const fs = require('fs-extra');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const standaloneDir = path.join(projectRoot, '.next/standalone');
const staticDir = path.join(projectRoot, '.next/static');
const publicDir = path.join(projectRoot, 'public');

const destStaticDir = path.join(standaloneDir, '.next/static');
const destPublicDir = path.join(standaloneDir, 'public');
const destNodeModules = path.join(standaloneDir, 'node_modules');

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

        // Copy prisma (schema)
        const prismaDir = path.join(projectRoot, 'prisma');
        const destPrismaDir = path.join(standaloneDir, 'prisma');
        if (fs.existsSync(prismaDir)) {
            console.log('Copying prisma...');
            await fs.copy(prismaDir, destPrismaDir);
        }

        // Ensure critical modules are present in standalone node_modules
        // Next.js standalone often misses some dependencies needed for the server to run in Electron
        const modulesToCopy = ['next', 'react', 'react-dom', 'styled-jsx', 'prisma', '@prisma'];
        for (const mod of modulesToCopy) {
            const srcMod = path.join(projectRoot, 'node_modules', mod);
            const destMod = path.join(destNodeModules, mod);
            if (fs.existsSync(srcMod)) {
                console.log(`Ensuring ${mod} is in standalone node_modules...`);
                await fs.copy(srcMod, destMod, {
                    overwrite: true,
                    dereference: true,
                    filter: (src) => !src.includes('\\obj\\') && !src.includes('/obj/') // Skip only MSVC build artifacts
                });
            }
        }

        console.log('Standalone assets and dependencies prepared successfully.');
    } catch (err) {
        console.error('Error preparing assets:', err);
        process.exit(1);
    }
}

copyAssets();
