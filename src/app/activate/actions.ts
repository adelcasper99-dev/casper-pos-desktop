'use server';

import { Hardware } from '@/lib/license/hardware';
import { offlineDB } from '@/lib/offline-db';
import { CloudConfigManager } from '@/utils/cloudConfigManager';

export async function activateLicense(activationCode: string) {
    try {
        const machineId = await Hardware.getMachineId();
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
            // Save token to local DB
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
