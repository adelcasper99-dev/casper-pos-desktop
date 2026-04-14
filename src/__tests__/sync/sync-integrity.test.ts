import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as syncSale } from '@/app/api/pos/offline-sale/route';
import { resetTestDB } from './setup';
import { NextRequest } from 'next/server';

describe('Sync Engine: Idempotency & Temporal Integrity', () => {
    
    beforeEach(async () => {
        await resetTestDB();
        
        // Setup minimal data (Branch, etc)
        await prisma.branch.create({
            data: { id: 'branch-1', name: 'Main Branch', code: 'BR-1' }
        });

        await prisma.warehouse.create({
            data: { id: 'WH-1', name: 'Main Warehouse', branchId: 'branch-1' }
        });
    });

    /**
     * TEST: Idempotency (Chaos Test)
     * Simulates 5 simultaneous requests with the same idempotencyKey.
     * Expected: Exactly 1 record created, no DB errors.
     */
    it('should handle simultaneous identical payloads without duplication (Idempotency)', async () => {
        const payload = {
            idempotencyKey: 'test-key-123',
            customerName: 'Chaos User',
            totalAmount: 100,
            paymentMethod: 'CASH',
            branchId: 'branch-1',
            warehouseId: 'WH-1',
            items: []
        };

        const executeRequest = () => {
            const req = new NextRequest('http://localhost/api/pos/offline-sale', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            return syncSale(req);
        };

        // Fire 5 requests simultaneously
        const responses = await Promise.all([
            executeRequest(),
            executeRequest(),
            executeRequest(),
            executeRequest(),
            executeRequest()
        ]);

        // Check DB count
        const count = await prisma.sale.count({
            where: { idempotencyKey: 'test-key-123' }
        });

        expect(count).toBe(1);

        // Verify some responses were 'existing'
        const results = await Promise.all(responses.map(r => r.json()));
        const existingCount = results.filter(r => r.existing).length;
        expect(existingCount).toBeGreaterThanOrEqual(4);
    });

    /**
     * TEST: Temporal Integrity
     * Simulates a transaction backdated by 48 hours.
     * Expected: DB record createdAt matches the payload, not now.
     */
    it('should honor client-side createdAt timestamps (Temporal Integrity)', async () => {
        const backdatedTime = new Date();
        backdatedTime.setHours(backdatedTime.getHours() - 48);
        
        const payload = {
            idempotencyKey: 'time-travel-key',
            customerName: 'Time Traveler',
            totalAmount: 200,
            paymentMethod: 'CASH',
            branchId: 'branch-1',
            warehouseId: 'WH-1',
            createdAt: backdatedTime.toISOString(),
            items: []
        };

        const req = new NextRequest('http://localhost/api/pos/offline-sale', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const res = await syncSale(req);
        const data = await res.json();
        expect(data.success).toBe(true);

        const savedSale = await prisma.sale.findUnique({
            where: { id: data.id }
        });

        // Compare timestamps (allowing for small string conversion variance if any)
        expect(savedSale?.createdAt.getTime()).toBeCloseTo(backdatedTime.getTime(), -3); // Within 1 second
    });
});
