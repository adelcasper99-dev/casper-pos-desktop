export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      getPrinters: () => Promise<{ name: string; isDefault: boolean; status: number }[]>;
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
        isMaximized: () => Promise<boolean>;
        onMaximizeChange: (cb: (isMaximized: boolean) => void) => () => void;
        zoomIn: () => void;
        zoomOut: () => void;
        zoomReset: () => void;
      };

      /** Database Configuration API */
      config?: {
        showOpenDialog: () => Promise<string | null>;
        selectBackupFolder: () => Promise<string | null>;
        getConfig: () => Promise<any>;
        getDbPath: () => Promise<string>;
        saveConfigAndRestart: (path: string) => Promise<boolean>;
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
