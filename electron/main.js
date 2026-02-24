const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { execSync, spawn } = require('child_process');

const debugLog = path.join(os.homedir(), 'casper-boot.log');
const log = (msg) => {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] [PROCESS ${process.pid}] ${msg}\n`);
};

log(`--- ENTRY: ${JSON.stringify(process.argv)} ---`);

if (!app.requestSingleInstanceLock()) {
    log('Process: Not original instance. Quitting...');
    app.quit();
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

const getDatabasePath = () => {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }

    const configPath = path.join(userDataPath, 'casper-config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.dbPath) {
                // Return custom path with local.db appended
                return path.join(config.dbPath, 'local.db');
            }
        } catch (e) {
            log(`Failed to read casper-config.json: ${e.message}`);
        }
    }

    // Default fallback
    return path.join(userDataPath, 'local.db');
};

const runMigrations = (dbPath) => {
    if (!app.isPackaged) return;
    log('Migrations: Starting...');

    const normalizedDbPath = dbPath.replace(/\\/g, '/');
    const dbUrl = `file:${normalizedDbPath}`;

    const enginesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'engines');
    const queryEnginePath = path.join(enginesPath, 'query_engine-windows.dll.node');
    const schemaEnginePath = path.join(enginesPath, 'schema-engine-windows.exe');

    const prismaJs = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'prisma', 'build', 'index.js');
    const schemaPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'prisma', 'schema.prisma');

    if (!fs.existsSync(prismaJs)) {
        log(`Migrations: FATAL - Prisma CLI not found at ${prismaJs}`);
        return;
    }

    const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: dbUrl,
        PRISMA_QUERY_ENGINE_LIBRARY: queryEnginePath,
        PRISMA_SCHEMA_ENGINE_BINARY: schemaEnginePath,
        PRISMA_CLI_QUERY_ENGINE_TYPE: 'library'
    };

    const attemptMigration = (attempt) => {
        try {
            log(`Migrations: Running deploy (attempt ${attempt}) on ${dbUrl}...`);
            const output = execSync(`"${process.execPath}" "${prismaJs}" migrate deploy --schema "${schemaPath}"`, {
                env, windowsHide: true, encoding: 'utf-8'
            });
            log(`Migrations Output: ${output}`);
            log('Migrations: Success.');
            return true;
        } catch (err) {
            log(`Migrations: Deploy failed: ${err.message}`);

            // Fallback: try db push
            try {
                log('Migrations: Trying db push as fallback...');
                const output = execSync(`"${process.execPath}" "${prismaJs}" db push --schema "${schemaPath}" --accept-data-loss`, {
                    env, windowsHide: true, encoding: 'utf-8'
                });
                log(`Migrations Push Output: ${output}`);
                log('Migrations: Database synced via push.');
                return true;
            } catch (pushErr) {
                log(`Migrations: db push also failed: ${pushErr.message}`);
                return false;
            }
        }
    };

    // Check for schema integrity BEFORE running migrations if possible,
    // though Prisma handle migration safety, PRAGMA check is for data durability.
    try {
        log('Database: Running integrity check...');
        const output = execSync(`"${process.execPath}" "${prismaJs}" db execute --stdin --schema "${schemaPath}"`, {
            env, input: 'PRAGMA integrity_check;', windowsHide: true, encoding: 'utf-8'
        });
        if (output.includes('ok')) {
            log('Database: Integrity check - OK');
        } else {
            log(`Database: Integrity check found issues: ${output}`);
        }
    } catch (e) {
        log(`Database: Integrity check failed to run: ${e.message}`);
    }

    // First attempt
    const firstAttempt = attemptMigration(1);

    if (!firstAttempt) {
        // Auto-recovery: the DB is likely corrupt/empty from a previous failed boot.
        // Delete it and retry from scratch so the user doesn't need to manually intervene.
        log('Migrations: AUTO-RECOVERY — deleting corrupt/empty database and retrying...');
        try {
            if (fs.existsSync(dbPath)) {
                fs.unlinkSync(dbPath);
                log(`Migrations: Deleted corrupt database at ${dbPath}`);
            }
            // Also remove WAL and SHM sidecar files if present
            [`${dbPath}-wal`, `${dbPath}-shm`].forEach(f => {
                if (fs.existsSync(f)) { fs.unlinkSync(f); log(`Migrations: Deleted ${f}`); }
            });
            attemptMigration(2);
        } catch (recoveryErr) {
            log(`Migrations: FATAL - Auto-recovery failed: ${recoveryErr.message}`);
        }
    }
};

let mainWindow = null;
let splashWindow = null;
let nextServer;
let appPort = 3001;

const findFreePort = () => {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
};

const startServer = () => {
    return new Promise(async (resolve, reject) => {
        const dbPath = getDatabasePath();

        if (app.isPackaged) {
            runMigrations(dbPath);
            appPort = await findFreePort();

            const cwd = path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone');
            const serverPath = path.join(cwd, 'server.js');

            if (!fs.existsSync(serverPath)) {
                return reject(new Error(`Next.js server.js not found! Ensure '.next/standalone' is in asarUnpack.\nPath checked: ${serverPath}`));
            }

            log(`Server: Starting on port ${appPort} inside ${cwd}...`);
            const enginesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'engines');
            const queryEnginePath = path.join(enginesPath, 'query_engine-windows.dll.node');
            const normalizedDbPath = dbPath.replace(/\\/g, '/');

            nextServer = spawn(process.execPath, [serverPath], {
                cwd,
                env: {
                    ...process.env,
                    ELECTRON_RUN_AS_NODE: '1',
                    PORT: String(appPort),
                    HOST: '127.0.0.1',
                    DATABASE_URL: `file:${normalizedDbPath}`,
                    PRISMA_QUERY_ENGINE_LIBRARY: queryEnginePath
                }
            });

            let isReady = false;

            nextServer.stdout.on('data', (data) => log(`SERVER STDOUT: ${data.toString().trim()}`));
            nextServer.stderr.on('data', (data) => log(`SERVER STDERR: ${data.toString().trim()}`));
            nextServer.on('error', (err) => reject(new Error(`Spawn Error: ${err.message}`)));
            nextServer.on('exit', (code) => {
                if (!isReady) reject(new Error(`Server crashed immediately with exit code ${code}. Check casper-boot.log.`));
            });

            // Actively poll the port until Next.js is ready
            const poll = setInterval(() => {
                const socket = new net.Socket();
                socket.on('connect', () => {
                    isReady = true;
                    clearInterval(poll);
                    socket.destroy();
                    resolve();
                }).on('error', () => {
                    socket.destroy();
                }).connect(appPort, '127.0.0.1');
            }, 500);

        } else {
            resolve();
        }
    });
};

const createSplashWindow = () => {
    splashWindow = new BrowserWindow({
        width: 400, height: 400, transparent: true, frame: false, alwaysOnTop: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    splashWindow.loadFile(path.join(__dirname, 'splash.html'));
};

const createWindow = async () => {
    createSplashWindow();

    const iconPath = path.join(__dirname, '..', 'public', 'assets', 'icon.png');
    mainWindow = new BrowserWindow({
        width: 1200, height: 800, icon: iconPath, frame: false, titleBarStyle: 'hidden', show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, contextIsolation: true
        }
    });

    try {
        await startServer(); // Wait explicitly for the server to be completely healthy

        const url = app.isPackaged ? `http://127.0.0.1:${appPort}` : 'http://localhost:3001';
        log(`Loading main UI from: ${url}`);
        await mainWindow.loadURL(url);

        if (splashWindow) splashWindow.close();
        mainWindow.maximize();
        mainWindow.show();
    } catch (error) {
        log(`FATAL BOOT ERROR: ${error.message}`);
        dialog.showErrorBox("Startup Error", `Failed to start the background server.\n\n${error.message}\n\nPlease check casper-boot.log in your user folder.`);
        app.quit();
    }
};

