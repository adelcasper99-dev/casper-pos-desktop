const { contextBridge, ipcRenderer, webFrame } = require('electron');

console.log('[PRELOAD] electronAPI bridging to renderer...');

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
     * Silently print an HTML string to the named printer.
     * The main process writes HTML to a temp file, loads it in a hidden window,
     * waits for load + CSS settle, then calls webContents.print({ silent: true }).
     *
     * @param {string} html         - Self-contained HTML (inline styles required)
     * @param {string} printerName  - Exact printer name from getPrinters(), or '' for default
     * @param {object} [options]    - Optional overrides: { paperWidth, paperHeight } in microns
     * @returns Promise<{ success: true }>
     */
    print: (html, printerName, options = {}) =>
        ipcRenderer.invoke('print:html', html, printerName, options),

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
        zoomIn: () => { const z = Math.min(webFrame.getZoomFactor() + 0.1, 3.0); webFrame.setZoomFactor(z); console.log('[zoom] in ->', z.toFixed(2)); },
        zoomOut: () => { const z = Math.max(webFrame.getZoomFactor() - 0.1, 0.5); webFrame.setZoomFactor(z); console.log('[zoom] out ->', z.toFixed(2)); },
        zoomReset: () => { webFrame.setZoomFactor(1.0); console.log('[zoom] reset'); },
    },
});

