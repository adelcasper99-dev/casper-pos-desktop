const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── CONFIGURATION ───
const isWindows = process.platform === 'win32';
const homeDir = process.env.APPDATA || (isWindows ? process.env.USERPROFILE + '\\AppData\\Roaming' : process.env.HOME + '/Library/Application Support');
const dbDir = path.join(homeDir, 'casper-pos-desktop');
const dbPath = path.join(dbDir, 'local.db');
const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
// Try to find prisma index.js
let prismaJs = path.resolve(__dirname, '../../node_modules/prisma/build/index.js');
if (!fs.existsSync(prismaJs)) {
    // If not found (e.g. running from a different root), try a broader search or assume standard location
    prismaJs = 'npx prisma'; 
}

const env = {
    ...process.env,
    DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}`
};

function log(msg) {
    console.log(`[SIMULATOR] ${msg}`);
}

async function run() {
    log(`Starting corruption simulation on: ${dbPath}`);
    
    if (!fs.existsSync(dbPath)) {
        log(`ERROR: Database not found at ${dbPath}. Please run the app once first.`);
        return;
    }

    // 1. Find the latest open shift
    log("Identifying active shift...");
    const prismaCmd = (sql) => `"${process.execPath}" "${prismaJs}" db execute --stdin --schema "${schemaPath}"`;
    
    try {
        // We use a raw SQL approach to insert the "Text" corruption
        // SQLite typeof('0.00') is 'text' if inserted with double quotes in a numeric column in some contexts,
        // but reliably we can just UPDATE it.
        
        log("Inserting 'String' corruption into Shift.totalCashSales...");
        // This is the "Digest" killer: inserting a string literal that Decimal.js/Prisma might struggle with 
        // if it expects a number but gets a string that doesn't parse correctly or behaves oddly.
        // Actually, Prisma SQLite provider returns strings for Decimals. 
        // The real killer is when the value is something like "CorruptedData" or just literal '"0.00"' in a way that breaks prototype methods.
        
        const corruptSql = `UPDATE "Shift" SET "totalCashSales" = 'NOT_A_NUMBER' WHERE "status" = 'OPEN';`;
        execSync(`echo ${corruptSql} | npx prisma db execute --stdin --schema "${schemaPath}"`, { env, stdio: 'inherit' });
        
        log("✅ CORRUPTION INSERTED: Shift.totalCashSales is now 'NOT_A_NUMBER'");
        log("Now, try to open the Shift Status Preview or Close Shift in the app.");
        log("The expected behavior is:");
        log("1. main.js Pre-Patch would heal this on NEXT RESTART (if we had the healing logic for totalCashSales).");
        log("2. decimal-utils.ts toDecimal() will catch the NaN and return 0 instead of crashing the whole page.");
        
    } catch (err) {
        log(`Simulation failed: ${err.message}`);
    }
}

run();
