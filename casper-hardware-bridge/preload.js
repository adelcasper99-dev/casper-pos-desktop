const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    testPrint: () => ipcRenderer.invoke('test-print'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    getActiveClients: () => ipcRenderer.invoke('get-active-clients')
});
