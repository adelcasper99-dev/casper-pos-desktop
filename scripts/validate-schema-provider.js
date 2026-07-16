/**
 * validate-schema-provider.js
 * ----------------------------
 * Validates that the Prisma schema datasource provider matches the DATABASE_URL protocol.
 * Prevents Prisma from throwing runtime validation errors due to mismatches.
 *
 * Usage:
 *   node scripts/validate-schema-provider.js [--schema path/to/schema.prisma]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');

const schemaArgIndex = args.indexOf('--schema');
if (schemaArgIndex !== -1 && args[schemaArgIndex + 1]) {
    schemaPath = path.resolve(process.cwd(), args[schemaArgIndex + 1]);
} else if (args.includes('postgres')) {
    // Convenience shortcut
    schemaPath = path.resolve(__dirname, '../prisma/schema.postgres.prisma');
}

// 1. Get DATABASE_URL
let dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (match) {
            dbUrl = match[1];
        }
    }
}

if (!dbUrl) {
    console.error('❌ [validate-schema-provider] ERROR: DATABASE_URL is not defined in process.env or .env file.');
    process.exit(1);
}

// 2. Read schema provider
if (!fs.existsSync(schemaPath)) {
    console.error(`❌ [validate-schema-provider] ERROR: Schema file not found at: ${schemaPath}`);
    process.exit(1);
}

const schemaContent = fs.readFileSync(schemaPath, 'utf8');
const datasourceBlockMatch = schemaContent.match(/datasource\s+\w+\s*\{([^}]+)\}/);
if (!datasourceBlockMatch) {
    console.error(`❌ [validate-schema-provider] ERROR: Could not find datasource block in schema at: ${schemaPath}`);
    process.exit(1);
}
const datasourceBody = datasourceBlockMatch[1];
const providerMatch = datasourceBody.match(/^\s*provider\s*=\s*["']?(\w+)["']?/m);

if (!providerMatch) {
    console.error(`❌ [validate-schema-provider] ERROR: Could not find datasource provider in schema at: ${schemaPath}`);
    process.exit(1);
}

const schemaProvider = providerMatch[1].toLowerCase();

// 3. Determine expected provider based on URL protocol
let expectedProvider = '';
const dbUrlLower = dbUrl.toLowerCase();

if (dbUrlLower.startsWith('postgresql://') || dbUrlLower.startsWith('postgres://')) {
    expectedProvider = 'postgresql';
} else if (dbUrlLower.startsWith('file:') || dbUrlLower.endsWith('.db') || dbUrlLower.endsWith('.sqlite')) {
    expectedProvider = 'sqlite';
} else {
    console.warn(`⚠️ [validate-schema-provider] WARNING: Could not automatically determine expected provider from DATABASE_URL: "${dbUrl}". Skipping validation.`);
    process.exit(0);
}

// 4. Validate
if (schemaProvider !== expectedProvider) {
    console.error('\n❌ =======================================================================');
    console.error('❌ PRISMA PROVIDER AND DATABASE PROTOCOL MISMATCH DETECTED');
    console.error('❌ =======================================================================');
    console.error(`   Schema:            ${path.basename(schemaPath)}`);
    console.error(`   Schema Provider:   "${schemaProvider}"`);
    console.error(`   DATABASE_URL:      "${dbUrl}"`);
    console.error(`   Expected Provider: "${expectedProvider}"`);
    console.error('   =======================================================================');
    if (expectedProvider === 'sqlite') {
        console.error('   👉 FIX FOR LOCAL DEV: datasource provider in prisma/schema.prisma must be "sqlite".');
        console.error('      Verify prisma/schema.prisma is set to "sqlite".');
        console.error('      If it is set to "postgresql", run: node scripts/sync-schemas.js --sqlite');
    } else {
        console.error('   👉 FIX FOR CLOUD: datasource provider in schema.postgres.prisma must be "postgresql".');
        console.error('      Run: node scripts/sync-schemas.js (to sync and generate the postgres schema).');
    }
    console.error('===========================================================================\n');
    process.exit(1);
}

console.log(`✅ [validate-schema-provider] Success: Schema "${path.basename(schemaPath)}" provider ("${schemaProvider}") matches DATABASE_URL protocol.`);
process.exit(0);
