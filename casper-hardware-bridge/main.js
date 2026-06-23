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

        const contextMenu = Menu.buildFromTemplate([
            { label: 'Casper Hardware Bridge', enabled: false },
            { label: 'Status: Active (4040)', enabled: false },
            { type: 'separator' },
            { label: 'Settings', click: () => createSettingsWindow() },
            { label: 'Restart Service', click: () => { app.relaunch(); app.exit(); } },
            { type: 'separator' },
            { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
        ]);
        
        tray.setToolTip('Casper Hardware Bridge');
        tray.setContextMenu(contextMenu);
    } catch (err) {
        console.error('Tray Init Error:', err);
    }

    expressApp.listen(4040, '0.0.0.0', () => {
        console.log('API Router Active: http://0.0.0.0:4040');
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') app.quit();
    });

    ipcMain.handle('get-settings', () => store.store);
    ipcMain.handle('save-settings', (event, newSettings) => {
        store.set(newSettings);
        return { success: true };
    });
    
    ipcMain.handle('get-printers', async () => {
        try {
            const win = getWorkerWindow();
            if (win.webContents.getPrintersAsync) {
                const printers = await win.webContents.getPrintersAsync();
                console.log(`[Bridge] Discovery Scan (Async): Found ${printers.length} printers`);
                return printers;
            }
            if (win.webContents.getPrinters) {
                const printers = win.webContents.getPrinters();
                console.log(`[Bridge] Discovery Scan (Sync): Found ${printers.length} printers`);
                return printers;
            }
            console.error('[Bridge] No printing discovery method found on webContents');
            return [];
        } catch (err) {
            console.error('[Bridge] Printer Discovery ERROR:', err);
            return [];
        }
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
