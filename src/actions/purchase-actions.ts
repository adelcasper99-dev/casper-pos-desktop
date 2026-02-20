"use server";

import { prisma } from '@/lib/prisma';
import { secureAction } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingEngine } from '@/lib/accounting/transaction-factory';
import { getCurrentUser } from './auth';
import { PERMISSIONS } from '@/lib/permissions';

interface PurchaseFilters {
    startDate?: string;
    endDate?: string;
    supplierId?: string;
    status?: string;
}

/**
 * Fetch purchase history
 */
export const getPurchasesHistory = secureAction(async (filters?: PurchaseFilters) => {
    const { startDate, endDate, supplierId, status } = filters || {};

    const where: any = {};

    if (startDate || endDate) {
        where.purchaseDate = {};
        if (startDate) where.purchaseDate.gte = new Date(startDate);
        if (endDate) where.purchaseDate.lte = new Date(endDate);
    }

    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;

    const purchases = await prisma.purchaseInvoice.findMany({
        where,
        include: {
            supplier: {
                select: { name: true }
            },
            warehouse: {
                select: { name: true, branch: { select: { name: true } } }
            },
            items: {
                include: {
                    product: {
                        select: { name: true, sku: true }
                    }
                }
            }
        },
        orderBy: {
            purchaseDate: 'desc'
        }
    });

    return {
        success: true,
        purchases: purchases.map(p => ({
            ...p,
            totalAmount: Number(p.totalAmount),
            paidAmount: Number(p.paidAmount),
            deliveryCharge: Number(p.deliveryCharge),
            items: p.items.map(i => ({
                ...i,
                unitCost: Number(i.unitCost)
            }))
        }))
    };
}, { permission: PERMISSIONS.PURCHASING_VIEW });

/**
 * Fetch a single purchase for editing
 */
export const getPurchase = secureAction(async (id: string) => {
    const purchase = await prisma.purchaseInvoice.findUnique({
        where: { id },
        include: {
            items: {
                include: {
                    product: true
                }
            }
        }
    });

    if (!purchase) return { success: false, error: "Purchase not found" };

    return {
        success: true,
        data: {
            ...purchase,
            totalAmount: Number(purchase.totalAmount),
            paidAmount: Number(purchase.paidAmount),
            deliveryCharge: Number(purchase.deliveryCharge),
            items: purchase.items.map(i => ({
                ...i,
                unitCost: Number(i.unitCost)
            }))
        }
    };
}, { permission: PERMISSIONS.PURCHASING_VIEW });

/**
 * Void a purchase (refund)
 */
export const voidPurchase = secureAction(async (id: string, reason?: string) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch original invoice
        const invoice = await tx.purchaseInvoice.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!invoice) throw new Error("Invoice not found");
        if (invoice.status === 'VOIDED') throw new Error("Already voided");

        // 2. Reverse Inventory
        for (const item of invoice.items) {
            await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: item.quantity } }
            });

            await tx.stock.updateMany({
                where: { productId: item.productId, warehouseId: invoice.warehouseId },
                data: { quantity: { decrement: item.quantity } }
            });

            await tx.stockMovement.create({
                data: {
                    type: 'RETURN',
                    productId: item.productId,
                    fromWarehouseId: invoice.warehouseId,
                    toWarehouseId: null,
                    quantity: item.quantity,
                    reason: `Void: Purchase Invoice #${invoice.invoiceNumber || invoice.id.split('-')[0]}`,
                    performedById: currentUser.id
                }
            });
        }

        // 3. Supplier Balance Adjustment
        const unpaid = new Decimal(invoice.totalAmount).minus(invoice.paidAmount);
        await tx.supplier.update({
            where: { id: invoice.supplierId },
            data: { balance: { decrement: unpaid } }
        });

        // 4. Treasury Reversal (if paid)
        if (Number(invoice.paidAmount) > 0) {
            // Find default treasury for the branch
            const treasury = await tx.treasury.findFirst({
                where: { branchId: currentUser.branchId || undefined, isDefault: true }
            }) || await tx.treasury.findFirst({ where: { isDefault: true } });

            if (treasury) {
                await tx.transaction.create({
                    data: {
                        type: 'IN', // Reversal of OUT
                        amount: invoice.paidAmount,
                        description: `Void Purchase #${invoice.invoiceNumber || invoice.id.split('-')[0]} - Cash In`,
                        paymentMethod: invoice.paymentMethod,
                        treasuryId: treasury.id
                    }
                });

                await tx.treasury.update({
                    where: { id: treasury.id },
                    data: { balance: { increment: invoice.paidAmount } }
                });
            }
        }

        // 5. Update Status
        const voidedInvoice = await tx.purchaseInvoice.update({
            where: { id },
            data: {
                status: 'VOIDED',
                voidReason: reason || 'Purchase Return',
                voidedAt: new Date(),
                voidedBy: currentUser.id
            }
        });

        // 6. Accounting Reversal
        await AccountingEngine.recordTransaction({
            description: `Void Purchase: ${invoice.invoiceNumber || invoice.id.split('-')[0]}`,
            reference: invoice.id,
            purchaseId: invoice.id,
            lines: [
                { accountCode: '2000', debit: Number(invoice.totalAmount), credit: 0, description: 'AP Reversed' },
                { accountCode: '1200', debit: 0, credit: Number(invoice.totalAmount), description: 'Inventory Asset Reversed' }
            ]
        }, tx);

        return voidedInvoice;
    });

    revalidatePath("/inventory");
    revalidatePath("/logs");
    revalidatePath("/purchasing");

    return {
        success: true,
        message: "Purchase voided successfully",
        data: result
    };
}, { permission: PERMISSIONS.INVENTORY_MANAGE });
