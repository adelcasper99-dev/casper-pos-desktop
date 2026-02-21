const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');

/**
 * Gap 4 (§2.1): Find a free OS port so the Next.js server doesn't bind
 * to a predictable port (3000) reachable by other local processes.
 */
function findFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

let mainWindow = null;
let nextServer;
let appPort = 3000; // default for dev; overridden at startup in packaged mode

const startServer = async () => {
    if (app.isPackaged) {
        const port = await findFreePort();
        appPort = port;
        const serverPath = path.join(process.resourcesPath, '.next/standalone/server.js');
        const cwd = path.join(process.resourcesPath, '.next/standalone');

        console.log(`Starting server from: ${serverPath} on port ${port}`);

        nextServer = spawn(process.execPath, [serverPath], {
            cwd,
            // Bind to 127.0.0.1 only (loopback) + ephemeral port so no other
            // local process can connect via a predictable address.
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), HOST: '127.0.0.1' },
            stdio: 'inherit'
        });

        nextServer.on('error', (err) => {
            console.error('Failed to start server:', err);
        });
    }
};

const createWindow = async () => {
    // Resolve icon: packaged → resources dir, dev → public/assets
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'public', 'assets', 'icon.png')
        : path.join(__dirname, '..', 'public', 'assets', 'icon.png');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        // ── Frameless / borderless window ──────────────────────────────────
        frame: false,           // Remove native OS title bar & borders
        titleBarStyle: 'hidden', // Belt-and-suspenders on macOS
        show: false,            // Reveal only after maximize to avoid flash
        // ───────────────────────────────────────────────────────────────────
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true, // §2.1: enforce same-origin policy
        },
    });

    // Launch maximized, then reveal – avoids the "windowed then maximized" flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    // Forward maximize / restore events to renderer so the icon stays in sync
    mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));

    if (app.isPackaged) {
        await startServer(); // sets appPort to the ephemeral port

        const loadURL = async () => {
            try {
                await mainWindow.loadURL(`http://127.0.0.1:${appPort}`);
            } catch (e) {
                console.log('Server not ready, retrying...');
                setTimeout(loadURL, 1000);
            }
        };
        loadURL();
    } else {
        mainWindow.loadURL('http://localhost:3000');
        if (process.env.ENABLE_DEVTOOLS === 'true') {
            mainWindow.webContents.openDevTools();
        }
    }
};

// ============================================================================
// IPC: Custom Window Controls
// ============================================================================
ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
});

// ── Zoom Controls handlers ──────────────────────────────────────
ipcMain.on('window:zoomIn', () => {
    if (!mainWindow) return;
    const currentZoom = mainWindow.webContents.getZoomFactor();
    const newZoom = Math.min(currentZoom + 0.1, 3.0);
    console.log(`[IPC] Zoom In: ${currentZoom} -> ${newZoom}`);
    mainWindow.webContents.setZoomFactor(newZoom);
});

ipcMain.on('window:zoomOut', () => {
    if (!mainWindow) return;
    const currentZoom = mainWindow.webContents.getZoomFactor();
    const newZoom = Math.max(currentZoom - 0.1, 0.5);
    console.log(`[IPC] Zoom Out: ${currentZoom} -> ${newZoom}`);
    mainWindow.webContents.setZoomFactor(newZoom);
});

ipcMain.on('window:zoomReset', () => {
    if (!mainWindow) return;
    console.log(`[IPC] Zoom Reset`);
    mainWindow.webContents.setZoomFactor(1.0);
});
// ───────────────────────────────────────────────────────────────

// ============================================================================
// IPC: List all installed printers
// ============================================================================
ipcMain.handle('printers:list', async () => {
    try {
        const printers = await mainWindow.webContents.getPrintersAsync();
        return printers.map(p => ({
            name: p.name,
            isDefault: p.isDefault,
            status: p.status,
        }));
    } catch (err) {
        console.error('[PRINT] Failed to list printers:', err);
        return [];
    }
});

// ============================================================================
// IPC: Silent print HTML to a named printer
// Writes HTML to a temp file (avoids data: URL length limit for large receipts)
// Uses 80mm paper size (width: 80mm in microns) with no margins for thermal receipts
// Falls back to A4 if paperSize override is provided by the caller
// ============================================================================
ipcMain.handle('print:html', async (_event, html, printerName, options = {}) => {
    return new Promise((resolve, reject) => {
        // 1. Write HTML to a temp file so we can load it as file:// (no URL length limit)
        const tmpFile = path.join(os.tmpdir(), `casper-print-${Date.now()}.html`);
        try {
            fs.writeFileSync(tmpFile, html, 'utf-8');
        } catch (writeErr) {
            return reject(new Error(`Failed to write temp print file: ${writeErr.message}`));
        }

        // 2. Create an invisible off-screen window
        const printWin = new BrowserWindow({
            show: false,
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        const cleanup = () => {
            try {
                if (!printWin.isDestroyed()) printWin.close();
            } catch (_) { /* ignore */ }
            try {
                fs.unlinkSync(tmpFile);
            } catch (_) { /* ignore */ }
        };

        // 3. Load temp file
        printWin.loadURL(`file://${tmpFile}`);

        // 4. Wait for full load + 250ms CSS/font settle, then print
        printWin.webContents.once('did-finish-load', () => {
            setTimeout(() => {
                // Paper size: 80mm wide × 297mm tall (in microns: 1mm = 1000µm)
                // Adjust height to a large value so content is not clipped
                const paperWidth = options.paperWidth || 80000;   // µm (80mm)
                const paperHeight = options.paperHeight || 2970000; // µm (297mm tall max)

                const printOptions = {
                    silent: true,
                    printBackground: true,
                    deviceName: printerName || '',   // '' = system default printer
                    pageSize: { width: paperWidth, height: paperHeight },
                    margins: { marginType: 'none' },
                    scaleFactor: 100,
                };

                console.log(`[PRINT] Sending to: "${printerName || 'default'}" (${paperWidth / 1000}mm wide)`);

                printWin.webContents.print(printOptions, (success, failureReason) => {
                    cleanup();
                    if (success) {
                        console.log(`[PRINT] ✓ Success → ${printerName}`);
                        resolve({ success: true });
                    } else {
                        console.error(`[PRINT] ✗ Failed: ${failureReason}`);
                        reject(new Error(failureReason || 'Print failed'));
                    }
                });
            }, 250);
        });

        // Handle load errors (e.g., temp file missing)
        printWin.webContents.once('did-fail-load', (_e, code, desc) => {
            cleanup();
            reject(new Error(`Print window failed to load: ${desc} (${code})`));
        });
    });
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (nextServer) nextServer.kill();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (nextServer) nextServer.kill();
});
