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
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { EXPENSE_CATEGORY_MAP } from "@/shared/constants/accounting-mappings";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;  // Max requests per window
}

const EXPENSE_RATE_LIMIT: RateLimitConfig = {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 20,      // Max 20 expense creations per minute
};

// In-memory rate limit store (resets on server restart)
// For production, consider using Redis for distributed rate limiting
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for a user
 * @returns true if allowed, false if rate limited
 */
function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const userLimit = rateLimitStore.get(userId);
    
    if (!userLimit || userLimit.resetAt < now) {
        // New window
        rateLimitStore.set(userId, {
            count: 1,
            resetAt: now + EXPENSE_RATE_LIMIT.windowMs
        });
        return {
            allowed: true,
            remaining: EXPENSE_RATE_LIMIT.maxRequests - 1,
            resetIn: EXPENSE_RATE_LIMIT.windowMs
        };
    }
    
    if (userLimit.count >= EXPENSE_RATE_LIMIT.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: userLimit.resetAt - now
        };
    }
    
    // Increment count
    userLimit.count++;
    rateLimitStore.set(userId, userLimit);
    
    return {
        allowed: true,
        remaining: EXPENSE_RATE_LIMIT.maxRequests - userLimit.count,
        resetIn: userLimit.resetAt - now
    };
}

// Repair/Initialize Accounting Accounts
export const repairAccounting = secureAction(async () => {
    await seedAccounts();
    return { success: true, message: "Accounting accounts synchronized" };
}, { permission: 'ACCOUNTING_MANAGE' });


const FALLBACK_EXPENSE_GL = '5200';

const CreateExpenseSchema = z.object({
    description: z.string().min(1, "الوصف مطلوب"),
    amount: z.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
    category: z.string().min(1, "التصنيف مطلوب"),
    paymentMethod: z.enum(['CASH', 'VISA', 'CARD', 'MASTERCARD', 'BANK', 'INSTAPAY', 'WALLET', 'VODAFONE_CASH']).optional(),
    treasuryId: z.string().uuid("معرف الخزنة غير صالح").optional().or(z.literal('')),
});

const GL_ACCOUNT_MAP: Record<string, string> = {
    CASH: '1000', VISA: '1010', CARD: '1010',
    MASTERCARD: '1010', BANK: '1010',
    INSTAPAY: '1020', WALLET: '1020', VODAFONE_CASH: '1020'
};

/**
 * GL Routing Monitoring
 * Tracks unmapped categories for reporting and improvement
 */
const GL_ROUTING_WARNINGS = new Map<string, number>();
const MAX_WARNING_LOG_SIZE = 100;

/**
 * Get statistics on GL routing warnings
 * Useful for monitoring and improving the EXPENSE_CATEGORY_MAP
 */
