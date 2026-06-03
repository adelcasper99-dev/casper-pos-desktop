const { app, Tray, Menu, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const AutoLaunch = require('auto-launch');

const bridgeAutoLauncher = new AutoLaunch({
    name: 'Casper Hardware Bridge',
    path: process.execPath,
});

let tray = null;
let settingsWindow = null;
let store;

const expressApp = express();
expressApp.use(cors({ origin: '*' })); // Permissive for local bridging
expressApp.use(express.json());

const activeClients = new Map();

function updateActiveClient(req) {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip === '::1' || ip === '::ffff:127.0.0.1') ip = '127.0.0.1';
    
    const { ping, userAgent, url } = req.body || {};
    
    const clientInfo = activeClients.get(ip) || {
        ip,
        userAgent: userAgent || req.headers['user-agent'] || 'Unknown Browser',
        url: url || '',
        connects: 0
    };
    
    clientInfo.lastActive = Date.now();
    clientInfo.connects += 1;
    if (userAgent) clientInfo.userAgent = userAgent;
    if (url) clientInfo.url = url;
    
    activeClients.set(ip, clientInfo);
    
    // Clean up stale clients (offline for more than 30 seconds)
    const staleCutoff = Date.now() - 30000;
    let sizeBefore = activeClients.size;
    for (const [key, val] of activeClients.entries()) {
        if (val.lastActive < staleCutoff) {
            activeClients.delete(key);
        }
    }
    
    if (activeClients.size !== sizeBefore || clientInfo.connects === 1) {
        updateTrayMenu();
    }
}

let _printerCache = null;
let _printerCacheAt = 0;
const PRINTER_CACHE_TTL_MS = 30000;

async function getOSPrinters() {
    const now = Date.now();
    if (_printerCache && (now - _printerCacheAt) < PRINTER_CACHE_TTL_MS) {
        return _printerCache;
    }
    try {
        const win = getWorkerWindow();
        let printers = [];
        if (win.webContents.getPrintersAsync) {
            printers = await win.webContents.getPrintersAsync();
        } else if (win.webContents.getPrinters) {
            printers = win.webContents.getPrinters();
        }
        _printerCache = printers;
        _printerCacheAt = now;
        return printers;
    } catch (err) {
        console.error('[Bridge] Printer Discovery ERROR:', err);
        return _printerCache || [];
    }
}

function updateTrayMenu() {
    if (!tray) return;
    try {
        const clientCount = activeClients.size;
        const clientsLabel = clientCount === 0 
            ? 'Status: Active (4040)' 
            : `Status: Active (4040) - ${clientCount} Connected`;
            
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Casper Hardware Bridge', enabled: false },
            { label: clientsLabel, enabled: false },
            { type: 'separator' },
            { label: 'Settings', click: () => createSettingsWindow() },
            { label: 'Restart Service', click: () => { app.relaunch(); app.exit(); } },
            { type: 'separator' },
            { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
        ]);
        tray.setContextMenu(contextMenu);
    } catch (err) {
        console.error('Tray menu update error:', err);
    }
}

// Client registration middleware
expressApp.use((req, res, next) => {
    updateActiveClient(req);
    next();
});

// GET /api/status - client check for online status & printers list
expressApp.get('/api/status', async (req, res) => {
    try {
        const printers = await getOSPrinters();
        res.json({
            online: true,
            version: '1.0.0',
            printers: printers
        });
    } catch (e) {
        res.json({ online: true, version: '1.0.0', printers: [], error: e.message });
    }
});

// POST /api/status - heartbeat endpoint returning client list
expressApp.post('/api/status', (req, res) => {
    res.json({ success: true, clients: Array.from(activeClients.values()) });
});

