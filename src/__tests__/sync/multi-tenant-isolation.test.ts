import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as syncSale } from '@/app/api/pos/offline-sale/route';
import { resetTestDB, syncHeaders } from './setup';
import { NextRequest } from 'next/server';
import { seedAccounts } from '@/lib/accounting/seed-accounts';
import { runWithTenant } from '@/lib/prisma-tenant-extension';
import { secureTransaction } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';

describe('Multi-Tenant Isolation & RLS Security', () => {
    const branchId = 'c6d2d480-16cf-448c-8f1a-b68a8677e5bb';
    const warehouseId = 'b7d59b2d-d558-450f-90e6-5838cf38c4ab';
    const productId = 'd90a6e35-d242-45e0-a92c-809ff44b67b1';
    const categoryId = 'e297801a-82ee-44bb-9964-b68a8677e5bc';

    let privateKey: string;
    let tenantA_Jwt: string;
    let tenantB_Jwt: string;

    beforeAll(() => {
        // Generate private key for signing tenant test JWTs
        const { publicKey, privateKey: privKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
        });
        privateKey = privKey;
        process.env.LICENSE_PUBLIC_KEY = publicKey;

        tenantA_Jwt = jwt.sign({
            tenant_id: 'tenant-A',
            status: 'active',
            trial_ends_at: new Date('2029-12-31').toISOString(),
            server_now: new Date().toISOString(),
            machine_id: 'machine-A'
        }, privateKey, { algorithm: 'RS256' });

        tenantB_Jwt = jwt.sign({
            tenant_id: 'tenant-B',
            status: 'active',
            trial_ends_at: new Date('2029-12-31').toISOString(),
            server_now: new Date().toISOString(),
            machine_id: 'machine-B'
        }, privateKey, { algorithm: 'RS256' });
    });
    
    beforeEach(async () => {
        await resetTestDB();
        
        // Clean up tables not covered by resetTestDB
        await prisma.product.deleteMany({});
        await prisma.category.deleteMany({});
        await prisma.user.deleteMany({});
        
        // Setup minimal base data for Tenant A
        await runWithTenant('tenant-A', async () => {
            await prisma.branch.create({
                data: { id: branchId, name: 'Tenant A Branch', code: 'TA-BR-1' }
            });

            await prisma.warehouse.create({
                data: { id: warehouseId, name: 'Tenant A Warehouse', branchId }
            });

            await prisma.category.create({
                data: { id: categoryId, name: 'Tenant A Category' }
            });

            await prisma.product.create({
                data: {
                    id: productId,
                    name: 'Tenant A Product',
                    sku: 'TA-SKU',
                    costPrice: 50,
                    sellPrice: 100,
                    trackStock: false,
                    categoryId: categoryId
                }
            });
        });

        // Seed default GL accounts inside Tenant A context
        await runWithTenant('tenant-A', async () => {
            await seedAccounts();
        });
    });

    /**
     * TEST: Automatic tenantId injection
     */
    it('should inject tenantId automatically on model writes and reads', async () => {
        await runWithTenant('tenant-A', async () => {
            const users = await prisma.user.create({
                data: {
                    username: 'tenantA_user',
                    password: 'password',
                    name: 'Tenant A User',
                    roleStr: 'STAFF'
                }
            });

            expect(users.tenantId).toBe('tenant-A');

            const fetchedUser = await prisma.user.findFirst({
                where: { username: 'tenantA_user' }
            });
            expect(fetchedUser).not.toBeNull();
            expect(fetchedUser?.tenantId).toBe('tenant-A');
        });
    });

    /**
     * TEST: Cross-Tenant Data Isolation
     */
    it('should isolate queries so Tenant B cannot see Tenant A data', async () => {
        // Create a user in Tenant A
        await runWithTenant('tenant-A', async () => {
            await prisma.user.create({
                data: {
                    username: 'tenantA_staff',
                    password: 'password',
                    name: 'Tenant A Staff',
                    roleStr: 'STAFF'
                }
            });
        });

        // Query as Tenant B
        await runWithTenant('tenant-B', async () => {
            const userForTenantB = await prisma.user.findFirst({
                where: { username: 'tenantA_staff' }
            });
            // Should be filtered out
            expect(userForTenantB).toBeNull();
        });

        // Query as Tenant A
        await runWithTenant('tenant-A', async () => {
            const userForTenantA = await prisma.user.findFirst({
                where: { username: 'tenantA_staff' }
            });
            expect(userForTenantA).not.toBeNull();
        });
    });

    /**
     * TEST: Sync Endpoint Validation with JWT Tenant Mismatch
     */
    it('should reject sync payloads where payload tenantId does not match JWT tenantId', async () => {
        const payload = {
            idempotencyKey: 'sync-key-1',
            tenantId: 'tenant-B', // Tampered payload tenantId
            customerName: 'Tenant B User',
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

        const req = new NextRequest('http://localhost/api/pos/offline-sale', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-license-jwt': tenantA_Jwt // Authenticated as Tenant A
            },
            body: JSON.stringify(payload)
        });

        const res = await syncSale(req);
        expect(res.status).toBe(403);
        
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.error).toContain('Tenant mismatch');
    });

    /**
     * TEST: Super Admin bypass via 'SYSTEM'
     */
    it('should bypass tenant filters when tenantId is set to SYSTEM', async () => {
        // Create user in Tenant A
        await runWithTenant('tenant-A', async () => {
            await prisma.user.create({
                data: {
                    username: 'staff-a',
                    password: 'password',
                    roleStr: 'STAFF'
                }
            });
        });

        // Create user in Tenant B
        await runWithTenant('tenant-B', async () => {
            await prisma.user.create({
                data: {
                    username: 'staff-b',
                    password: 'password',
                    roleStr: 'STAFF'
                }
            });
        });

        // Query as SYSTEM (Super Admin)
        await runWithTenant('SYSTEM', async () => {
            const allUsers = await prisma.user.findMany({
                where: {
                    username: { in: ['staff-a', 'staff-b'] }
                }
            });
            expect(allUsers.length).toBe(2);
        });
    });
});