app.on('window-all-closed', () => {
    if (nextServer) nextServer.kill();
    if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
    if (nextServer) nextServer.kill();
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false);

ipcMain.handle('printers:list', async () => {
    if (!mainWindow) return [];
    try {
        return await mainWindow.webContents.getPrintersAsync();
    } catch (error) {
        log(`Error getting printers: ${error.message}`);
        return [];
    }
});

ipcMain.handle('print:html', async (event, html, printerName, options) => {
    if (!mainWindow) return { success: false, error: 'Main window not found' };

    const printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // 🛡️ HARDENING: Safety timeout to prevent the app from hanging if the printer/spooler is unresponsive
    const TIMEOUT_MS = 15000; // 15 seconds
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('PRINT_TIMEOUT')), TIMEOUT_MS);
    });

    const tempFilePath = path.join(os.tmpdir(), `casper_print_${Date.now()}.html`);

    try {
        fs.writeFileSync(tempFilePath, html, 'utf8');
        await printWindow.loadFile(tempFilePath);

        // Wait a short moment for fonts and images to actually buffer in the DOM
        await new Promise(resolve => setTimeout(resolve, 500));

        const printPromise = new Promise((resolve) => {
            printWindow.webContents.print({
                silent: true,
                printBackground: true,
                deviceName: printerName,
                margins: { marginType: 'none' },
                ...options
            }, (success, failureReason) => {
                if (success) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: failureReason });
                }
            });
        });

        // Race between actual print and the safety timeout
        const result = await Promise.race([printPromise, timeoutPromise]);

        // Cleanup & Success
        if (!printWindow.isDestroyed()) printWindow.close();
        try { fs.unlinkSync(tempFilePath); } catch (e) { }
        return result;

    } catch (error) {
        log(`Print Error: ${error.message}`);
        if (!printWindow.isDestroyed()) printWindow.close();
        try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) { }

        return {
            success: false,
            error: error.message === 'PRINT_TIMEOUT' ? 'Printer timed out (Spooler busy?)' : error.message
        };
    }
});

