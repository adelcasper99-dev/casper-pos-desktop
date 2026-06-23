import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPartner, createPartnerTransaction, distributeProfitLoss, getPartners } from '../features/partners/api/partner-service';
import { prisma } from '../lib/prisma';
import { getSession } from '../lib/auth';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingEngine } from '@/lib/accounting/transaction-factory';

// Mock dependencies
vi.mock('../lib/prisma', () => ({
    prisma: {
        partner: {
            findMany: vi.fn(),
            create: vi.fn(),
            findUniqueOrThrow: vi.fn(),
        },
        partnerTransaction: {
            create: vi.fn(),
        },
        account: {
            findFirst: vi.fn(),
            createMany: vi.fn(),
            aggregate: vi.fn(),
        },
        treasury: {
            findUniqueOrThrow: vi.fn(),
            update: vi.fn(),
        },
        journalEntry: {
            findUnique: vi.fn(),
        },
        journalLine: {
            aggregate: vi.fn(),
        },
        $transaction: vi.fn((cb) => cb(prisma)),
    },
}));

vi.mock('../lib/auth', () => ({
    getSession: vi.fn(),
}));

vi.mock('@/lib/accounting/transaction-factory', () => ({
    AccountingEngine: {
        recordTransaction: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

describe('Partner Service Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup default session
        vi.mocked(getSession).mockResolvedValue({
            user: { id: 'u1', username: 'admin', role: 'ADMIN', permissions: ['*'], branchId: 'b1' }
        } as any);
    });

    describe('createPartner', () => {
        it('should create a partner and seed accounts if constraints are met', async () => {
            vi.mocked(prisma.partner.findMany).mockResolvedValue([
                { id: 'p1', name: 'Partner 1', profitShare: new Decimal(40) }
            ] as any);
            vi.mocked(prisma.account.findFirst).mockResolvedValue({ code: '3001' } as any);
            vi.mocked(prisma.partner.create).mockResolvedValue({ id: 'p2', name: 'Partner 2' } as any);

            const result = await createPartner({ name: 'Partner 2', profitShare: 50 });

            expect(result.success).toBe(true);
            expect(prisma.partner.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    name: 'Partner 2',
                    profitShare: 50,
                    capitalGlCode: '3002',
                    currentGlCode: '3202'
                })
            }));
            expect(prisma.account.createMany).toHaveBeenCalled();
        });

        it('should throw error if profit share exceeds 100%', async () => {
            vi.mocked(prisma.partner.findMany).mockResolvedValue([
                { id: 'p1', name: 'Partner 1', profitShare: new Decimal(60) }
            ] as any);

            const result = await createPartner({ name: 'Partner 2', profitShare: 50 });

            expect(result.success).toBe(false);
            expect(result.error).toContain('إجمالي نسب الشركاء لا يمكن أن يتجاوز 100%');
        });

        it('should enforce GL range guard (> 3099 limit)', async () => {
            vi.mocked(prisma.partner.findMany).mockResolvedValue([]);
            vi.mocked(prisma.account.findFirst).mockResolvedValue({ code: '3099' } as any); // Last account is at limit

            const result = await createPartner({ name: 'Partner 100', profitShare: 5 });

            expect(result.success).toBe(false);
            expect(result.error).toContain('لقد تم الوصول للحد الأقصى لعدد الشركاء المسموح به');
            expect(prisma.partner.create).not.toHaveBeenCalled();
        });
    });

    describe('createPartnerTransaction', () => {
        it('should record deposit and call recordTransaction with treasury branchId', async () => {
            vi.mocked(prisma.partner.findUniqueOrThrow).mockResolvedValue({ id: 'p1', name: 'Partner 1', capitalGlCode: '3001', currentGlCode: '3201' } as any);
            vi.mocked(prisma.treasury.findUniqueOrThrow).mockResolvedValue({ id: 't1', branchId: 'b1', glCode: '1001' } as any);

            const result = await createPartnerTransaction({
                partnerId: 'p1',
                type: 'DEPOSIT',
                amount: 1500,
                treasuryId: 't1',
                description: 'Initial investment'
            });

            expect(result.success).toBe(true);
            expect(prisma.treasury.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 't1' },
                data: { balance: { increment: 1500 } }
            }));
            expect(AccountingEngine.recordTransaction).toHaveBeenCalledWith(expect.objectContaining({
                branchId: 'b1',
                lines: expect.arrayContaining([
                    { accountCode: '1001', debit: 1500, credit: 0, description: 'إيداع شريك - Partner 1' },
                    { accountCode: '3001', debit: 0, credit: 1500, description: 'إيداع رأس مال - Partner 1' }
                ])
            }), expect.anything());
        });
    });

    describe('distributeProfitLoss', () => {
        it('should distribute profit and inject session branchId to recordTransaction', async () => {
            vi.mocked(prisma.partner.findMany).mockResolvedValue([
                { id: 'p1', name: 'Partner 1', profitShare: new Decimal(60), currentGlCode: '3201' },
                { id: 'p2', name: 'Partner 2', profitShare: new Decimal(40), currentGlCode: '3202' }
            ] as any);
            vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);

            const result = await distributeProfitLoss({
                periodFrom: new Date('2026-01-01'),
                periodTo: new Date('2026-01-31'),
                netAmount: 10000
            });

            expect(result.success).toBe(true);
            
            // Check that partner transactions are created with correct ratios
            expect(prisma.partnerTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ partnerId: 'p1', amount: 6000, type: 'DISTRIBUTION' })
            }));
            expect(prisma.partnerTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ partnerId: 'p2', amount: 4000, type: 'DISTRIBUTION' })
            }));

            // Check branchId injection from mock session ('b1')
            expect(AccountingEngine.recordTransaction).toHaveBeenCalledWith(expect.objectContaining({
                branchId: 'b1',
                lines: expect.arrayContaining([
                    { accountCode: '3300', debit: 10000, credit: 0, description: 'توزيع أرباح' },
                    { accountCode: '3201', debit: 0, credit: 6000, description: 'أرباح موزعة - Partner 1' },
                    { accountCode: '3202', debit: 0, credit: 4000, description: 'أرباح موزعة - Partner 2' }
                ])
            }), expect.anything());
        });

        it('should distribute loss using Decimal.abs() for calculation', async () => {
            vi.mocked(prisma.partner.findMany).mockResolvedValue([
                { id: 'p1', name: 'Partner 1', profitShare: new Decimal(100), currentGlCode: '3201' }
            ] as any);
            vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);

            const result = await distributeProfitLoss({
                periodFrom: new Date('2026-01-01'),
                periodTo: new Date('2026-01-31'),
                netAmount: -5000
            });

            expect(result.success).toBe(true);
            expect(prisma.partnerTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ partnerId: 'p1', amount: -5000 })
            }));
            
            expect(AccountingEngine.recordTransaction).toHaveBeenCalledWith(expect.objectContaining({
                branchId: 'b1',
                lines: expect.arrayContaining([
                    { accountCode: '3300', debit: 0, credit: 5000, description: 'توزيع خسائر' },
                    { accountCode: '3201', debit: 5000, credit: 0, description: 'خسائر موزعة - Partner 1' }
                ])
            }), expect.anything());
        });
    });
});
