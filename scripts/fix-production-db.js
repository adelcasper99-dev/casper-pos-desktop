/**
 * Emergency fix script — applies missing device-fields columns
 * and CashCategory table to the current production local.db
 * Run once: node scripts/fix-production-db.js
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

// Attempt to use better-sqlite3 if available, otherwise use child_process sqlite3 CLI
let db;
try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'casper-pos-desktop', 'local.db');

    if (!fs.existsSync(dbPath)) {
        console.error('ERROR: Database not found at', dbPath);
        process.exit(1);
    }

    console.log('Opening:', dbPath);
    db = new Database(dbPath);

    const applyColumn = (table, column, definition) => {
        const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
        const exists = cols.some(c => c.name === column);
        if (exists) {
            console.log(`  SKIP: ${table}.${column} already exists`);
        } else {
            db.prepare(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`).run();
            console.log(`  ADD:  ${table}.${column}`);
        }
    };

    console.log('\n--- Product columns ---');
    applyColumn('Product', 'isDevice',   'BOOLEAN NOT NULL DEFAULT false');
    applyColumn('Product', 'deviceType', 'TEXT');
    applyColumn('Product', 'condition',  'TEXT');
    applyColumn('Product', 'color',      'TEXT');

    console.log('\n--- PurchaseItem columns ---');
    applyColumn('PurchaseItem', 'imei',        'TEXT');
    applyColumn('PurchaseItem', 'condition',   'TEXT');
    applyColumn('PurchaseItem', 'color',       'TEXT');
    applyColumn('PurchaseItem', 'deviceType',  'TEXT');
    applyColumn('PurchaseItem', 'returnedQty', 'INTEGER NOT NULL DEFAULT 0');

    console.log('\n--- SaleItem columns ---');
    applyColumn('SaleItem', 'imei',       'TEXT');
    applyColumn('SaleItem', 'condition',  'TEXT');
    applyColumn('SaleItem', 'color',      'TEXT');
    applyColumn('SaleItem', 'deviceType', 'TEXT');

    console.log('\n--- CashCategory table ---');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='CashCategory'").all();
    if (tables.length > 0) {
        console.log('  SKIP: CashCategory table already exists');
    } else {
        db.prepare(`
            CREATE TABLE "CashCategory" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL,
                "type" TEXT NOT NULL,
                "isSystem" BOOLEAN NOT NULL DEFAULT false,
                "glCode" TEXT,
                "isActive" BOOLEAN NOT NULL DEFAULT true,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" DATETIME NOT NULL
            )
        `).run();
        db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS "CashCategory_name_key" ON "CashCategory"("name")`).run();
        console.log('  CREATED: CashCategory table');
    }

    // Mark the migration as applied in _prisma_migrations so deploy doesn't re-run it
    console.log('\n--- Registering migration in _prisma_migrations ---');
    const migName = '20260407000000_add_device_fields';
    const alreadyApplied = db.prepare(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = ?`
    ).get(migName);

    if (alreadyApplied) {
        console.log('  SKIP: Migration already registered');
    } else {
        db.prepare(`
            INSERT INTO "_prisma_migrations"
                (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES
                (lower(hex(randomblob(16))), 'manual', CURRENT_TIMESTAMP, ?, NULL, NULL, CURRENT_TIMESTAMP, 1)
        `).run(migName);
        console.log('  REGISTERED:', migName);
    }

    db.close();
    console.log('\n✅ Production database patched successfully.');
    console.log('   Rebuild the app with: npm run build:electron');

} catch (err) {
    console.error('\n❌ Fix failed:', err.message);
    if (db) try { db.close(); } catch(_) {}
    process.exit(1);
}
