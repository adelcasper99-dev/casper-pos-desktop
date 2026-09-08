import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTicketById } from '../actions/returns-fetchers';
import { partialRefundTicket, initiateWarrantyReturn } from '../actions/ticket-actions';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../actions/auth';
import { getCurrentShiftInternal } from '../actions/shift-management-actions';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingEngine } from '@/lib/accounting/transaction-factory';

// Mock Next.js headers & cookies for safe-action getSession
vi.mock('next/headers', () => ({
    cookies: vi.fn().mockImplementation(async () => ({
        get: vi.fn().mockReturnValue({ value: 'mock-token' }),
        set: vi.fn(),
    })),
    headers: vi.fn().mockImplementation(async () => new Headers()),
}));

// Mock auth
vi.mock('../lib/auth', () => ({
    getSession: vi.fn().mockResolvedValue({
        user: {
            id: 'user-001',
            name: 'Manager Ahmed',
            username: 'ahmed_mgr',
            role: 'MANAGER',
            branchId: 'branch-cairo',
            permissions: ['TICKET_REFUND', 'TICKET_CREATE', 'TICKET_VIEW', 'TICKET_EDIT'],
        },
    }),
}));

// Mock dependencies
vi.mock('../lib/prisma', () => ({
    prisma: {
        ticket: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        ticketPart: {
            update: vi.fn(),
            create: vi.fn(),
        },
        repairPayment: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        shift: {
            update: vi.fn(),
        },
        treasury: {
            findFirst: vi.fn().mockResolvedValue({ id: 'treasury-1' }),
        },
        transaction: {
            create: vi.fn(),
        },
        actionLog: {
            create: vi.fn(),
        },
        ticketNote: {
            create: vi.fn(),
        },
        customerTransaction: {
            create: vi.fn(),
        },
        customer: {
            update: vi.fn(),
        },
        stockMovement: {
            create: vi.fn(),
        },
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
        $queryRaw: vi.fn().mockResolvedValue([]),
        $transaction: vi.fn(async (cb) => cb(prisma)),
    },
}));

vi.mock('../actions/auth', () => ({
    getCurrentUser: vi.fn().mockResolvedValue({
        id: 'user-001',
        name: 'Manager Ahmed',
        username: 'ahmed_mgr',
        role: 'MANAGER',
        branchId: 'branch-cairo',
        permissions: ['TICKET_REFUND', 'TICKET_CREATE', 'TICKET_VIEW', 'TICKET_EDIT'],
    }),
}));

vi.mock('../actions/shift-management-actions', () => ({
    getCurrentShiftInternal: vi.fn().mockResolvedValue({
        shift: {
            id: 'shift-001',
            status: 'OPEN',
            userId: 'user-001',
        },
    }),
    updateShiftHeartbeat: vi.fn().mockResolvedValue({}),
}));

vi.mock('../lib/csrf', () => ({
    verifyCSRFToken: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/accounting/transaction-factory', () => ({
    AccountingEngine: {
        recordRefund: vi.fn().mockResolvedValue({ id: 'je-123' }),
        recordMaintenancePayment: vi.fn(),
    },
}));

