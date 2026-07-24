import { offlineDB } from './offline-db';
import { logger } from './logger';
import { db } from './offline-db';
import Decimal from 'decimal.js';
import { CloudConfigManager } from '@/utils/cloudConfigManager';

const SYNC_BATCH_SIZE = 50;

export class SyncService {
    // 🛡️ HELPER: Get cloud context dynamically
    // 🛡️ HELPER: Get cloud context dynamically
    private static async getCloudContext() {
        const config = await CloudConfigManager.getCloudConfig();
        const settings = await offlineDB.storeSettings.get('settings');
        return {
            enabled: config.enabled,
            cloudUrl: config.cloudUrl || '',
            secret: config.syncSecret || '',
            branchId: config.branchId || '',
            licenseJwt: settings?.licenseJwt || ''
        };
    }

    // 🛡️ HELPER: Dual-Store Update for License JWT (Prisma SQLite + Dexie IndexedDB)
    static async updateLocalLicenseJwt(newToken: string | null) {
        try {
            const { prisma } = await import('@/lib/prisma');
            await prisma.storeSettings.upsert({
                where: { id: 'settings' },
                create: { id: 'settings', licenseJwt: newToken },
                update: { licenseJwt: newToken }
            });

            if (offlineDB.isOpen()) {
                const settings = await offlineDB.storeSettings.get('settings');
                if (settings) {
                    await offlineDB.storeSettings.put({
                        ...settings,
                        licenseJwt: newToken || undefined
                    });
                } else {
                    await offlineDB.storeSettings.put({
                        id: 'settings',
                        name: 'Casper Store',
                        taxRate: 14,
                        currency: 'EGP',
                        receiptFooter: 'Thank you',
                        updatedAt: new Date().toISOString(),
                        licenseJwt: newToken || undefined
                    });
                }
            }




            if (typeof window !== 'undefined') {
                if (newToken) {
                    window.dispatchEvent(new CustomEvent('casper:license-renewed', { detail: { token: newToken } }));
                } else {
                    window.dispatchEvent(new CustomEvent('casper:license-revoked'));
                }
            }
        } catch (err) {
            logger.error('[License:Sync] Failed to update local license JWT', err);
        }
    }

