'use server';

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { secureAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { getCurrentShiftInternal } from "./shift-management-actions";
import { getCurrentUser } from "./auth";
import { seedAccounts } from "@/lib/accounting/seed-accounts";
import { getTranslations } from "@/lib/i18n-mock";

// Repair/Initialize Accounting Accounts
export const repairAccounting = secureAction(async () => {
    await seedAccounts();
    return { success: true, message: "Accounting accounts synchronized" };
}, { permission: 'ACCOUNTING_MANAGE' });


/**
 * PHASE 4: Accounting Actions (P2)
 * Real implementations that link to shifts and create proper audit trails
 */

// Create expense linked to current shift
export const createExpense = secureAction(async (data: {
    description: string;
    amount: number;
    category: string;
    paymentMethod?: string;
    treasuryId?: string;
    csrfToken?: string;
}) => {
    const t = await getTranslations('SystemMessages.Errors');
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error(t('unauthorized'));

    // Get current shift if one is active
    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    const currentShift = shiftResult.shift;

    const result = await prisma.$transaction(async (tx) => {
        // 1. Create the expense record
        const expense = await tx.expense.create({
            data: {
                description: data.description,
                amount: new Decimal(data.amount),
                category: data.category,
                paymentMethod: data.paymentMethod || 'CASH',
                shiftId: currentShift?.id || null // Link to shift if active
            }
        });

        // 2. Create treasury transaction for cash outflow
        await tx.transaction.create({
            data: {
                type: 'EXPENSE',
                amount: new Decimal(data.amount),
                paymentMethod: data.paymentMethod || 'CASH',
                description: `Expense: ${data.description}`,
                treasuryId: data.treasuryId || null
            }
        });

        // 3. Update Treasury Balance if linked
        if (data.treasuryId) {
            await tx.treasury.update({
                where: { id: data.treasuryId },
                data: { balance: { decrement: data.amount } }
            });
        }

        // 3. Update shift totalExpenses if active
        if (currentShift?.id) {
            await tx.shift.update({
                where: { id: currentShift.id },
                data: {
                    totalExpenses: { increment: data.amount }
                }
            });
        }

        // 4. Create journal entry (inside transaction)
        await AccountingEngine.recordTransaction({
            description: `Expense: ${data.description}`,
            reference: expense.id,
            expenseId: expense.id,
            lines: [
                { accountCode: '5200', debit: data.amount, credit: 0, description: data.category },
                { accountCode: '1000', debit: 0, credit: data.amount, description: 'Cash Paid' }
            ]
        }, tx);

        return expense;
    });

    revalidatePath('/accounting', 'page');
    revalidatePath('/pos', 'page');

    return {
        success: true,
        expense: result,
        message: `Expense of ${data.amount} recorded successfully`
    };
}, { permission: 'ACCOUNTING_MANAGE' });

// Update expense with audit trail
export const updateExpense = secureAction(async (id: string, data: {
    description?: string;
    amount?: number;
    category?: string;
    paymentMethod?: string;
    csrfToken?: string;
}, reason?: string) => {
    const t = await getTranslations('SystemMessages.Errors');
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new Error(t('notFound'));

    // Create audit log
    await prisma.auditLog.create({
        data: {
            entityType: 'EXPENSE',
            entityId: id,
            action: 'UPDATE',
            previousData: JSON.stringify({
                description: existing.description,
                amount: Number(existing.amount),
                category: existing.category
            }),
            newData: JSON.stringify(data),
            reason: reason || 'Update expense'
        }
    });

    await prisma.expense.update({
        where: { id },
        data: {
            description: data.description,
            amount: data.amount ? new Decimal(data.amount) : undefined,
            category: data.category,
            paymentMethod: data.paymentMethod
        }
    });

    revalidatePath('/accounting', 'page');
    return { success: true };
}, { permission: 'ACCOUNTING_MANAGE' });

// Delete expense with audit trail
export const deleteExpense = secureAction(async (id: string, reason?: string) => {
    const t = await getTranslations('SystemMessages.Errors');
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new Error(t('notFound'));

    await prisma.auditLog.create({
        data: {
            entityType: 'EXPENSE',
            entityId: id,
            action: 'DELETE',
            previousData: JSON.stringify({
                description: existing.description,
                amount: Number(existing.amount),
                category: existing.category
            }),
            reason: reason || 'Delete expense'
        }
    });

    await prisma.expense.delete({ where: { id } });

    revalidatePath('/accounting', 'page');
    return { success: true };
}, { permission: 'ACCOUNTING_MANAGE' });

// Wrapper functions for shift management (Next.js requires async functions in "use server" files)
import { openShift as openShiftAction, closeShift as closeShiftAction } from "./shift-management-actions";

export const openShift = async (...args: Parameters<typeof openShiftAction>) => {
    return openShiftAction(...args);
};

export const closeShift = async (...args: Parameters<typeof closeShiftAction>) => {
    return closeShiftAction(...args);
};


// Add transaction to treasury
export const addTransaction = secureAction(async (type: string, amount: number, description: string, method: string, treasuryId?: string) => {
    // 🆕 If no treasuryId provided, try to find default for current user's branch
    let finalTreasuryId = treasuryId;
    if (!finalTreasuryId) {
        const { getCurrentUser } = await import('./auth');
        const user = await getCurrentUser();
        if (user?.branchId) {
            const defaultTreasury = await prisma.treasury.findFirst({
                where: { branchId: user.branchId, isDefault: true }
            });
            if (defaultTreasury) finalTreasuryId = defaultTreasury.id;
        }
    }

    await prisma.$transaction(async (tx) => {
        await tx.transaction.create({
            data: {
                type,
                amount: new Decimal(amount),
                description,
                paymentMethod: method,
                treasuryId: finalTreasuryId
            }
        });

        // 🆕 Update Balance if linked
        if (finalTreasuryId) {
            // Logic: IN/CAPITAL/SALE = + | OUT/EXPENSE/REFUND = -
            const isPositive = ['IN', 'CAPITAL', 'SALE', 'TICKET', 'CUSTOMER_PAYMENT'].includes(type);
            if (isPositive) {
                await tx.treasury.update({
                    where: { id: finalTreasuryId },
                    data: { balance: { increment: amount } }
                });
            } else {
                await tx.treasury.update({
                    where: { id: finalTreasuryId },
                    data: { balance: { decrement: amount } }
                });
            }
        }
    });

    revalidatePath('/accounting', 'page');
    return { success: true, message: "Transaction added" };
}, { permission: 'ACCOUNTING_MANAGE' });

// Update transaction with audit
export const updateTransaction = secureAction(async (id: string, data: Prisma.TransactionUpdateInput, reason?: string) => {
    const t = await getTranslations('SystemMessages.Errors');
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) throw new Error(t('notFound'));

    await prisma.$transaction(async (tx) => {
        // 1. Create audit log
        await tx.auditLog.create({
            data: {
                entityType: 'TRANSACTION',
                entityId: id,
                action: 'UPDATE',
                previousData: JSON.stringify({
                    type: existing.type,
                    amount: Number(existing.amount),
                    description: existing.description,
                    treasuryId: existing.treasuryId
                }),
                newData: JSON.stringify(data),
                reason: reason || 'Update transaction'
            }
        });

        // 2. RECONCILE TREASURY BALANCE (BL-10 Fix)
        const isPositive = (type: string) => ['IN', 'CAPITAL', 'SALE', 'TICKET', 'CUSTOMER_PAYMENT'].includes(type);
        const oldAmount = Number(existing.amount);
        const newAmount = data.amount !== undefined ? Number(data.amount) : oldAmount;
        const oldTreasuryId = existing.treasuryId;
        const newTreasuryId = ((data as any).treasuryId as string) || oldTreasuryId;

        // If amount or treasury changed, we need to adjust balances
        if (oldAmount !== newAmount || oldTreasuryId !== newTreasuryId) {
            // Reverse old impact
            if (oldTreasuryId) {
                const reversal = isPositive(existing.type) ? -oldAmount : oldAmount;
                await tx.treasury.update({
                    where: { id: oldTreasuryId },
                    data: { balance: { increment: reversal } }
                });
            }

            // Apply new impact
            if (newTreasuryId) {
                // We use existing.type unless data.type is provided (but usually type isn't editable)
                const finalType = (data as any).type || existing.type;
                const forwardImpact = isPositive(finalType) ? newAmount : -newAmount;
                await tx.treasury.update({
                    where: { id: newTreasuryId },
                    data: { balance: { increment: forwardImpact } }
                });
            }
        }

        // 3. Perform the update
        await tx.transaction.update({
            where: { id },
            data
        });
    });

    revalidatePath('/accounting', 'page');
    return { success: true, message: "Transaction updated and treasury reconciled" };
}, { permission: 'ACCOUNTING_MANAGE' });

