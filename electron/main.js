const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let nextServer;

const startServer = () => {
    if (app.isPackaged) {
        const serverPath = path.join(process.resourcesPath, '.next/standalone/server.js');
        const cwd = path.join(process.resourcesPath, '.next/standalone');

        console.log('Starting server from:', serverPath);

        nextServer = spawn(process.execPath, [serverPath], {
            cwd,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: 3000, HOST: '127.0.0.1' },
            stdio: 'inherit'
        });

        nextServer.on('error', (err) => {
            console.error('Failed to start server:', err);
        });
    }
};

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const loadURL = async () => {
        try {
            await win.loadURL('http://127.0.0.1:3000');
        } catch (e) {
            console.log('Server not ready, retrying...');
            setTimeout(loadURL, 1000);
        }
    };

    if (app.isPackaged) {
        startServer();
        loadURL();
    } else {
        win.loadURL('http://localhost:3000');
        win.webContents.openDevTools();
    }
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (nextServer) nextServer.kill();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (nextServer) nextServer.kill();
});
