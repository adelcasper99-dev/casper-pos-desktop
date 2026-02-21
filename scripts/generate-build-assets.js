/**
 * scripts/generate-build-assets.js
 * Generates NSIS installer assets (BMP/ICO) and bytenode bytecode.
 */

const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs-extra');
const path = require('path');
const { Jimp } = require('jimp');

const projectRoot = path.join(__dirname, '..');
const assetsDir = path.join(projectRoot, 'public', 'assets');
const buildDir = path.join(projectRoot, 'build');
const srcIcon = path.join(assetsDir, 'icon-512.png'); // Best source for scaling down

async function generateIcons() {
    console.log('[1/4] Generating multi-size ICO...');
    const sizes = [16, 32, 48, 64, 128, 256];
    const pngBuffers = await Promise.all(sizes.map(size =>
        sharp(srcIcon).resize(size, size).png().toBuffer()
    ));

    const icoBuffer = await toIco(pngBuffers);
    await fs.writeFile(path.join(buildDir, 'icon.ico'), icoBuffer);
    await fs.copyFile(path.join(buildDir, 'icon.ico'), path.join(buildDir, 'installerIcon.ico'));
    await fs.copyFile(path.join(buildDir, 'icon.ico'), path.join(buildDir, 'uninstallerIcon.ico'));
    console.log('  ✓ build/icon.ico (multi-size)');
}

async function generateBitmaps() {
    console.log('[2/4] Generating installer bitmaps (BMP) via Jimp...');

    // 1. Installer Header (150x57 px)
    const headerWidth = 150;
    const headerHeight = 57;
    const headerLogoSize = 48;

    const logoBuffer = await sharp(srcIcon).resize(headerLogoSize, headerLogoSize).png().toBuffer();
    const logoImage = await Jimp.read(logoBuffer);

    const header = new Jimp({ width: headerWidth, height: headerHeight, color: 0xFFFFFFFF }); // Jimp 1.6 constructor
    const x = Math.floor((headerWidth - headerLogoSize) / 2);
    const y = Math.floor((headerHeight - headerLogoSize) / 2);
    header.composite(logoImage, x, y);
    await header.write(path.join(buildDir, 'installerHeader.bmp'));
    console.log('  ✓ build/installerHeader.bmp (150x57)');

    // 2. Installer Sidebar (164x314 px)
    const sidebarWidth = 164;
    const sidebarHeight = 314;

    const sidebar = new Jimp({ width: sidebarWidth, height: sidebarHeight, color: 0x0E748CFF });
    const sidebarLogoBuffer = await sharp(srcIcon).resize(100, 100).png().toBuffer();
    const sidebarLogo = await Jimp.read(sidebarLogoBuffer);

    sidebar.composite(sidebarLogo, 32, 40);

    await sidebar.write(path.join(buildDir, 'installerSidebar.bmp'));
    await fs.copyFile(path.join(buildDir, 'installerSidebar.bmp'), path.join(buildDir, 'uninstallerSidebar.bmp'));
    console.log('  ✓ build/installerSidebar.bmp (164x314)');
}

async function main() {
    if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);

    try {
        await generateIcons();
        await generateBitmaps();
        console.log('\n✅ NSIS build assets generated successfully.');
    } catch (err) {
        console.error('\n❌ Build asset generation failed:', err);
        process.exit(1);
    }
}

main();
