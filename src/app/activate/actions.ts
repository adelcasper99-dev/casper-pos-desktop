'use server';

import { prisma } from '@/lib/prisma';
import { CloudConfigManager } from '@/utils/cloudConfigManager';

/**
 * Server action: performs cloud activation.
 *
 * IMPORTANT: machineId MUST be fetched on the client via Electron IPC
 * (window.electronAPI.license.getMachineId) before calling this action.
 * Calling Hardware.getMachineId() server-side would return the *server's*
 * hardware UUID, not the client machine's — breaking the hardware binding.
 *
 * NOTE: We persist the JWT in Prisma (StoreSettings), NOT IndexedDB.
 * This action runs on the server where IndexedDB (Dexie) is unavailable.
 * The Electron renderer reads the JWT back from StoreSettings via Prisma
 * on the next page load after redirect.
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
            body: JSON.stringify({ activationCode, machineId }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { success: false, error: (data as { error?: string }).error || 'Activation failed.' };
        }

        const data = await res.json() as { token?: string };

        if (!data.token) {
            return { success: false, error: 'No token received from server.' };
        }

        // Persist JWT server-side via Prisma (works in SSR / Server Actions)
        await prisma.storeSettings.upsert({
            where:  { id: 'settings' },
            create: {
                id:            'settings',
                name:          'Casper Store',
                licenseJwt:    data.token,
                lastServerNow: Date.now(),
            },
            update: {
                licenseJwt:    data.token,
                lastServerNow: Date.now(),
            },
        });

        return { success: true };

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[activateLicense]', msg);
        return { success: false, error: msg };
    }
}
