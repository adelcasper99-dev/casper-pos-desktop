import { offlineDB } from './offline-db';

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
        console.log('🔄 Starting sync...');
        const results = await Promise.allSettled([
            this.syncSales(),
            this.syncTickets()
        ]);

        const failures = results.filter(r => r.status === 'rejected');
        console.log(`✅ Sync complete. ${failures.length} failures.`);

        return {
            success: failures.length === 0,
            failures
        };
    }

    // 🛡️ RELIABILITY: Sync sales with conflict detection
    static async syncSales() {
        const unsyncedSales = await offlineDB.sales
            .where('synced').equals(0) // 🛡️ Use 0 for false in IndexedDB
            .and(sale => sale.syncRetries < 5) // Max 5 retries
            .toArray();

        if (unsyncedSales.length === 0) {
            return { synced: 0, failed: 0 };
        }

        console.log(`📤 Syncing ${unsyncedSales.length} sales...`);

        let synced = 0;
        let failed = 0;

        for (const sale of unsyncedSales) {
            try {
                await this.retryWithBackoff(async () => {
                    const response = await fetch('/api/pos/offline-sale', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
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
                    syncError: undefined
                });
                synced++;

            } catch (error: any) {
                console.error(`Failed to sync sale ${sale.id}:`, error);

                // Update retry count and error
                await offlineDB.sales.update(sale.id, {
                    syncRetries: sale.syncRetries + 1,
                    syncError: error.message
                });
                failed++;
            }
        }

        console.log(`✅ Sales sync: ${synced} synced, ${failed} failed`);
        return { synced, failed };
    }

    // 🛡️ RELIABILITY: Sync tickets with error handling
    static async syncTickets() {
        const unsyncedTickets = await offlineDB.tickets
            .where('synced').equals(0) // 🛡️ Use 0 for false in IndexedDB
            .and(ticket => ticket.syncRetries < 5)
            .toArray();

        if (unsyncedTickets.length === 0) {
            return { synced: 0, failed: 0 };
        }

        console.log(`📤 Syncing ${unsyncedTickets.length} tickets...`);

        let synced = 0;
        let failed = 0;

        for (const ticket of unsyncedTickets) {
            try {
                await this.retryWithBackoff(async () => {
                    const response = await fetch('/api/tickets/offline-ticket', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
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
                    syncError: undefined
                });
                synced++;

            } catch (error: any) {
                console.error(`Failed to sync ticket ${ticket.id}:`, error);

                // Update retry count and error
                await offlineDB.tickets.update(ticket.id, {
                    syncRetries: ticket.syncRetries + 1,
                    syncError: error.message
                });
                failed++;
            }
        }

        console.log(`✅ Tickets sync: ${synced} synced, ${failed} failed`);
        return { synced, failed };
    }

    // 🎨 VISUAL CLARITY: Get queue status for UI
    static async getQueueStatus() {
        const [salesCount, ticketsCount] = await Promise.all([
            offlineDB.sales.where('synced').equals(0).count(), // 🛡️ Use 0 for false
            offlineDB.tickets.where('synced').equals(0).count() // 🛡️ Use 0 for false
        ]);

        return {
            salesCount,
            ticketsCount,
            total: salesCount + ticketsCount
        };
    }

    // 👤 USABILITY: Manual sync trigger
    static async manualSync() {
        console.log('🔄 Manual sync triggered');
        return await this.syncAll();
    }
}