    // 🛡️ HELPER: Check license renewal & revocation with Cloud HQ
    static async checkLicenseRenewal() {
        const ctx = await this.getCloudContext();
        if (!ctx.enabled || !ctx.cloudUrl) return;

        try {
            const { Hardware } = await import('./license/hardware');
            const machineId = await Hardware.getMachineId();
            if (!machineId) return;

            const response = await fetch(`${ctx.cloudUrl}/api/license/ping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machineId,
                    branchId: ctx.branchId,
                    licenseJwt: ctx.licenseJwt
                })
            });

            if (!response.ok) return;

            const data = await response.json();

            if (data.valid === false && (data.reason === 'suspended' || data.reason === 'revoked')) {
                logger.warn('[License:Sync] License suspended or revoked on cloud backend. Invalidating local license.');
                await this.updateLocalLicenseJwt(null);
                return;
            }

            if (data.valid && data.renewedJwt) {
                logger.info('[License:Sync] Auto-renewed license JWT received from HQ Cloud. Updating local store.');
                await this.updateLocalLicenseJwt(data.renewedJwt);
            }
        } catch (error: any) {
            logger.warn(`[License:Sync] Renewal ping warning: ${error.message}`);
        }
    }

    // 🆕 RELIABILITY: Sync Master Data (Models/Categories) to resolve offline collisions

    static async syncMasterData() {
        const ctx = await this.getCloudContext();
        if (!ctx.enabled || !ctx.cloudUrl) return { synced: 0, failed: 0 };

        try {
            const response = await fetch('/api/local/sync-master-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cloudUrl: ctx.cloudUrl,
                    secret: ctx.secret
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Master Data sync failed: ${error}`);
            }

            const data = await response.json();
            if (data.pulled > 0) {
                logger.info(`✅ Master Data sync: processed ${data.pulled} ID overrides`);
            }
            return { synced: data.pulled || 0, failed: 0 };
        } catch (error: any) {
            logger.error(`⚠️ Master Data sync error: ${error.message}`);
            return { synced: 0, failed: 1 };
        }
    }
    // 🛡️ RELIABILITY: Retry logic with exponential backoff
    private static async retryWithBackoff<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3
    ): Promise<T> {
        let lastError: any;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    // Exponential backoff: 1s, 2s, 4s
                    const delay = Math.pow(2, i) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    private static pullFailureCount = 0;
    private static lastPullAttempt = 0;
    private static isSyncing = false;

    // ⚡ SPEED: Sync all pending data
    static async syncAll() {
        if (this.isSyncing) {
            logger.warn('[Sync:All] Sync is already in progress. Bypassing parallel sync attempt.');
            return { success: false, error: 'Sync Already In Progress' };
        }
        
        // 🛡️ GUARD: DB State Gating
        if (!offlineDB.isOpen()) {
            logger.warn('[Sync:All] IndexedDB is not open. Sync aborted to prevent state corruption.');
            return { success: false, error: 'Database Closed' };
        }


        this.isSyncing = true;
        try {
            const ctx = await this.getCloudContext();
            
            // 🛡️ GUARD: Validation
            if (!ctx.enabled || !ctx.cloudUrl) {
                logger.error('[Sync:All] Cloud sync is disabled or Cloud URL is missing. Sync aborted.');
                return { success: false, error: 'Cloud Sync Disabled' };
            }
            if (!ctx.secret) {
                logger.error('[Sync:All] Sync Secret is missing. Sync aborted.');
                return { success: false, error: 'No Sync Secret' };
            }

            // 🔑 PHASE 0: License Renewal Check
            await this.checkLicenseRenewal();

            // 📥 PHASE 1: Pull Master Data Delta

            const now = Date.now();
            const backoffDelay = Math.min(this.pullFailureCount * 60000, 300000);

            if (now - this.lastPullAttempt > backoffDelay) {
                this.lastPullAttempt = now;
                try {
                    const pullResult = await this.pullMasterData();
                    if (pullResult.success) {
                        this.pullFailureCount = 0;
                    } else {
                        this.pullFailureCount++;
                        logger.warn(`[Sync:Pull] Master data pull failed (${this.pullFailureCount}): ${pullResult.error}`);
                    }
                } catch (error) {
                    logger.error('[Sync:Pull] Fatal error in master data pull', error);
                }
            }

            // 📤 PHASE 2: Push Local Changes
            const modules = [
                { name: 'Sales', sync: () => this.syncSales() },
                { name: 'Tickets', sync: () => this.syncTickets() },
                { name: 'Treasury', sync: () => this.syncTreasuryTransactions() },
                { name: 'Inventory', sync: () => this.syncInventoryMovements() },
                { name: 'Returns', sync: () => this.syncReturns() }
            ];

            const results = await Promise.allSettled(modules.map(m => m.sync()));

            let totalFailed = 0;
            let anyCriticalError = false;

            results.forEach((r, i) => {
                const moduleName = modules[i].name;
                if (r.status === 'rejected') {
                    logger.error(`[Sync:Push] ${moduleName} REJECTED critically`, r.reason);
                    anyCriticalError = true;
                } else {
                    const res = r.value as any;
                    const failed = res.failed || 0;
                    if (failed > 0) {
                        logger.warn(`[Sync:Push] ${moduleName} finished with ${failed} item failures.`);
                        totalFailed += failed;
                    }
                }
            });

            if (totalFailed > 0 || anyCriticalError) {
                logger.error(`[Sync:Push] Sync cycle failed. Critical:${anyCriticalError} ItemFailures:${totalFailed}`);
            }

            return {
                success: !anyCriticalError && totalFailed === 0,
                failures: results.filter(r => r.status === 'rejected')
            };
        } finally {
            this.isSyncing = false;
        }
    }

    // 📥 NEW: Pull delta master data from cloud
    static async pullMasterData() {
        try {
            const ctx = await this.getCloudContext();
            if (!ctx.enabled || !ctx.cloudUrl) return { success: false, error: 'Cloud URL not configured' };

            const metadata = await offlineDB.syncMetadata.get('lastPullTimestamp');
            const lastPull = metadata ? metadata.lastSyncTime.toISOString() : new Date(0).toISOString();

            const response = await fetch(`${ctx.cloudUrl}/api/sync/pull?since=${lastPull}&branchId=${ctx.branchId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-sync-secret': ctx.secret,
                    'x-license-jwt': ctx.licenseJwt
                }
            });

            if (!response.ok) {
                throw new Error(`Pull failed (${response.status})`);
            }

            const { data, timestamp } = await response.json();
            
            const hasData = (data.products?.length > 0) || 
                            (data.categories?.length > 0) || 
                            (data.models?.length > 0) || 
                            data.storeSettings || 
                            data.systemConfig;

            if (!hasData) return { success: true, pulled: 0 };

            logger.info(`[Sync:Pull] Found updates since ${lastPull}. Merging...`);

            // 1. Merge Products
            if (data.products?.length > 0) {
                const mappedProducts = data.products.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    sku: p.sku,
                    barcode: p.sku,
                    // 🛡️ Decimal wrapping ensures precision survives the IndexedDB round-trip
                    price: Number(new Decimal(p.sellPrice ?? 0).toFixed(2)),
                    stock: Number(p.stock ?? 0),
                    categoryId: p.categoryId,
                    modelId: p.modelId,
                    categoryName: p.category?.name || 'Uncategorized',
                    costPrice: Number(new Decimal(p.costPrice ?? 0).toFixed(2)),
                    trackStock: p.trackStock,
                    isBundle: p.isBundle,
                    lastSynced: new Date(),
                    syncPriority: 0,
                    updatedAt: p.updatedAt
                }));
                await offlineDB.products.bulkPut(mappedProducts);
            }

            // 2. Merge Categories
            if (data.categories?.length > 0) {
                await offlineDB.categories.bulkPut(data.categories.map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    color: c.color,
                    updatedAt: c.updatedAt
                })));
            }

            // 3. Merge Models
            if (data.models?.length > 0) {
                await offlineDB.models.bulkPut(data.models.map((m: any) => ({
                    id: m.id,
                    name: m.name,
                    categoryId: m.categoryId,
                    updatedAt: m.updatedAt
                })));
            }

            // 4. Update Settings
            if (data.storeSettings) await offlineDB.storeSettings.put(data.storeSettings);
            if (data.systemConfig) await offlineDB.systemConfigs.put(data.systemConfig);

            // 5. Update the checkpoint
            await offlineDB.syncMetadata.put({
                key: 'lastPullTimestamp',
                lastSyncTime: new Date(timestamp),
                syncStatus: 'SUCCESS',
                recordCount: (data.products?.length || 0) + (data.categories?.length || 0)
            });

            logger.info(`[Sync:Pull] Successfully merged delta from ${timestamp}`);
            return { success: true, pulled: 1 };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    // 🛡️ RELIABILITY: Sync sales with conflict detection
    static async syncSales() {
        const ctx = await this.getCloudContext();
        if (!ctx.enabled || !ctx.cloudUrl) return { synced: 0, failed: 0 };

        const allUnsynced = await offlineDB.sales
            .where('synced').equals(0)
            .and(sale => (sale.syncRetries || 0) < 5)
            .toArray();

        // 🛡️ BATCH CAP: Process max records per cycle
        const batchCap = SYNC_BATCH_SIZE || 50;
        const unsyncedSales = allUnsynced.slice(0, batchCap);

        if (unsyncedSales.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsyncedSales.length}/${allUnsynced.length} sales (batch cap: ${batchCap})...`);

        let synced = 0;
        let failed = 0;

        try {
            const response = await fetch(`${ctx.cloudUrl}/api/sync/up`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'authorization': `Bearer ${ctx.licenseJwt}`
                },
                body: JSON.stringify({ sales: unsyncedSales })
            });

            if (response.status === 401 || response.status === 403) {
                logger.error(`[Sync:Sales] HALT: Received ${response.status} from cloud. Token invalid or tenant suspended.`);
                throw new Error('AUTH_FAILED');
            }

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Sync failed: ${error}`);
            }

            const data = await response.json();

            // Process results
            if (data.sales) {
                for (const res of data.sales) {
                    if (res.error) {
                        logger.error(`Failed to sync sale ${res.id}`, res.error);
                        const sale = unsyncedSales.find(s => s.id === res.id);
                        if (sale) {
                            const newRetries = (sale.syncRetries || 0) + 1;
                            await offlineDB.sales.update(res.id, {
                                syncRetries: newRetries,
                                syncError: newRetries >= 5 ? 'DEAD_LETTER: ' + res.error : res.error,
                                syncStatus: newRetries >= 5 ? 'ERROR' : undefined
                            });
                        }
                        failed++;
                    } else {
                        await offlineDB.sales.update(res.id, {
                            synced: 1,
                            syncError: undefined,
                            syncStatus: 'SYNCED'
                        });
                        synced++;
                    }
                }
            }
        } catch (error: any) {
            if (error.message === 'AUTH_FAILED') {
                throw error; // Propagate critical halt up
            }
            logger.error(`Batch sync request failed`, error);
            failed += unsyncedSales.length;
            
            // Increment retries for the batch
            for (const sale of unsyncedSales) {
                const newRetries = (sale.syncRetries || 0) + 1;
                if (newRetries >= 5) {
                    await offlineDB.sales.update(sale.id, {
                        syncRetries: newRetries,
                        syncError: 'DEAD_LETTER: ' + error.message,
                        syncStatus: 'ERROR'
                    });
                } else {
                    await offlineDB.sales.update(sale.id, {
                        syncRetries: newRetries,
                        syncError: error.message
                    });
                }
            }
        }

        logger.info(`✅ Sales sync: ${synced} synced, ${failed} failed`);
        return { synced, failed };
    }

    // 🛡️ RELIABILITY: Sync tickets with error handling
    static async syncTickets() {
        const ctx = await this.getCloudContext();
        if (!ctx.enabled || !ctx.cloudUrl) return { synced: 0, failed: 0 };

        const allUnsynced = await offlineDB.tickets
            .where('synced').equals(0)
            .and(ticket => (ticket.syncRetries || 0) < 5)
            .toArray();

        // 🛡️ BATCH CAP: Process max records per cycle
        const batchCap = SYNC_BATCH_SIZE || 50;
        const unsyncedTickets = allUnsynced.slice(0, batchCap);

        if (unsyncedTickets.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsyncedTickets.length}/${allUnsynced.length} tickets (batch cap: ${batchCap})...`);

        let synced = 0;
        let failed = 0;

        try {
            const response = await fetch(`${ctx.cloudUrl}/api/sync/up`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'authorization': `Bearer ${ctx.licenseJwt}`
                },
                body: JSON.stringify({ tickets: unsyncedTickets })
            });

            if (response.status === 401 || response.status === 403) {
                logger.error(`[Sync:Tickets] HALT: Received ${response.status} from cloud. Token invalid or tenant suspended.`);
                throw new Error('AUTH_FAILED');
            }

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Sync failed: ${error}`);
            }

            const data = await response.json();

            // Process results
            if (data.tickets) {
                for (const res of data.tickets) {
                    if (res.error) {
                        logger.error(`Failed to sync ticket ${res.id}`, res.error);
                        const ticket = unsyncedTickets.find(t => t.id === res.id);
                        if (ticket) {
                            const newRetries = (ticket.syncRetries || 0) + 1;
                            await offlineDB.tickets.update(res.id, {
                                syncRetries: newRetries,
                                syncError: newRetries >= 5 ? 'DEAD_LETTER: ' + res.error : res.error,
                                syncStatus: newRetries >= 5 ? 'ERROR' : undefined
                            });
                        }
                        failed++;
                    } else {
                        await offlineDB.tickets.update(res.id, {
                            synced: 1,
                            syncError: undefined,
                            syncStatus: 'SYNCED'
                        });
                        synced++;
                    }
                }
            }
        } catch (error: any) {
            if (error.message === 'AUTH_FAILED') {
                throw error; // Propagate critical halt up
            }
            logger.error(`Batch sync request failed`, error);
            failed += unsyncedTickets.length;
            
            for (const ticket of unsyncedTickets) {
                const newRetries = (ticket.syncRetries || 0) + 1;
                if (newRetries >= 5) {
                    await offlineDB.tickets.update(ticket.id, {
                        syncRetries: newRetries,
                        syncError: 'DEAD_LETTER: ' + error.message,
                        syncStatus: 'ERROR'
                    });
                } else {
                    await offlineDB.tickets.update(ticket.id, {
                        syncRetries: newRetries,
                        syncError: error.message
                    });
                }
            }
        }

        logger.info(`✅ Tickets sync: ${synced} synced, ${failed} failed`);
        return { synced, failed };
    }

    // 🛡️ RELIABILITY: Sync treasury transactions with idempotency
    static async syncTreasuryTransactions() {
        const ctx = await this.getCloudContext();
        if (!ctx.enabled || !ctx.cloudUrl) return { synced: 0, failed: 0, deadLettered: 0 };

        const unsyncedTxs = await (offlineDB.treasuryTransactions?.where('synced').equals(0)
            .and(tx => (tx.syncRetries || 0) < 5)
            .toArray() ?? Promise.resolve([]));

        if (unsyncedTxs.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsyncedTxs.length} treasury transactions...`);

        let synced = 0;
        let failed = 0;
        let deadLettered = 0;

        for (const tx of unsyncedTxs) {
            try {
                await this.retryWithBackoff(async () => {
                    const response = await fetch(`${ctx.cloudUrl}/api/treasury/offline-transaction`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-sync-secret': ctx.secret,
                            'x-license-jwt': ctx.licenseJwt
                        },
                        body: JSON.stringify({
                            ...tx,
                            idempotencyKey: tx.idempotencyKey,
                            branchId: ctx.branchId
                        })
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(`Sync failed: ${error}`);
                    }

                    return response.json();
                });

                await offlineDB.treasuryTransactions.update(tx.id, {
                    synced: 1,
                    syncError: undefined,
                    syncStatus: 'SYNCED'
                });
                synced++;

            } catch (error: any) {
                const newRetries = (tx.syncRetries || 0) + 1;
                
                if (newRetries >= 5) {
                    logger.error(`⚠️ Dead-lettering treasury transaction ${tx.id} after 5 failures`, error);
                    await offlineDB.treasuryTransactions.update(tx.id, {
                        syncRetries: newRetries,
                        syncError: 'DEAD_LETTER: Requires manual intervention',
                        syncStatus: 'ERROR'
                    });
                    deadLettered++;
                } else {
                    await offlineDB.treasuryTransactions.update(tx.id, {
                        syncRetries: newRetries,
                        syncError: error.message
                    });
                }
                failed++;
            }
        }

        logger.info(`✅ Treasury sync: ${synced} synced, ${failed} failed, ${deadLettered} dead-lettered`);
        return { synced, failed, deadLettered };
    }

    // NEW: Sync inventory movements
    static async syncInventoryMovements() {
        const ctx = await this.getCloudContext();
        if (!ctx.enabled || !ctx.cloudUrl) return { synced: 0, failed: 0 };

        const unsynced = await (offlineDB.inventoryMovements?.where('synced').equals(0)
            .and(m => (m.syncRetries || 0) < 5)
            .toArray() ?? Promise.resolve([]));

        if (unsynced.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsynced.length} inventory movements...`);

        let synced = 0;
        let failed = 0;

        for (const m of unsynced) {
            try {
                await this.retryWithBackoff(async () => {
                    const response = await fetch(`${ctx.cloudUrl}/api/inventory/offline-movement`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-sync-secret': ctx.secret,
                            'x-license-jwt': ctx.licenseJwt
                        },
                        body: JSON.stringify({
                            ...m,
                            idempotencyKey: m.idempotencyKey,
                            branchId: ctx.branchId
                        })
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(`Sync failed: ${error}`);
                    }

                    return response.json();
                });

                await offlineDB.inventoryMovements.update(m.id, {
                    synced: 1,
                    syncError: undefined,
                    syncStatus: 'SYNCED'
                });
                synced++;

            } catch (error: any) {
                const newRetries = (m.syncRetries || 0) + 1;
                if (newRetries >= 5) {
                    logger.error(`⚠️ Dead-lettering inventory movement ${m.id} after 5 failures`, error);
                    await offlineDB.inventoryMovements.update(m.id, {
                        syncRetries: newRetries,
                        syncError: 'DEAD_LETTER: Requires manual intervention',
                        syncStatus: 'ERROR'
                    });
                } else {
                    await offlineDB.inventoryMovements.update(m.id, {
                        syncRetries: newRetries,
                        syncError: error.message
                    });
                }
                failed++;
            }
        }

        logger.info(`✅ Inventory sync: ${synced} synced, ${failed} failed`);
        return { synced, failed };
    }

    // NEW: Sync returns
    static async syncReturns() {
        const ctx = await this.getCloudContext();
        if (!ctx.enabled || !ctx.cloudUrl) return { synced: 0, failed: 0 };

        const unsynced = await (offlineDB.returns?.where('synced').equals(0)
            .and(r => (r.syncRetries || 0) < 5)
            .toArray() ?? Promise.resolve([]));

        if (unsynced.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsynced.length} returns...`);

        let synced = 0;
        let failed = 0;

        for (const r of unsynced) {
            try {
                await this.retryWithBackoff(async () => {
                    const response = await fetch(`${ctx.cloudUrl}/api/sales/offline-return`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-sync-secret': ctx.secret,
                            'x-license-jwt': ctx.licenseJwt
                        },
                        body: JSON.stringify({
                            ...r,
                            idempotencyKey: r.idempotencyKey,
                            branchId: ctx.branchId
                        })
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(`Sync failed: ${error}`);
                    }

                    return response.json();
                });

                await offlineDB.returns.update(r.id, {
                    synced: 1,
                    syncError: undefined,
                    syncStatus: 'SYNCED'
                });
                synced++;

            } catch (error: any) {
                const newRetries = (r.syncRetries || 0) + 1;
                if (newRetries >= 5) {
                    logger.error(`⚠️ Dead-lettering return ${r.id} after 5 failures`, error);
                    await offlineDB.returns.update(r.id, {
                        syncRetries: newRetries,
                        syncError: 'DEAD_LETTER: Requires manual intervention',
                        syncStatus: 'ERROR'
                    });
                } else {
                    await offlineDB.returns.update(r.id, {
                        syncRetries: newRetries,
                        syncError: error.message
                    });
                }
                failed++;
            }
        }

        logger.info(`✅ Returns sync: ${synced} synced, ${failed} failed`);
        return { synced, failed };
    }

    // 🎨 VISUAL CLARITY: Get queue status for UI
    static async getQueueStatus() {
        const [
            salesCount, ticketsCount, treasuryCount, inventoryCount, returnsCount,
            salesErr, ticketsErr, treasuryErr, inventoryErr, returnsErr
        ] = await Promise.all([
            offlineDB.sales.where('synced').equals(0).count(),
            offlineDB.tickets.where('synced').equals(0).count(),
            (offlineDB.treasuryTransactions?.where('synced').equals(0).count() ?? Promise.resolve(0)),
            (offlineDB.inventoryMovements?.where('synced').equals(0).count() ?? Promise.resolve(0)),
            (offlineDB.returns?.where('synced').equals(0).count() ?? Promise.resolve(0)),
            offlineDB.sales.where('syncStatus').equals('ERROR').count(),
            offlineDB.tickets.where('syncStatus').equals('ERROR').count(),
            (offlineDB.treasuryTransactions?.where('syncStatus').equals('ERROR').count() ?? Promise.resolve(0)),
            (offlineDB.inventoryMovements?.where('syncStatus').equals('ERROR').count() ?? Promise.resolve(0)),
            (offlineDB.returns?.where('syncStatus').equals('ERROR').count() ?? Promise.resolve(0))
        ]);

        return {
            salesCount,
            ticketsCount,
            treasuryCount,
            inventoryCount,
            returnsCount,
            total: salesCount + ticketsCount + treasuryCount + inventoryCount + returnsCount,
            errorCount: salesErr + ticketsErr + treasuryErr + inventoryErr + returnsErr
        };
    }

    // 👤 USABILITY: Manual sync trigger
    static async manualSync() {
        // 🛡️ SECURITY: Use SyncWorker to ensure mutual exclusion
        const { SyncWorker } = await import('./sync-worker');
        return await SyncWorker.runUniversalSync();
    }

    // 📋 ADMIN: Get items that failed multiple times (Dead Letter Queue)
    static async getDeadLetterQueue() {
        const [sales, tickets, treasury, inventory, returns] = await Promise.all([
            offlineDB.sales.where('syncStatus').equals('ERROR').toArray(),
            offlineDB.tickets.where('syncStatus').equals('ERROR').toArray(),
            (offlineDB.treasuryTransactions?.where('syncStatus').equals('ERROR').toArray() ?? Promise.resolve([])),
            (offlineDB.inventoryMovements?.where('syncStatus').equals('ERROR').toArray() ?? Promise.resolve([])),
            (offlineDB.returns?.where('syncStatus').equals('ERROR').toArray() ?? Promise.resolve([]))
        ]);

        return [
            ...sales.map(item => ({ ...item, type: 'SALE' })),
            ...tickets.map(item => ({ ...item, type: 'TICKET' })),
            ...treasury.map(item => ({ ...item, type: 'TREASURY' })),
            ...inventory.map(item => ({ ...item, type: 'INVENTORY' })),
            ...returns.map(item => ({ ...item, type: 'RETURN' }))
        ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }

    // 🛠️ ADMIN: Retry a failed item
    static async retryItem(type: string, id: string) {
        const table = this.getStoreTable(type);
        if (!table) return;

        await table.update(id, {
            syncRetries: 0,
            syncStatus: 'PENDING',
            synced: 0,
            syncError: undefined
        });
        logger.info(`[SyncService] Marked ${type} ${id} for retry.`);
    }

    // 🗑️ ADMIN: Remove a problematic item from queue
    static async removeItem(type: string, id: string) {
        const table = this.getStoreTable(type);
        if (!table) return;

        await table.delete(id);
        logger.warn(`[SyncService] Removed ${type} ${id} from offline queue.`);
    }

    private static getStoreTable(type: string) {
        switch (type) {
            case 'SALE': return offlineDB.sales;
            case 'TICKET': return offlineDB.tickets;
            case 'TREASURY': return offlineDB.treasuryTransactions;
            case 'INVENTORY': return offlineDB.inventoryMovements;
            case 'RETURN': return offlineDB.returns;
            default: return null;
        }
    }
}
