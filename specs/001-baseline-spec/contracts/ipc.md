# IPC Contracts: Baseline Casper POS Desktop

## Renderer to Main (Invocations)

### `saveOfflineData(data: string): Promise<{success: boolean, error?: string}>`

- **Purpose**: Triggers a manual or automatic backup of IndexedDB contents to the local SQLite database.
- **Handler**: `main.js` -> `ipcMain.handle('save-offline-data', ...)`

### `loadOfflineData(): Promise<{data: string | null, error?: string}>`

- **Purpose**: Retrieves the most recent valid backup from the filesystem.
- **Handler**: `main.js` -> `ipcMain.handle('load-offline-data', ...)`

### `vacuumDatabase(): Promise<{success: boolean, error?: string}>`

- **Purpose**: Executes `VACUUM` on the local SQLite database to optimize size and performance.
- **Handler**: `main.js` -> `ipcMain.handle('vacuum-database', ...)`

### `printThermalReceipt(layout: any): Promise<{success: boolean, error?: string}>`

- **Purpose**: Triggers immediate printing to the default thermal printer via Electron's silent print capability.
- **Handler**: `main.js` -> `ipcMain.handle('print-thermal-receipt', ...)`

## Main to Renderer (Events)

### `onBackupStatus(status: {timestamp: string, success: boolean})`

- **Purpose**: Notifies the UI of background backup completions.
- **Bridge**: `preload.js` -> `ipcRenderer.on('backup-status', ...)`
