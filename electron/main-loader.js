const { dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const logFile = path.join(os.homedir(), 'casper-boot.log');
const log = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, entry);
    console.log(msg);
};

try {
    log('--- BOOT START ---');
    log(`App Path: ${app.getAppPath()}`);
    log(`Resource Path: ${process.resourcesPath}`);

    log('Loading bytenode...');
    require('bytenode');
    log('Bytenode loaded.');

    const jsPath = path.join(__dirname, 'main.js');
    const jscPath = path.join(__dirname, 'main.jsc');

    const jsExists = fs.existsSync(jsPath);
    const jscExists = fs.existsSync(jscPath);

    if (!jscExists && jsExists) {
        log('Loading main.js (no .jsc bytecode found)...');
        require(jsPath);
        log('main.js loaded successfully.');
    } else if (!jsExists && jscExists) {
        log('Loading main.jsc (no source .js found)...');
        require(jscPath);
        log('main.jsc loaded successfully.');
    } else if (jsExists && jscExists) {
        const jsStat = fs.statSync(jsPath);
        const jscStat = fs.statSync(jscPath);
        if (jsStat.mtimeMs > jscStat.mtimeMs) {
            log('main.js is newer than main.jsc — loading source (edit main.js, save, and restart for changes)');
            require(jsPath);
            log('main.js loaded successfully.');
        } else {
            log('main.jsc is newer than or equal to main.js — loading bytecode');
            log('Tip: edit main.js and restart to load from source, or run npm run compile:bytecode to update bytecode');
            require(jscPath);
            log('main.jsc loaded successfully.');
        }
    } else {
        log('ERROR: Neither main.js nor main.jsc found');
        throw new Error(`No entry point found at ${__dirname}`);
    }

} catch (err) {
    log(`FATAL ERROR: ${err.message}`);
    log(`Stack: ${err.stack}`);

    app.whenReady().then(() => {
        dialog.showErrorBox(
            'Casper POS - Bootstrap Error',
            `A critical error occurred while loading the application bytecode.\n\nError: ${err.message}\n\nCheck ${logFile} for details.`
        );
        app.quit();
    });
}
