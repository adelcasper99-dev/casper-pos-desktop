'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { secureAction } from '@/lib/safe-action';
import { PERMISSIONS } from '@/lib/permissions';
import { z } from 'zod';
import { getTranslations } from "@/lib/i18n-mock";

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

    // Verify source treasury has sufficient balance
    if (Number(fromTreasury.balance) < amount) {
        throw new Error(t('insufficientFunds', { available: Number(fromTreasury.balance), required: amount }));
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
            data: { balance: { decrement: amount } }
        });

        // Add to destination treasury
        await tx.treasury.update({
            where: { id: toTreasuryId },
            data: { balance: { increment: amount } }
        });

        // Create outgoing transaction
        const outgoingTx = await tx.transaction.create({
            data: {
                type: 'INTER_HQ_OUT',
                amount,
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
                amount,
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
                    fromBalance: Number(fromTreasury.balance),
                    toBalance: Number(toTreasury.balance)
                }),
                newData: JSON.stringify({
                    fromBalance: Number(fromTreasury.balance) - amount,
                    toBalance: Number(toTreasury.balance) + amount,
                    amount,
                    paymentMethod
                }),
                reason: description,
                branchId: fromTreasury.branchId,
                hqId: toTreasury.branchId,
                user: user?.username || user?.name || 'system'
            }
        });
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
