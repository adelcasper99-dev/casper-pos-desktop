'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { secureAction } from '@/lib/safe-action';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { z } from 'zod';
import { getTranslations } from "@/lib/i18n-mock";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Inter-HQ Fund Transfer Action
 * Allows transferring funds between treasuries in different HQ branches
 */

const interHQTransferSchema = z.object({
    fromTreasuryId: z.string(),
    toTreasuryId: z.string(),
    amount: z.number().positive(),
    paymentMethod: z.enum(['CASH', 'VISA', 'WALLET', 'INSTAPAY']),
    description: z.string(),
    approverNotes: z.string().optional()
});

export const transferFundsBetweenHQs = secureAction(async (data: z.infer<typeof interHQTransferSchema>) => {
    const { fromTreasuryId, toTreasuryId, amount, paymentMethod, description, approverNotes } = data;
    const { getCurrentUser } = await import('./auth');
    const user = await getCurrentUser();
    const t = await getTranslations('SystemMessages.Errors');

    if (fromTreasuryId === toTreasuryId) {
        throw new Error(t('sameTreasury'));
    }

    // Get both treasuries with branch info
    const [fromTreasury, toTreasury] = await Promise.all([
        prisma.treasury.findUnique({
            where: { id: fromTreasuryId },
            include: { branch: true }
        }),
        prisma.treasury.findUnique({
            where: { id: toTreasuryId },
            include: { branch: true }
        })
    ]);

    if (!fromTreasury || !toTreasury) {
        throw new Error(t('notFound'));
    }

    const fromBalance = new Decimal(fromTreasury.balance.toString());
    const amountDec = new Decimal(amount);

    // Verify source treasury has sufficient balance
    if (fromBalance.lt(amountDec)) {
        const canGoNegative = hasPermission(user?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
        if (!canGoNegative) {
            throw new Error(t('insufficientFunds', { available: fromBalance.toNumber(), required: amount }));
        }
    }

    // Verify both are HQ centers (not regular stores)
    if (fromTreasury.branch.type !== 'CENTER' || toTreasury.branch.type !== 'CENTER') {
        throw new Error(t('hqTransferOnly'));
    }

    // Execute transfer in transaction
    await prisma.$transaction(async (tx) => {
        // Deduct from source treasury
        await tx.treasury.update({
            where: { id: fromTreasuryId },
            data: { balance: { decrement: amountDec } }
        });

        // Add to destination treasury
        await tx.treasury.update({
            where: { id: toTreasuryId },
            data: { balance: { increment: amountDec } }
        });

        // Create outgoing transaction
        const outgoingTx = await tx.transaction.create({
            data: {
                type: 'INTER_HQ_OUT',
                amount: amountDec,
                description: `Transfer to ${toTreasury.branch.name} - ${description}${approverNotes ? ` | Notes: ${approverNotes}` : ''}`,
                paymentMethod,
                treasuryId: fromTreasuryId,
                isTransfer: true
            }
        });

        // Create incoming transaction
        await tx.transaction.create({
            data: {
                type: 'INTER_HQ_IN',
                amount: amountDec,
                description: `Transfer from ${fromTreasury.branch.name} - ${description}${approverNotes ? ` | Notes: ${approverNotes}` : ''}`,
                paymentMethod,
                treasuryId: toTreasuryId,
                isTransfer: true,
                relatedTransactionId: outgoingTx.id // Link to outgoing transaction
            }
        });

        // Create audit log
        await tx.auditLog.create({
            data: {
                entityType: 'TREASURY_TRANSFER',
                entityId: `${fromTreasuryId}-${toTreasuryId}`,
                action: 'INTER_HQ_TRANSFER',
                previousData: JSON.stringify({
                    fromBalance: fromBalance.toNumber(),
                    toBalance: new Decimal(toTreasury.balance.toString()).toNumber()
                }),
                newData: JSON.stringify({
                    fromBalance: fromBalance.sub(amountDec).toNumber(),
                    toBalance: new Decimal(toTreasury.balance.toString()).add(amountDec).toNumber(),
                    amount: amountDec.toNumber(),
                    paymentMethod
                }),
                reason: description,
                branchId: fromTreasury.branchId,
                hqId: toTreasury.branchId,
                user: user?.username || user?.name || 'system'
            }
        });

        // Add Accounting GL Entry
        const { AccountingEngine } = await import('@/lib/accounting/transaction-factory');
        
        // Use the actual GL code from each treasury if available, otherwise fallback
        const fromGl = fromTreasury.glCode || '1000';
        const toGl = toTreasury.glCode || '1000';

        await AccountingEngine.recordTransaction({
            description: `HQ Transfer: ${fromTreasury.branch.name} -> ${toTreasury.branch.name} (${paymentMethod})`,
            reference: outgoingTx.id, // Linking to the outbound transaction
            date: new Date(),
            branchId: fromTreasury.branchId,
            lines: [
                { accountCode: toGl, debit: amountDec.toNumber(), credit: 0, description: `Inbound HQ Transfer to ${toTreasury.branch.name}` },
                { accountCode: fromGl, debit: 0, credit: amountDec.toNumber(), description: `Outbound HQ Transfer from ${fromTreasury.branch.name}` }
            ]
        }, tx);
    });

    return {
        success: true,
        message: `Successfully transferred ${amount} from ${fromTreasury.branch.name} to ${toTreasury.branch.name}`
    };
}, { permission: PERMISSIONS.TREASURY_MANAGE });

/**
 * Get Inter-HQ Transfer History
 * Shows all fund movements between HQ centers
 */
export const getInterHQTransfers = secureAction(async (filters?: {
    startDate?: Date;
    endDate?: Date;
    hqId?: string;
}) => {
    const where: Prisma.TransactionWhereInput = {
        type: { in: ['INTER_HQ_IN', 'INTER_HQ_OUT'] },
        deletedAt: null
    };

    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    if (filters?.hqId) {
        where.OR = [
            { treasuryId: filters.hqId },
            // Note: Using relatedTransactionId instead of relatedEntityId
            { relatedTransactionId: filters.hqId }
        ];
    }

    const transfers = await prisma.transaction.findMany({
        where,
        include: {
            treasury: {
                include: { branch: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    return {
        data: transfers.map(t => ({
            id: t.id,
            type: t.type,
            amount: Number(t.amount),
            description: t.description,
            paymentMethod: t.paymentMethod,
            fromHQ: t.type === 'INTER_HQ_OUT' ? t.treasury?.branch.name : 'External',
            toHQ: t.type === 'INTER_HQ_IN' ? t.treasury?.branch.name : 'External',
            createdAt: t.createdAt.toISOString(),
            notes: t.description?.includes('Notes:') ? t.description.split('Notes:')[1]?.trim() : null
        }))
    };
}, { permission: PERMISSIONS.TREASURY_VIEW, requireCSRF: false });