export function getGlRoutingStats(): { unmappedCategories: Array<{category: string; count: number}>; totalWarnings: number } {
    const entries = Array.from(GL_ROUTING_WARNINGS.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
    
    return {
        unmappedCategories: entries,
        totalWarnings: entries.reduce((sum, e) => sum + e.count, 0)
    };
}

/**
 * Resolves the correct GL account code for an expense category.
 * Falls back to the general expense account (5200) if the category is not mapped.
 * Logs warning and tracks unmapped categories for monitoring.
 * 
 * @param category - The expense category key from EXPENSE_CATEGORY_MAP
 * @returns The GL account code to use for the journal entry
 */
function resolveExpenseGlCode(category: string): string {
    const mapping = EXPENSE_CATEGORY_MAP[category];
    if (!mapping) {
        // Track for monitoring
        const currentCount = GL_ROUTING_WARNINGS.get(category) || 0;
        GL_ROUTING_WARNINGS.set(category, currentCount + 1);
        
        // Trim if too large (prevent memory issues in long-running processes)
        if (GL_ROUTING_WARNINGS.size > MAX_WARNING_LOG_SIZE) {
            const oldestKey = GL_ROUTING_WARNINGS.keys().next().value;
            if (oldestKey) GL_ROUTING_WARNINGS.delete(oldestKey);
        }
        
        console.warn(`[createExpense] Unknown expense category "${category}", routing to fallback GL ${FALLBACK_EXPENSE_GL}`);
        console.warn(`[GL-Routing-Monitor] Add "${category}" to EXPENSE_CATEGORY_MAP for proper expense tracking. Current stats: ${getGlRoutingStats().totalWarnings} total unmapped warnings.`);
        return FALLBACK_EXPENSE_GL;
    }
    return mapping.glCode;
}

/**
 * PHASE 4: Accounting Actions (P2)
 * Real implementations that link to shifts and create proper audit trails
 */

// Create expense linked to current shift
export const createExpense = secureAction(async (data: z.infer<typeof CreateExpenseSchema>) => {
    const t = await getTranslations('SystemMessages.Errors');
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error(t('unauthorized'));

    // Rate limiting check
    const rateCheck = checkRateLimit(currentUser.id);
    if (!rateCheck.allowed) {
        const resetSeconds = Math.ceil(rateCheck.resetIn / 1000);
        throw new Error(`تم تجاوز حد إنشاء المصروفات. يرجى الانتظار ${resetSeconds} ثانية قبل إنشاء مصروف جديد.`);
    }

    const validated = CreateExpenseSchema.parse(data);

    const glExpenseCode = resolveExpenseGlCode(validated.category);
    const glPaymentCode = GL_ACCOUNT_MAP[validated.paymentMethod || 'CASH'] ?? '1000';

    // Get current shift if one is active
    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    const currentShift = shiftResult.shift;

    const result = await prisma.$transaction(async (tx) => {
        // 1. Create the expense record
        const expense = await tx.expense.create({
            data: {
                description: validated.description,
                amount: new Decimal(validated.amount),
                category: validated.category,
                paymentMethod: validated.paymentMethod || 'CASH',
                shiftId: currentShift?.id || null, // Link to shift if active
                branchId: currentUser.branchId ?? null
            }
        });

        // 2. Create treasury transaction for cash outflow
        await tx.transaction.create({
            data: {
                type: 'EXPENSE',
                amount: new Decimal(validated.amount),
                paymentMethod: validated.paymentMethod || 'CASH',
                description: `Expense: ${validated.description}`,
                treasuryId: validated.treasuryId || null,
                expenseId: expense.id
            }
        });

        // 3. Update Treasury Balance if linked
        if (validated.treasuryId) {
            const treasury = await tx.treasury.findUnique({ where: { id: validated.treasuryId } });
            if (treasury && Number(treasury.balance) < validated.amount) {
                const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                if (!canGoNegative) {
                    throw new Error(`رصيد الخزنة غير كافٍ (${Number(treasury.balance)}). ولا تملك صلاحية السحب بالسالب.`);
                }
            }
            await tx.treasury.update({
                where: { id: validated.treasuryId },
                data: { balance: { decrement: validated.amount } }
            });
        }

        // 3. Update shift totalExpenses if active
        if (currentShift?.id) {
            await tx.shift.update({
                where: { id: currentShift.id },
                data: {
                    totalExpenses: { increment: validated.amount }
                }
            });
        }

        // 4. Create journal entry (inside transaction)
        // G-01 Fix: Use resolved GL code from category mapping, not hardcoded '5200'
        await AccountingEngine.recordTransaction({
            description: `Expense: ${validated.description}`,
            reference: expense.id,
            expenseId: expense.id,
            branchId: currentUser.branchId ?? undefined, // Expense GL must carry branchId for P&L isolation
            lines: [
                { accountCode: glExpenseCode, debit: validated.amount, credit: 0, description: EXPENSE_CATEGORY_MAP[validated.category]?.labelAr ?? validated.category },
                { accountCode: glPaymentCode, debit: 0, credit: validated.amount, description: `${validated.paymentMethod || 'CASH'} Paid` }
            ]
        }, tx);

        return expense;
    });

    revalidatePath('/accounting', 'page');
    revalidatePath('/pos', 'page');

    return {
        success: true,
        expense: result,
        glCode: glExpenseCode,
        message: `Expense of ${validated.amount} recorded to GL ${glExpenseCode} successfully`
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
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error(t('unauthorized'));

    const existing = await prisma.expense.findUnique({
        where: { id },
        include: { shift: true }
    });
    if (!existing) throw new Error(t('notFound'));

    await prisma.$transaction(async (tx) => {
        // 1. Audit trail
        await tx.auditLog.create({
            data: {
                entityType: 'EXPENSE',
                entityId: id,
                action: 'DELETE',
                previousData: JSON.stringify({
                    description: existing.description,
                    amount: Number(existing.amount),
                    category: existing.category,
                    shiftId: existing.shiftId
                }),
                reason: reason || 'Delete expense'
            }
        });

        // 2. Find and reverse the associated journal entries (GL)
        const { FinancialReversalService } = await import('@/lib/financial-reversal-service');
        await FinancialReversalService.reverseAccountingEntries(tx, existing.id, reason || 'Parent expense deleted');

        // 3. Reverse associated treasury transactions linked via expenseId
        const linkedTransactions = await tx.transaction.findMany({
            where: {
                type: 'EXPENSE',
                deletedAt: null,
                expenseId: existing.id
            }
        });

        for (const txn of linkedTransactions) {
            if (txn.treasuryId && !txn.deletedAt) {
                // Reverse the physical cash deduction
                await tx.treasury.update({
                    where: { id: txn.treasuryId },
                    data: { balance: { increment: existing.amount } }
                });

                // Soft delete the connected treasury transaction
                await tx.transaction.update({
                    where: { id: txn.id },
                    data: { deletedAt: new Date(), deletedReason: reason || 'Parent expense deleted' }
                });
            }
        }

        // 4. Reverse shift totalExpenses if active
        if (existing.shiftId && existing.shift?.status === 'OPEN') {
            await tx.shift.update({
                where: { id: existing.shiftId },
                data: { totalExpenses: { decrement: existing.amount } }
            });
        }

        // 5. Finally, hard delete the expense
        await tx.expense.delete({ where: { id } });
    });

    revalidatePath('/accounting', 'page');
    revalidatePath('/pos', 'page');
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
                const treasury = await tx.treasury.findUnique({ where: { id: finalTreasuryId } });
                if (treasury && Number(treasury.balance) < amount) {
                    const currentUser = await getCurrentUser();
                    const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                    if (!canGoNegative) {
                        throw new Error(`رصيد الخزنة غير كافٍ (${Number(treasury.balance)}). ولا تملك صلاحية السحب بالسالب.`);
                    }
                }
                await tx.treasury.update({
                    where: { id: finalTreasuryId },
                    data: { balance: { decrement: amount } }
                });
            }
        }

        // Fix 3: Post GL journal entry for full auditability
        // Wrapped in try/catch so a missing seedAccounts run won't break the treasury update
        try {
            const POSITIVE_TYPES = ['IN', 'CAPITAL', 'SALE', 'TICKET', 'CUSTOMER_PAYMENT'];
            const isPositiveGL = POSITIVE_TYPES.includes(type);
            const glAccountMap: Record<string, string> = {
                CASH: '1000', VISA: '1010', CARD: '1010',
                MASTERCARD: '1010', BANK: '1010',
                INSTAPAY: '1020', WALLET: '1020', VODAFONE_CASH: '1020'
            };
            const assetAccount = glAccountMap[method] ?? '1000';

            if (isPositiveGL) {
                await AccountingEngine.recordTransaction({
                    description,
                    lines: [
                        { accountCode: assetAccount, debit: amount, credit: 0,      description: `${method} Cash In` },
                        { accountCode: '4400',        debit: 0,      credit: amount, description: 'Other Income' }
                    ]
                }, tx);
            } else {
                await AccountingEngine.recordTransaction({
                    description,
                    lines: [
                        { accountCode: '5200',        debit: amount, credit: 0,      description: 'General Expense' },
                        { accountCode: assetAccount,  debit: 0,      credit: amount, description: `${method} Cash Out` }
                    ]
                }, tx);
            }
        } catch (glError) {
            console.error('[addTransaction] GL posting failed (non-fatal):', glError);
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

                // 🛑 Check for Negative Balance Permission
                if (forwardImpact < 0) {
                    const treasury = await tx.treasury.findUnique({ where: { id: newTreasuryId } });
                    if (treasury && (Number(treasury.balance) + forwardImpact) < 0) {
                        const { getCurrentUser } = await import('./auth');
                        const user = await getCurrentUser();
                        const canGoNegative = hasPermission(user?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                        if (!canGoNegative) {
                            throw new Error(`تحديث العملية سيؤدي إلى رصيد سالب في الخزنة (${Number(treasury.balance) + forwardImpact}). ولا تملك صلاحية السحب بالسالب.`);
                        }
                    }
                }

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
        const totalDebit = account.journalLines.reduce((sum, l) => sum.plus(new Decimal(String(l.debit))), new Decimal(0));
        const totalCredit = account.journalLines.reduce((sum, l) => sum.plus(new Decimal(String(l.credit))), new Decimal(0));
        const balance = account.type === 'ASSET' || account.type === 'EXPENSE'
            ? totalDebit.minus(totalCredit)
            : totalCredit.minus(totalDebit);

        return {
            code: account.code,
            name: account.name,
            type: account.type,
            debit: totalDebit.toNumber(),
            credit: totalCredit.toNumber(),
            balance: balance.abs().toNumber(),
            balanceType: balance.gte(0) ? 'DR' : 'CR'
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
