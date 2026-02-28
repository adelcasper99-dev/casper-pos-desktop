const { contextBridge, ipcRenderer, webFrame } = require('electron');



contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * True if running inside Electron (allows renderer to detect environment)
     */
    isElectron: true,

    /**
     * Get all printers installed on the OS.
     * @returns Promise<Array<{ name: string, isDefault: boolean, status: number }>>
     */
    getPrinters: () => ipcRenderer.invoke('printers:list'),

    /**
     * Standard silent print (A4 / Document)
     */
    printStandard: (html, printerName, options) =>
        ipcRenderer.invoke('print:standard', html, printerName, options),

    /**
     * Thermal silent print (Roll / Receipt)
     */
    printThermal: (html, printerName, paperWidthMm) =>
        ipcRenderer.invoke('print:thermal', html, printerName, paperWidthMm),

    saveToPDF: (html, filename) =>
        ipcRenderer.invoke('print:to-pdf', html, filename),

    /**
     * Legacy generic print (mapped to standard)
     */
    print: (html, printerName, options) =>
        ipcRenderer.invoke('print:standard', html, printerName, options),

    /**
     * High-speed thermal receipt printing (alias for printThermal)
     */
    printThermalReceipt: (html, printerName, paperWidthMm) =>
        ipcRenderer.invoke('print:thermal', html, printerName, paperWidthMm),

    /**
     * Custom window controls (used by TitleBar component).
     * Replaces native OS title bar buttons in the frameless window.
     */
    windowControls: {
        minimize: () => ipcRenderer.send('window:minimize'),
        maximize: () => ipcRenderer.send('window:maximize'),
        close: () => ipcRenderer.send('window:close'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
        /**
         * Subscribe to maximize/restore events from the main process.
         * @param {(isMaximized: boolean) => void} cb
         * @returns {() => void} unsubscribe function
         */
        onMaximizeChange: (cb) => {
            const handler = (_event, value) => cb(value);
            ipcRenderer.on('window:maximized', handler);
            return () => ipcRenderer.removeListener('window:maximized', handler);
        },

        // ── Zoom: use webFrame directly — runs in the renderer process, ──
        // ── no IPC round-trip needed, can't be blocked by drag region.  ──
        zoomIn: () => { const z = Math.min(webFrame.getZoomFactor() + 0.1, 3.0); webFrame.setZoomFactor(z); },
        zoomOut: () => { const z = Math.max(webFrame.getZoomFactor() - 0.1, 0.5); webFrame.setZoomFactor(z); },
        zoomReset: () => { webFrame.setZoomFactor(1.0); },
    },

    /**
     * Database location and setup config API
     */
    config: {
        showOpenDialog: () => ipcRenderer.invoke('dialog:showOpenDialog'),
        selectBackupFolder: () => ipcRenderer.invoke('dialog:showBackupFolderDialog'),
        getConfig: () => ipcRenderer.invoke('app:get-config'),
        getDbPath: () => ipcRenderer.invoke('app:get-db-path'),
        saveConfigAndRestart: (path) => ipcRenderer.invoke('app:save-config-and-restart', path),
        saveBackupConfig: (path) => ipcRenderer.invoke('app:save-backup-config', path),
    },

    /**
     * Offline Data Resilience & Maintenance API
     */
    storage: {
        saveOfflineData: (data) => ipcRenderer.invoke('app:save-offline-data', data),
        loadOfflineData: () => ipcRenderer.invoke('app:load-offline-data'),
        getAvailableBackups: () => ipcRenderer.invoke('app:get-available-backups'),
        deleteBackup: (filePath) => ipcRenderer.invoke('app:delete-backup', filePath),
        restoreFromBackup: (filePath) => ipcRenderer.invoke('app:restore-from-backup', filePath),
        exportSupportBundle: () => ipcRenderer.invoke('app:export-support-bundle'),
        vacuumDatabase: () => ipcRenderer.invoke('app:vacuum-db'),
<<<<<<< HEAD

=======
        printThermalReceipt: (layout) => ipcRenderer.invoke('app:print-thermal-receipt', layout),
    },

    /**
     * Auto-Updater API
     */
    updater: {
        onUpdateAvailable: (callback) => {
            const handler = (_event, info) => callback(info);
            ipcRenderer.on('updater:update-available', handler);
            return () => ipcRenderer.removeListener('updater:update-available', handler);
        },
        onDownloadProgress: (callback) => {
            const handler = (_event, progress) => callback(progress);
            ipcRenderer.on('updater:download-progress', handler);
            return () => ipcRenderer.removeListener('updater:download-progress', handler);
        },
        onUpdateDownloaded: (callback) => {
            const handler = (_event, info) => callback(info);
            ipcRenderer.on('updater:update-downloaded', handler);
            return () => ipcRenderer.removeListener('updater:update-downloaded', handler);
        },
        onError: (callback) => {
            const handler = (_event, error) => callback(error);
            ipcRenderer.on('updater:error', handler);
            return () => ipcRenderer.removeListener('updater:error', handler);
        },
        installUpdate: () => ipcRenderer.invoke('app:install-update')
>>>>>>> 001-baseline-spec
    }
});

