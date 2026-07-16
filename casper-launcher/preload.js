const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
    onStatus: (cb) => ipcRenderer.on('status', (_, data) => cb(data)),
    connectManual: (ip, port) => ipcRenderer.invoke('connect-manual', ip, port),
    retryDiscovery: () => ipcRenderer.invoke('retry-discovery'),
});
