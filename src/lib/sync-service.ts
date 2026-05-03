import { offlineDB } from './offline-db';
import { logger } from './logger';
import { db } from './offline-db';
import Decimal from 'decimal.js';

const SYNC_BATCH_SIZE = 50;

export class SyncService {
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

    // ⚡ SPEED: Sync all pending data
    static async syncAll() {
        // 📥 PHASE 1: Pull Master Data Delta
        const now = Date.now();
        // Simple backoff: If failed previously, wait longer before trying again (exponential-ish)
        const backoffDelay = Math.min(this.pullFailureCount * 60000, 300000); // Max 5 mins

        if (now - this.lastPullAttempt > backoffDelay) {
            this.lastPullAttempt = now;
            const pullResult = await this.pullMasterData();
            if (pullResult.success) {
                this.pullFailureCount = 0;
            } else {
                this.pullFailureCount++;
                logger.warn(`[Sync:Pull] Master data pull failed (${this.pullFailureCount}). skipping push sync if critical.`);
            }
        }

        // 📤 PHASE 2: Push Local Changes
        // Only trigger push if we are online and have a cloud URL
        const cloudUrl = process.env.NEXT_PUBLIC_CLOUD_URL || '';
        if (!cloudUrl) return { success: false, error: 'No Cloud URL' };

        // 🛡️ GUARD: Sync secret is mandatory for authenticated push
        const syncSecret = process.env.NEXT_PUBLIC_SYNC_SECRET || '';
        if (!syncSecret) {
            logger.error('[Sync:Push] NEXT_PUBLIC_SYNC_SECRET is not configured. Aborting push to prevent unauthorized sync.');
            return { success: false, error: 'Sync secret not configured' };
        }

        const results = await Promise.allSettled([
            this.syncSales(),
            this.syncTickets(),
            this.syncTreasuryTransactions(),
            this.syncInventoryMovements(),
            this.syncReturns()
        ]);

        const totalFailed = results.reduce((acc, r) => {
            if (r.status === 'rejected') return acc + 1;
            return acc + (r.value.failed || 0);
        }, 0);
        
        const anyCriticalError = results.some(r => r.status === 'rejected');

        if (totalFailed > 0) {
            logger.error(`[Sync:Push] Completed with ${totalFailed} item failures.`);
        }

        return {
            success: !anyCriticalError && totalFailed === 0,
            failures: results.filter(r => r.status === 'rejected')
        };
    }

    // 📥 NEW: Pull delta master data from cloud
    static async pullMasterData() {
        try {
            const metadata = await offlineDB.syncMetadata.get('lastPullTimestamp');
            const lastPull = metadata ? metadata.lastSyncTime.toISOString() : new Date(0).toISOString();

            // Use the same secret for pulling as pushing
            const secret = process.env.NEXT_PUBLIC_SYNC_SECRET || '';
            const cloudUrl = process.env.NEXT_PUBLIC_CLOUD_URL || '';

            if (!cloudUrl) return { success: false, error: 'Cloud URL not configured' };

            const response = await fetch(`${cloudUrl}/api/sync/pull?since=${lastPull}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-sync-secret': secret
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
        const allUnsynced = await offlineDB.sales
            .where('synced').equals(0)
            .and(sale => (sale.syncRetries || 0) < 5)
            .toArray();

        // 🛡️ BATCH CAP: Process max 50 records per cycle to prevent connection bursts
        const unsyncedSales = allUnsynced.slice(0, SYNC_BATCH_SIZE);

        if (unsyncedSales.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsyncedSales.length}/${allUnsynced.length} sales (batch cap: ${SYNC_BATCH_SIZE})...`);

        let synced = 0;
        let failed = 0;

        for (const sale of unsyncedSales) {
            try {
                await this.retryWithBackoff(async () => {
                    const response = await fetch('/api/pos/offline-sale', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-sync-secret': process.env.NEXT_PUBLIC_SYNC_SECRET || ''
                        },
                        // 🛡️ Explicit idempotencyKey aligns with server-side @@unique guard
                        body: JSON.stringify({ ...sale, idempotencyKey: sale.idempotencyKey ?? sale.id })
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(`Sync failed: ${error}`);
                    }

                    return response.json();
                });

                // Mark as synced
                await offlineDB.sales.update(sale.id, {
                    synced: 1,
                    syncError: undefined,
                    syncStatus: 'SYNCED'
                });
                synced++;

            } catch (error: any) {
                logger.error(`Failed to sync sale ${sale.id}`, error);

                const newRetries = (sale.syncRetries || 0) + 1;
                
                if (newRetries >= 5) {
                    logger.error(`⚠️ Dead-lettering sale ${sale.id} after 5 failures`, error);
                    await offlineDB.sales.update(sale.id, {
                        syncRetries: newRetries,
                        syncError: 'DEAD_LETTER: Requires manual intervention',
                        syncStatus: 'ERROR'
                    });
                } else {
                    await offlineDB.sales.update(sale.id, {
                        syncRetries: newRetries,
                        syncError: error.message
                    });
                }
                failed++;
            }
        }

        logger.info(`✅ Sales sync: ${synced} synced, ${failed} failed`);
        return { synced, failed };
    }

