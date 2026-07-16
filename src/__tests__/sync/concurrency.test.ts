import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as syncTicket } from '@/app/api/tickets/offline-ticket/route';
import { resetTestDB, syncHeaders } from './setup';
import { NextRequest } from 'next/server';
import { SyncWorker } from '@/lib/sync-worker';
import { SyncService } from '@/lib/sync-service';
import { offlineDB } from '@/lib/offline-db';

import { runWithTenant } from '@/lib/prisma-tenant-extension';

describe('Sync Engine: Concurrency & Stability', () => {
    
    beforeEach(async () => {
        await resetTestDB();
        (SyncWorker as any).isSyncing = false; // 🛡️ Reset state between tests
        
        await runWithTenant('test-tenant', async () => {
            // Setup minimal data (Branch, etc)
            await prisma.branch.create({
                data: { id: 'branch-1', name: 'Main Branch', code: 'BR-1' }
            });
        });
    });

    /**
     * TEST: Atomic Collision (Ticket Barcodes)
     * Two clients syncing at the same time should get unique sequential IDs.
     */
    it('should generate unique sequential ticket barcodes during concurrent sync (Atomic Lock)', async () => {
        const payload1 = {
            idempotencyKey: 'ticket-1',
            customerName: 'Client A',
            customerPhone: '111',
            branchId: 'branch-1',
            deviceBrand: 'Apple',
            deviceModel: 'iPhone 13',
            issueDescription: 'Broken screen'
        };

        const payload2 = {
            idempotencyKey: 'ticket-2',
            customerName: 'Client B',
            customerPhone: '222',
            branchId: 'branch-1',
            deviceBrand: 'Samsung',
            deviceModel: 'S22',
            issueDescription: 'Battery swap'
        };

        const executeRequest = (p: any) => {
            const req = new NextRequest('http://localhost/api/tickets/offline-ticket', {
                method: 'POST',
                headers: syncHeaders,
                body: JSON.stringify(p)
            });
            return syncTicket(req);
        };

        // Fire both syncs simultaneously
        const [res1, res2] = await Promise.all([
            executeRequest(payload1),
            executeRequest(payload2)
        ]);

        const data1 = await res1.json();
        const data2 = await res2.json();

        expect(data1.success).toBe(true);
        expect(data2.success).toBe(true);

        // Barcodes should be unique and sequential (T-001, T-002)
        expect(data1.barcode).not.toBe(data2.barcode);
        
        const barcodes = [data1.barcode, data2.barcode].sort();
        expect(barcodes[0]).toBe('BR-1-T001');
        expect(barcodes[1]).toBe('BR-1-T002');
    }, 15000);

    /**
     * TEST: Sync Mutex
     * Verifies that while SyncWorker is running, subsequent calls are blocked.
     */
    it('should block overlapping sync cycles using isSyncing mutex', async () => {
        // 🧪 SETUP: Add a pending item so the sync actually runs
        await offlineDB.sales.add({
            id: 'mutex-sale',
            totalAmount: 100,
            synced: 0,
            warehouseId: 'WH-1',
            paymentMethod: 'CASH',
            status: 'COMPLETED',
            taxAmount: 0,
            subTotal: 100,
            items: [],
            offlineFlag: true,
            discountAmount: 0,
            discountPercentage: 0,
            createdAt: Date.now()
        });

        // Mock SyncService.syncAll to be slow
        const spy = vi.spyOn(SyncService, 'syncAll').mockImplementation(async () => {
            await new Promise(r => setTimeout(r, 200)); // Sleep 200ms
            return { success: true, failures: [] };
        });

        // First run
        const firstRun = SyncWorker.runUniversalSync();
        
        // Immediate second run attempt
        const secondRun = await SyncWorker.runUniversalSync();
        
        expect((secondRun as any).message).toBe('Sync already in progress');
        
        await firstRun; // Wait for first one to finish
        expect(spy).toHaveBeenCalledTimes(1);
        
        spy.mockRestore();
    });
});
