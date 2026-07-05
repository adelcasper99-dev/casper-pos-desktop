'use server';

import { offlineDB } from '@/lib/offline-db';
import { CloudConfigManager } from '@/utils/cloudConfigManager';

/**
 * Server action: performs cloud activation.
 * 
 * IMPORTANT: machineId MUST be fetched on the client via Electron IPC
 * (window.electronAPI.license.getMachineId) before calling this action.
 * Calling Hardware.getMachineId() server-side would return the *server's*
 * hardware UUID, not the client machine's — breaking the hardware binding.
 */
export async function activateLicense(activationCode: string, machineId: string) {
    try {
        if (!machineId) {
            return { success: false, error: 'Could not determine machine ID. Is this running in Electron?' };
        }

        const config = await CloudConfigManager.getCloudConfig();

        if (!config.cloudUrl) {
            return { success: false, error: 'Cloud URL not configured in system settings.' };
        }

        const res = await fetch(`${config.cloudUrl}/api/license/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activationCode, machineId })
        });

        if (!res.ok) {
            const data = await res.json();
            return { success: false, error: data.error || 'Activation failed.' };
        }

        const data = await res.json();
        
        if (data.token) {
            // Save token to local IndexedDB
            let settings = await offlineDB.storeSettings.get('settings');
            if (!settings) {
                settings = { 
                    id: 'settings', 
                    name: 'Casper Store', 
                    blindCloseEnabled: true,
                    taxRate: 0,
                    currency: 'USD',
                    receiptFooter: '',
                    updatedAt: new Date().toISOString()
                };
                await offlineDB.storeSettings.put(settings);
            }

            await offlineDB.storeSettings.update('settings', {
                licenseJwt: data.token
            });

            return { success: true };
        }

        return { success: false, error: 'No token received from server.' };

    } catch (error: any) {
        console.error('Activation Error:', error);
        return { success: false, error: error.message };
    }
}
