import { db, type OfflineSale } from './offline-db';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient();

export class LocalPersistenceService {
    /**
     * Syncs PENDING sales from Dexie to SQLite.
     * This ensures that even if browser cache is cleared, the data is safe in SQLite.
     */
    static async mirrorToSQLite() {
        try {
            const pendingSales = await db.sales
                .where('syncStatus')
                .equals('PENDING')
                .toArray();

            if (pendingSales.length === 0) return;

            logger.info(`[LocalPersistence] Mirroring ${pendingSales.length} sales to SQLite...`);

            for (const sale of pendingSales) {
                await prisma.sale.upsert({
                    where: { id: sale.id },
                    update: {
                        syncStatus: 'SYNCED', // In the context of local mirroring, SYNCED means "Mirrored to SQLite"
                        offlineFlag: true,
                    },
                    create: {
                        id: sale.id,
                        totalAmount: sale.totalAmount,
                        paymentMethod: sale.paymentMethod,
                        status: sale.status,
                        taxAmount: sale.taxAmount,
                        subTotal: sale.subTotal,
                        createdAt: new Date(sale.createdAt),
                        warehouseId: sale.warehouseId,
                        syncStatus: 'SYNCED',
                        offlineFlag: true,
                        // Items would typically be handled in a transaction or separate model, 
                        // for brevity in this baseline we are focusing on the Sale entity.
                    },
                });

                // Update Dexie to reflect it's mirrored
                await db.sales.update(sale.id, { syncStatus: 'SYNCED' });
            }

            logger.info('[LocalPersistence] Mirroring complete.');
        } catch (error) {
            logger.error('[LocalPersistence] Mirroring failed', error);
        }
    }

    /**
   * Forces a full filesystem backup via Electron IPC.
   * (This is the "mirroring browser cache to local filesystem" referred to in Constitution)
   */
    static async backupToFilesystem(isManual = false) {
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
            const result = await (window as any).electronAPI.storage.saveOfflineData({ isManual });
            if (result && result.success === false) {
                if (isManual) throw new Error(result.error);
                else console.warn(`[LocalPersistence] Auto-backup skipped/failed: ${result.error}`);
            }
            return result;
        }
        return { success: false, error: 'Not in Electron environment' };
    }

    static async restoreFromFilesystem() {
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
            try {
                const data = await (window as any).electronAPI.storage.loadOfflineData();
                if (data) {
                    logger.info('[LocalPersistence] Loaded offline data from filesystem backup');
                    return data;
                }
            } catch (error) {
                logger.error('[LocalPersistence] Failed to restore from filesystem backup', error);
            }
        }
        return null; // NO-OP for web
    }

    static async startAutoBackup() {
        if (typeof window === 'undefined') return;

        let intervalMinutes = 15; // default
        if ((window as any).electronAPI?.config?.getConfig) {
            try {
                const config = await (window as any).electronAPI.config.getConfig();
                if (config.backupInterval) {
                    intervalMinutes = parseInt(config.backupInterval, 10) || 15;
                }
            } catch (e) {
                logger.warn('[LocalPersistence] Failed to fetch config for backup interval. Defaulting to 15m.');
            }
        }

        logger.info(`[LocalPersistence] Auto-backup service started. Interval: ${intervalMinutes} minutes.`);

        // Clear any existing interval if we're restarting it
        if ((window as any)._casperBackupTimer) {
            clearInterval((window as any)._casperBackupTimer);
        }

        (window as any)._casperBackupTimer = setInterval(() => {
            this.backupToFilesystem().catch(err => logger.error('[LocalPersistence] Auto-backup failed', err));
        }, Math.max(1, intervalMinutes) * 60 * 1000);
    }
}
