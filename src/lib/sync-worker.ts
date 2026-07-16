import { SyncService } from './sync-service';
import { LocalPersistenceService } from './local-persistence';
import { triggerCustomerReindex } from '@/actions/customer-actions';
import { logger } from './logger';
import { CloudConfigManager, CloudConfig } from '@/utils/cloudConfigManager';

export class SyncWorker {
    private static isRunning = false;
    private static isSyncing = false; // Mutual exclusion lock
    private static universalSyncInterval: NodeJS.Timeout | null = null;
    private static mirrorInterval: NodeJS.Timeout | null = null;
    private static indexerInterval: NodeJS.Timeout | null = null;
    private static configUnsubscribe: (() => void) | null = null;
    private static currentConfig: CloudConfig | null = null;

    static async start(intervalMs = 30000) {
        if (this.isRunning) return;
        this.isRunning = true;

        this.currentConfig = await CloudConfigManager.getCloudConfig();

        if (process.env.NODE_ROLE === 'SUB_NODE') {
            logger.info('[SyncWorker] Skipping background sync (Sub-Node)');
            this.isRunning = false;
            return;
        }

        if (!this.configUnsubscribe) {
            this.configUnsubscribe = CloudConfigManager.onConfigUpdated(async (newConfig) => {
                logger.info('[SyncWorker] Cloud config updated. Initiating graceful restart...');
                await this.gracefulRestart(newConfig, intervalMs);
            });
        }

        this.startTimers(intervalMs);
    }

    private static startTimers(intervalMs: number) {
        logger.info('[SyncWorker] Started — universal sync mode (Sales, Tickets, Treasury, Inventory, Returns).');

        // Universal sync interval
        this.universalSyncInterval = setInterval(async () => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                logger.info('[SyncWorker] Device is offline. Skipping sync cycle.');
                return;
            }
            if (!this.currentConfig?.enabled) {
                logger.info('[SyncWorker] Cloud sync is disabled in config. Skipping cycle.');
                return;
            }
            await this.runUniversalSync();
        }, intervalMs);

        // Mirroring interval (5m) as per Constitution Pillar I
        this.mirrorInterval = setInterval(async () => {
            logger.info('[SyncWorker] Triggering periodic filesystem mirroring...');
            await LocalPersistenceService.mirrorToSQLite();
            await LocalPersistenceService.backupToFilesystem();
        }, 5 * 60 * 1000);

        // Self-Healing Indexer (15m) — Reconciles Customer LTV/Balances
        this.indexerInterval = setInterval(async () => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) return; // don't try if offline
            logger.info('[SyncWorker] Triggering periodic customer re-indexing sweeper...');
            await triggerCustomerReindex().catch(e => logger.error('[SyncWorker] Error triggering reindex', e));
        }, 15 * 60 * 1000);
    }

    private static async gracefulRestart(newConfig: CloudConfig, intervalMs: number) {
        this.currentConfig = newConfig;

        // Clear existing timers
        if (this.universalSyncInterval) clearInterval(this.universalSyncInterval);
        if (this.mirrorInterval) clearInterval(this.mirrorInterval);
        if (this.indexerInterval) clearInterval(this.indexerInterval);

        // Wait if currently syncing
        const maxWaitMs = 15000;
        const waitInterval = 500;
        let waited = 0;
        while (this.isSyncing && waited < maxWaitMs) {
            await new Promise(res => setTimeout(res, waitInterval));
            waited += waitInterval;
        }

        if (this.isSyncing) {
            logger.warn('[SyncWorker] Timed out waiting for sync to finish during config change.');
            // We proceed to start timers anyway, `isSyncing` logic in runUniversalSync will handle conflicts safely
        }

        logger.info('[SyncWorker] Restarting timers with new configuration...');
        this.startTimers(intervalMs);
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
            this.isSyncing = false; // Release lock
        }
    }
}
