import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as syncSale } from '@/app/api/pos/offline-sale/route';
import { resetTestDB } from './setup';
import { NextRequest } from 'next/server';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const WAREHOUSE_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = 'cat-1';

describe('Sync Engine: Idempotency & Temporal Integrity', () => {
    
    beforeEach(async () => {
        await resetTestDB();
        
        // Setup minimal data (Branch, etc)
        await prisma.branch.create({
            data: { id: BRANCH_ID, name: 'Main Branch', code: 'BR-1' }
        });

        await prisma.warehouse.create({
            data: { id: WAREHOUSE_ID, name: 'Main Warehouse', branchId: BRANCH_ID }
        });

        // Seed GL Accounts required for double-entry bookkeeping validation
        await prisma.account.deleteMany();
        await prisma.account.createMany({
            data: [
                { code: '4000', name: 'Sales Revenue', type: 'REVENUE' },
                { code: '1000', name: 'Cash Treasury', type: 'ASSET' }
            ]
        });

        // Seed Product and Category
        await prisma.category.create({
            data: { id: CATEGORY_ID, name: 'Test Category' }
        });

        await prisma.product.create({
            data: {
                id: PRODUCT_ID,
                sku: 'test-sku',
                name: 'Test Product',
                costPrice: 50,
                sellPrice: 100,
                categoryId: CATEGORY_ID,
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
            branchId: BRANCH_ID,
            warehouseId: WAREHOUSE_ID,
            taxAmount: 0,
            discountAmount: 0,
            discountPercentage: 0,
            items: [
                {
                    productId: PRODUCT_ID,
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
            branchId: BRANCH_ID,
            warehouseId: WAREHOUSE_ID,
            createdAt: backdatedTime.toISOString(),
            taxAmount: 0,
            discountAmount: 0,
            discountPercentage: 0,
            items: [
                {
                    productId: PRODUCT_ID,
                    quantity: 2,
                    unitPrice: 100
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
