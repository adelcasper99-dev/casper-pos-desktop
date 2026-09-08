import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { PrismaTransactionClient } from '@/lib/prisma';

export interface DeductTreasuryResult {
    updatedTreasury: {
        id: string;
        name: string;
        balance: Prisma.Decimal;
        branchId?: string | null;
    };
    isOverdraft: boolean;
    auditTag: 'PERMISSION_OVERDRAFT' | 'SETTING_OVERDRAFT' | null;
    previousBalance: Prisma.Decimal;
    newBalance: Prisma.Decimal;
    deductedAmount: Prisma.Decimal;
}

export interface DeductTreasuryOptions {
    tx: PrismaTransactionClient | Prisma.TransactionClient | {
        treasury: {
            updateMany: (args: unknown) => Promise<{ count: number }>;
            update: (args: unknown) => Promise<{ id: string; name: string; balance: Prisma.Decimal; branchId?: string | null }>;
            findUnique: (args: unknown) => Promise<{ name?: string; balance?: Prisma.Decimal; tenantId?: string } | null>;
            findUniqueOrThrow: (args: unknown) => Promise<{ id: string; name: string; balance: Prisma.Decimal; branchId?: string | null }>;
        };
        storeSettings: {
            findFirst: (args?: unknown) => Promise<{ allowNegativeCash?: boolean | null } | null>;
        };
    };
    treasuryId: string;
    amount: Decimal | Prisma.Decimal | number | string;
    actionDescription?: string;
    allowOverdraftOverride?: boolean;
}

/**
 * Deducts balance from a Treasury atomically with strict concurrency protection,
 * configurable overdraft prevention, and Decimal precision.
 */
export async function deductTreasuryBalance(
    options: DeductTreasuryOptions
): Promise<DeductTreasuryResult> {
    const { tx, treasuryId, amount, actionDescription, allowOverdraftOverride } = options;

    const decAmount = new Decimal(amount.toString());
    if (decAmount.isNegative()) {
        throw new Error('قيمة الصرف يجب أن تكون موجبة.');
    }

    const prismaAmount = new Prisma.Decimal(decAmount.toString());

    // Resolve overdraft policy
    let allowOverdraft = false;
    if (typeof allowOverdraftOverride === 'boolean') {
        allowOverdraft = allowOverdraftOverride;
    } else {
        // Scoped automatically to current tenant via prismaTenantExtension on PostgreSQL, single-row on SQLite
        const settings = await tx.storeSettings.findFirst({});
        allowOverdraft = Boolean(settings?.allowNegativeCash);
    }

    if (!allowOverdraft) {
        // Atomic compare-and-decrement: only succeeds if balance >= prismaAmount
        const updateResult = await tx.treasury.updateMany({
            where: {
                id: treasuryId,
                balance: {
                    gte: prismaAmount,
                },
            },
            data: {
                balance: {
                    decrement: prismaAmount,
                },
            },
        });

        if (updateResult.count === 0) {
            // Fetch current treasury state for detailed error message
            const currentTreasury = await tx.treasury.findUnique({
                where: { id: treasuryId },
                select: { name: true, balance: true },
            });

            const currentBal = currentTreasury ? new Decimal(currentTreasury.balance.toString()).toFixed(2) : '0.00';
            const reqAmount = decAmount.toFixed(2);
            const treasuryName = currentTreasury?.name ? ` "${currentTreasury.name}"` : '';
            const actionContext = actionDescription ? ` لإتمام ${actionDescription}` : '';

            throw new Error(
                `عفواً، رصيد الخزينة${treasuryName} الحالي (${currentBal} ج.م) غير كافٍ${actionContext} لصرف (${reqAmount} ج.م).`
            );
        }

        const updated = await tx.treasury.findUniqueOrThrow({
            where: { id: treasuryId },
        });

        const newBalDec = new Decimal(updated.balance.toString());
        const prevBalDec = newBalDec.plus(decAmount);

        return {
            updatedTreasury: updated,
            isOverdraft: false,
            auditTag: null,
            previousBalance: new Prisma.Decimal(prevBalDec.toString()),
            newBalance: updated.balance,
            deductedAmount: prismaAmount,
        };
    } else {
        // Overdraft permitted: decrement unconditionally
        const updated = await tx.treasury.update({
            where: { id: treasuryId },
            data: {
                balance: {
                    decrement: prismaAmount,
                },
            },
        });

        const newBalDec = new Decimal(updated.balance.toString());
        const prevBalDec = newBalDec.plus(decAmount);
        const isOverdraft = newBalDec.isNegative();

        return {
            updatedTreasury: updated,
            isOverdraft,
            auditTag: isOverdraft
                ? (allowOverdraftOverride === true ? 'PERMISSION_OVERDRAFT' : 'SETTING_OVERDRAFT')
                : null,
            previousBalance: new Prisma.Decimal(prevBalDec.toString()),
            newBalance: updated.balance,
            deductedAmount: prismaAmount,
        };
    }
}
