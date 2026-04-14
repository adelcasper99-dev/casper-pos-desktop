import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { SyncService } from '@/lib/sync-service';
import { offlineDB } from '@/lib/offline-db';
import { resetTestDB } from './setup';

describe('Sync Engine: DLQ Routing & Backoff', () => {
    
    beforeEach(async () => {
        await resetTestDB();
        
        // Mock global fetch for API failures
        (global as any).fetch = vi.fn();
    });

    /**
     * TEST: DLQ Routing
     * Simulates 5 sync failures for a sale.
     * Expected: After 5th failure, status becomes 'ERROR' (DLQ).
     */
    it('should route transactions to the Dead Letter Queue after 5 consecutive failures', async () => {
        const testSale = {
            id: 'dead-sale-1',
            customerName: 'Error User',
            totalAmount: 50,
            synced: 0,
            syncRetries: 4, 
            createdAt: Date.now(),
            warehouseId: 'WH-1',
            paymentMethod: 'CASH',
            status: 'COMPLETED',
            taxAmount: 0,
            subTotal: 50,
            items: [],
            offlineFlag: true,
            discountAmount: 0,
            discountPercentage: 0
        };

        // Seed offlineDB (using direct Dexie if possible, or mocking the Service input)
        await offlineDB.sales.add(testSale);

        // Mock fetch to return 500
        (fetch as any).mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Server Crash')
        });

        // Trigger sync for sales
        await SyncService.syncSales();

        // Check offlineDB state
        const updatedSale = await offlineDB.sales.get('dead-sale-1');
        
        expect(updatedSale?.syncRetries).toBe(5);
        expect(updatedSale?.syncStatus).toBe('ERROR');
        expect(updatedSale?.syncError).toContain('DEAD_LETTER');
    });

    /**
     * TEST: Sync Skipping
     * Ensure syncSales avoids items that are already in DLQ.
     */
    it('should skip items that are already in ERROR status (DLQ)', async () => {
        const errorSale = {
            id: 'error-sale-1',
            synced: 0,
            syncStatus: 'ERROR' as any,
            syncRetries: 5,
            createdAt: Date.now(),
            warehouseId: 'WH-1',
            totalAmount: 50,
            paymentMethod: 'CASH',
            status: 'COMPLETED',
            taxAmount: 0,
            subTotal: 50,
            items: [],
            offlineFlag: true,
            discountAmount: 0,
            discountPercentage: 0
        };
        await offlineDB.sales.add(errorSale);

        const fetchSpy = vi.spyOn(global, 'fetch');
        
        await SyncService.syncSales();

        // Should NOT have attempted to fetch this sale
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
