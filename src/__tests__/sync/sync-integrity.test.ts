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
            data: { id: 'b3b07384-d113-4956-a5d2-085e78370b01', name: 'Main Branch', code: 'BR-1' }
        });

        await prisma.warehouse.create({
            data: { id: 'b3b07384-d113-4956-a5d2-085e78370f01', name: 'Main Warehouse', branchId: 'b3b07384-d113-4956-a5d2-085e78370b01' }
        });

        // Seed accounts needed for Double-Entry Bookkeeping
        await prisma.account.create({
            data: { id: 'acc-sales', code: '4000', name: 'Sales Revenue', type: 'REVENUE' }
        });

        await prisma.account.create({
            data: { id: 'acc-cash', code: '1000', name: 'Main Cash', type: 'ASSET' }
        });

        // Seed treasury mapped to the branch
        await prisma.treasury.create({
            data: { id: 'treasury-1', branchId: 'b3b07384-d113-4956-a5d2-085e78370b01', name: 'Main Treasury', glCode: '1000', paymentMethod: 'CASH', balance: '0' }
        });

        // Seed category and product
        await prisma.category.create({
            data: { id: 'cat-1', name: 'Electronics' }
        });

        await prisma.product.create({
            data: {
                id: 'd3b07384-d113-4956-a5d2-085e78370123',
                sku: 'PROD-100',
                name: 'iPhone 15 Pro',
                categoryId: 'cat-1',
                costPrice: '1000',
                sellPrice: '1200',
                trackStock: false
            }
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
            branchId: 'b3b07384-d113-4956-a5d2-085e78370b01',
            warehouseId: 'b3b07384-d113-4956-a5d2-085e78370f01',
            items: [
                {
                    productId: 'd3b07384-d113-4956-a5d2-085e78370123',
                    quantity: 1,
                    unitPrice: 100
                }
            ]
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
            branchId: 'b3b07384-d113-4956-a5d2-085e78370b01',
            warehouseId: 'b3b07384-d113-4956-a5d2-085e78370f01',
            createdAt: backdatedTime.toISOString(),
            items: [
                {
                    productId: 'd3b07384-d113-4956-a5d2-085e78370123',
                    quantity: 1,
                    unitPrice: 200
                }
            ]
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
