const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { execSync, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const whatsappService = require('./whatsappService');


const debugLog = path.join(os.homedir(), 'casper-boot.log');
const log = (msg) => {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] [PROCESS ${process.pid}] ${msg}\n`);
};

/**
 * Hardened IPC Error Handlers
 */
const safeHandle = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            const result = await handler(event, ...args);
            // If the result is already in {success, data} format, return it directly
            if (result && typeof result === 'object' && ('success' in result)) {
                return result;
            }
            return { success: true, data: result };
        } catch (error) {
            log(`IPC Error [${channel}]: ${error.message}`);
            return { success: false, error: error.message };
        }
    });
};

const safeOn = (channel, handler) => {
    ipcMain.on(channel, (event, ...args) => {
        try {
            handler(event, ...args);
        } catch (error) {
            log(`IPC Exception [${channel}]: ${error.message}`);
        }
    });
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
                if (!fs.existsSync(config.dbPath)) {
                    fs.mkdirSync(config.dbPath, { recursive: true });
                }
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

    const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: dbUrl,
        PRISMA_QUERY_ENGINE_LIBRARY: queryEnginePath,
        PRISMA_SCHEMA_ENGINE_BINARY: schemaEnginePath,
        PRISMA_CLI_QUERY_ENGINE_TYPE: 'library'
    };

    const runSql = (sql) => {
        try {
            execSync(`"${process.execPath}" "${prismaJs}" db execute --stdin --schema "${schemaPath}"`, {
                env, input: sql, windowsHide: true, encoding: 'utf-8'
            });
            return true;
        } catch (e) {
            return false;
        }
    };

    // ─── Pre-Patch: Apply each missing column individually ────────────────────
    // Each statement runs in isolation so "duplicate column" errors on already-
    // patched databases are silently ignored without blocking the full migration.
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
      // Backfill: Migrate sharedLossAmount to new field (Skips NULL and zero intentionally)
      // Safety: Only run if sharedLossAmount column actually exists to prevent SQLite from interpreting the name as a string literal
      'UPDATE "Ticket" SET "excessLossAmount" = "sharedLossAmount" WHERE (SELECT COUNT(*) FROM pragma_table_info("Ticket") WHERE name = "sharedLossAmount") > 0 AND "sharedLossAmount" > 0',
      // Self-healing: If data was already corrupted by the string literal "sharedLossAmount", reset it to 0.00
      'UPDATE "Ticket" SET "excessLossAmount" = 0.00 WHERE typeof("excessLossAmount") = "text"',

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
      // Backfill: Migrate sharedLossRate to lossRate (Prevents overwriting fresh 70.00 defaults)
      // Safety: Only run if sharedLossRate column actually exists to prevent SQLite from interpreting the name as a string literal
      'UPDATE "Technician" SET "lossRate" = "sharedLossRate" WHERE (SELECT COUNT(*) FROM pragma_table_info("Technician") WHERE name = "sharedLossRate") > 0 AND "sharedLossRate" IS NOT NULL AND "sharedLossRate" != 70.00',
      // Self-healing: If data was already corrupted by the string literal "sharedLossRate", reset it to 70.00
      'UPDATE "Technician" SET "lossRate" = 70.00 WHERE typeof("lossRate") = "text"',

      // Warehouse & Branch
      'ALTER TABLE "Warehouse" ADD COLUMN "type" TEXT NOT NULL DEFAULT "SELLABLE"',
      'ALTER TABLE "Warehouse" ADD COLUMN "isMaintenanceDefault" BOOLEAN NOT NULL DEFAULT false',
      'ALTER TABLE "Branch" ADD COLUMN "isMaintenanceHQ" BOOLEAN NOT NULL DEFAULT false',

      // New Tables
      'CREATE TABLE IF NOT EXISTS "CashCategory" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "type" TEXT NOT NULL, "isSystem" BOOLEAN NOT NULL DEFAULT false, "glCode" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
      'CREATE UNIQUE INDEX IF NOT EXISTS "CashCategory_name_key" ON "CashCategory"("name")',
      'CREATE TABLE IF NOT EXISTS "SalePayment" ("id" TEXT NOT NULL PRIMARY KEY, "saleId" TEXT NOT NULL, "method" TEXT NOT NULL, "amount" DECIMAL NOT NULL, "reference" TEXT, CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)',
      'CREATE INDEX IF NOT EXISTS "SalePayment_saleId_idx" ON "SalePayment"("saleId")',

      // --- COMPREHENSIVE DATA HEALING (Prevention of "White Screen" crashes) ---
      // These statements reset any Decimal columns that were corrupted with string literals 
      // (a common SQLite quirk when using double quotes in UPDATE statements with missing columns).
      
      // Product Healing
      'UPDATE "Product" SET "costPrice" = 0.00 WHERE typeof("costPrice") = "text"',
      'UPDATE "Product" SET "sellPrice" = 0.00 WHERE typeof("sellPrice") = "text"',
      'UPDATE "Product" SET "sellPrice2" = 0.00 WHERE typeof("sellPrice2") = "text"',
      'UPDATE "Product" SET "sellPrice3" = 0.00 WHERE typeof("sellPrice3") = "text"',
      
      // SaleItem Healing
      'UPDATE "SaleItem" SET "unitPrice" = 0.00 WHERE typeof("unitPrice") = "text"',
      'UPDATE "SaleItem" SET "unitCost" = 0.00 WHERE typeof("unitCost") = "text"',
      
      // Sale Healing
      'UPDATE "Sale" SET "totalAmount" = 0.00 WHERE typeof("totalAmount") = "text"',
      'UPDATE "Sale" SET "subTotal" = 0.00 WHERE typeof("subTotal") = "text"',
      'UPDATE "Sale" SET "discountAmount" = 0.00 WHERE typeof("discountAmount") = "text"',
      'UPDATE "Sale" SET "taxAmount" = 0.00 WHERE typeof("taxAmount") = "text"',
      
      // User/Employee Healing
      'UPDATE "User" SET "salary" = 0.00 WHERE typeof("salary") = "text"',
      'UPDATE "User" SET "maxDiscount" = 0.00 WHERE typeof("maxDiscount") = "text"',
      'UPDATE "User" SET "maxDiscountAmount" = 0.00 WHERE typeof("maxDiscountAmount") = "text"',

      // Shift Healing (CRITICAL: Prevents White Screen on Z-Report)
      'UPDATE "Shift" SET "totalCashSales" = 0.00 WHERE typeof("totalCashSales") = "text"',
      'UPDATE "Shift" SET "totalCardSales" = 0.00 WHERE typeof("totalCardSales") = "text"',
      'UPDATE "Shift" SET "totalWalletSales" = 0.00 WHERE typeof("totalWalletSales") = "text"',
      'UPDATE "Shift" SET "totalInstapay" = 0.00 WHERE typeof("totalInstapay") = "text"',
      'UPDATE "Shift" SET "totalAccountSales" = 0.00 WHERE typeof("totalAccountSales") = "text"',
      'UPDATE "Shift" SET "totalCashRefunds" = 0.00 WHERE typeof("totalCashRefunds") = "text"',
      'UPDATE "Shift" SET "totalAccountRefunds" = 0.00 WHERE typeof("totalAccountRefunds") = "text"'
    ];

    // --- OPTIMIZED PRE-PATCH BYPASS ---
    // 1. Determine target version based on statement count
    const targetPatchVersion = prePatchStatements.length;
    let cachedPatchVersion = 0;
    let casperConfig = {};
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'casper-config.json');

    try {
        if (fs.existsSync(configPath)) {
            casperConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            cachedPatchVersion = casperConfig.appliedPatchVersion || 0;
        }
    } catch (e) {
        log(`Config: Failed to load configuration for boot check: ${e.message}`);
    }

    let isAlreadyPatched = false;

    if (cachedPatchVersion === targetPatchVersion) {
        try {
            log('Database: Checking schema signature to verify cached version...');
            const signatureCheck = execSync(`"${process.execPath}" "${prismaJs}" db execute --stdin --schema "${schemaPath}"`, {
                env, input: 'SELECT name FROM sqlite_master WHERE type="table" AND name="CashCategory";', windowsHide: true, encoding: 'utf-8'
            });
            if (signatureCheck.includes('CashCategory')) {
                const columnCheck = execSync(`"${process.execPath}" "${prismaJs}" db execute --stdin --schema "${schemaPath}"`, {
                    env, input: 'PRAGMA table_info("Product");', windowsHide: true, encoding: 'utf-8'
                });
                if (columnCheck.includes('isDevice')) {
                    isAlreadyPatched = true;
                    log(`Database: Schema matches cached version (${targetPatchVersion}). Skipping 93 pre-patch migrations.`);
                }
            }
        } catch (e) {
            log(`Database: Schema signature check failed (expected on empty/new DB): ${e.message}`);
        }
    }

    if (!isAlreadyPatched) {
        log(`Migrations: Applying ${targetPatchVersion} pre-patch SQL statements...`);
        for (const sql of prePatchStatements) {
            const ok = runSql(sql + ';');
            log(`Migrations: Pre-patch ${ok ? 'OK' : 'SKIP'}: ${sql.slice(0, 70)}...`);
        }
        log('Migrations: Pre-patch complete.');

        // Save successfully applied version to config
        try {
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
            casperConfig.appliedPatchVersion = targetPatchVersion;
            fs.writeFileSync(configPath, JSON.stringify(casperConfig, null, 2), 'utf8');
            log(`Config: Updated appliedPatchVersion to ${targetPatchVersion}`);
        } catch (e) {
            log(`Config: Failed to write configuration: ${e.message}`);
        }
    }
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
            // Reset the applied patch version in config
            casperConfig.appliedPatchVersion = 0;
            try {
                fs.writeFileSync(configPath, JSON.stringify(casperConfig, null, 2), 'utf8');
                log('Config: Reset appliedPatchVersion to 0 due to auto-recovery.');
            } catch (configWriteErr) {
                log(`Config: Failed to write reset configuration during auto-recovery: ${configWriteErr.message}`);
            }

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
                    DATABASE_URL: `file:${normalizedDbPath}?socket_timeout=10000&connection_limit=1&journal_mode=WAL&synchronous=NORMAL&cache_size=-2000&temp_store=memory`,
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
            const MAX_POLL = 1200; // 60 seconds at 50ms intervals
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
            }, 50);

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

safeHandle('app:install-update', () => {
    autoUpdater.quitAndInstall();
});

safeOn('window:minimize', () => mainWindow?.minimize());
safeOn('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
safeOn('window:close', () => mainWindow?.close());
safeHandle('window:isMaximized', () => mainWindow?.isMaximized() || false);

safeHandle('shell:open-external', async (event, url) => {
    await shell.openExternal(url);
});

// --- WhatsApp Native Engine ---
const initWhatsApp = async () => {
    const waLogger = {
        info: (m) => log(`[WhatsApp] ${m}`),
        warn: (m) => log(`[WhatsApp] WARN: ${m}`),
        error: (m) => log(`[WhatsApp] ERROR: ${m}`)
    };

    try {
        await whatsappService.initialize((event, payload) => {
            if (mainWindow && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send(`whatsapp:${event}`, payload);
            }
        }, waLogger);
        return { success: true };
    } catch (err) {
        log(`[WhatsApp] Init error: ${err.message}`);
        return { success: false, error: err.message };
    }
};

safeHandle('whatsapp:initialize', async () => {
    return await initWhatsApp();
});

safeHandle('whatsapp:send-message', (_, to, body) => whatsappService.sendMessage(to, body));
safeHandle('whatsapp:get-status', () => ({ status: whatsappService.getStatus() }));
safeHandle('whatsapp:logout', async () => { 
    const result = await whatsappService.logout();
    return result;
});


safeHandle('printers:list', async () => {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({
        name: p.name,
        isDefault: p.isDefault,
        status: p.status
    }));
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
safeHandle('print:thermal', async (event, html, printerName, paperWidthMm) => {
    return await handleThermalPrint(event, html, printerName, paperWidthMm);
});
// Legacy support
ipcMain.handle('print:silent', handleStandardPrint);
safeHandle('app:print-thermal-receipt', async (event, html, printerName, paperWidthMm) => {
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

safeHandle('dialog:showOpenDialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Database Folder'
    });
    return result.canceled ? null : result.filePaths[0];
});

safeHandle('dialog:showBackupFolderDialog', async () => {
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

safeHandle('app:get-config', () => {
    return loadConfig();
});

safeHandle('app:get-db-path', () => {
    return path.dirname(getDatabasePath());
});

safeHandle('app:save-config-and-restart', async (event, newDbFolder) => {
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

// --- Restore From External File ---
safeHandle('dialog:showOpenDbFileDialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'اختر ملف قاعدة البيانات لاستعادته',
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        properties: ['openFile']
    });
    return canceled ? null : filePaths[0];
});

ipcMain.handle('app:restore-from-external-file', async (event, sourcePath) => {
    try {
        if (!fs.existsSync(sourcePath)) throw new Error('الملف المختار غير موجود');

        log(`RESTORE EXTERNAL: From ${sourcePath}`);
        const activeDbPath = getDatabasePath();

        // 1. Kill Next Server to release locks
        if (nextServer) nextServer.kill('SIGKILL');
        await new Promise(r => setTimeout(r, 1500));

        // 2. Backup current as safety
        const backupPath = `${activeDbPath}.pre-ext-restore.${Date.now()}.bak`;
        if (fs.existsSync(activeDbPath)) fs.copyFileSync(activeDbPath, backupPath);

        // 3. Copy new file
        fs.copyFileSync(sourcePath, activeDbPath);

        // 4. Cleanup WAL/SHM
        const walPath = `${activeDbPath}-wal`;
        const shmPath = `${activeDbPath}-shm`;
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

        log(`RESTORE EXTERNAL: Complete. Relaunching...`);
        app.relaunch();
        app.quit();
        return { success: true };
    } catch (err) {
        log(`RESTORE EXTERNAL ERROR: ${err.message}`);
        return { success: false, error: err.message };
    }
});

app.on('before-quit', () => {
    whatsappService.destroyClient();
});

app.whenReady().then(async () => {
    await initWhatsApp();
    createWindow();
});