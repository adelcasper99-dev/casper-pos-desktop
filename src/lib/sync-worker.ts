import { SyncService } from './sync-service';
import { LocalPersistenceService } from './local-persistence';
import { triggerCustomerReindex } from '@/actions/customer-actions';
import { logger } from './logger';

export class SyncWorker {
    private static isRunning = false;
    private static isSyncing = false; // 🆕 Mutual exclusion lock

    static start(intervalMs = 30000) {
        if (this.isRunning) return;
        this.isRunning = true;

        logger.info('[SyncWorker] Started — universal sync mode (Sales, Tickets, Treasury, Inventory, Returns).');

        // Universal sync interval (30s) — all 5 offline stores
        setInterval(async () => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                logger.info('[SyncWorker] Device is offline. Skipping sync cycle.');
                return;
            }
            await this.runUniversalSync();
        }, intervalMs);

        // Mirroring interval (5m) as per Constitution Pillar I
        setInterval(async () => {
            logger.info('[SyncWorker] Triggering periodic filesystem mirroring...');
            await LocalPersistenceService.mirrorToSQLite();
            await LocalPersistenceService.backupToFilesystem();
        }, 5 * 60 * 1000);

        // 🆕 Self-Healing Indexer (15m) — Reconciles Customer LTV/Balances
        setInterval(async () => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) return; // don't try if offline
            logger.info('[SyncWorker] Triggering periodic customer re-indexing sweeper...');
            await triggerCustomerReindex().catch(e => logger.error('[SyncWorker] Error triggering reindex', e));
        }, 15 * 60 * 1000);
    }

    static async runUniversalSync() {
        if (this.isSyncing) {
            logger.info('[SyncWorker] Sync already in progress. Skipping cycle.');
            return { success: false, message: 'Sync already in progress' };
        }

        this.isSyncing = true;
        try {
            const status = await SyncService.getQueueStatus();
            
            // Only log the pending queue if there is something to push
            if (status.total > 0) {
                logger.info(
                    `[SyncWorker] Pending push queue — Sales:${status.salesCount} Tickets:${status.ticketsCount} ` +
                    `Treasury:${status.treasuryCount} Inventory:${status.inventoryCount} Returns:${status.returnsCount}`
                );
            }

            const results = await SyncService.syncAll();

            if (!results.success) {
                logger.warn(`[SyncWorker] Sync cycle finished with issues.`);
            }
            return results;
        } catch (error) {
            logger.error('[SyncWorker] Error in universal sync cycle', error);
            return { success: false, failures: [error] };
        } finally {
            this.isSyncing = false; // 🆕 Release lock
        }
    }
}
