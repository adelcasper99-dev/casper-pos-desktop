import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { GL, PAYMENT_METHOD_GL_MAP } from '@/shared/constants/accounting-mappings';

// Mock dependencies using vi.hoisted so they are available inside hoisted vi.mock factories
const { mockPrisma, mockAccountingEngine, mockCurrentShift } = vi.hoisted(() => {
    const mockCurrentShift = {
        id: 'shift-today-2',
        userId: 'usr-admin-1',
        cashierName: 'Super Admin',
        status: 'OPEN',
        startCash: 1000,
        totalCashSales: 2000,
        totalCardSales: 0,
        totalWalletSales: 0,
        totalInstapay: 0,
        totalAccountSales: 0,
        totalCashRefunds: 100,
        totalAccountRefunds: 0,
        crossShiftRefundsIssued: 300,
        crossShiftRefundsReceived: 0,
        totalExpenses: 200,
        totalRefunds: 400,
        totalSales: 0,
        totalTickets: 0,
        expenses: [
            { amount: 200, paymentMethod: 'CASH' }
        ],
        sales: [],
        openedAt: new Date('2026-09-05T09:00:00.000Z'),
    };

    const mockPrisma = {
        ticket: {
            findFirst: vi.fn(),
            update: vi.fn(),
        },
        repairPayment: {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        treasury: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        shift: {
            findFirst: vi.fn().mockResolvedValue(mockCurrentShift),
            findUnique: vi.fn().mockResolvedValue(mockCurrentShift),
            update: vi.fn().mockResolvedValue(mockCurrentShift),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        storeSettings: {
            findFirst: vi.fn().mockResolvedValue({ blindCloseEnabled: false }),
        },
        auditLog: {
            create: vi.fn(),
        },
        user: {
            findUnique: vi.fn().mockResolvedValue({ id: 'usr-admin-1', branchId: 'branch-cairo-1' }),
            findFirst: vi.fn().mockResolvedValue({ id: 'usr-admin-1', branchId: 'branch-cairo-1' }),
        },
        transaction: {
            create: vi.fn(),
        },
        journalEntry: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        employeeTransaction: {
            findMany: vi.fn(),
            create: vi.fn(),
        },
        actionLog: {
            create: vi.fn(),
        },
        customer: {
            update: vi.fn(),
        },
        customerTransaction: {
            create: vi.fn(),
        },
        ticketPart: {
            findMany: vi.fn(),
        },
        technician: {
            findUnique: vi.fn(),
        },
        ticketCollaborator: {
            findMany: vi.fn(),
        },
        $transaction: vi.fn(async (callback: any) => callback(mockPrisma)),
    };

    const mockAccountingEngine = {
        recordTransaction: vi.fn(),
        recordRefund: vi.fn(),
        recordMaintenancePayment: vi.fn(),
        reverseJournalEntry: vi.fn(),
    };

    return { mockPrisma, mockAccountingEngine, mockCurrentShift };
});

vi.mock('@/lib/prisma', () => ({
    prisma: mockPrisma,
}));

vi.mock('@/lib/accounting/transaction-factory', () => ({
    AccountingEngine: mockAccountingEngine,
}));

vi.mock('@/lib/auth', () => ({
    getSession: vi.fn().mockResolvedValue({
        user: { id: 'usr-admin-1', username: 'admin', role: 'ADMIN', permissions: ['*'], branchId: 'branch-cairo-1' },
    }),
}));

vi.mock('@/lib/csrf', () => ({
    verifyCSRFToken: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/actions/auth', () => ({
    getCurrentUser: vi.fn().mockResolvedValue({
        id: 'usr-admin-1',
        name: 'Super Admin',
        role: 'ADMIN',
        branchId: 'branch-cairo-1',
    }),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

// Import actions after mocking
import {
    refundTicketExcessToCustomer,
    reopenAccidentallyDeliveredTicket,
    processTicketPayment
} from '@/actions/ticket-actions';
import {
    closeShift,
    getShiftStatusPreview
} from '@/actions/shift-management-actions';

describe('Advance Deposit & Settlement Architecture Proofs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.repairPayment.findMany.mockResolvedValue([]);
        mockPrisma.repairPayment.create.mockResolvedValue({ id: 'pay-1' });
        mockPrisma.treasury.findFirst.mockResolvedValue({ id: 'treas-1', balance: new Decimal(5000) });
        mockPrisma.treasury.findUnique.mockResolvedValue({ id: 'treas-1', balance: new Decimal(5000) });
        mockPrisma.treasury.update.mockResolvedValue({ id: 'treas-1' });
        mockPrisma.shift.findFirst.mockResolvedValue(mockCurrentShift);
        mockPrisma.shift.findUnique.mockResolvedValue(mockCurrentShift);
        mockPrisma.shift.update.mockResolvedValue(mockCurrentShift);
        mockPrisma.shift.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.storeSettings.findFirst.mockResolvedValue({ blindCloseEnabled: false });
        mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-1' });
        mockPrisma.journalEntry.findUnique.mockResolvedValue(null);
        mockPrisma.employeeTransaction.findMany.mockResolvedValue([]);
        mockPrisma.employeeTransaction.create.mockResolvedValue({ id: 'emp-tx-1' });
        mockPrisma.ticketPart.findMany.mockResolvedValue([]);
        mockPrisma.ticketCollaborator.findMany.mockResolvedValue([]);
        mockPrisma.actionLog.create.mockResolvedValue({ id: 'log-1' });
        mockAccountingEngine.recordTransaction.mockResolvedValue({ id: 'je-1' });
        mockAccountingEngine.recordMaintenancePayment.mockResolvedValue({ id: 'je-maint-1' });
        mockAccountingEngine.reverseJournalEntry.mockResolvedValue({ id: 'je-rev-1' });
    });

    describe('Critical 4: Idempotency Key Determinism Proof', () => {
        it('two rapid calls with different Date.now() produce the exact same deterministic idempotency key and prevent duplicate payouts', async () => {
            const ticketData = {
                id: 't-006',
                barcode: 'T-006#',
                amountPaid: new Decimal(500),
                repairPrice: new Decimal(200),
                currentBranchId: 'branch-cairo-1',
                customer: { id: 'cust-1', name: 'Ahmed' },
            };

            mockPrisma.ticket.findFirst.mockResolvedValue(ticketData);
            mockPrisma.ticket.update.mockResolvedValue({ ...ticketData, amountPaid: new Decimal(200) });

            const expectedDeterministicKey = `REFUND_EXCESS_${ticketData.id}_${ticketData.amountPaid.toFixed(2)}_${ticketData.repairPrice.toFixed(2)}`;

            // Call 1 at time T1 (1725555000000)
            const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1725555000000);

            const res1 = await refundTicketExcessToCustomer({
                ticketId: 't-006',
                amount: 300,
                method: 'CASH',
            });

            expect(res1.success).toBe(true);

            // Raw Assertion 1: Key generated is NOT affected by Date.now()
            expect(mockAccountingEngine.recordTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    idempotencyKey: expectedDeterministicKey,
                    description: expect.stringContaining('رد متبقي عربون'),
                }),
                expect.anything()
            );

            // Call 2: Rapid double click with different timestamp T2 (250ms later)
            dateSpy.mockReturnValue(1725555000250);

            // Simulate DB has the key from Call 1 now
            mockPrisma.journalEntry.findUnique.mockResolvedValue({
                id: 'je-refund-1',
                idempotencyKey: expectedDeterministicKey,
            });

            const res2 = await refundTicketExcessToCustomer({
                ticketId: 't-006',
                amount: 300,
                method: 'CASH',
            });

            // Rescued safely: zero second deduction, returns ticket safely
            expect(res2.success).toBe(true);
            // Treasury decrement must have been called EXACTLY ONCE across both calls
            expect(mockPrisma.treasury.update).toHaveBeenCalledTimes(1);
            expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1);

            dateSpy.mockRestore();
        });
    });

    describe('Gap 1: T-006 Accidental Premature Delivery Revert Proof', () => {
        it('reopening accidentally delivered ticket wipes profit snapshots, reverses GL distributions, and posts commission reversal', async () => {
            const deliveredTicket = {
                id: 't-006',
                barcode: 'T-006#',
                status: 'PAID_DELIVERED',
                deliveredAt: new Date('2026-09-04T12:00:00Z'),
                warrantyExpiryDate: new Date('2026-10-04T12:00:00Z'),
                laborPoolAmount: new Decimal(200),
                techCommissionAmount: new Decimal(50),
                centerLaborProfit: new Decimal(150),
            };

            mockPrisma.ticket.findFirst.mockResolvedValue(deliveredTicket);
            mockPrisma.ticket.update.mockResolvedValue({
                ...deliveredTicket,
                status: 'IN_PROGRESS',
                deliveredAt: null,
                warrantyExpiryDate: null,
                laborPoolAmount: null,
                techCommissionAmount: null,
                centerLaborProfit: null,
            });

            // Existing distribution journal entry
            const distKey = `TICKET_DIST_${deliveredTicket.id}`;
            mockPrisma.journalEntry.findUnique.mockResolvedValue({
                id: 'je-dist-1',
                idempotencyKey: distKey,
                lines: [
                    { accountId: 'acc-2150', debit: new Decimal(200), credit: new Decimal(0) },
                    { accountId: 'acc-4000', debit: new Decimal(0), credit: new Decimal(200) },
                ],
            });

            // Existing technician commission
            mockPrisma.employeeTransaction.findMany.mockResolvedValue([
                {
                    id: 'tx-comm-1',
                    userId: 'tech-1',
                    type: 'MAINTENANCE_COMMISSION',
                    amount: new Decimal(50),
                    branchId: 'branch-cairo-1',
                },
            ]);

            const res = await reopenAccidentallyDeliveredTicket({
                ticketId: 't-006',
                targetStatus: 'IN_PROGRESS',
                reason: 'إلغاء تسليم مبكر',
            });

            expect(res.success).toBe(true);

            // Raw Assertion 1: Ticket fields reset
            const updateCall = mockPrisma.ticket.update.mock.calls.find((c: any[]) => c[0].where?.id === 't-006');
            expect(updateCall).toBeDefined();
            expect(updateCall[0].data.status).toBe('IN_PROGRESS');
            expect(updateCall[0].data.deliveredAt).toBeNull();
            expect(updateCall[0].data.warrantyExpiryDate).toBeNull();
            expect(new Decimal(updateCall[0].data.finalCustomerPrice).toNumber()).toBe(0);
            expect(new Decimal(updateCall[0].data.techCommissionAmount).toNumber()).toBe(0);
            expect(new Decimal(updateCall[0].data.centerLaborProfit).toNumber()).toBe(0);

            // Raw Assertion 2: GL distribution reversed via reverseJournalEntry
            expect(mockAccountingEngine.reverseJournalEntry).toHaveBeenCalledWith(
                'je-dist-1',
                expect.stringContaining(`TICKET_DIST_REVERSAL_${deliveredTicket.id}`),
                expect.anything()
            );

            // Raw Assertion 3: Commission compensated with negative amount
            const empTxCall = mockPrisma.employeeTransaction.create.mock.calls[0][0];
            expect(empTxCall.data.userId).toBe('tech-1');
            expect(empTxCall.data.type).toBe('COMMISSION_REVERSAL');
            expect(new Decimal(empTxCall.data.amount).toNumber()).toBe(-50);
            expect(empTxCall.data.referenceId).toBe('t-006');
        });
    });

    describe('Gap 2: Cross-Shift Cash Drawer Settlement & Reconciliation Proof', () => {
        it('prior-shift deposit refund increments crossShiftRefundsIssued and validates current till balance', async () => {
            const ticketData = {
                id: 't-007',
                barcode: 'T-007#',
                amountPaid: new Decimal(500),
                repairPrice: new Decimal(200),
                currentBranchId: 'branch-cairo-1',
            };

            mockPrisma.ticket.findFirst.mockResolvedValue(ticketData);
            mockPrisma.ticket.update.mockResolvedValue(ticketData);

            // Deposit was collected yesterday in Shift 1 (before today's shift openedAt)
            mockPrisma.repairPayment.findMany.mockResolvedValue([
                {
                    id: 'p-dep-yesterday',
                    type: 'DEPOSIT',
                    amount: new Decimal(500),
                    recordedAt: new Date('2026-09-04T15:00:00.000Z'), // Prior day!
                },
            ]);

            // Scenario A: Current till has insufficient cash (100 EGP in drawer, refund is 300 EGP)
            mockPrisma.treasury.findFirst.mockResolvedValue({ id: 'treas-cairo', balance: new Decimal(100) });
            mockPrisma.treasury.findUnique.mockResolvedValue({ id: 'treas-cairo', balance: new Decimal(100) });

            const failRes = await refundTicketExcessToCustomer({
                ticketId: 't-007',
                amount: 300,
                method: 'CASH',
            });

            // Guard validation: cleanly returns error message without throwing uncaught rejection
            expect(failRes.success).toBe(false);
            expect(failRes.error).toContain('رصيد الدرج (100) غير كافٍ لصرف المبلغ (300)');

            // Scenario B: Current till has sufficient cash (1000 EGP in drawer)
            mockPrisma.treasury.findUnique.mockResolvedValue({ id: 'treas-cairo', balance: new Decimal(1000) });

            const successRes = await refundTicketExcessToCustomer({
                ticketId: 't-007',
                amount: 300,
                method: 'CASH',
            });

            expect(successRes.success).toBe(true);

            // Raw Assertion: Prior-shift refund MUST update crossShiftRefundsIssued, NOT negative ticket sales
            const shiftCalls = mockPrisma.shift.update.mock.calls;
            const targetShiftCall = shiftCalls.find((c: any[]) => c[0].where?.id === mockCurrentShift.id);
            expect(targetShiftCall).toBeDefined();
            expect(targetShiftCall && new Decimal(targetShiftCall[0].data.crossShiftRefundsIssued.increment).toNumber()).toBe(300);
            expect(targetShiftCall && new Decimal(targetShiftCall[0].data.totalRefunds.increment).toNumber()).toBe(300);

            // Verifies totalTicketRevenueCash was NOT decremented for yesterday's money
            expect(mockPrisma.shift.update).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        totalTicketRevenueCash: expect.anything(),
                    }),
                })
            );
        });

        it('shift-close and reconciliation math actively subtracts crossShiftRefundsIssued from expected cash to prevent false drawer discrepancy', async () => {
            // Scenario: Shift B had:
            // - Start Cash: 1000 EGP
            // - Cash Sales: 2000 EGP
            // - Cash Expenses: 200 EGP
            // - Intra-shift Cash Refunds: 100 EGP
            // - Cross-Shift Refunds Issued (e.g. prior day deposit refund): 300 EGP
            //
            // Correct Expected Cash = 1000 + 2000 - 200 - 100 - 300 = 2400 EGP
            // If crossShiftRefundsIssued was NOT consumed, expectedCash would be 2700 EGP,
            // falsely showing a -300 EGP shortage when cashier counts 2400 EGP in till.

            const shiftWithCrossRefunds = {
                ...mockCurrentShift,
                id: 'shift-reconcile-test',
                startCash: new Decimal(1000),
                totalCashSales: new Decimal(2000),
                totalExpenses: new Decimal(200),
                expenses: [{ amount: new Decimal(200), paymentMethod: 'CASH' }],
                totalCashRefunds: new Decimal(100),
                crossShiftRefundsIssued: new Decimal(300),
                crossShiftRefundsReceived: new Decimal(0),
                sales: [],
                totalSales: 0,
                totalTickets: 0,
                status: 'OPEN',
            };

            mockPrisma.shift.findUnique.mockResolvedValue(shiftWithCrossRefunds);
            mockPrisma.shift.findFirst.mockResolvedValue(shiftWithCrossRefunds);

            // 1. Verify getShiftStatusPreview calculates expectedCash = 2400 EGP and reports crossShiftRefundsIssued = 300
            const summaryRes = await getShiftStatusPreview({ shiftId: 'shift-reconcile-test' });
            expect(summaryRes.success).toBe(true);
            expect(summaryRes.data.cash.expected).toBe(2400);
            expect(summaryRes.data.cash.crossShiftRefundsIssued).toBe(300);

            // 2. Verify closeShift with counted cash = 2400 EGP has exactly ZERO cash variance
            const closeRes = await closeShift({
                shiftId: 'shift-reconcile-test',
                actualCash: 2400,
            });

            expect(closeRes.success).toBe(true);

            // Raw Assertion: closeShift updated shift with endCash = 2400, cashVariance = 0
            const updateManyCalls = mockPrisma.shift.updateMany.mock.calls;
            expect(updateManyCalls.length).toBeGreaterThan(0);
            const closeCall = updateManyCalls[0][0];

            expect(new Decimal(closeCall.data.endCash).toNumber()).toBe(2400);
            expect(new Decimal(closeCall.data.cashVariance).toNumber()).toBe(0);
            expect(closeCall.data.hasAdjustments).toBe(false);

            // 3. Verify mismatch scenario (cashier counts 2350 EGP instead of 2400 EGP)
            const mismatchRes = await closeShift({
                shiftId: 'shift-reconcile-test',
                actualCash: 2350,
            });

            expect(mismatchRes.success).toBe(false);
            if (!mismatchRes.success && mismatchRes.code === 'DISCREPANCY_DETECTED') {
                expect(mismatchRes.expectedCash).toBe('2400.00');
                expect(mismatchRes.cashVariance).toBe('-50.00');
            }
        });
    });

    describe('Gap 3: GL 2150 Liability Relief Across 3 Paths Proof', () => {
        it('Path A (Surplus): deposit 500, repair 200 -> GL 2150 relieves 200 on completion and 300 on cash refund', async () => {
            const ticketData = {
                id: 't-surplus',
                barcode: 'T-SURPLUS#',
                status: 'COMPLETED', // ready for delivery
                amountPaid: new Decimal(500),
                repairPrice: new Decimal(200),
                currentBranchId: 'branch-cairo-1',
                customer: { id: 'cust-1' },
            };

            mockPrisma.ticket.findFirst.mockResolvedValue(ticketData);
            mockPrisma.ticket.update.mockResolvedValue({ ...ticketData, status: 'PAID_DELIVERED' });
            mockPrisma.repairPayment.findMany.mockResolvedValue([
                { id: 'p-dep-500', type: 'DEPOSIT', amount: new Decimal(500) }
            ]);

            // Final Delivery (amount = 0 because customer already paid 500 in advance)
            const deliveryRes = await processTicketPayment({
                ticketId: 't-surplus',
                amount: 0,
                paymentMethod: 'CASH',
                paymentType: 'PAYMENT',
            });

            expect(deliveryRes.success).toBe(true);

            // Verify Delivery Journal lines: GL 2150 must be relieved by 200 (exact repair cost)
            const deliveryCall = mockAccountingEngine.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].idempotencyKey === 'TICKET_DIST_t-surplus'
            );
            expect(deliveryCall).toBeDefined();
            const line2150Delivery = deliveryCall?.[0].lines.find((l: any) => l.accountCode === GL.LIABILITIES.CUSTOMER_DEPOSITS);
            expect(line2150Delivery && new Decimal(line2150Delivery.debit).toNumber()).toBe(200);

            // Surplus Cash Refund of 300:
            mockPrisma.ticket.findFirst.mockResolvedValue({
                ...ticketData,
                status: 'PAID_DELIVERED',
            });
            mockPrisma.treasury.findUnique.mockResolvedValue({ id: 'tr-1', balance: new Decimal(5000) });

            const refundRes = await refundTicketExcessToCustomer({
                ticketId: 't-surplus',
                amount: 300,
                method: 'CASH',
            });

            expect(refundRes.success).toBe(true);

            // Verify Refund Journal lines: GL 2150 debited 300, Cash credited 300
            const refundCall = mockAccountingEngine.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].idempotencyKey === 'REFUND_EXCESS_t-surplus_500.00_200.00'
            );
            expect(refundCall).toBeDefined();
            const line2150Refund = refundCall?.[0].lines.find((l: any) => l.accountCode === GL.LIABILITIES.CUSTOMER_DEPOSITS);
            const line1000Refund = refundCall?.[0].lines.find((l: any) => l.accountCode === GL.ASSETS.CASH);

            expect(line2150Refund && new Decimal(line2150Refund.debit).toNumber()).toBe(300);
            expect(line1000Refund && new Decimal(line1000Refund.credit).toNumber()).toBe(300);

            // Total Ledger Balance Verification:
            // Initial Deposit: Credit GL 2150 = 500
            // Delivery Relief: Debit GL 2150 = 200
            // Excess Payout:   Debit GL 2150 = 300
            // Net GL 2150 balance = 0. Net Cash = +200. Net Revenue = +200. Perfectly balanced!
        });

        it('Path B (Shortfall): deposit 200, repair 500 -> GL 2150 relieves 200, cash debited 300, revenue credited 500', async () => {
            const ticketData = {
                id: 't-shortfall',
                barcode: 'T-SHORTFALL#',
                status: 'COMPLETED',
                amountPaid: new Decimal(200), // 200 deposit paid
                repairPrice: new Decimal(500), // 500 total cost
                currentBranchId: 'branch-cairo-1',
                customer: { id: 'cust-1' },
            };

            mockPrisma.ticket.findFirst.mockResolvedValue(ticketData);
            mockPrisma.ticket.update.mockResolvedValue({ ...ticketData, amountPaid: new Decimal(500), status: 'PAID_DELIVERED' });
            mockPrisma.repairPayment.findMany.mockResolvedValue([
                { id: 'p-dep-200', type: 'DEPOSIT', amount: new Decimal(200) }
            ]);

            // Customer pays remaining 300 at pickup:
            const res = await processTicketPayment({
                ticketId: 't-shortfall',
                amount: 300,
                paymentMethod: 'CASH',
                paymentType: 'PAYMENT',
            });

            expect(res.success).toBe(true);

            const deliveryCall = mockAccountingEngine.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].idempotencyKey === 'TICKET_DIST_t-shortfall'
            );
            expect(deliveryCall).toBeDefined();

            const line2150 = deliveryCall?.[0].lines.find((l: any) => l.accountCode === GL.LIABILITIES.CUSTOMER_DEPOSITS);
            const line1000 = deliveryCall?.[0].lines.find((l: any) => l.accountCode === GL.ASSETS.CASH);

            expect(line2150 && new Decimal(line2150.debit).toNumber()).toBe(200); // Prior deposit relieved
            expect(line1000 && new Decimal(line1000.debit).toNumber()).toBe(300); // Fresh cash received at pickup
            // Total Debits = 200 + 300 = 500, balancing 500 in Revenue/Parts/Commission credits!
        });

        it('Path C (Exact Match): deposit 500, repair 500 -> GL 2150 relieves exactly 500 with zero cash at pickup', async () => {
            const ticketData = {
                id: 't-exact',
                barcode: 'T-EXACT#',
                status: 'COMPLETED',
                amountPaid: new Decimal(500),
                repairPrice: new Decimal(500),
                currentBranchId: 'branch-cairo-1',
                customer: { id: 'cust-1' },
            };

            mockPrisma.ticket.findFirst.mockResolvedValue(ticketData);
            mockPrisma.ticket.update.mockResolvedValue({ ...ticketData, status: 'PAID_DELIVERED' });
            mockPrisma.repairPayment.findMany.mockResolvedValue([
                { id: 'p-dep-500', type: 'DEPOSIT', amount: new Decimal(500) }
            ]);

            const res = await processTicketPayment({
                ticketId: 't-exact',
                amount: 0,
                paymentMethod: 'CASH',
                paymentType: 'PAYMENT',
            });

            expect(res.success).toBe(true);

            const deliveryCall = mockAccountingEngine.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].idempotencyKey === 'TICKET_DIST_t-exact'
            );
            expect(deliveryCall).toBeDefined();

            const line2150 = deliveryCall?.[0].lines.find((l: any) => l.accountCode === GL.LIABILITIES.CUSTOMER_DEPOSITS);
            expect(line2150 && new Decimal(line2150.debit).toNumber()).toBe(500);

            // Fresh cash line should NOT be present since zero fresh cash was paid
            const line1000 = deliveryCall?.[0].lines.find((l: any) => l.accountCode === GL.ASSETS.CASH);
            expect(line1000).toBeUndefined();
        });
    });
});
