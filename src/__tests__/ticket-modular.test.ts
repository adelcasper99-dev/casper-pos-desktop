import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextTicketNumber } from '../actions/tickets/workflow';
import { createTicket } from '../actions/tickets/mutations';
import { processTicketPayment } from '../actions/tickets/financials';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../actions/auth';
import { getCurrentShiftInternal } from '../actions/shift-management-actions';
import { getSession } from '../lib/auth';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingEngine } from '@/lib/accounting/transaction-factory';

// Mock dependencies
vi.mock('../lib/prisma', () => ({
    prisma: {
        ticket: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        branch: {
            findUnique: vi.fn(),
        },
        customer: {
            upsert: vi.fn(),
            findUnique: vi.fn(),
        },
        technician: {
            findUnique: vi.fn(),
        },
        repairPayment: {
            create: vi.fn(),
        },
        shift: {
            update: vi.fn(),
            findUnique: vi.fn(),
        },
        treasury: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
        },
        transaction: {
            create: vi.fn(),
        },
        ticketNote: {
            create: vi.fn(),
        },
        $transaction: vi.fn((cb) => cb(prisma)),
    },
}));

vi.mock('../actions/auth', () => ({
    getCurrentUser: vi.fn(),
}));

vi.mock('../actions/shift-management-actions', () => ({
    getCurrentShiftInternal: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
    getSession: vi.fn(),
}));

vi.mock('../lib/csrf', () => ({
    verifyCSRFToken: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/phone-validation', () => ({
    checkGlobalPhoneUniqueness: vi.fn(() => ({ unique: true })),
}));

vi.mock('@/lib/accounting/transaction-factory', () => ({
    AccountingEngine: {
        recordTransaction: vi.fn(),
        recordRefund: vi.fn(),
        recordMaintenancePayment: vi.fn(),
        recordSale: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

describe('Ticket Modular Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup default session for secureAction
        vi.mocked(getSession).mockResolvedValue({
            user: { id: 'u1', username: 'admin', role: 'ADMIN', permissions: ['*'], branchId: 'b1' }
        } as any);
        
        // Setup getCurrentUser for internal action logic
        vi.mocked(getCurrentUser).mockResolvedValue({ 
            id: 'u1', username: 'admin', role: 'ADMIN', permissions: ['*'], branchId: 'b1', name: 'Admin User'
        } as any);

        // Mock shift result
        vi.mocked(getCurrentShiftInternal).mockResolvedValue({ 
            shift: { id: 'shift-1', status: 'OPEN' } as any 
        });

        // Mock branch result
        (prisma.branch.findUnique as any).mockResolvedValue({ id: 'b1', code: 'B1' });
    });

    describe('getNextTicketNumber', () => {
        it('should return B1-T001 if no tickets exist for branch B1', async () => {
            (prisma.ticket.findMany as any).mockResolvedValue([]);
            (prisma.ticket.findUnique as any).mockResolvedValue(null);

            const result = await getNextTicketNumber('b1');
            expect(result).toBe('B1-T001');
        });

        it('should increment the highest found ticket number for branch B1', async () => {
            (prisma.ticket.findMany as any).mockResolvedValue([
                { barcode: 'B1-T005' },
                { barcode: 'B1-T002' }
            ]);
            (prisma.ticket.findUnique as any).mockResolvedValue(null);

            const result = await getNextTicketNumber('b1');
            expect(result).toBe('B1-T006');
        });

        it('should respect branch isolation (B1 vs B2)', async () => {
            (prisma.branch.findUnique as any).mockImplementation((args: any) => {
                if (args.where.id === 'b1') return Promise.resolve({ id: 'b1', code: 'B1' });
                if (args.where.id === 'b2') return Promise.resolve({ id: 'b2', code: 'B2' });
                return Promise.resolve(null);
            });

            (prisma.ticket.findMany as any).mockImplementation((args: any) => {
                if (args.where.barcode.startsWith === 'B1-T') return Promise.resolve([{ barcode: 'B1-T010' }]);
                if (args.where.barcode.startsWith === 'B2-T') return Promise.resolve([{ barcode: 'B2-T020' }]);
                return Promise.resolve([]);
            });

            const res1 = await getNextTicketNumber('b1');
            const res2 = await getNextTicketNumber('b2');

            expect(res1).toBe('B1-T011');
            expect(res2).toBe('B2-T021');
        });
    });

    describe('createTicket', () => {
        it('should create a ticket with B1- branch prefix', async () => {
            (prisma.ticket.findMany as any).mockResolvedValue([]);
            (prisma.ticket.findUnique as any).mockResolvedValue(null);
            (prisma.customer.upsert as any).mockResolvedValue({ id: 'cust-1' });
            (prisma.ticket.create as any).mockResolvedValue({ id: 't-1', barcode: 'B1-T001' });
            (prisma.shift.findUnique as any).mockResolvedValue({ id: 'shift-1' });

            const result = await createTicket({
                customerName: 'John Doe',
                customerPhone: '01234567890',
                deviceBrand: 'Apple',
                deviceModel: 'iPhone 13',
                issueDescription: 'Broken Screen',
                repairPrice: 100
            });

            expect(result.success).toBe(true);
            expect(prisma.ticket.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    barcode: 'B1-T001'
                })
            }));
        });
    });

    describe('processTicketPayment', () => {
        it('should use recordMaintenancePayment (Dynamic GL) and update treasury', async () => {
            (prisma.ticket.findUnique as any).mockResolvedValue({ 
                id: 't-1', 
                barcode: 'B1-100',
                repairPrice: new Decimal(100),
                amountPaid: new Decimal(0),
                currentBranchId: 'b1'
            });
            (prisma.repairPayment.create as any).mockResolvedValue({ id: 'p-1' });
            (prisma.treasury.findFirst as any).mockResolvedValue({ id: 'treas-1', balance: new Decimal(1000) });

            const result = await processTicketPayment({
                ticketId: 't-1',
                amount: 50,
                paymentMethod: 'VISA',
                treasuryId: 'treas-visa'
            });

            expect(result.success).toBe(true);
            
            // Verify dynamic GL logic via recordMaintenancePayment
            expect(AccountingEngine.recordMaintenancePayment).toHaveBeenCalledWith(expect.objectContaining({
                method: 'VISA',
                amount: 50
            }), expect.anything());

            // Verify Treasury impact
            expect(prisma.treasury.update).toHaveBeenCalled();
            expect(prisma.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    paymentMethod: 'VISA',
                    amount: new Decimal(50)
                })
            }));
        });
    });
});
