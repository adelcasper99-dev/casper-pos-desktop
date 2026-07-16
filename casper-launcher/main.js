const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const dgram = require('dgram');
const http = require('http');
const os = require('os');
const fs = require('fs');

// ── Single Instance Lock ──────────────────────────────────────────────────────
// Prevents double-click race condition where two instances fight over port 55432.
if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

const BEACON_PORT = 55432;
const DEFAULT_PORT = 3001;
const CONFIG_FILE = path.join(app.getPath('userData'), 'launcher-config.json');

// ── Config persistence ────────────────────────────────────────────────────────
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (_) {}
    return {};
}
function saveConfig(data) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...loadConfig(), ...data }, null, 2), 'utf8');
    } catch (_) {}
}

// ── Network Helpers ───────────────────────────────────────────────────────────
function getLanSubnet() {
    const nets = os.networkInterfaces();
    for (const ifaces of Object.values(nets)) {
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address.split('.').slice(0, 3).join('.');
            }
        }
    }
    return null;
}

function checkHttp(url, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        try {
            const req = http.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => {
                clearTimeout(timer);
                resolve(res.statusCode < 500);
            });
            req.on('error', () => { clearTimeout(timer); resolve(false); });
            req.on('timeout', () => { clearTimeout(timer); req.destroy(); resolve(false); });
            req.end();
        } catch (_) { clearTimeout(timer); resolve(false); }
    });
}

// Scans the local /24 subnet in batches of 20. Calls onProgress(0-100).
async function subnetScan(subnet, port, onProgress) {
    const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
    const batchSize = 20;
    for (let i = 0; i < ips.length; i += batchSize) {
        const batch = ips.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(async (ip) => {
                const ok = await checkHttp(`http://${ip}:${port}/api/health`, 800);
                return ok ? { ip, port } : null;
            })
        );
        const found = results.find(Boolean);
        if (found) return found;
        if (onProgress) onProgress(Math.round(((i + batchSize) / ips.length) * 100));
    }
    return null;
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 340,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        center: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    mainWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function sendStatus(status, data = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status', { status, ...data });
    }
}

// ── Launch ────────────────────────────────────────────────────────────────────
async function launch(url) {
    try {
        new URL(url); // validate
    } catch (_) { return; }

    const parsed = new URL(url);
    saveConfig({ lastUrl: url, lastIp: parsed.hostname, lastPort: parseInt(parsed.port) || DEFAULT_PORT });

    sendStatus('opening', { url });
    await new Promise(r => setTimeout(r, 1600)); // confirm screen visible
    await shell.openExternal(url);
    app.quit();
}

// ── Discovery ─────────────────────────────────────────────────────────────────
async function runDiscovery() {
    const config = loadConfig();
    const port = config.lastPort || DEFAULT_PORT;

    // Phase 0 — Cached IP (2s fast-path)
    if (config.lastUrl) {
        sendStatus('checking_cache', { url: config.lastUrl });
        const ok = await checkHttp(`${config.lastUrl}/api/health`, 2000);
        if (ok) return launch(config.lastUrl);
    }

    // Phase 1 — UDP broadcast listen + direct ping (3s)
    // Sends a ping so the Master responds immediately (no waiting for next broadcast cycle).
    sendStatus('udp_scan');
    const udpResult = await new Promise((resolve) => {
        let resolved = false;
        let pinger = null;
        const socket = dgram.createSocket('udp4');
        const done = (val) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            if (pinger) clearInterval(pinger);
            try { socket.close(); } catch (_) {}
            resolve(val);
        };
        const timer = setTimeout(() => done(null), 3000);

        socket.on('message', (msg) => {
            try {
                const data = JSON.parse(msg.toString());
                if (data.app === 'casper-pos' && data.ip && data.port) done(data);
            } catch (_) {}
        });
        socket.on('error', () => done(null));

        socket.bind(() => {
            try {
                socket.setBroadcast(true);
                // Send ping multiple times in case of packet loss
                const ping = Buffer.from(JSON.stringify({ app: 'casper-launcher', action: 'ping' }));
                const sendPing = () => socket.send(ping, BEACON_PORT, '255.255.255.255', () => {});
                sendPing();
                pinger = setInterval(sendPing, 500);
            } catch (_) { done(null); }
        });
    });

    if (udpResult) return launch(`http://${udpResult.ip}:${udpResult.port}`);

    // Phase 2 — Subnet HTTP scan (covers multi-AP / cross-router shops)
    sendStatus('subnet_scan', { progress: 0 });
    const subnet = getLanSubnet();
    if (subnet) {
        const found = await subnetScan(subnet, port, (pct) => {
            sendStatus('subnet_scan', { progress: pct });
        });
        if (found) return launch(`http://${found.ip}:${found.port}`);
    }

    // Phase 3 — mDNS hostname (bonus; works on Windows Private networks)
    sendStatus('mdns');
    const mdnsUrl = `http://casper-pos.local:${port}`;
    const mdnsOk = await checkHttp(`${mdnsUrl}/api/health`, 3000);
    if (mdnsOk) return launch(mdnsUrl);

    // Phase 4 — Manual entry (pre-filled with last known IP)
    sendStatus('manual', { lastIp: config.lastIp || '', lastPort: port });
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('connect-manual', async (_, ip, port) => {
    const url = `http://${ip.trim()}:${port || DEFAULT_PORT}`;
    const ok = await checkHttp(`${url}/api/health`, 3000);
    if (ok) { await launch(url); return { success: true }; }
    return { success: false, error: 'لم يتم الاتصال بالكاشير. تأكد من أن جهاز الماستر شغّال.' };
});

ipcMain.handle('retry-discovery', () => {
    runDiscovery();
    return { success: true };
});

// ── Boot ──────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    createWindow();
    mainWindow.webContents.once('did-finish-load', () => {
        runDiscovery();
    });
});

app.on('window-all-closed', () => app.quit());
