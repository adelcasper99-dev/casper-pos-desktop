import { db } from './offline-db';
import { processSale } from '@/actions/pos';
import { LocalPersistenceService } from './local-persistence';
import { logger } from './logger';

export class SyncWorker {
    private static isRunning = false;

    static start(intervalMs = 30000) {
        if (this.isRunning) return;
        this.isRunning = true;

        logger.info('[SyncWorker] Started.');

        // Sync interval (30s)
        setInterval(async () => {
            await this.syncPendingSales();
        }, intervalMs);

        // Mirroring interval (5m) as per Constitution Pillar I
        setInterval(async () => {
            logger.info('[SyncWorker] Triggering periodic filesystem mirroring...');
            await LocalPersistenceService.mirrorToSQLite();
            await LocalPersistenceService.backupToFilesystem();
        }, 5 * 60 * 1000);
    }

    private static async syncPendingSales() {
        // Note: navigator.onLine is NOT checked here because this is an Electron app.
        // processSale is a server action on 127.0.0.1, always reachable locally.

        try {
            const pendingSales = await db.sales
                .where('syncStatus')
                .equals('PENDING')
                .toArray();

            if (pendingSales.length === 0) return;

            logger.info(`[SyncWorker] Found ${pendingSales.length} pending sales. Syncing...`);

            for (const sale of pendingSales) {
                try {
                    const payload = {
                        items: sale.items.map(i => ({ id: i.productId, quantity: i.quantity, price: i.unitPrice })),
                        paymentMethod: sale.paymentMethod as any,
                        totalAmount: sale.totalAmount,
                        customer: {
                            name: sale.customerName || '',
                            phone: sale.customerPhone || '',
                            address: sale.customerAddress || ''
                        },
                        offlineFlag: true
                    };

                    const result = await processSale(payload);

                    if (result.success) {
                        await db.sales.update(sale.id, { syncStatus: 'SYNCED' });
                        logger.info(`[SyncWorker] Sale ${sale.id} synced successfully.`);
                    }
                } catch (err) {
                    logger.error(`[SyncWorker] Failed to sync sale ${sale.id}`, err);
                }
            }
        } catch (error) {
            logger.error('[SyncWorker] Error in sync process', error);
        }
    }
}
