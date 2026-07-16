/**
 * scripts/compile-bytecode.js
 * Compiles main and preload scripts to V8 bytecode using bytenode.
 * Must be run via Electron's Node runtime to ensure V8 version parity.
 */

const bytenode = require('bytenode');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');

async function compile() {
    console.log('[Bytenode] Compiling JS to V8 Bytecode...');

    const files = [
        {
            src: path.join(projectRoot, 'electron', 'main.js'),
            dest: path.join(projectRoot, 'electron', 'main.jsc')
        },
        {
            src: path.join(projectRoot, 'electron', 'preload.js'),
            dest: path.join(projectRoot, 'electron', 'preload.jsc')
        }
    ];

    for (const file of files) {
        try {
            if (!fs.existsSync(file.src)) {
                throw new Error(`Source file not found: ${file.src}`);
            }

            // Atomic write: compile to temp file, then rename
            const tmpDest = file.dest + '.tmp';
            await bytenode.compileFile({
                filename: file.src,
                output: tmpDest,
                compileAsModule: true
            });
            fs.renameSync(tmpDest, file.dest);

            console.log(`  ✓ Compiled: ${path.basename(file.dest)}`);
        } catch (err) {
            console.error(`  ✗ Failed to compile ${path.basename(file.src)}:`, err.message);
            process.exit(1);
        }
    }

    console.log('✅ Bytecode compilation complete.');
    console.log('Note: the Electron loader now uses file mtime to decide between source (.js) and bytecode (.jsc).');
    console.log('      If you edit main.js/preload.js after compiling, the app will load from source.');
    console.log('      Re-run this script to update bytecode before shipping a distribution build.');
    process.exit(0);
}

compile();
