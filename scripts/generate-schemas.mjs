import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_SCHEMA = path.resolve(__dirname, '../prisma/schema.base.prisma');
const CLOUD_SCHEMA = path.resolve(__dirname, '../prisma/schema.cloud.prisma');
const LOCAL_SCHEMA = path.resolve(__dirname, '../prisma/schema.local.prisma');
const EXTENSION_PATH = path.resolve(__dirname, '../src/lib/prisma-tenant-extension.ts');

if (!fs.existsSync(BASE_SCHEMA)) {
    console.error('ERROR: schema.base.prisma not found.');
    process.exit(1);
}

const baseContent = fs.readFileSync(BASE_SCHEMA, 'utf8');

// 1. Generate Cloud Schema (PostgreSQL, Multi-Tenant)
let cloudContent = baseContent.replace(/provider\s*=\s*"base"/, 'provider = "postgresql"');
fs.writeFileSync(CLOUD_SCHEMA, cloudContent);
console.log('[generate-schemas] Generated schema.cloud.prisma');

// 2. Generate Local Schema (SQLite, Single-Tenant)
let localContent = baseContent.replace(/provider\s*=\s*"base"/, 'provider = "sqlite"');
// Strip all lines containing `// MULTITENANT_FIELD`
localContent = localContent.split('\n').filter(line => !line.includes('// MULTITENANT_FIELD')).join('\n');
// Strip all @@index([tenantId]) exactly
localContent = localContent.replace(/@@index\(\[tenantId\]\)\s*\n/g, '');
// Strip tenantId from compound unique/index constraints
localContent = localContent.replace(/tenantId,\s*/g, '');
localContent = localContent.replace(/,\s*tenantId/g, '');
// Remove if it becomes empty like @@unique([])
localContent = localContent.replace(/@@unique\(\[\]\)\s*\n/g, '');
localContent = localContent.replace(/@@index\(\[\]\)\s*\n/g, '');

// Strip models
localContent = localContent.replace(/\/\/\s*──\s*Tenant Model\s*──[\s\S]*?model Tenant \{[\s\S]*?\n\}/g, '');
localContent = localContent.replace(/\/\/\s*──\s*License Model\s*──[\s\S]*?model License \{[\s\S]*?\n\}/g, '');
localContent = localContent.replace(/\/\/\s*──\s*Per-Tenant Sequential Numbering\s*──[\s\S]*?model TenantSequence \{[\s\S]*?\n\}/g, '');
localContent = localContent.replace(/model Tenant \{[\s\S]*?\n\}/g, '');
localContent = localContent.replace(/model License \{[\s\S]*?\n\}/g, '');
localContent = localContent.replace(/model TenantSequence \{[\s\S]*?\n\}/g, '');

fs.writeFileSync(LOCAL_SCHEMA, localContent);
console.log('[generate-schemas] Generated schema.local.prisma');

// 3. Sync TENANT_AWARE_MODELS array
const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
const tenantAwareModels = [];
let match;
while ((match = modelRegex.exec(baseContent)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];
    if (/\btenantId\b/.test(modelBody) && modelName !== 'Tenant' && modelName !== 'License' && modelName !== 'TenantSequence') {
        tenantAwareModels.push(modelName);
    }
}
tenantAwareModels.sort();

if (fs.existsSync(EXTENSION_PATH)) {
    let extContent = fs.readFileSync(EXTENSION_PATH, 'utf8');
    const startMarker = 'const TENANT_AWARE_MODELS = [';
    const endMarker = '];';
    const startIndex = extContent.indexOf(startMarker);
    const endIndex = extContent.indexOf(endMarker, startIndex);
    
    if (startIndex !== -1 && endIndex !== -1) {
        const formattedList = tenantAwareModels.map(m => `    '${m}'`).join(',\n');
        const newBlock = `${startMarker}\n${formattedList}\n`;
        const newExtContent = extContent.substring(0, startIndex) + newBlock + extContent.substring(endIndex);
        fs.writeFileSync(EXTENSION_PATH, newExtContent);
        console.log(`[generate-schemas] Synced ${tenantAwareModels.length} models to prisma-tenant-extension.ts`);
    }
}

// 4. Auto-detect DATABASE_URL protocol & generate matching Prisma Client if requested
function getDatabaseUrl() {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envMatch = envContent.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (envMatch && envMatch[1]) {
            return envMatch[1];
        }
    }
    return null;
}

if (process.argv.includes('--generate')) {
    let rawDbUrl = getDatabaseUrl();
    if (!rawDbUrl) {
        console.warn('⚠️ [generate-schemas] WARNING: DATABASE_URL not found in environment or .env file. Defaulting to "file:./local.db".');
        rawDbUrl = 'file:./local.db';
    }

    const isPostgres = /^postgres(ql)?:\/\//i.test(rawDbUrl);
    const detectedProvider = isPostgres ? 'postgresql' : 'sqlite';
    const targetSchemaPath = isPostgres ? CLOUD_SCHEMA : LOCAL_SCHEMA;
    const targetSchemaName = isPostgres ? 'prisma/schema.cloud.prisma' : 'prisma/schema.local.prisma';

    console.log(`[generate-schemas] 🟢 Auto-detected DB protocol provider: "${detectedProvider}" (URL: ${rawDbUrl})`);
    console.log(`[generate-schemas] Running "npx prisma generate --schema ${targetSchemaName}"...`);

    try {
        execSync(`npx prisma generate --schema "${targetSchemaPath}"`, {
            stdio: 'inherit',
            cwd: path.resolve(__dirname, '..')
        });
        console.log(`[generate-schemas] ✅ Prisma client generated successfully using ${targetSchemaName}`);
    } catch (error) {
        console.error(`❌ [generate-schemas] ERROR: Failed to generate Prisma client with ${targetSchemaName}:`, error.message);
        process.exit(1);
    }
}