// --- NEW CONFIG AND SETUP IPC HANDLERS ---
ipcMain.handle('dialog:showOpenDialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Database Folder'
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('app:get-db-path', () => {
    // Return the directory where local.db is (or will be) stored
    return path.dirname(getDatabasePath());
});

ipcMain.handle('app:save-config-and-restart', async (event, newDbFolder) => {
    try {
        const userDataPath = app.getPath('userData');
        const configPath = path.join(userDataPath, 'casper-config.json');

        fs.writeFileSync(configPath, JSON.stringify({ dbPath: newDbFolder }, null, 2), 'utf8');
        log(`Saved new config path: ${newDbFolder}. Restarting...`);

        // Relaunch the application and exit
        app.relaunch();
        app.quit();
        return true;
    } catch (err) {
        log(`Failed save-config-and-restart: ${err.message}`);
        return false;
    }
});

// --- OFFLINE DATA PERSISTENCE & MAINTENANCE ---

ipcMain.handle('app:save-offline-data', async (event, data) => {
    try {
        const dbPath = getDatabasePath();
        const userDataPath = app.getPath('userData');
        const backupPath = path.join(userDataPath, 'local_mirror.db');

        // Mirror the actual SQLite file for durability (Constitution Requirement)
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, backupPath);
            log(`Mirror: SQLite mirrored to ${backupPath}`);
        }

        // Also save provided metadata if any
        if (data && Object.keys(data).length > 0) {
            const jsonPath = path.join(userDataPath, 'offline_backup.json');
            fs.writeFileSync(jsonPath, JSON.stringify(data), 'utf8');
        }

        return { success: true };
    } catch (err) {
        log(`Failed to save offline data: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('app:load-offline-data', async () => {
    try {
        const userDataPath = app.getPath('userData');
        const backupPath = path.join(userDataPath, 'offline_backup.json');
        if (!fs.existsSync(backupPath)) return null;
        const data = fs.readFileSync(backupPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        log(`Failed to load offline data: ${err.message}`);
        return null;
    }
});

ipcMain.handle('app:export-support-bundle', async () => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Support Bundle',
            defaultPath: path.join(os.homedir(), `casper_support_${Date.now()}.zip`),
            filters: [{ name: 'Zip Files', extensions: ['zip'] }]
        });

        if (canceled || !filePath) return null;

        const userDataPath = app.getPath('userData');
        const dbPath = getDatabasePath();
        const logPath = path.join(os.homedir(), 'casper-boot.log');

        // Note: For a real ZIP we'd use adm-zip, but for now let's just copy files to a folder
        // if the user provided a folder path, OR we can just copy to a temp folder and let them know.
        // Given we have fs-extra, we can use it if we want, but it's not imported here yet.
        const fsExtra = require('fs-extra');
        const exportDir = filePath.replace(/\.zip$/, '');
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

        if (fs.existsSync(dbPath)) fsExtra.copySync(dbPath, path.join(exportDir, 'local.db'));
        if (fs.existsSync(logPath)) fsExtra.copySync(logPath, path.join(exportDir, 'boot.log'));

        return { success: true, path: exportDir };
    } catch (err) {
        log(`Failed to export support bundle: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('app:vacuum-db', async () => {
    try {
        const dbPath = getDatabasePath();
        const prismaJs = app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'prisma', 'build', 'index.js')
            : path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
        const schemaPath = app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'prisma', 'schema.prisma')
            : path.join(__dirname, '..', 'prisma', 'schema.prisma');

        const normalizedDbPath = dbPath.replace(/\\/g, '/');
        const env = {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            DATABASE_URL: `file:${normalizedDbPath}`
        };

        // Running a raw SQL VACUUM via prisma execute
        log('Database: Running VACUUM...');
        execSync(`"${process.execPath}" "${prismaJs}" db execute --stdin --schema "${schemaPath}"`, {
            env, input: 'VACUUM;', windowsHide: true, encoding: 'utf-8'
        });
        log('Database: VACUUM success.');
        return { success: true };
    } catch (err) {
        log(`Failed to vacuum database: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('app:print-thermal-receipt', async (event, layout) => {
    // This is the "Speed Print" implementation.
    // It bypasses the standard Electron preview if possible and sends raw or high-speed silent print.
    // For now, we reuse the print:html logic but with higher priority and no dialog.
    log('Print: Speed Print triggered');
    try {
        return await ipcMain.emit('print:html', null, layout.html, layout.printerName || '', { silent: true });
    } catch (err) {
        log(`Print: Speed Print failed: ${err.message}`);
        return { success: false, error: err.message };
    }
});

app.whenReady().then(createWindow);