// Soft delete transaction
export const deleteTransaction = secureAction(async (id: string, reason?: string) => {
    const currentUser = await getCurrentUser();
    const t = await getTranslations('SystemMessages.Errors');
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) throw new Error(t('notFound'));

    await prisma.$transaction(async (tx) => {
        // 1. Audit Log
        await tx.auditLog.create({
            data: {
                entityType: 'TRANSACTION',
                entityId: id,
                action: 'SOFT_DELETE',
                previousData: JSON.stringify({
                    type: existing.type,
                    amount: Number(existing.amount),
                    description: existing.description,
                    treasuryId: existing.treasuryId
                }),
                reason: reason || 'Delete transaction',
                user: currentUser?.username || 'system'
            }
        });

        // 2. REVERSE TREASURY IMPACT (BL-11 Fix)
        if (existing.treasuryId && !existing.deletedAt) {
            const isPositive = ['IN', 'CAPITAL', 'SALE', 'TICKET', 'CUSTOMER_PAYMENT'].includes(existing.type);
            const reversalAmount = isPositive ? -Number(existing.amount) : Number(existing.amount);

            await tx.treasury.update({
                where: { id: existing.treasuryId },
                data: { balance: { increment: reversalAmount } }
            });
        }

        // 3. Performing soft delete
        await tx.transaction.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                deletedBy: currentUser?.username || 'system',
                deletedReason: reason
            }
        });
    });

    revalidatePath('/accounting', 'page');
    return { success: true, message: "Transaction deleted and treasury reversed" };
}, { permission: 'ACCOUNTING_MANAGE' });