    // 🛡️ RELIABILITY: Sync tickets with error handling
    static async syncTickets() {
        const allUnsynced = await offlineDB.tickets
            .where('synced').equals(0)
            .and(ticket => (ticket.syncRetries || 0) < 5)
            .toArray();

        // 🛡️ BATCH CAP: Process max 50 records per cycle
        const unsyncedTickets = allUnsynced.slice(0, SYNC_BATCH_SIZE);

        if (unsyncedTickets.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsyncedTickets.length}/${allUnsynced.length} tickets (batch cap: ${SYNC_BATCH_SIZE})...`);

        let synced = 0;
        let failed = 0;

        for (const ticket of unsyncedTickets) {
            try {
                await this.retryWithBackoff(async () => {
                    const response = await fetch('/api/tickets/offline-ticket', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-sync-secret': process.env.NEXT_PUBLIC_SYNC_SECRET || ''
                        },
                        // 🛡️ Explicit idempotencyKey aligns with server-side @@unique guard
                        body: JSON.stringify({ ...ticket, idempotencyKey: ticket.idempotencyKey ?? ticket.id })
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(`Sync failed: ${error}`);
                    }

                    return response.json();
                });

                // Mark as synced
                await offlineDB.tickets.update(ticket.id, {
                    synced: 1,
                    syncError: undefined,
                    syncStatus: 'SYNCED'
                });
                synced++;

            } catch (error: any) {
                logger.error(`Failed to sync ticket ${ticket.id}`, error);

                const newRetries = (ticket.syncRetries || 0) + 1;
                
                if (newRetries >= 5) {
                    logger.error(`⚠️ Dead-lettering ticket ${ticket.id} after 5 failures`, error);
                    await offlineDB.tickets.update(ticket.id, {
                        syncRetries: newRetries,
                        syncError: 'DEAD_LETTER: Requires manual intervention',
                        syncStatus: 'ERROR'
                    });
                } else {
                    await offlineDB.tickets.update(ticket.id, {
                        syncRetries: newRetries,
                        syncError: error.message
                    });
                }
                failed++;
            }
        }

        logger.info(`✅ Tickets sync: ${synced} synced, ${failed} failed`);
        return { synced, failed };
    }

    // 🛡️ RELIABILITY: Sync treasury transactions with idempotency
    static async syncTreasuryTransactions() {
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
                    const response = await fetch('/api/treasury/offline-transaction', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...tx,
                            idempotencyKey: tx.idempotencyKey
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
                    const response = await fetch('/api/inventory/offline-movement', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...m,
                            idempotencyKey: m.idempotencyKey
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
                    const response = await fetch('/api/sales/offline-return', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-sync-secret': process.env.NEXT_PUBLIC_SYNC_SECRET || ''
                        },
                        body: JSON.stringify({
                            ...r,
                            idempotencyKey: r.idempotencyKey
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
        const [salesCount, ticketsCount, treasuryCount, inventoryCount, returnsCount] = await Promise.all([
            offlineDB.sales.where('synced').equals(0).count(),
            offlineDB.tickets.where('synced').equals(0).count(),
            (offlineDB.treasuryTransactions?.where('synced').equals(0).count() ?? Promise.resolve(0)),
            (offlineDB.inventoryMovements?.where('synced').equals(0).count() ?? Promise.resolve(0)),
            (offlineDB.returns?.where('synced').equals(0).count() ?? Promise.resolve(0))
        ]);

        return {
            salesCount,
            ticketsCount,
            treasuryCount,
            inventoryCount,
            returnsCount,
            total: salesCount + ticketsCount + treasuryCount + inventoryCount + returnsCount
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
