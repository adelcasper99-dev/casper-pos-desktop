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

    // In development, prioritize main.js if it exists
    const jsPath = path.join(__dirname, 'main.js');
    const jscPath = path.join(__dirname, 'main.jsc');

    if (process.env.NODE_ENV === 'development' && fs.existsSync(jsPath)) {
        log('Loading main.js (development mode)...');
        require(jsPath);
        log('main.js loaded successfully.');
    } else {
        log(`Checking for main.jsc at: ${jscPath}`);
        if (!fs.existsSync(jscPath)) {
            log('ERROR: main.jsc NOT FOUND');
            throw new Error(`main.jsc not found at ${jscPath}`);
        }
        log('Requiring main.jsc...');
        require(jscPath);
        log('main.jsc required successfully.');
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
