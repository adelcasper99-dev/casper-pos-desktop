/**
 * scripts/generate-icons.js
 * Converts casper-icon.svg → PNG sizes needed for Electron + app icons.
 * Run with: node scripts/generate-icons.js
 *
 * Requires: sharp  →  npm install --save-dev sharp
 */

const path = require('path');
const fs = require('fs');

async function main() {
    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.error('[generate-icons] "sharp" not found. Run: npm install --save-dev sharp');
        process.exit(1);
    }

    const src = path.join(__dirname, '..', 'public', 'assets', 'logo-source.png');
    const outDir = path.join(__dirname, '..', 'public', 'assets');

    if (!fs.existsSync(src)) {
        console.error('[generate-icons] logo-source.png not found at:', src);
        process.exit(1);
    }

    const sizes = [16, 32, 48, 64, 128, 256, 512];

    for (const size of sizes) {
        const out = path.join(outDir, `icon-${size}.png`);
        await sharp(src).resize(size, size).png().toFile(out);
        console.log(`  ✓ icon-${size}.png`);
    }

    // Primary icon used by Electron (256px is the sweet spot for Windows taskbar)
    const primary = path.join(outDir, 'icon.png');
    await sharp(src).resize(256, 256).png().toFile(primary);
    console.log(`  ✓ icon.png (256px – Electron primary)`);

    console.log('\n✅ All icons generated in public/assets/');
}

main().catch(console.error);
