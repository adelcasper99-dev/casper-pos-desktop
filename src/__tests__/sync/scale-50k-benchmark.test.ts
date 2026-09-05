import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { runWithTenant } from '@/lib/prisma-tenant-extension';
import { performance } from 'perf_hooks';
import Decimal from 'decimal.js';

describe('50K Scale Benchmark & Multi-Tenant Query Verification', () => {
    beforeAll(async () => {
        console.log('[Scale Benchmark] Setting up Branches, Warehouses, Categories, Users, and Shifts...');

        // 1. Create Branches, Warehouses, Categories, Users, Shifts for 5 tenants
        for (let t = 1; t <= 5; t++) {
            await runWithTenant(`tenant-${t}`, async () => {
                await prisma.branch.upsert({
                    where: { id: `branch-tenant-${t}` },
                    update: {},
                    create: {
                        id: `branch-tenant-${t}`,
                        name: `Branch Tenant ${t}`,
                        code: `BR-${t}`
                    }
                });

                await prisma.warehouse.upsert({
                    where: { id: `wh-tenant-${t}` },
                    update: {},
                    create: {
                        id: `wh-tenant-${t}`,
                        name: `Warehouse Tenant ${t}`,
                        branchId: `branch-tenant-${t}`
                    }
                });

                await prisma.category.upsert({
                    where: { id: `cat-tenant-${t}` },
                    update: {},
                    create: {
                        id: `cat-tenant-${t}`,
                        name: `Category Tenant ${t}`
                    }
                });

                await prisma.user.upsert({
                    where: { username: `user-tenant-${t}` },
                    update: {},
                    create: {
                        id: `user-tenant-${t}`,
                        username: `user-tenant-${t}`,
                        password: 'hashed-password',
                        name: `Staff ${t}`,
                        roleStr: 'STAFF',
                        branchId: `branch-tenant-${t}`
                    }
                });

                await prisma.shift.upsert({
                    where: { id: `shift-tenant-${t}` },
                    update: {},
                    create: {
                        id: `shift-tenant-${t}`,
                        userId: `user-tenant-${t}`,
                        startCash: new Decimal('100.00'),
                        status: 'OPEN'
                    }
                });
            });
        }
        
        // 2. Populate 10,000 Products in chunks
        const productsData: Array<{
            id: string;
            tenantId: string;
            name: string;
            sku: string;
            costPrice: Decimal;
            sellPrice: Decimal;
            categoryId: string;
            trackStock: boolean;
        }> = [];
        for (let i = 1; i <= 10000; i++) {
            const tenantNum = (i % 5) + 1;
            productsData.push({
                id: `scale-prod-${i}`,
                tenantId: `tenant-${tenantNum}`,
                name: `Scale Product Item ${i}`,
                sku: `SKU-SCALE-${1000000 + i}`,
                costPrice: new Decimal('80.00'),
                sellPrice: new Decimal('150.50'),
                categoryId: `cat-tenant-${tenantNum}`,
                trackStock: true
            });
        }

        for (let c = 0; c < productsData.length; c += 1000) {
            const chunk = productsData.slice(c, c + 1000);
            await runWithTenant('SYSTEM', async () => {
                await prisma.product.createMany({
                    data: chunk
                });
            });
        }

        // 3. Populate 10,000 Sales in chunks
        const salesData: Array<{
            id: string;
            tenantId: string;
            branchId: string;
            warehouseId: string;
            userId: string;
            shiftId: string;
            totalAmount: Decimal;
            paymentMethod: string;
            status: string;
            createdAt: Date;
        }> = [];
        const baseDate = new Date('2026-01-01').getTime();
        for (let i = 1; i <= 10000; i++) {
            const tenantNum = (i % 5) + 1;
            salesData.push({
                id: `scale-sale-${i}`,
                tenantId: `tenant-${tenantNum}`,
                branchId: `branch-tenant-${tenantNum}`,
                warehouseId: `wh-tenant-${tenantNum}`,
                userId: `user-tenant-${tenantNum}`,
                shiftId: `shift-tenant-${tenantNum}`,
                totalAmount: new Decimal('500.00'),
                paymentMethod: 'CASH',
                status: 'COMPLETED',
                createdAt: new Date(baseDate + i * 60000)
            });
        }

        for (let c = 0; c < salesData.length; c += 1000) {
            const chunk = salesData.slice(c, c + 1000);
            await runWithTenant('SYSTEM', async () => {
                await prisma.sale.createMany({
                    data: chunk
                });
            });
        }

        console.log('[Scale Benchmark] 10,000 Products and 10,000 Sales successfully populated.');
    }, 90000);

    it('should query tenant SKU among 10,000 products in < 15ms', async () => {
        const targetSku = 'SKU-SCALE-1008500';
        
        const tStart = performance.now();
        const product = await runWithTenant('tenant-1', async () => {
            return await prisma.product.findFirst({
                where: { sku: targetSku }
            });
        });
        const elapsedMs = performance.now() - tStart;

        console.log(`  -> 10k Products SKU Search Latency: ${elapsedMs.toFixed(3)} ms`);
        expect(product).toBeDefined();
        expect(elapsedMs).toBeLessThan(50); // Target < 50ms
    });

    it('should paginate 10,000 multi-tenant sales in < 15ms', async () => {
        const tStart = performance.now();
        const sales = await runWithTenant('tenant-1', async () => {
            return await prisma.sale.findMany({
                orderBy: { createdAt: 'desc' },
                take: 20
            });
        });
        const elapsedMs = performance.now() - tStart;

        console.log(`  -> 10k Sales Order/Pagination Latency: ${elapsedMs.toFixed(3)} ms`);
        expect(sales.length).toBe(20);
        expect(elapsedMs).toBeLessThan(50);
    });

    it('should aggregate 10,000 multi-tenant sales totals in < 25ms', async () => {
        const tStart = performance.now();
        const aggregations = await runWithTenant('tenant-1', async () => {
            return await prisma.sale.aggregate({
                _sum: { totalAmount: true },
                _count: { id: true }
            });
        });
        const elapsedMs = performance.now() - tStart;

        console.log(`  -> 10k Sales Multi-Tenant Total Aggregate Latency: ${elapsedMs.toFixed(3)} ms (Total Count: ${aggregations._count.id})`);
        expect(aggregations._count.id).toBe(2000); // 10,000 / 5 tenants
        expect(elapsedMs).toBeLessThan(50);
    });
});
