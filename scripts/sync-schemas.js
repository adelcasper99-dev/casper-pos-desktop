/**
 * sync-schemas.js
 * ---------------
 * Keeps prisma/schema.prisma (SQLite, for local dev) and
 * prisma/schema.postgres.prisma (PostgreSQL, for cloud builds) in sync.
 * Also automatically syncs the TENANT_AWARE_MODELS array in prisma-tenant-extension.ts.
 *
 * Usage:
 *   node scripts/sync-schemas.js           <- write postgres from sqlite (default)
 *   node scripts/sync-schemas.js --sqlite  <- write sqlite from postgres
 */

const fs = require('fs');
const path = require('path');

const SQLITE_SCHEMA  = path.resolve(__dirname, '../prisma/schema.prisma');
const POSTGRES_SCHEMA = path.resolve(__dirname, '../prisma/schema.postgres.prisma');

const toPostgres = (src) => src.replace('provider = "sqlite"', 'provider = "postgresql"');
const toSqlite   = (src) => src.replace('provider = "postgresql"', 'provider = "sqlite"');

const args = process.argv.slice(2);

function syncTenantAwareModels() {
    const extPath = path.resolve(__dirname, '../src/lib/prisma-tenant-extension.ts');
    if (!fs.existsSync(extPath)) {
        console.warn('[sync-schemas] prisma-tenant-extension.ts not found. Skipping TENANT_AWARE_MODELS sync.');
        return;
    }
    const schemaContent = fs.readFileSync(SQLITE_SCHEMA, 'utf8');
    
    // Regex to match: model <Name> { <fields> }
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    const tenantAwareModels = [];
    
    let match;
    while ((match = modelRegex.exec(schemaContent)) !== null) {
        const modelName = match[1];
        const modelBody = match[2];
        if (/\btenantId\b/.test(modelBody)) {
            tenantAwareModels.push(modelName);
        }
    }
    
    tenantAwareModels.sort();
    
    let extContent = fs.readFileSync(extPath, 'utf8');
    const startMarker = 'const TENANT_AWARE_MODELS = [';
    const endMarker = '];';
    
    const startIndex = extContent.indexOf(startMarker);
    if (startIndex === -1) {
        console.error('ERROR: Could not find const TENANT_AWARE_MODELS = [ in prisma-tenant-extension.ts');
        process.exit(1);
    }
    
    const endIndex = extContent.indexOf(endMarker, startIndex);
    if (endIndex === -1) {
        console.error('ERROR: Could not find closing ]; in prisma-tenant-extension.ts');
        process.exit(1);
    }
    
    const formattedList = tenantAwareModels.map(m => `    '${m}'`).join(',\n');
    const newBlock = `${startMarker}\n${formattedList}\n`;
    
    const newExtContent = extContent.substring(0, startIndex) + newBlock + extContent.substring(endIndex);
    fs.writeFileSync(extPath, newExtContent);
    console.log(`[sync-schemas] Automatically synced ${tenantAwareModels.length} tenant-aware models to prisma-tenant-extension.ts`);
}

if (args.includes('--sqlite')) {
    if (!fs.existsSync(POSTGRES_SCHEMA)) {
        console.error('ERROR: schema.postgres.prisma not found. Run without --sqlite first.');
        process.exit(1);
    }
    const src = fs.readFileSync(POSTGRES_SCHEMA, 'utf8');
    const out = toSqlite(src);
    if (!out.includes('provider = "sqlite"')) {
        console.error('ERROR: sync-schemas --sqlite failed: provider = "sqlite" not found in output. Check schema format.');
        process.exit(1);
    }
    fs.writeFileSync(SQLITE_SCHEMA, out);
    console.log('[sync-schemas] schema.prisma (SQLite) updated from schema.postgres.prisma');
    syncTenantAwareModels();
} else {
    if (!fs.existsSync(SQLITE_SCHEMA)) {
        console.error('ERROR: schema.prisma not found.');
        process.exit(1);
    }
    const src = fs.readFileSync(SQLITE_SCHEMA, 'utf8');
    // Guard: make sure source is actually sqlite before syncing
    if (!src.includes('provider = "sqlite"')) {
        console.warn('[sync-schemas] WARNING: schema.prisma already has a non-sqlite provider. Syncing as-is.');
    }
    const out = toPostgres(src);
    if (!out.includes('provider = "postgresql"')) {
        console.error('ERROR: sync-schemas failed: provider = "postgresql" not found in output. Check schema format.');
        process.exit(1);
    }
    fs.writeFileSync(POSTGRES_SCHEMA, out);
    console.log('[sync-schemas] schema.postgres.prisma (PostgreSQL) updated from schema.prisma');
    syncTenantAwareModels();
}
