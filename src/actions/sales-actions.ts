"use server";

import { prisma } from '@/lib/prisma';
import { secureAction } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingEngine } from '@/lib/accounting/transaction-factory';
import { getCurrentUser } from './auth';
import { getCurrentShiftInternal } from './shift-management-actions';
import { PERMISSIONS } from '@/lib/permissions';

interface SalesHistoryFilters {
    startDate?: string;
    endDate?: string;
    customerId?: string;
    paymentMethod?: string;
    status?: string;
}

/**
 * Fetch sales history with filtering and pagination
 */
export const getSalesHistory = secureAction(async (filters?: SalesHistoryFilters) => {
    const { startDate, endDate, customerId, paymentMethod, status } = filters || {};

    const where: any = {
        deletedAt: null, // If adding soft delete later
    };

    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (customerId) where.customerId = customerId;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (status) where.status = status;

    const sales = await prisma.sale.findMany({
        where,
        include: {
            customer: {
                select: { name: true }
            },
            items: {
                include: {
                    product: {
                        select: { name: true, sku: true }
                    }
                }
            },
            user: {
                select: { name: true, username: true }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return {
        success: true,
        sales: sales.map(s => ({
            ...s,
            totalAmount: Number(s.totalAmount),
            taxAmount: Number(s.taxAmount),
            subTotal: Number(s.subTotal),
            items: s.items.map(i => ({
                ...i,
                unitPrice: Number(i.unitPrice),
                unitCost: Number(i.unitCost)
            }))
        }))
    };
}, { permission: PERMISSIONS.POS_ACCESS });

/**
 * Refund a sale (Ported Logic)
 */
export const refundSale = secureAction(async (data: {
    saleId: string;
    reason?: string;
}) => {
    const { saleId, reason } = data;
    const currentUser = await getCurrentUser();

    if (!currentUser) {
        throw new Error("Authentication required");
    }

    // Get current shift for the refund transaction
    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error("Cannot process refund: No active shift. Please open a shift first.");
    }
    const currentShift = shiftResult.shift;

    // Execute atomic refund transaction
    const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch original sale
        const sale = await tx.sale.findUnique({
            where: { id: saleId },
            include: {
                items: true,
                payments: true
            }
        });

        if (!sale) throw new Error("Sale not found");
        if (sale.status === 'REFUNDED') throw new Error("This sale has already been refunded");

        // 🏦 Find appropriate treasury based on the sale's payment method
        const treasury = await tx.treasury.findFirst({
            where: {
                branchId: currentUser.branchId || undefined,
                paymentMethod: sale.paymentMethod,
                isDefault: true
            } as any
        }) || await tx.treasury.findFirst({
            where: { isDefault: true }
        });

        // 2. Create negative Transaction in CURRENT shift
        await tx.transaction.create({
            data: {
                type: 'REFUND',
                amount: new Decimal(sale.totalAmount).negated(),
                paymentMethod: sale.paymentMethod,
                description: `Refund for Sale #${sale.id.split('-')[0].toUpperCase()}${reason ? ` - ${reason}` : ''}`,
                shiftId: currentShift.id,
                treasuryId: treasury?.id || null
            }
        });

        // 🏦 Update Treasury Balance
        if (treasury && sale.paymentMethod !== 'ACCOUNT' && sale.paymentMethod !== 'DEFERRED') {
            await tx.treasury.update({
                where: { id: treasury.id },
                data: { balance: { decrement: sale.totalAmount } }
            });
        }

        // 3. Handle Customer Account Reversal (If customer sale on credit)
        if (sale.customerId && (sale.paymentMethod === 'ACCOUNT' || sale.paymentMethod === 'DEFERRED')) {
            await tx.customerTransaction.create({
                data: {
                    customerId: sale.customerId,
                    type: 'CREDIT',
                    amount: new Decimal(sale.totalAmount).negated(),
                    description: `Refund for Sale #${sale.id.split('-')[0]}`,
                    reference: sale.id,
                    createdBy: currentUser.id
                }
            });

            await tx.customer.update({
                where: { id: sale.customerId },
                data: { balance: { decrement: sale.totalAmount } }
            });
        }

        // 4. Reverse inventory
        for (const item of sale.items) {
            await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } }
            });

            await tx.stock.updateMany({
                where: { productId: item.productId, warehouseId: sale.warehouseId },
                data: { quantity: { increment: item.quantity } }
            });

            await tx.stockMovement.create({
                data: {
                    type: 'REFUND',
                    productId: item.productId,
                    toWarehouseId: sale.warehouseId,
                    quantity: item.quantity,
                    reason: `Refund: Sale #${sale.id.split('-')[0]}`,
                    performedById: currentUser.id
                }
            });
        }

        // 5. Update sale status
        const refundedSale = await tx.sale.update({
            where: { id: saleId },
            data: {
                status: 'REFUNDED',
                refundReason: reason || 'Customer refund'
            }
        });

        // 6. Audit Log
        await tx.auditLog.create({
            data: {
                entityType: 'SALE',
                entityId: saleId,
                action: 'REFUND',
                previousData: JSON.stringify({ status: sale.status, total: Number(sale.totalAmount) }),
                newData: JSON.stringify({ status: 'REFUNDED', reason }),
                reason: reason || 'Customer refund',
                user: currentUser.username || currentUser.name,
                branchId: currentUser.branchId
            }
        });

        // 7. Reversing Journal Entry
        const isDeferred = sale.paymentMethod === 'DEFERRED' || sale.paymentMethod === 'ACCOUNT';
        await AccountingEngine.recordTransaction({
            description: `Refund: Sale #${saleId.split('-')[0]}`,
            reference: saleId,
            saleId: saleId,
            lines: [
                { accountCode: '4000', debit: Number(sale.totalAmount), credit: 0, description: 'Sales Revenue Reversed' },
                {
                    accountCode: isDeferred ? '1200' : '1000',
                    debit: 0,
                    credit: Number(sale.totalAmount),
                    description: isDeferred ? 'AR Reversed' : 'Cash Refunded'
                }
            ]
        }, tx);

        // 8. Update shift refund tracking
        await tx.shift.update({
            where: { id: currentShift.id },
            data: { totalRefunds: { increment: sale.totalAmount } }
        });

        return {
            sale: refundedSale,
            refundedAmount: Number(sale.totalAmount)
        };
    });

    revalidatePath("/pos");
    revalidatePath("/logs");
    revalidatePath("/reports");

    return {
        success: true,
        message: "Sale refunded successfully",
        refundedAmount: result.refundedAmount
    };
}, { permission: PERMISSIONS.POS_ACCESS });
