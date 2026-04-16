import { offlineDB } from './offline-db';
import { logger } from './logger';
import { db } from './offline-db';

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

    // ⚡ SPEED: Sync all pending data
    static async syncAll() {
        logger.info('🔄 Starting universal sync...');
        const results = await Promise.allSettled([
            this.syncSales(),
            this.syncTickets(),
            this.syncTreasuryTransactions(),
            this.syncInventoryMovements(),
            this.syncReturns()
        ]);

        const failures = results.filter(r => r.status === 'rejected');
        logger.info(`✅ Sync complete. ${failures.length} failures.`);

        return {
            success: failures.length === 0,
            failures
        };
    }

    // 🛡️ RELIABILITY: Sync sales with conflict detection
    static async syncSales() {
        const unsyncedSales = await offlineDB.sales
            .where('synced').equals(0) // 🛡️ Use 0 for false in IndexedDB
            .and(sale => (sale.syncRetries || 0) < 5) // Max 5 retries
            .toArray();

        if (unsyncedSales.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsyncedSales.length} sales...`);

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
                        body: JSON.stringify(sale)
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
        const unsyncedTickets = await offlineDB.tickets
            .where('synced').equals(0) // 🛡️ Use 0 for false in IndexedDB
            .and(ticket => (ticket.syncRetries || 0) < 5)
            .toArray();

        if (unsyncedTickets.length === 0) {
            return { synced: 0, failed: 0 };
        }

        logger.info(`📤 Syncing ${unsyncedTickets.length} tickets...`);

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
                        body: JSON.stringify(ticket)
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
                        headers: { 'Content-Type': 'application/json' },
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
