export interface CloudConfig {
    enabled: boolean;
    cloudUrl: string;
    branchId: string;
    syncSecret: string;
}

export class CloudConfigManager {
    private static listeners: ((config: CloudConfig) => void)[] = [];
    private static isInitialized = false;

    static async getCloudConfig(): Promise<CloudConfig> {
        // Default config (fallback to .env if present, but defaults to disabled to ensure opt-in)
        const defaultConfig: CloudConfig = {
            enabled: false,
            cloudUrl: process.env.NEXT_PUBLIC_CLOUD_URL || '',
            branchId: process.env.NEXT_PUBLIC_BRANCH_ID || '',
            syncSecret: process.env.NEXT_PUBLIC_SYNC_SECRET || '',
        };

        if (typeof window !== 'undefined') {
            const win = window as any;
            // Try Electron IPC first
            if (win.electronAPI && win.electronAPI.config && win.electronAPI.config.getCloudConfig) {
                try {
                    const config = await win.electronAPI.config.getCloudConfig();
                    // Merge with defaults in case of missing keys
                    if (config) {
                        return { ...defaultConfig, ...config };
                    }
                } catch (e) {
                    console.error('[CloudConfigManager] Failed to get config from IPC', e);
                }
            } else {
                // Web Mode Fallback (LocalStorage)
                try {
                    const stored = localStorage.getItem('cloud-config');
                    if (stored) {
                        return { ...defaultConfig, ...JSON.parse(stored) };
                    }
                } catch (e) {
                    console.error('[CloudConfigManager] Failed to get config from localStorage', e);
                }
            }
        }
        return defaultConfig;
    }

    static async saveCloudConfig(config: CloudConfig): Promise<{ success: boolean; error?: string }> {
        if (typeof window !== 'undefined') {
            const win = window as any;
            if (win.electronAPI && win.electronAPI.config && win.electronAPI.config.saveCloudConfig) {
                return await win.electronAPI.config.saveCloudConfig(config);
            } else {
                // Web Mode Fallback
                try {
                    localStorage.setItem('cloud-config', JSON.stringify(config));
                    // Manually notify listeners in web mode since IPC won't trigger it automatically here
                    CloudConfigManager.notifyListeners(config);
                    return { success: true };
                } catch (e: any) {
                    return { success: false, error: e.message };
                }
            }
        }
        return { success: false, error: 'Cannot save config on server side' };
    }

    static onConfigUpdated(callback: (config: CloudConfig) => void): () => void {
        CloudConfigManager.listeners.push(callback);

        if (typeof window !== 'undefined' && !CloudConfigManager.isInitialized) {
            const win = window as any;
            if (win.electronAPI && win.electronAPI.config && win.electronAPI.config.onCloudConfigUpdated) {
                win.electronAPI.config.onCloudConfigUpdated((newConfig: CloudConfig) => {
                    CloudConfigManager.notifyListeners(newConfig);
                });
            }
            // For Web Mode, cross-tab sync could be added here via window.addEventListener('storage', ...)
            window.addEventListener('storage', (e) => {
                if (e.key === 'cloud-config' && e.newValue) {
                    try {
                        const newConfig = JSON.parse(e.newValue);
                        CloudConfigManager.notifyListeners(newConfig);
                    } catch (err) {}
                }
            });

            CloudConfigManager.isInitialized = true;
        }

        return () => {
            CloudConfigManager.listeners = CloudConfigManager.listeners.filter(cb => cb !== callback);
        };
    }

    private static notifyListeners(config: CloudConfig) {
        CloudConfigManager.listeners.forEach(cb => cb(config));
    }
}
