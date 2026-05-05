const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../prisma/schema.prisma');

// Model-qualified whitelist: "<ModelName>.<fieldName>"
// These are non-financial Float fields (metrics, coordinates, file sizes).
const WHITELIST = new Set([
    'TechnicianPerformance.avgRepairTime',
    'BackupLog.fileSize',
    'StoreSettings.locationLat',
    'StoreSettings.locationLng',
]);

function checkSchema() {
    console.log('🔍 Checking prisma/schema.prisma for unauthorized Float types...');
    
    if (!fs.existsSync(SCHEMA_PATH)) {
        console.error('❌ schema.prisma not found at:', SCHEMA_PATH);
        process.exit(1);
    }

    const content = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const lines = content.split('\n');
    let errors = 0;
    let currentModel = null;

    lines.forEach((line, index) => {
        // Track current model context
        const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
        if (modelMatch) {
            currentModel = modelMatch[1];
            return;
        }
        if (line.trim() === '}') {
            currentModel = null;
            return;
        }

        // Match field definitions: fieldName Float ...
        const fieldMatch = line.match(/^\s+(\w+)\s+Float/);
        if (fieldMatch) {
            const fieldName = fieldMatch[1];
            const qualifiedName = `${currentModel}.${fieldName}`;
            if (!WHITELIST.has(qualifiedName)) {
                console.error(`❌ Unauthorized 'Float' type found at line ${index + 1}: model '${currentModel}', field '${fieldName}'`);
                console.error(`   Financial fields must use 'Decimal'. If this is intentional, add '${qualifiedName}' to the WHITELIST.`);
                errors++;
            }
        }
    });

    if (errors > 0) {
        console.error(`\nTotal unauthorized Float types: ${errors}`);
        console.error('Action required: Refactor to Decimal or add to the model-qualified WHITELIST.');
        process.exit(1);
    }

    console.log('✅ Type integrity check passed. No unauthorized Float types found.');
}

checkSchema();
