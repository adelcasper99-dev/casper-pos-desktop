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
let appPort = 3000;

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

        const url = app.isPackaged ? `http://127.0.0.1:${appPort}` : 'http://localhost:3000';
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

app.whenReady().then(createWindow);