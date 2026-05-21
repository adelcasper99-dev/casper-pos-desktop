import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as syncSale } from '@/app/api/pos/offline-sale/route';
import { resetTestDB } from './setup';
import { NextRequest } from 'next/server';

describe('Sync Engine: Idempotency & Temporal Integrity', () => {
    const branchId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const warehouseId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
    const productId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
    const categoryId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
    
    beforeEach(async () => {
        await resetTestDB();
        
        // Setup minimal data (Branch, Warehouse, Category, Product)
        await prisma.branch.create({
            data: { id: branchId, name: 'Main Branch', code: 'BR-1' }
        });

        await prisma.warehouse.create({
            data: { id: warehouseId, name: 'Main Warehouse', branchId }
        });

        await prisma.category.create({
            data: { id: categoryId, name: 'General' }
        });

        await prisma.product.create({
            data: {
                id: productId,
                sku: 'PROD-1',
                name: 'Test Product',
                categoryId,
                costPrice: '10',
                sellPrice: '20',
                trackStock: false
            }
        });

        // Seed GL Accounts and Treasury for sync routing
        await prisma.account.create({
            data: { id: 'acc-sales', code: '4000', name: 'Sales Revenue', type: 'REVENUE' }
        });

        await prisma.account.create({
            data: { id: 'acc-cash', code: '1000', name: 'Cash on Hand', type: 'ASSET' }
        });

        await prisma.treasury.create({
            data: {
                id: 'treasury-1',
                name: 'Main Treasury',
                branchId,
                paymentMethod: 'CASH',
                glCode: '1000',
                balance: '0'
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
            branchId,
            warehouseId,
            items: [
                {
                    productId,
                    quantity: 1,
                    unitPrice: 100,
                    unitCost: 50
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
            branchId,
            warehouseId,
            createdAt: backdatedTime.toISOString(),
            items: [
                {
                    productId,
                    quantity: 1,
                    unitPrice: 200,
                    unitCost: 100
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
