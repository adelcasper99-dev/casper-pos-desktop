const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { execSync, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

const debugLog = path.join(os.homedir(), 'casper-boot.log');
const log = (msg) => {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] [PROCESS ${process.pid}] ${msg}\n`);
};

// Configure autoUpdater logger
autoUpdater.logger = {
    info(msg) { log(`Updater: ${msg}`); },
    warn(msg) { log(`Updater Warn: ${msg}`); },
    error(msg) { log(`Updater Error: ${msg}`); },
    debug(msg) { log(`Updater Debug: ${msg}`); }
};
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

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
    // In development mode, Prisma puts the database in the prisma directory
    if (!app.isPackaged) {
        return path.join(__dirname, '..', 'prisma', 'local.db');
    }

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
    const startTime = Date.now();

    const normalizedDbPath = dbPath.replace(/\\/g, '/');
    const dbUrl = `file:${normalizedDbPath}`;

    const enginesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'engines');
    const queryEnginePath = path.join(enginesPath, 'query_engine-windows.dll.node');
    const schemaEnginePath = path.join(enginesPath, 'schema-engine-windows.exe');

    const prismaJs = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'prisma', 'build', 'index.js');
    const schemaPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'prisma', 'schema.prisma');

    const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: dbUrl,
        PRISMA_QUERY_ENGINE_LIBRARY: queryEnginePath,
        PRISMA_SCHEMA_ENGINE_BINARY: schemaEnginePath,
        PRISMA_CLI_QUERY_ENGINE_TYPE: 'library'
    };

    const runSqlWithOutput = (sql) => {
        try {
            return execSync(`"${process.execPath}" "${prismaJs}" db execute --stdin --schema "${schemaPath}"`, {
                env, input: sql, windowsHide: true, encoding: 'utf-8'
            });
        } catch (e) {
            return null;
        }
    };

    const sendStatus = (status) => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.send('boot-status', status);
        }
    };

    // ─── Pre-Patch: Apply each missing column individually ────────────────────
    const prePatchStatements = [
        // Product
        'ALTER TABLE "Product" ADD COLUMN "isDevice" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "Product" ADD COLUMN "deviceType" TEXT',
        'ALTER TABLE "Product" ADD COLUMN "condition" TEXT',
        'ALTER TABLE "Product" ADD COLUMN "color" TEXT',

        // PurchaseItem
        'ALTER TABLE "PurchaseItem" ADD COLUMN "imei" TEXT',
        'ALTER TABLE "PurchaseItem" ADD COLUMN "condition" TEXT',
        'ALTER TABLE "PurchaseItem" ADD COLUMN "color" TEXT',
        'ALTER TABLE "PurchaseItem" ADD COLUMN "deviceType" TEXT',
        'ALTER TABLE "PurchaseItem" ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0',

        // SaleItem
        'ALTER TABLE "SaleItem" ADD COLUMN "imei" TEXT',
        'ALTER TABLE "SaleItem" ADD COLUMN "condition" TEXT',
        'ALTER TABLE "SaleItem" ADD COLUMN "color" TEXT',
        'ALTER TABLE "SaleItem" ADD COLUMN "deviceType" TEXT',

        // PurchaseInvoice
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "isWalkin" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinName" TEXT',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinPhone" TEXT',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinNationalId" TEXT',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "attachmentUrl" TEXT',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidReason" TEXT',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidedAt" DATETIME',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidedBy" TEXT',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "isReturn" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "parentId" TEXT',
        'ALTER TABLE "PurchaseInvoice" ADD COLUMN "branchId" TEXT',

        // Transaction
        'ALTER TABLE "Transaction" ADD COLUMN "categoryId" TEXT',
        'ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" TEXT',

        // Sale
        'ALTER TABLE "Sale" ADD COLUMN "warrantyDays" INTEGER',
        'ALTER TABLE "Sale" ADD COLUMN "warrantyExpiryDate" DATETIME',
        'ALTER TABLE "Sale" ADD COLUMN "customerId" TEXT',
        'ALTER TABLE "Sale" ADD COLUMN "tableId" TEXT',
        'ALTER TABLE "Sale" ADD COLUMN "tableName" TEXT',
        'ALTER TABLE "Sale" ADD COLUMN "userId" TEXT',
        'ALTER TABLE "Sale" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT "PENDING"',
        'ALTER TABLE "Sale" ADD COLUMN "offlineFlag" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "Sale" ADD COLUMN "discountPercentage" DECIMAL DEFAULT 0.00',
        'ALTER TABLE "Sale" ADD COLUMN "previousStatus" TEXT',
        'ALTER TABLE "Sale" ADD COLUMN "isReturn" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "Sale" ADD COLUMN "parentId" TEXT',
        'ALTER TABLE "Sale" ADD COLUMN "branchId" TEXT',
        'ALTER TABLE "Sale" ADD COLUMN "relatedSupplierId" TEXT',

        // Ticket
        'ALTER TABLE "Ticket" ADD COLUMN "finalCustomerPrice" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Ticket" ADD COLUMN "techBillingPrice" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Ticket" ADD COLUMN "partCostPrice" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Ticket" ADD COLUMN "laborPoolAmount" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Ticket" ADD COLUMN "techCommissionAmount" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Ticket" ADD COLUMN "centerLaborProfit" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Ticket" ADD COLUMN "centerPartProfit" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Ticket" ADD COLUMN "commissionClawback" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Ticket" ADD COLUMN "lastReturnedAt" DATETIME',
        'ALTER TABLE "Ticket" ADD COLUMN "originalTechId" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "returnCount" INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE "Ticket" ADD COLUMN "returnReason" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "rejectionReason" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "rejectedAt" DATETIME',
        'ALTER TABLE "Ticket" ADD COLUMN "clientSupplierId" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "clientUserId" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "parentTicketId" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "barcode" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "customerId" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "lossResponsibility" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "excessLossAmount" DECIMAL NOT NULL DEFAULT 0.00',
        // [MODEL: RepairPayment] [ADDED: 2026-07-16] tenantId (Fixes tenant-aware mismatch)
        'ALTER TABLE "RepairPayment" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT \'default\'',

        // User
        'ALTER TABLE "User" ADD COLUMN "salary" DECIMAL DEFAULT 0.00',
        'ALTER TABLE "User" ADD COLUMN "monthlyOffDays" INTEGER DEFAULT 4',
        'ALTER TABLE "User" ADD COLUMN "hireDate" DATETIME',
        'ALTER TABLE "User" ADD COLUMN "maxDiscount" DECIMAL DEFAULT 0.00',
        'ALTER TABLE "User" ADD COLUMN "maxDiscountAmount" DECIMAL DEFAULT 0.00',
        'ALTER TABLE "User" ADD COLUMN "isFrozen" BOOLEAN NOT NULL DEFAULT false',

        // Technician
        'ALTER TABLE "Technician" ADD COLUMN "defaultPriceTier" TEXT NOT NULL DEFAULT "COST"',
        'ALTER TABLE "Technician" ADD COLUMN "deletedAt" DATETIME',
        'ALTER TABLE "Technician" ADD COLUMN "lossRate" DECIMAL NOT NULL DEFAULT 70.00',
        'ALTER TABLE "Technician" ADD COLUMN "commissionRuleId" TEXT',

        // Warehouse & Branch
        'ALTER TABLE "Warehouse" ADD COLUMN "type" TEXT NOT NULL DEFAULT "SELLABLE"',
        'ALTER TABLE "Warehouse" ADD COLUMN "isMaintenanceDefault" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "Branch" ADD COLUMN "isMaintenanceHQ" BOOLEAN NOT NULL DEFAULT false',

        // New Tables & Missing Columns
        'CREATE TABLE IF NOT EXISTS "Model" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "categoryId" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
        'CREATE UNIQUE INDEX IF NOT EXISTS "Model_name_categoryId_key" ON "Model"("name", "categoryId")',
        'CREATE TABLE IF NOT EXISTS "Attribute" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
        'CREATE UNIQUE INDEX IF NOT EXISTS "Attribute_name_key" ON "Attribute"("name")',
        'CREATE TABLE IF NOT EXISTS "Sequence" ("name" TEXT NOT NULL PRIMARY KEY, "value" INTEGER NOT NULL DEFAULT 0)',
        'CREATE TABLE IF NOT EXISTS "CommissionRule" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "type" TEXT NOT NULL, "value" DECIMAL NOT NULL DEFAULT 0.00, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
        'ALTER TABLE "Customer" ADD COLUMN "totalPurchaseValue" DECIMAL NOT NULL DEFAULT 0.00',
        'ALTER TABLE "Customer" ADD COLUMN "receivesNotifications" BOOLEAN NOT NULL DEFAULT true',
        'ALTER TABLE "JournalEntry" ADD COLUMN "idempotencyKey" TEXT',
        'ALTER TABLE "JournalEntry" ADD COLUMN "transactionId" TEXT',
        'ALTER TABLE "NotificationLog" ADD COLUMN "metadata" TEXT',
        'ALTER TABLE "Product" ADD COLUMN "modelId" TEXT',
        'ALTER TABLE "Product" ADD COLUMN "attributeId" TEXT',
        'ALTER TABLE "PurchaseItem" ADD COLUMN "unitOfMeasureId" TEXT',
        'ALTER TABLE "PurchaseItem" ADD COLUMN "conversionFactor" DECIMAL NOT NULL DEFAULT 1.00',
        'ALTER TABLE "Sale" ADD COLUMN "idempotencyKey" TEXT',
        'ALTER TABLE "Sale" ADD COLUMN "isTimeSuspicious" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "TicketPart" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE "Transaction" ADD COLUMN "isTimeSuspicious" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "StockMovement" ADD COLUMN "idempotencyKey" TEXT',
        'ALTER TABLE "Ticket" ADD COLUMN "idempotencyKey" TEXT',

        // Legacy New Tables
        'CREATE TABLE IF NOT EXISTS "CashCategory" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "type" TEXT NOT NULL, "isSystem" BOOLEAN NOT NULL DEFAULT false, "glCode" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
        'CREATE UNIQUE INDEX IF NOT EXISTS "CashCategory_name_key" ON "CashCategory"("name")',
        'CREATE TABLE IF NOT EXISTS "SalePayment" ("id" TEXT NOT NULL PRIMARY KEY, "saleId" TEXT NOT NULL, "method" TEXT NOT NULL, "amount" DECIMAL NOT NULL, "reference" TEXT, CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)',
        'CREATE INDEX IF NOT EXISTS "SalePayment_saleId_idx" ON "SalePayment"("saleId")'
    ];

    const CURRENT_SCHEMA_VERSION = prePatchStatements.length;
    log(`Migrations: Target schema version: ${CURRENT_SCHEMA_VERSION}`);

    // Check current version
    const versionOutput = runSqlWithOutput('PRAGMA user_version;');
    let currentVersion = 0;
    if (versionOutput) {
        try {
            const parsed = JSON.parse(versionOutput);
            currentVersion = parsed[0]?.user_version || 0;
        } catch (e) {
            log(`Migrations: Failed to parse user_version: ${e.message}`);
        }
    }
    log(`Migrations: Current schema version: ${currentVersion}`);

    if (currentVersion < CURRENT_SCHEMA_VERSION) {
        log(`Migrations: Applying ${CURRENT_SCHEMA_VERSION - currentVersion} missing patches...`);
        sendStatus(`Optimizing Database (${currentVersion}/${CURRENT_SCHEMA_VERSION})...`);

        for (let i = currentVersion; i < CURRENT_SCHEMA_VERSION; i++) {
            const sql = prePatchStatements[i];
            const ok = runSql(sql + ';');
            if (ok) {
                // Update version after each successful patch to allow resuming
                runSql(`PRAGMA user_version = ${i + 1};`);
            }
            if (i % 5 === 0 || i === CURRENT_SCHEMA_VERSION - 1) {
                sendStatus(`Optimizing Database (${i + 1}/${CURRENT_SCHEMA_VERSION})...`);
            }
            log(`Migrations: Pre-patch ${ok ? 'OK' : 'SKIP'}: ${sql.slice(0, 70)}...`);
        }
        log('Migrations: Pre-patch complete.');
    } else {
        log('Migrations: Database already up to date.');
    }
    log(`Migrations: Phase complete in ${Date.now() - startTime}ms.`);
    // ──────────────────────────────────────────────────────────────────────────

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

    // REMOVED Redundant Integrity Check (handled in db-init.ts)

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

            let pollCount = 0;
            const MAX_POLL = 120; // 60 seconds at 500ms intervals
            const poll = setInterval(() => {
                if (++pollCount > MAX_POLL) {
                    clearInterval(poll);
                    reject(new Error('Server failed to start within 60 seconds. Checkout casper-boot.log.'));
                    return;
                }
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
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, contextIsolation: true
        }
    });
    splashWindow.loadFile(path.join(__dirname, 'splash.html'));
};

const createWindow = async () => {
    createSplashWindow();

    // Auto-open folder after download completes
    session.defaultSession.on('will-download', (event, item, webContents) => {
        item.once('done', (event, state) => {
            if (state === 'completed') {
                const savePath = item.getSavePath();
                if (savePath) shell.showItemInFolder(savePath);
            }
        });
    });

    const iconPath = path.join(__dirname, '..', 'public', 'assets', 'casper-light.png');
    mainWindow = new BrowserWindow({
        width: 1200, height: 800, minWidth: 900, minHeight: 640, icon: iconPath, frame: false, titleBarStyle: 'hidden', show: false,
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

        // Check for updates shortly after boot
        setTimeout(() => {
            if (app.isPackaged) {
                log('Updater: Triggering check for updates...');
                autoUpdater.checkForUpdatesAndNotify();
            }
        }, 5000);
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

// --- AUTO UPDATER EVENTS AND IPC ---
autoUpdater.on('checking-for-update', () => log('Updater: Checking for update...'));
autoUpdater.on('update-available', (info) => {
    log('Updater: Update available.');
    if (mainWindow) mainWindow.webContents.send('updater:update-available', info);
});
autoUpdater.on('update-not-available', (info) => log('Updater: Update not available.'));
autoUpdater.on('error', (err) => {
    log(`Updater Error: ${err.message}`);
    if (mainWindow) mainWindow.webContents.send('updater:error', err.message);
});
autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) mainWindow.webContents.send('updater:download-progress', progressObj);
});
autoUpdater.on('update-downloaded', (info) => {
    log('Updater: Update downloaded.');
    if (mainWindow) mainWindow.webContents.send('updater:update-downloaded', info);
});

ipcMain.handle('app:install-update', () => {
    log('Updater: Installing update and quitting...');
    autoUpdater.quitAndInstall(false, true);
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false);

ipcMain.handle('shell:open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        log(`Shell openExternal Error: ${error.message}`);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('printers:list', async () => {
    if (!mainWindow) return [];
    try {
        return await mainWindow.webContents.getPrintersAsync();
    } catch (error) {
        log(`Error getting printers: ${error.message}`);
        return [];
    }
});

/**
 * Dedicated Handler for Standard (A4/Office) Printing
 */
const handleStandardPrint = async (event, html, printerName, options) => {
    if (!mainWindow) return { success: false, error: 'Main window not found' };

    // Check if custom pageSize is provided in options
    const hasCustomPageSize = options?.pageSize && typeof options.pageSize === 'object';
    const labelWidth = hasCustomPageSize ? options.pageSize.width : 0;
    const labelHeight = hasCustomPageSize ? options.pageSize.height : 0;

    log(`[StandardPrint] Custom pageSize: ${hasCustomPageSize}, width: ${labelWidth}µm, height: ${labelHeight}µm`);

    const printWindow = new BrowserWindow({
        show: false,
        width: hasCustomPageSize ? Math.round(labelWidth / 38.1) : 1024,
        height: hasCustomPageSize ? Math.round(labelHeight / 38.1) : 1024,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const tempFilePath = path.join(os.tmpdir(), `casper_a4_${Date.now()}.html`);

    try {
        fs.writeFileSync(tempFilePath, html, 'utf8');
        await printWindow.loadFile(tempFilePath);

        // Wait for fonts & content
        await printWindow.webContents.executeJavaScript(`
            new Promise(r => {
                if (document.readyState === 'complete') document.fonts.ready.then(r);
                else window.addEventListener('load', () => document.fonts.ready.then(r));
            })
        `);
        await new Promise(r => setTimeout(r, 2000));

        const printOptions = {
            silent: true,
            deviceName: printerName && printerName !== 'none' ? printerName : '',
            printBackground: true,
            color: true,
            margins: hasCustomPageSize ? { marginType: 'none' } : { marginType: 'none' },
            ...(hasCustomPageSize ? {
                pageSize: {
                    width: labelWidth,
                    height: labelHeight
                }
            } : { pageSize: 'A4' }),
            ...options
        };

        log(`Print [${hasCustomPageSize ? 'Label/Custom' : 'Standard/A4'}]: Sending to [${printerName}], pageSize: ${JSON.stringify(printOptions.pageSize)}`);

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (!printWindow.isDestroyed()) printWindow.destroy();
                resolve({ success: false, error: 'A4 print timeout' });
            }, 25000);

            printWindow.webContents.print(printOptions, (success, errorType) => {
                clearTimeout(timeout);
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) { }
                if (!printWindow.isDestroyed()) printWindow.destroy();
                resolve({ success, error: errorType });
            });
        });
    } catch (error) {
        log(`Print [${hasCustomPageSize ? 'Label/Custom' : 'Standard/A4'}] Fatal Error: ${error.message}`);
        if (!printWindow.isDestroyed()) printWindow.destroy();
        return { success: false, error: error.message };
    }
};

/**
 * Dedicated Handler for Thermal (Roll/Receipt) Printing
 */
const handleThermalPrint = async (event, html, printerName, paperWidthMm) => {
    if (!mainWindow) return { success: false, error: 'Main window not found' };

    const widthPx = Math.round((paperWidthMm || 80) * 3.78);
    const printWindow = new BrowserWindow({
        show: false,
        width: widthPx,
        height: 1024,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const tempFilePath = path.join(os.tmpdir(), `casper_thermal_${Date.now()}.html`);

    try {
        fs.writeFileSync(tempFilePath, html, 'utf8');
        await printWindow.loadFile(tempFilePath);

        // Wait for fonts & content
        await printWindow.webContents.executeJavaScript(`
            new Promise(r => {
                if (document.readyState === 'complete') document.fonts.ready.then(r);
                else window.addEventListener('load', () => document.fonts.ready.then(r));
            })
        `);
        await new Promise(r => setTimeout(r, 1000));


        log(`Print [Thermal] Requested: HTML Length [${html?.length}], Printer [${printerName}], Width [${paperWidthMm}mm]`);

        const printOptions = {
            silent: true,
            deviceName: (printerName && printerName !== 'none' && printerName !== 'undefined') ? printerName : '',
            printBackground: true,
            color: false, // Thermal is B&W
            margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 }, // No margins for thermal
            pageSize: {
                width: Math.round((paperWidthMm || 80) * 1000),
                height: 1000000 // Very tall height for continuous thermal roll - prevents page splitting
            }
        };

        log(`Print [Thermal] Options: ${JSON.stringify(printOptions)}`);

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (!printWindow.isDestroyed()) printWindow.destroy();
                resolve({ success: false, error: 'Thermal print timeout' });
            }, 15000);

            printWindow.webContents.print(printOptions, (success, errorType) => {
                clearTimeout(timeout);
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) { }
                if (!printWindow.isDestroyed()) printWindow.destroy();
                resolve({ success, error: errorType });
            });
        });
    } catch (error) {
        log(`Print [Thermal] Fatal Error: ${error.message}`);
        if (!printWindow.isDestroyed()) printWindow.destroy();
        return { success: false, error: error.message };
    }
};

ipcMain.handle('print:to-pdf', async (event, html, filename) => {
    if (!mainWindow) return { success: false, error: 'Main window not found' };

    const printWindow = new BrowserWindow({
        show: false,
        width: 1024,
        height: 1024,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const tempFilePath = path.join(os.tmpdir(), `casper_pdf_${Date.now()}.html`);

    try {
        fs.writeFileSync(tempFilePath, html, 'utf8');
        await printWindow.loadFile(tempFilePath);

        await printWindow.webContents.executeJavaScript(`
            new Promise(r => {
                if (document.readyState === 'complete') document.fonts.ready.then(r);
                else window.addEventListener('load', () => document.fonts.ready.then(r));
            })
        `);
        await new Promise(r => setTimeout(r, 2000));

        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export PDF',
            defaultPath: path.join(os.homedir(), filename || `invoice_${Date.now()}.pdf`),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (canceled || !filePath) {
            if (!printWindow.isDestroyed()) printWindow.destroy();
            return { success: false, error: 'Cancelled' };
        }

        const data = await printWindow.webContents.printToPDF({
            margins: { marginType: 'none' },
            pageSize: 'A4',
            printBackground: true
        });

        fs.writeFileSync(filePath, data);
        if (!printWindow.isDestroyed()) printWindow.destroy();
        try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) { }

        // Open location
        shell.showItemInFolder(filePath);

        return { success: true, path: filePath };
    } catch (error) {
        log(`PDF Export Fatal Error: ${error.message}`);
        if (!printWindow.isDestroyed()) printWindow.destroy();
        return { success: false, error: error.message };
    }
});

ipcMain.handle('print:standard', handleStandardPrint);
ipcMain.handle('print:thermal', async (event, html, printerName, paperWidthMm) => {
    return await handleThermalPrint(event, html, printerName, paperWidthMm);
});
// Legacy support
ipcMain.handle('print:silent', handleStandardPrint);
ipcMain.handle('app:print-thermal-receipt', async (event, html, printerName, paperWidthMm) => {
    return await handleThermalPrint(event, html, printerName, paperWidthMm);
});

// --- NEW CONFIG AND SETUP IPC HANDLERS ---
const loadConfig = () => {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'casper-config.json');
    if (fs.existsSync(configPath)) {
        try {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            log(`Failed to parse config: ${e.message}`);
        }
    }
    return {};
};

ipcMain.handle('dialog:showOpenDialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Database Folder'
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:showBackupFolderDialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Custom Backup Folder'
    });
    if (result.canceled || !result.filePaths[0]) return null;

    let selectedPath = result.filePaths[0];
    if (!selectedPath.endsWith('Casper Backups')) {
        selectedPath = path.join(selectedPath, 'Casper Backups');
        if (!fs.existsSync(selectedPath)) {
            fs.mkdirSync(selectedPath, { recursive: true });
        }
    }
    return selectedPath;
});

ipcMain.handle('app:get-config', () => {
    return loadConfig();
});

ipcMain.handle('app:get-db-path', () => {
    return path.dirname(getDatabasePath());
});

ipcMain.handle('license:get-machine-id', () => {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        if (platform === 'win32') {
            exec('wmic csproduct get uuid', (error, stdout) => {
                if (error) return reject(error);
                const lines = stdout.split('\n');
                resolve(lines[1]?.trim() || '');
            });
        } else if (platform === 'darwin') {
            exec('ioreg -d2 -c IOPlatformExpertDevice | awk -F\\" \'/IOPlatformUUID/{print $(NF-1)}\'', (error, stdout) => {
                if (error) return reject(error);
                resolve(stdout.trim());
            });
        } else if (platform === 'linux') {
            exec('cat /var/lib/dbus/machine-id || cat /etc/machine-id', (error, stdout) => {
                if (error) return reject(error);
                resolve(stdout.trim());
            });
        } else {
            reject(new Error(`Unsupported platform: ${platform}`));
        }
    });
});

ipcMain.handle('app:save-config-and-restart', async (event, newDbFolder) => {
    try {
        const userDataPath = app.getPath('userData');
        const configPath = path.join(userDataPath, 'casper-config.json');
        const existingConfig = loadConfig();
        const newConfig = { ...existingConfig, dbPath: newDbFolder };

        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
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

ipcMain.handle('app:save-backup-config', async (event, configData) => {
    try {
        const userDataPath = app.getPath('userData');
        const configPath = path.join(userDataPath, 'casper-config.json');

        const existingConfig = loadConfig();
        const newConfig = { ...existingConfig, ...configData };

        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
        log(`Saved custom backup config: path=${configData.backupPath}, interval=${configData.backupInterval}`);
        return { success: true };
    } catch (err) {
        log(`Failed to save backup config: ${err.message}`);
        return { success: false, error: err.message };
    }
});

// --- OFFLINE DATA PERSISTENCE & MAINTENANCE ---


ipcMain.handle('app:save-offline-data', async (event, data) => {
    try {
        const dbPath = getDatabasePath();
        const userDataPath = app.getPath('userData');
        const hiddenMirrorPath = path.join(userDataPath, 'local_mirror.db');

        // 1. Always create the hidden fail-safe mirror
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, hiddenMirrorPath);
            // log(`Mirror: SQLite mirrored to ${hiddenMirrorPath}`); // Too noisy for 15min intervals
        } else {
            throw new Error(`Source database not found at ${dbPath}`);
        }

        // 2. Custom Destination Backup with Timestamp & Cleanup
        const config = loadConfig();
        if (config.backupPath && fs.existsSync(config.backupPath)) {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            const customBackupName = `casper_backup_${timestamp}.db`;
            const customBackupPath = path.join(config.backupPath, customBackupName);

            fs.copyFileSync(dbPath, customBackupPath);
            log(`Backup saved to ${customBackupPath}`);

            // Cleanup: Keep only the configured number of recent .db files (default 30)
            try {
                const maxBackups = config.maxBackups || 30;
                const files = fs.readdirSync(config.backupPath);
                const dbBackups = files
                    .filter(f => f.startsWith('casper_backup_') && f.endsWith('.db'))
                    .map(f => ({
                        name: f,
                        path: path.join(config.backupPath, f),
                        time: fs.statSync(path.join(config.backupPath, f)).mtime.getTime()
                    }))
                    .sort((a, b) => b.time - a.time); // Newest first

                if (dbBackups.length > maxBackups) {
                    const filesToDelete = dbBackups.slice(maxBackups);
                    filesToDelete.forEach(file => {
                        fs.unlinkSync(file.path);
                        log(`Auto-cleanup: Deleted old backup ${file.name}`);
                    });
                }
            } catch (cleanupErr) {
                log(`Auto-cleanup failed: ${cleanupErr.message}`);
            }
        } else if (data && data.isManual) {
            // If it's a manual backup and no path is configured, we should probably warn them,
            // but the UI shouldn't allow the button to be clicked anyway.
            if (!config.backupPath) {
                throw new Error("No backup path configured. Please apply configuration first.");
            }
        }

        // 3. Save frontend offline json metadata if provided
        if (data && Object.keys(data).length > 0 && !data.isManual) {
            const jsonPath = path.join(userDataPath, 'offline_backup.json');
            fs.writeFileSync(jsonPath, JSON.stringify(data), 'utf8');
        }
        return { success: true };
    } catch (err) {
        log(`Failed to save offline data: ${err.message}`);
        // Do not crash the app, return gracefully
        return { success: false, error: err.message };
    }
});

ipcMain.handle('app:get-available-backups', async () => {
    try {
        const config = loadConfig();
        if (!config.backupPath || !fs.existsSync(config.backupPath)) {
            return { success: true, backups: [] };
        }

        const files = fs.readdirSync(config.backupPath);
        const dbBackups = files
            .filter(f => f.startsWith('casper_backup_') && f.endsWith('.db'))
            .map(f => {
                const fullPath = path.join(config.backupPath, f);
                const stats = fs.statSync(fullPath);
                return {
                    filename: f,
                    path: fullPath,
                    sizeBytes: stats.size,
                    createdAt: stats.mtime.toISOString(),
                };
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return { success: true, backups: dbBackups };
    } catch (err) {
        log(`Failed to get available backups: ${err.message}`);
        return { success: false, error: err.message };
    }
});

// App: Delete specific backup file
ipcMain.handle('app:delete-backup', async (event, backupPath) => {
    try {
        log(`Deleting backup file: ${backupPath}`);
        if (!fs.existsSync(backupPath)) {
            return { success: false, error: 'Backup file not found' };
        }

        fs.unlinkSync(backupPath);
        log(`Backup file deleted successfully: ${backupPath}`);
        return { success: true };
    } catch (err) {
        log(`Failed to delete backup: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('app:restore-from-backup', async (event, backupFilePath) => {
    try {
        log(`RESTORE: Initiating restore from ${backupFilePath}`);

        if (!fs.existsSync(backupFilePath)) {
            throw new Error('Selected backup file does not exist.');
        }

        const activeDbPath = getDatabasePath();

        // Safety Strategy: We cannot replace the active DB while Prisma or Next.js holds a lock on it.
        // The safest way to do this in Electron without introducing complex Prisma disconnection IPCs
        // is to kill the Next.js/Prisma server child process entirely, replace the file, and relaunch the app.

        log(`RESTORE: Killing Next.js server to release database locks...`);
        if (nextServer) {
            nextServer.kill('SIGKILL');
        }

        // Wait a brief moment to ensure file locks are released by the OS
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Copy overwrite
        log(`RESTORE: Copying backup to active database path...`);
        fs.copyFileSync(backupFilePath, activeDbPath);

        // Ensure sidecar WAL files are removed so the new DB state isn't corrupted by old WALs
        const walPath = `${activeDbPath}-wal`;
        const shmPath = `${activeDbPath}-shm`;
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

        log(`RESTORE: Complete. Restarting application...`);
        app.relaunch();
        app.quit();

        return { success: true };
    } catch (err) {
        log(`RESTORE FATAL ERROR: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('app:load-offline-data', async () => {
    try {
        const userDataPath = app.getPath('userData');
        const backupPath = path.join(userDataPath, 'offline_backup.json');
        if (!fs.existsSync(backupPath)) return null;
        return JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    } catch (err) { return null; }
});

ipcMain.handle('app:export-support-bundle', async () => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Support Bundle',
            defaultPath: path.join(os.homedir(), `casper_support_${Date.now()}.zip`),
            filters: [{ name: 'Zip Files', extensions: ['zip'] }]
        });
        if (canceled || !filePath) return null;
        const fsExtra = require('fs-extra');
        const exportDir = filePath.replace(/\.zip$/, '');
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
        const dbPath = getDatabasePath();
        if (fs.existsSync(dbPath)) fsExtra.copySync(dbPath, path.join(exportDir, 'local.db'));
        if (fs.existsSync(debugLog)) fsExtra.copySync(debugLog, path.join(exportDir, 'boot.log'));

        // Open folder (exportDir is a directory, not a file, so it opens the directory itself)
        shell.openPath(exportDir);

        return { success: true, path: exportDir };
    } catch (err) { return { success: false, error: err.message }; }
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
        const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}` };
        execSync(`"${process.execPath}" "${prismaJs}" db execute --stdin --schema "${schemaPath}"`, {
            env, input: 'VACUUM;', windowsHide: true, encoding: 'utf-8'
        });
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('app:safe-storage-encrypt', (event, plaintext) => {
    try {
        if (safeStorage.isEncryptionAvailable()) {
            return { success: true, data: safeStorage.encryptString(plaintext).toString('base64'), encrypted: true };
        }
        console.warn('safeStorage is not available. Passing through plaintext.');
        return { success: true, data: plaintext, encrypted: false };
    } catch (e) {
        console.error('Encryption failed', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('app:safe-storage-decrypt', (event, encryptedBase64) => {
    try {
        if (safeStorage.isEncryptionAvailable()) {
            const buffer = Buffer.from(encryptedBase64, 'base64');
            return { success: true, data: safeStorage.decryptString(buffer), encrypted: true };
        }
        return { success: true, data: encryptedBase64, encrypted: false };
    } catch (e) {
        console.error('Decryption failed', e);
        return { success: false, error: e.message };
    }
});

// WhatsApp Service Integration
let whatsappService = null;
try {
    whatsappService = require('./whatsappService');
} catch (err) {
    console.error('[Main] Failed to load whatsappService:', err);
}

ipcMain.handle('whatsapp:initialize', async () => {
    if (!whatsappService) return { success: false, error: 'WHATSAPP_MODULE_UNAVAILABLE' };
    try {
        await whatsappService.initialize((event, data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (event === 'status') {
                    mainWindow.webContents.send('whatsapp:status', data);
                } else if (event === 'qr') {
                    mainWindow.webContents.send('whatsapp:qr', data);
                }
            }
        });
        return { success: true, data: { status: whatsappService.getStatus() } };
    } catch (err) {
        console.error('[WhatsApp IPC] Initialize failed:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('whatsapp:getStatus', () => {
    if (!whatsappService) return { success: false, data: { status: 'DISCONNECTED' } };
    try {
        return { success: true, data: { status: whatsappService.getStatus() } };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('whatsapp:logout', async () => {
    if (!whatsappService) return { success: false, error: 'WHATSAPP_MODULE_UNAVAILABLE' };
    try {
        return await whatsappService.logout();
    } catch (err) {
        console.error('[WhatsApp IPC] Logout failed:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('whatsapp:sendMessage', async (event, to, body) => {
    if (!whatsappService) return { success: false, error: 'WHATSAPP_MODULE_UNAVAILABLE' };
    try {
        return await whatsappService.sendMessage(to, body);
    } catch (err) {
        console.error('[WhatsApp IPC] SendMessage failed:', err);
        return { success: false, error: err.message };
    }
});

app.whenReady().then(createWindow);