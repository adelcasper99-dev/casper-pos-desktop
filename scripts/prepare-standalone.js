const fs = require('fs-extra');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const standaloneDir = path.join(projectRoot, '.next/standalone');
const staticDir = path.join(projectRoot, '.next/static');
const publicDir = path.join(projectRoot, 'public');

const destStaticDir = path.join(standaloneDir, '.next/static');
const destPublicDir = path.join(standaloneDir, 'public');

async function copyAssets() {
    console.log('Preparing standalone build...');

    if (!fs.existsSync(standaloneDir)) {
        console.error('Error: .next/standalone directory not found. Run "next build" first.');
        process.exit(1);
    }

    try {
        // Copy .next/static
        if (fs.existsSync(staticDir)) {
            console.log('Copying .next/static...');
            await fs.copy(staticDir, destStaticDir);
        }

        // Copy public
        if (fs.existsSync(publicDir)) {
            console.log('Copying public...');
            await fs.copy(publicDir, destPublicDir);
        }

        console.log('Standalone assets copied successfully.');
    } catch (err) {
        console.error('Error copying assets:', err);
        process.exit(1);
    }
}

copyAssets();
