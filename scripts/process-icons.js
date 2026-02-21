const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SOURCE_IMAGE = 'C:\\Users\\TheExpert\\.gemini\\antigravity\\brain\\c49b8fe7-24c4-4105-8462-86c981fd0946\\media__1771624439215.png';
const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets');

const sizes = [16, 32, 48, 64, 128, 256, 512];

async function processIcons() {
    console.log('--- Processing Icons ---');
    console.log('Source:', SOURCE_IMAGE);
    console.log('Destination:', ASSETS_DIR);

    if (!fs.existsSync(SOURCE_IMAGE)) {
        console.error('Source image not found!');
        return;
    }

    // Ensure assets directory exists
    if (!fs.existsSync(ASSETS_DIR)) {
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
    }

    // 1. Generate individual sized icons
    for (const size of sizes) {
        const dest = path.join(ASSETS_DIR, `icon-${size}.png`);
        await sharp(SOURCE_IMAGE)
            .resize(size, size)
            .toFile(dest);
        console.log(`Generated: icon-${size}.png`);
    }

    // 2. Generate icon.png (256x256)
    await sharp(SOURCE_IMAGE)
        .resize(256, 256)
        .toFile(path.join(ASSETS_DIR, 'icon.png'));
    console.log('Generated: icon.png');

    // 3. Generate casper-icon.png (512x512)
    await sharp(SOURCE_IMAGE)
        .resize(512, 512)
        .toFile(path.join(ASSETS_DIR, 'casper-icon.png'));
    console.log('Generated: casper-icon.png');

    // 4. Update logo-source.png (Original quality)
    fs.copyFileSync(SOURCE_IMAGE, path.join(ASSETS_DIR, 'logo-source.png'));
    console.log('Updated: logo-source.png');

    console.log('--- Icons Processed Successfully ---');
}

processIcons().catch(err => {
    console.error('Error processing icons:', err);
    process.exit(1);
});
