import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { performSetup } from '@/actions/setup';
import { openShift, closeShift } from '@/actions/shift-management-actions';
import { processSale } from '@/actions/pos';
import { resetTestDB } from './sync/setup';
import { Decimal } from 'decimal.js';

// Mock Next.js headers to bypass auth in pure Node environment
vi.mock('next/headers', () => ({
    cookies: () => ({
        get: (name: string) => {
            if (name === 'session') return { value: 'super-admin-token-integration-test' };
            return undefined;
        },
        set: () => {},
        delete: () => {}
    })
}));

// Mock revalidate paths since they don't exist outside Next.js
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

// Mock CSRF verification since we are running in a pure Node environment without Next.js middleware
vi.mock('@/lib/csrf', () => ({
    verifyCSRFToken: vi.fn().mockResolvedValue(true)
}));

// Mock auth so we don't need to worry about `ensureMainBranch` throwing issues
vi.mock('@/lib/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/auth')>();
    const mockUser = {
        id: 'super-admin',
        username: 'admin',
        name: 'Super Admin',
        role: 'ADMIN',
        permissions: ['*']
    };
    return {
        ...actual,
        getSession: vi.fn().mockResolvedValue({ user: mockUser })
    };
});

describe('User Workflow Integration (E2E)', () => {
    let branchId: string;
    let treasuryId: string;
    let shiftId: string;
    let productId: string;

    beforeAll(async () => {
        await resetTestDB();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('1. Trial Start / Setup', async () => {
        const res = await performSetup({
            admin: {
                username: 'admin',
                password: 'Password123!',
                name: 'Super Admin',
            },
            branch: {
                name: 'Main Test Branch',
                type: 'Retail',
            },
            settings: {
                currency: 'EGP',
                taxRate: 14,
            },
            options: {
                keepProducts: false,
                keepCustomers: false,
                keepEmployees: false,
                keepSettings: false,
                keepTreasuryAndWarehouses: false,
            }
        });
        
        expect(res.success).toBe(true);
    });

    it('2. Data Verification', async () => {
        // Verify default branch was created
        const branch = await prisma.branch.findFirst({ where: { code: 'MAIN' }});
        expect(branch).not.toBeNull();
        expect(branch?.name).toBe('Main Test Branch');
        branchId = branch!.id;

        // Verify default treasury was created
        const treasury = await prisma.treasury.findFirst({ where: { isDefault: true, paymentMethod: 'CASH' }});
        expect(treasury).not.toBeNull();
        treasuryId = treasury!.id;

        // Verify warehouse exists
        const warehouse = await prisma.warehouse.findFirst({ where: { isDefault: true }});
        expect(warehouse).not.toBeNull();

        // Update the mock to use the real Admin User ID (for foreign keys like ActionLog)
        const admin = await prisma.user.findFirst({ where: { username: 'admin' } });
        expect(admin).not.toBeNull();
        
        const { getSession } = await import('@/lib/auth');
        const userObj = {
            id: admin!.id,
            username: admin!.username,
            name: admin!.name,
            role: 'ADMIN',
            branchId: branchId,
            permissions: ['*']
        };
        (getSession as any).mockResolvedValue({ user: userObj });
    });

    it('3. Shift Initiation', async () => {
        // Try to open a shift using the mocked super-admin
        const res = await openShift({ startCash: 100 });
        
        // Response stringifies JSON in safe-action, parse it if it is a string
        const parsed = typeof res === 'string' ? JSON.parse(res) : res;
        
        expect(parsed.success).toBe(true);
        expect(parsed.shift).toBeDefined();
        shiftId = parsed.shift.id;
    });

    it('4. Product Creation', async () => {
        // Create a category first
        const category = await prisma.category.create({
            data: {
                name: 'Test Category',
            }
        });

        const product = await prisma.product.create({
            data: {
                name: 'Test Workflow Item',
                sellPrice: new Decimal(100),
                costPrice: new Decimal(60),
                trackStock: true,
                stock: new Decimal(50),
                categoryId: category.id,
                sku: 'TEST-SKU-123'
            }
        });
        
        productId = product.id;
        
        // Create the warehouse stock record
        const warehouse = await prisma.warehouse.findFirst({ where: { isDefault: true }});
        if (warehouse) {
            await prisma.stock.create({
                data: {
                    productId: productId,
                    warehouseId: warehouse.id,
                    quantity: new Decimal(50)
                }
            });
        }
        
        expect(product.id).toBeDefined();
    });

    it('5. POS Checkout', async () => {
        // Add 1 item of Test Workflow Item
        const res = await processSale({
            items: [
                { id: productId, quantity: 1, price: 100 }
            ],
            paymentMethod: 'CASH',
            totalAmount: 114,
            discountAmount: 0,
            discountPercentage: 0,
            force: false
        });
        
        expect(res.message).toBe("Sale processed successfully");
        expect(res.saleId).toBeDefined();

        // Verify Sale state
        const sale = await prisma.sale.findUnique({
            where: { id: res.saleId },
            include: { payments: true }
        });
        expect(sale).not.toBeNull();
        expect(sale?.status).toBe('COMPLETED');
        expect(sale?.totalAmount.toNumber()).toBe(114); // 100 + 14% tax

        // Verify Stock deducted
        const updatedProduct = await prisma.product.findUnique({ where: { id: productId }});
        expect(updatedProduct?.stock.toNumber()).toBe(49);

        // Verify Accounting
        const journalEntries = await prisma.journalEntry.findMany({
            where: { saleId: res.saleId },
            include: { lines: true }
        });
        expect(journalEntries.length).toBeGreaterThan(0);
        
        // Total Debits should equal Total Credits across all lines
        const allLines = journalEntries.flatMap(j => j.lines);
        const totalDebit = allLines.reduce((sum, l) => sum + l.debit.toNumber(), 0);
        const totalCredit = allLines.reduce((sum, l) => sum + l.credit.toNumber(), 0);
        expect(totalDebit).toBe(totalCredit);
        expect(totalDebit).toBeGreaterThan(0);
    });

    it('6. Reconciliation', async () => {
        // Expected Cash = 100 (start) + 114 (cash sale) = 214
        const res = await closeShift({
            shiftId: shiftId,
            actualCash: 214,
            acceptDiscrepancy: false
        });

        const parsed = typeof res === 'string' ? JSON.parse(res) : res;
        expect(parsed.success).toBe(true);
        expect(parsed.variance).toBe(0); // Perfect match

        // Shift should be CLOSED
        const closedShift = await prisma.shift.findUnique({ where: { id: shiftId }});
        expect(closedShift?.status).toBe('CLOSED');
    });
});