// Get real journal entries with filters
export const getJournalEntries = secureAction(async (filters?: { from?: Date; to?: Date; branchId?: string; limit?: number }) => {
    const where: Prisma.JournalEntryWhereInput = {};

    if (filters?.from || filters?.to) {
        where.date = {
            gte: filters.from,
            lte: filters.to
        };
    }

    if (filters?.branchId) {
        // Journal entries might need to be filtered by branch if linked to specific treasuries or shifts
        // For now, we assume global if no branchId is provided, or filter by related entity branch
    }

    const entries = await prisma.journalEntry.findMany({
        where,
        take: filters?.limit || 50,
        orderBy: { date: 'desc' },
        include: {
            lines: {
                include: { account: true }
            }
        }
    });

    return {
        success: true,
        data: entries
    };
}, { permission: 'ACCOUNTING_VIEW', requireCSRF: false });

// Get trial balance from accounts with date filters
export const getTrialBalance = secureAction(async (filters?: { from?: Date; to?: Date; branchId?: string }) => {
    const lineWhere: Prisma.JournalLineWhereInput = {};
    if (filters?.from || filters?.to) {
        lineWhere.journalEntry = {
            date: {
                gte: filters.from,
                lte: filters.to
            }
        };
    }

    const accounts = await prisma.account.findMany({
        include: {
            journalLines: {
                where: lineWhere
            }
        }
    });

    const balances = accounts.map(account => {
        const totalDebit = account.journalLines.reduce((sum, l) => sum + Number(l.debit), 0);
        const totalCredit = account.journalLines.reduce((sum, l) => sum + Number(l.credit), 0);
        const balance = account.type === 'ASSET' || account.type === 'EXPENSE'
            ? totalDebit - totalCredit
            : totalCredit - totalDebit;

        return {
            code: account.code,
            name: account.name,
            type: account.type,
            debit: totalDebit,
            credit: totalCredit,
            balance: Math.abs(balance),
            balanceType: balance >= 0 ? 'DR' : 'CR'
        };
    });

    return { success: true, data: balances };
}, { permission: 'ACCOUNTING_VIEW', requireCSRF: false });

export const getExpenses = secureAction(async (filters?: { from?: Date; to?: Date; branchId?: string }) => {
    const where: Prisma.ExpenseWhereInput = {};

    if (filters?.from || filters?.to) {
        where.date = {
            gte: filters.from,
            lte: filters.to
        };
    }

    if (filters?.branchId) {
        where.shift = {
            user: {
                branchId: filters.branchId
            }
        };
    }

    const expenses = await prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        take: 100
    });
    // Serialize decimals
    const serialized = expenses.map(e => ({
        ...e,
        amount: Number(e.amount)
    }));
    return { success: true, data: serialized };
}, { permission: 'ACCOUNTING_VIEW', requireCSRF: false });

// Get today's return metrics
export const getReturnsMetrics = secureAction(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayReturnsCount, todayRefundsValue] = await Promise.all([
        0, // prisma.ticket.count REMOVED
        prisma.transaction.aggregate({
            _sum: { amount: true },
            where: {
                type: 'REFUND',
                createdAt: { gte: today }
            }
        })
    ]);

    return {
        success: true,
        data: {
            todayReturnsCount,
            todayRefundsValue: Number(todayRefundsValue._sum.amount || 0)
        }
    };
}, { permission: 'ACCOUNTING_VIEW', requireCSRF: false });