// Initialize electron-store asynchronously for ESM compatibility
async function initStore() {
    try {
        const Store = (await import('electron-store')).default;
        store = new Store({
            defaults: {
                printerType: PrinterTypes.EPSON,
                receiptPrinter: 'auto',
                barcodePrinter: 'auto',
                a4Printer: 'auto',
                marginTop: 0,
                marginLeft: 0,
            }
        });
    } catch (e) {
        console.error('Failed to initialize electron-store:', e);
    }
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 480,
        height: 700,
        resizable: true,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile('settings.html');

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

// Global hidden window for silent A4 printing
let workerWindow = null;
function getWorkerWindow() {
    if (workerWindow) return workerWindow;
    workerWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    return workerWindow;
}

expressApp.post('/api/print', async (req, res) => {
    try {
        const { jobType, commands, html, printerSettings } = req.body;
        
        if (jobType === 'a4') {
            if (!html) return res.status(400).json({ error: 'HTML payload required for A4 jobs' });
            
            const targetA4 = printerSettings?.interface || store.get('a4Printer') || 'auto';
            const win = getWorkerWindow();
            
            await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
            
            win.webContents.print({
                silent: true,
                printBackground: true,
                deviceName: targetA4 === 'auto' ? '' : targetA4,
                margins: { marginType: 'printableArea' }
            }, (success, failureReason) => {
                if (!success) {
                    console.error('A4 Print Failed:', failureReason);
                }
            });
            
            return res.json({ success: true, message: 'A4 job spooled' });
        }

        // Thermal Routine (receipt or barcode)
        const targetKey = jobType === 'barcode' ? 'barcodePrinter' : 'receiptPrinter';
        const pInterface = printerSettings?.interface || store.get(targetKey) || 'printer:auto';
        const pType = printerSettings?.type || store.get('printerType') || PrinterTypes.EPSON;
        
        let printer = new ThermalPrinter({
            type: pType,
            interface: pInterface.startsWith('printer:') || pInterface.startsWith('tcp:') ? pInterface : `printer:${pInterface}`,
            options: { timeout: 3000 }
        });

        // Only apply calibration to receipts (not barcodes typically)
        if (jobType !== 'barcode') {
            const mTop = parseInt(store.get('marginTop') || 0, 10);
            const mLeft = parseInt(store.get('marginLeft') || 0, 10);
            for (let i = 0; i < mTop; i++) printer.newLine();
            if (mLeft > 0) {
                printer.setLeftMargin(mLeft);
                printer.add(Buffer.from([0x1D, 0x4C, mLeft % 256, Math.floor(mLeft / 256)]));
            }
        }

        if (commands && Array.isArray(commands)) {
            commands.forEach(cmd => {
                if (typeof printer[cmd.type] === 'function') {
                    printer[cmd.type](...(cmd.args || []));
                }
            });
        }
        
        printer.cut();
        if (jobType !== 'barcode') printer.openCashDrawer();

        await printer.execute();
        res.json({ success: true });

    } catch (e) {
        console.error('Print error:', e);
        res.status(500).json({ error: e.message || 'Execution Error' });
    }
});

app.whenReady().then(async () => {
    await initStore();

    // Enable auto-launch for production builds
    if (app.isPackaged) {
        bridgeAutoLauncher.enable().catch(err => console.error('Auto-launch enable failed', err));
    }

    const iconPath = path.join(__dirname, 'icon.png');
    const fs = require('fs');
    
    try {
        if (fs.existsSync(iconPath)) {
            tray = new Tray(iconPath);
        } else {
            console.warn('Tray icon missing');
            const { nativeImage } = require('electron');
            tray = new Tray(nativeImage.createEmpty()); 
        }
        
        tray.setToolTip('Casper Hardware Bridge');
        // Use the shared updateTrayMenu to render initial state (0 clients)
        updateTrayMenu();
    } catch (err) {
        console.error('Tray Init Error:', err);
    }

    expressApp.listen(4040, () => {
        console.log('API Router Active: http://localhost:4040');
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') app.quit();
    });

    ipcMain.handle('get-settings', () => store.store);
    ipcMain.handle('save-settings', (event, newSettings) => {
        store.set(newSettings);
        return { success: true };
    });
    
    ipcMain.handle('get-printers', async () => {
        return await getOSPrinters();
    });

    ipcMain.handle('get-active-clients', () => {
        return Array.from(activeClients.values());
    });

    ipcMain.handle('close-window', () => {
        if (settingsWindow) settingsWindow.close();
    });

    ipcMain.handle('test-print', async (event) => {
        try {
            const pInterface = store.get('receiptPrinter');
            const pType = store.get('printerType');
            
            let printer = new ThermalPrinter({
                type: pType,
                interface: pInterface.startsWith('printer:') ? pInterface : `printer:${pInterface}`,
            });

            const mTop = parseInt(store.get('marginTop') || 0, 10);
            const mLeft = parseInt(store.get('marginLeft') || 0, 10);

            for (let i = 0; i < mTop; i++) printer.newLine();
            if (mLeft > 0) {
                printer.setLeftMargin(mLeft);
                printer.add(Buffer.from([0x1D, 0x4C, mLeft % 256, Math.floor(mLeft / 256)]));
            }

            printer.alignCenter();
            printer.println("CASPER ROUTER CALIBRATION");
            printer.drawLine();
            printer.println(`Target: ${pInterface}`);
            printer.println(`Margins: T:${mTop} / L:${mLeft}`);
            printer.newLine();
            printer.cut();
            await printer.execute();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
});

app.on('window-all-closed', () => {
    // Override default to avoid quitting bridge when settings is closed
});
