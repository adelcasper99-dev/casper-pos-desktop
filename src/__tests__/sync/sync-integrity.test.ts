import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as syncSale } from '@/app/api/pos/offline-sale/route';
import { resetTestDB } from './setup';
import { NextRequest } from 'next/server';
import { seedAccounts } from '@/lib/accounting/seed-accounts';

describe('Sync Engine: Idempotency & Temporal Integrity', () => {
    const branchId = 'c6d2d480-16cf-448c-8f1a-b68a8677e5bb';
    const warehouseId = 'b7d59b2d-d558-450f-90e6-5838cf38c4ab';
    const productId = 'd90a6e35-d242-45e0-a92c-809ff44b67b1';
    const categoryId = 'e297801a-82ee-44bb-9964-b68a8677e5bc';
    
    beforeEach(async () => {
        await resetTestDB();
        
        // Setup minimal data (Branch, Warehouse, Category, Product)
        await prisma.branch.create({
            data: { id: branchId, name: 'Main Branch', code: 'BR-1' }
        });

        await prisma.warehouse.create({
            data: { id: warehouseId, name: 'Main Warehouse', branchId }
        });

        await prisma.category.upsert({
            where: { id: categoryId },
            update: {},
            create: {
                id: categoryId,
                name: 'Test Category'
            }
        });

        await prisma.product.upsert({
            where: { id: productId },
            update: {},
            create: {
                id: productId,
                name: 'Test Product',
                sku: 'TEST-SKU',
                costPrice: 50,
                sellPrice: 100,
                trackStock: false,
                categoryId: categoryId
            }
        });

        // Seed default GL accounts needed for sales transactions
        await seedAccounts();
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
                    quantity: 2,
                    unitPrice: 100,
                    unitCost: 50
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