vi.mock('@/lib/treasury-guard', () => ({
    deductTreasuryBalance: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

vi.mock('@/lib/stock-helpers', () => ({
    handleReturnedPartStock: vi.fn().mockResolvedValue({ success: true }),
    incrementWarehouseStock: vi.fn().mockResolvedValue({}),
    decrementWarehouseStock: vi.fn().mockResolvedValue({}),
}));

describe('Maintenance Ticket Returns & Guardrails Test Suite', () => {
    const mockUser = {
        id: 'user-001',
        name: 'Manager Ahmed',
        username: 'ahmed_mgr',
        role: 'MANAGER',
        branchId: 'branch-cairo',
        permissions: ['TICKET_REFUND', 'TICKET_CREATE', 'TICKET_VIEW', 'TICKET_EDIT'],
    };

    const mockShift = {
        id: 'shift-001',
        status: 'OPEN',
        userId: 'user-001',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (getCurrentUser as any).mockResolvedValue(mockUser);
        (getCurrentShiftInternal as any).mockResolvedValue({ shift: mockShift });
    });

    describe('1. Parts vs Labor Disaggregation (Root Cause T-004 Fix)', () => {
        it('calculates real labor fee as max(0, repairPrice - sum(parts)) and eliminates synthetic duplicates', async () => {
            // T-004 scenario: repairPrice = 18 EGP, partsPrice = 18 EGP, amountPaid = 18 EGP
            (prisma.ticket.findUnique as any).mockResolvedValue({
                id: 'ticket-T004',
                barcode: 'T-004',
                status: 'COMPLETED',
                repairPrice: new Decimal(18.00),
                amountPaid: new Decimal(18.00),
                customerId: 'cust-1',
                customer: { name: 'Ali' },
                createdAt: new Date('2026-09-08'),
                parts: [
                    {
                        id: 'part-1',
                        productId: 'prod-screen',
                        name: 'Screen Replacement',
                        price: new Decimal(18.00),
                        quantity: 1,
                        refundedQty: 0,
                        product: { sku: 'SCR-01' },
                    },
                ],
                payments: [],
            });

            const res = await getTicketById('ticket-T004');
            expect(res.success).toBe(true);
            expect(res.data).toBeDefined();

            // Total amount available for refund is strictly 18.00 EGP
            expect(res.data?.totalAmount).toBe(18.00);

            // Items should only contain 1 physical part, and NO synthetic 18.00 labor item
            expect(res.data?.items).toHaveLength(1);
            expect(res.data?.items[0].unitPrice).toBe(18.00);
            expect(res.data?.items[0].itemType).toBe('PRODUCT');
        });

        it('includes labor fee when customer was billed for labor above parts price', async () => {
            // repairPrice = 150 EGP, 1 part = 100 EGP -> True labor = 50 EGP
            (prisma.ticket.findUnique as any).mockResolvedValue({
                id: 'ticket-with-labor',
                barcode: 'T-100',
                status: 'COMPLETED',
                repairPrice: new Decimal(150.00),
                amountPaid: new Decimal(150.00),
                customerId: 'cust-1',
                customer: { name: 'Omar' },
                createdAt: new Date('2026-09-08'),
                parts: [
                    {
                        id: 'part-battery',
                        productId: 'prod-bat',
                        name: 'Battery',
                        price: new Decimal(100.00),
                        quantity: 1,
                        refundedQty: 0,
                        product: { sku: 'BAT-01' },
                    },
                ],
                payments: [],
            });

            const res = await getTicketById('ticket-with-labor');
            expect(res.success).toBe(true);
            expect(res.data?.totalAmount).toBe(150.00);
            expect(res.data?.items).toHaveLength(2);

            const partItem = res.data?.items.find((i) => i.itemType === 'PRODUCT');
            const serviceItem = res.data?.items.find((i) => i.itemType === 'SERVICE');

            expect(partItem?.unitPrice).toBe(100.00);
            expect(serviceItem?.unitPrice).toBe(50.00);
        });
    });

    describe('2. Hard-Cap Assertion & Over-Refund Prevention', () => {
        it('throws error and blocks refund when requested amount exceeds amountPaid', async () => {
            const mockTicket = {
                id: 'ticket-T004',
                barcode: 'T-004',
                status: 'COMPLETED',
                repairPrice: new Decimal(18.00),
                partsCost: new Decimal(10.00),
                amountPaid: new Decimal(10.00), // Customer only paid 10.00
                tenantId: 'tenant-1',
                currentBranchId: 'branch-cairo',
                parts: [
                    {
                        id: 'part-1',
                        productId: 'prod-1',
                        name: 'Screen',
                        price: new Decimal(18.00), // Part price is 18.00 > 10.00
                        cost: new Decimal(10.00),
                        quantity: 1,
                        refundedQty: 0,
                        warehouseId: 'wh-1',
                    },
                ],
                payments: [],
            };

            // First findFirst returns ticket, second returns null (no active rework)
            (prisma.ticket.findFirst as any)
                .mockResolvedValueOnce(mockTicket)
                .mockResolvedValueOnce(null);

            // Trying to refund 18.00 when only 10.00 was paid
            const result = await partialRefundTicket({
                ticketId: 'ticket-T004',
                items: [{ itemId: 'part-1', quantity: 1, isDamaged: false }],
                refundMethod: 'CASH',
                csrfToken: 'valid-token',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('يتجاوز إجمالي المبلغ المدفوع');
            expect(prisma.ticket.update).not.toHaveBeenCalled();
            expect(AccountingEngine.recordRefund).not.toHaveBeenCalled();
        });

        it('blocks refund when ticket has zero amountPaid (already refunded or unpaid)', async () => {
            const mockTicket = {
                id: 'ticket-unpaid',
                barcode: 'T-005',
                status: 'COMPLETED',
                repairPrice: new Decimal(100.00),
                partsCost: new Decimal(0.00),
                amountPaid: new Decimal(0.00), // Zero paid
                parts: [
                    {
                        id: 'part-test',
                        productId: 'prod-t',
                        name: 'Part',
                        price: new Decimal(100.00),
                        cost: new Decimal(50.00),
                        quantity: 1,
                        refundedQty: 0,
                    }
                ],
                payments: [],
            };

            (prisma.ticket.findFirst as any)
                .mockResolvedValueOnce(mockTicket)
                .mockResolvedValueOnce(null);

            const result = await partialRefundTicket({
                ticketId: 'ticket-unpaid',
                items: [{ itemId: 'part-test', quantity: 1, isDamaged: false }],
                refundMethod: 'CASH',
                csrfToken: 'valid-token',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('يتجاوز إجمالي المبلغ المدفوع المتبقي');
        });
    });

    describe('3. Successful Partial & Full Refund Lifecycle', () => {
        it('executes valid partial refund with exact Decimal calculations and ledger updates', async () => {
            const mockTicket = {
                id: 'ticket-valid',
                barcode: 'T-006',
                status: 'COMPLETED',
                repairPrice: new Decimal(100.00),
                partsCost: new Decimal(40.00),
                amountPaid: new Decimal(100.00),
                commissionRate: new Decimal(10),
                tenantId: 'default',
                currentBranchId: 'branch-cairo',
                parts: [
                    {
                        id: 'part-10',
                        productId: 'prod-10',
                        name: 'Speaker',
                        price: new Decimal(40.00),
                        cost: new Decimal(20.00),
                        quantity: 1,
                        refundedQty: 0,
                        warehouseId: 'wh-main',
                    },
                ],
                payments: [],
            };

            (prisma.ticket.findFirst as any)
                .mockResolvedValueOnce(mockTicket)
                .mockResolvedValueOnce(null);

            (prisma.repairPayment.create as any).mockResolvedValue({ id: 'pay-ref-1' });

            const result = await partialRefundTicket({
                ticketId: 'ticket-valid',
                items: [{ itemId: 'part-10', quantity: 1, isDamaged: false }],
                refundMethod: 'CASH',
                csrfToken: 'valid-token',
            });

            expect(result.success).toBe(true);

            // Assert ticket update
            expect(prisma.ticket.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'ticket-valid' },
                    data: expect.objectContaining({
                        amountPaid: expect.any(Decimal),
                        paymentStatus: 'partial',
                    }),
                })
            );

            // Assert shift update & accounting call
            expect(prisma.shift.update).toHaveBeenCalled();
            expect(AccountingEngine.recordRefund).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: 40.00,
                    method: 'CASH',
                    ticketId: 'ticket-valid',
                }),
                expect.anything()
            );

            // Assert ActionLog audit record
            expect(prisma.actionLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        action: 'TICKET_PARTIAL_REFUND',
                    }),
                })
            );
        });

        it('transitions ticket status to CANCELLED and paymentStatus to unpaid when fully refunded', async () => {
            const mockTicket = {
                id: 'ticket-full',
                barcode: 'T-007',
                status: 'COMPLETED',
                repairPrice: new Decimal(50.00),
                partsCost: new Decimal(0.00),
                amountPaid: new Decimal(50.00),
                commissionRate: new Decimal(0),
                tenantId: 'default',
                currentBranchId: 'branch-cairo',
                parts: [],
                payments: [],
            };

            (prisma.ticket.findFirst as any)
                .mockResolvedValueOnce(mockTicket)
                .mockResolvedValueOnce(null);

            (prisma.repairPayment.create as any).mockResolvedValue({ id: 'pay-ref-2' });

            const result = await partialRefundTicket({
                ticketId: 'ticket-full',
                items: [{ itemId: 'SVC-ticket-full', quantity: 1, isDamaged: false }],
                refundMethod: 'CASH',
                csrfToken: 'valid-token',
            });

            expect(result.success).toBe(true);
            expect(prisma.ticket.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'ticket-full' },
                    data: expect.objectContaining({
                        status: 'CANCELLED',
                        paymentStatus: 'unpaid',
                    }),
                })
            );
        });
    });

    describe('4. Idempotency Key Duplicate Submission Protection', () => {
        it('returns cached refund response without repeating double balance deductions', async () => {
            const idempotencyKey = 'REF-T004-9988-ABC';

            const mockTicket = {
                id: 'ticket-T004',
                barcode: 'T-004',
                status: 'COMPLETED',
                repairPrice: new Decimal(18.00),
                partsCost: new Decimal(10.00),
                amountPaid: new Decimal(18.00),
                parts: [
                    {
                        id: 'part-1',
                        productId: 'prod-1',
                        name: 'Screen',
                        price: new Decimal(18.00),
                        cost: new Decimal(10.00),
                        quantity: 1,
                        refundedQty: 0,
                    },
                ],
                payments: [],
            };

            (prisma.ticket.findFirst as any).mockResolvedValueOnce(mockTicket);

            // Simulate existing payment found with same idempotencyKey
            (prisma.repairPayment.findFirst as any).mockResolvedValue({
                id: 'existing-payment-1',
                amount: new Decimal(18.00),
                reference: idempotencyKey,
            });

            const result = await partialRefundTicket({
                ticketId: 'ticket-T004',
                items: [{ itemId: 'part-1', quantity: 1, isDamaged: false }],
                refundMethod: 'CASH',
                idempotencyKey,
                csrfToken: 'valid-token',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('تم تنفيذ الاسترداد مسبقاً');
            expect(prisma.ticket.update).not.toHaveBeenCalled();
            expect(AccountingEngine.recordRefund).not.toHaveBeenCalled();
        });
    });

    describe('5. Mutual Exclusion: Financial Refunds vs Warranty Rework', () => {
        it('blocks financial refund if an active rework ticket exists', async () => {
            const mockTicket = {
                id: 'ticket-parent',
                barcode: 'T-008',
                status: 'COMPLETED',
                repairPrice: new Decimal(200.00),
                partsCost: new Decimal(50.00),
                amountPaid: new Decimal(200.00),
                parts: [],
                payments: [],
            };

            const mockActiveRework = {
                id: 'ticket-rework-child',
                barcode: 'T-008-R1',
                status: 'IN_PROGRESS', // Active warranty rework!
            };

            (prisma.ticket.findFirst as any)
                .mockResolvedValueOnce(mockTicket)
                .mockResolvedValueOnce(mockActiveRework);

            const result = await partialRefundTicket({
                ticketId: 'ticket-parent',
                items: [{ itemId: 'SVC-ticket-parent', quantity: 1, isDamaged: false }],
                refundMethod: 'CASH',
                csrfToken: 'valid-token',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('توجد تذكرة ضمان نشطة');
        });

        it('blocks warranty rework creation on cancelled or fully refunded tickets', async () => {
            const futureDate = new Date(Date.now() + 86400000); // 1 day in future
            const mockCancelledTicket = {
                id: 'ticket-cancelled',
                barcode: 'T-009',
                status: 'DELIVERED',
                amountPaid: new Decimal(0.00),
                returnCount: 1,
                warrantyExpiryDate: futureDate,
                returnTickets: [],
            };

            // First findUnique for parentTicketId, second for barcode uniqueness check (returns null)
            (prisma.ticket.findUnique as any)
                .mockResolvedValueOnce(mockCancelledTicket)
                .mockResolvedValueOnce(null);

            const result = await initiateWarrantyReturn('ticket-cancelled');

            expect(result.success).toBe(false);
            expect(result.error).toContain('لا يمكن إنشاء تذكرة ضمان لتذكرة تم استرداد كامل قيمتها');
        });
    });
});
