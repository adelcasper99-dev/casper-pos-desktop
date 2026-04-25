export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      getPrinters: () => Promise<{ success: boolean; data: { name: string; isDefault: boolean; status: number }[]; error?: string }>;
      printStandard: (html: string, printerName: string, options?: any) => Promise<{ success: boolean; error?: string }>;
      printThermal: (html: string, printerName: string, paperWidthMm: number) => Promise<{ success: boolean; error?: string }>;
      print: (html: string, printerName: string, options?: any) => Promise<{ success: boolean; error?: string }>;
      printThermalReceipt: (html: string, printerName: string, paperWidthMm: number) => Promise<{ success: boolean; error?: string }>;
      saveToPDF: (html: string, filename?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      
      /** Shell API for external links */
      shell: {
        openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      };

      /** Custom frameless window controls – exposed by TitleBar */
      windowControls?: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<{ success: boolean; data: boolean; error?: string }>;
        onMaximizeChange: (cb: (isMaximized: boolean) => void) => () => void;
        zoomIn: () => void;
        zoomOut: () => void;
        zoomReset: () => void;
      };

      /** Database Configuration API */
      config?: {
        showOpenDialog: () => Promise<{ success: boolean; data: string | null; error?: string }>;
        selectBackupFolder: () => Promise<{ success: boolean; data: string | null; error?: string }>;
        getConfig: () => Promise<{ success: boolean; data: any; error?: string }>;
        getDbPath: () => Promise<{ success: boolean; data: string; error?: string }>;
        saveConfigAndRestart: (path: string) => Promise<{ success: boolean; data: boolean; error?: string }>;
        saveBackupConfig: (config: { backupPath: string; backupInterval?: number; maxBackups?: number }) => Promise<{ success: boolean; error?: string }>;
      };

      /** Offline Data Resilience & Maintenance API */
      storage?: {
        saveOfflineData: (data: any) => Promise<{ success: boolean; error?: string }>;
        loadOfflineData: () => Promise<any>;
        getAvailableBackups: () => Promise<{ success: boolean; backups?: any[]; error?: string }>;
        deleteBackup: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        restoreFromBackup: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        exportSupportBundle: () => Promise<{ success: boolean; path?: string; error?: string }>;
        vacuumDatabase: () => Promise<{ success: boolean; error?: string }>;
      };

      /** Auto Updater API */
      updater?: {
        onUpdateAvailable: (cb: (info: any) => void) => () => void;
        onDownloadProgress: (cb: (progress: any) => void) => () => void;
        onUpdateDownloaded: (cb: (info: any) => void) => () => void;
        onError: (cb: (err: any) => void) => () => void;
        installUpdate: () => Promise<void>;
      };
    };
  }
}
