"use server";

/**
 * AUDIT TRAIL POLICY: This file performs sensitive financial/inventory operations.
 * All mutations MUST be accompanied by an AuditLog entry.
 * AuditLog is APPEND-ONLY and must not be deleted or modified.
 */

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
    page?: number;
    pageSize?: number;
}

/**
 * Fetch sales history with filtering and pagination
 */
export async function getSalesHistory(filters?: SalesHistoryFilters): Promise<{
    success: boolean;
    sales?: any[];
    error?: string;
    total?: number;
    page?: number;
    pageSize?: number;
}> {
    try {
        const { startDate, endDate, customerId, paymentMethod, status } = filters || {};

        const where: any = {};

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        if (customerId) where.customerId = customerId;
        if (paymentMethod) where.paymentMethod = paymentMethod;
        if (status) where.status = status;

        const page = filters?.page || 1;
        const pageSize = filters?.pageSize || 50;

        const [sales, total] = await Promise.all([
            prisma.sale.findMany({
                where,
                include: {
                    customer: { select: { name: true } },
                    items: {
                        include: {
                            product: { select: { name: true, sku: true } }
                        }
                    },
                    user: { select: { name: true, username: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize
            }),
            prisma.sale.count({ where })
        ]);

        return {
            success: true,
            total,
            page,
            pageSize,
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
    } catch (error: any) {
        console.error('[getSalesHistory] Error:', error);
        return { success: false, sales: [], error: error.message };
    }
}


/**
 * Refund a sale (Ported Logic)
 */
export const refundSale = secureAction(async (data: {
    saleId: string;
    reason?: string;
    csrfToken?: string;
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
        const sale = await (tx.sale.findUnique as any)({
            where: { id: saleId },
            include: {
                items: {
                    include: {
                        product: { select: { id: true, isBundle: true } }
                    }
                },
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
            const isBundle = (item as any).product?.isBundle;

            if (isBundle) {
                // BUNDLE: restore each component's stock
                const components = await (tx as any).bundleItem.findMany({
                    where: { bundleProductId: item.productId },
                    include: {
                        componentProduct: { select: { id: true, trackStock: true } }
                    }
                });
                for (const comp of components) {
                    if (!comp.componentProduct.trackStock) continue;
                    const restoreQty = item.quantity * comp.quantityIncluded;
                    await tx.product.update({
                        where: { id: comp.componentProductId },
                        data: { stock: { increment: restoreQty } }
                    });
                    await tx.stock.updateMany({
                        where: { productId: comp.componentProductId, warehouseId: sale.warehouseId },
                        data: { quantity: { increment: restoreQty } }
                    });
                    await tx.stockMovement.create({
                        data: {
                            type: 'REFUND',
                            productId: comp.componentProductId,
                            toWarehouseId: sale.warehouseId,
                            quantity: restoreQty,
                            reason: `Bundle Refund: Sale #${sale.id.split('-')[0]} — component of bundle ${item.productId.slice(0, 8)}`,
                            performedById: currentUser.id
                        }
                    });
                }
            } else {
                // REGULAR product
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

/**
 * Partial Refund — refund specific items from a sale
 */
export const partialRefundSale = secureAction(async (data: {
    saleId: string;
    items: { itemId: string; quantity: number }[];
    reason?: string;
    csrfToken?: string;
}) => {
    const { saleId, items: refundItems, reason } = data;

    if (!refundItems || refundItems.length === 0) {
        throw new Error("يجب اختيار صنف واحد على الأقل للإرجاع");
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error("لا يوجد وردية مفتوحة. يرجى فتح وردية أولاً");
    }
    const currentShift = shiftResult.shift;

    const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch original sale with items
        const sale = await (tx.sale.findUnique as any)({
            where: { id: saleId },
            include: {
                items: {
                    include: {
                        product: { select: { id: true, name: true, isBundle: true } }
                    }
                }
            }
        });

        if (!sale) throw new Error("الفاتورة غير موجودة");
        if (sale.status === 'REFUNDED') throw new Error("تم إرجاع هذه الفاتورة بالكامل مسبقاً");

        // 2. Validate refund quantities against original items
        let refundTotal = 0;
        const processedItems: { item: any; refundQty: number; lineTotal: number }[] = [];

        for (const refundItem of refundItems) {
            const originalItem = (sale.items as any[]).find((i: any) => i.id === refundItem.itemId);
            if (!originalItem) throw new Error(`الصنف غير موجود في الفاتورة`);

            // V-07 fix: Check against available quantity (original - already refunded)
            const alreadyRefunded = (originalItem as any).refundedQty || 0;
            const availableQty = (originalItem as any).quantity - alreadyRefunded;

            if (refundItem.quantity <= 0) throw new Error(`الكمية يجب أن تكون أكبر من صفر`);
            if (refundItem.quantity > availableQty) {
                throw new Error(`الكمية المتبقية للإرجاع هي (${availableQty}). لا يمكن إرجاع (${refundItem.quantity}) من "${originalItem.product.name}"`);
            }

            const lineTotal = Number(originalItem.unitPrice) * refundItem.quantity;
            refundTotal += lineTotal;
            processedItems.push({ item: originalItem, refundQty: refundItem.quantity, lineTotal });
        }

        // 3. Find treasury
        const treasury = await tx.treasury.findFirst({
            where: { branchId: currentUser.branchId || undefined, paymentMethod: sale.paymentMethod, isDefault: true } as any
        }) || await tx.treasury.findFirst({ where: { isDefault: true } });

        // 4. Create refund transaction
        await tx.transaction.create({
            data: {
                type: 'REFUND',
                amount: new Decimal(-refundTotal),
                paymentMethod: sale.paymentMethod,
                description: `مرتجع جزئي للفاتورة #${sale.id.split('-')[0].toUpperCase()} — ${processedItems.map(p => `${p.item.product.name} x${p.refundQty}`).join('، ')}${reason ? ` (${reason})` : ''}`,
                shiftId: currentShift.id,
                treasuryId: treasury?.id || null
            }
        });

        // 5. Update treasury balance
        if (treasury && sale.paymentMethod !== 'ACCOUNT' && sale.paymentMethod !== 'DEFERRED') {
            await tx.treasury.update({
                where: { id: treasury.id },
                data: { balance: { decrement: refundTotal } }
            });
        }

        // 6. Reverse stock for returned items
        for (const { item, refundQty } of processedItems) {
            const isBundle = (item as any).product?.isBundle;

            if (isBundle) {
                // BUNDLE: restore each component's stock proportionally
                const components = await (tx as any).bundleItem.findMany({
                    where: { bundleProductId: item.productId },
                    include: { componentProduct: { select: { id: true, trackStock: true } } }
                });
                for (const comp of components) {
                    if (!comp.componentProduct.trackStock) continue;
                    const restoreQty = refundQty * comp.quantityIncluded;
                    await tx.product.update({
                        where: { id: comp.componentProductId },
                        data: { stock: { increment: restoreQty } }
                    });
                    await tx.stock.updateMany({
                        where: { productId: comp.componentProductId, warehouseId: sale.warehouseId },
                        data: { quantity: { increment: restoreQty } }
                    });
                    await tx.stockMovement.create({
                        data: {
                            type: 'REFUND',
                            productId: comp.componentProductId,
                            toWarehouseId: sale.warehouseId,
                            quantity: restoreQty,
                            reason: `مرتجع جزئي (باقة) — فاتورة #${sale.id.split('-')[0]}`,
                            performedById: currentUser.id
                        }
                    });
                }
            } else {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { increment: refundQty } }
                });
                await tx.stock.updateMany({
                    where: { productId: item.productId, warehouseId: sale.warehouseId },
                    data: { quantity: { increment: refundQty } }
                });
                await tx.stockMovement.create({
                    data: {
                        type: 'REFUND',
                        productId: item.productId,
                        toWarehouseId: sale.warehouseId,
                        quantity: refundQty,
                        reason: `مرتجع جزئي — فاتورة #${sale.id.split('-')[0]}`,
                        performedById: currentUser.id
                    }
                });
            }
        }

        // 6b. V-07: Update SaleItem refundedQty — do NOT delete or decrement original quantity
        for (const { item, refundQty } of processedItems) {
            await tx.saleItem.update({
                where: { id: (item as any).id },
                data: { refundedQty: { increment: refundQty } } as any
            });
        }

        // 6c. Recalculate sale totals based on (original quantity - total refunded)
        const allItemsAfter = await tx.saleItem.findMany({ where: { saleId } });
        const newSubTotal = allItemsAfter.reduce(
            (sum, i) => sum + Number(i.unitPrice) * (i.quantity - ((i as any).refundedQty || 0)),
            0
        );
        // Keep the same tax rate
        const originalSubTotal = Number(sale.subTotal);
        const taxAmount = originalSubTotal > 0
            ? (Number(sale.taxAmount) / originalSubTotal) * newSubTotal
            : 0;
        const newTotal = newSubTotal + taxAmount;

        // 7. Determine status based on cumulative refunds
        const allReturned = allItemsAfter.every(i => (i as any).refundedQty === i.quantity);

        await tx.sale.update({
            where: { id: saleId },
            data: {
                status: allReturned ? 'REFUNDED' : 'PARTIAL_REFUND',
                subTotal: newSubTotal,
                taxAmount: taxAmount,
                totalAmount: newTotal,
                refundReason: reason || 'مرتجع جزئي'
            } as any
        });

        // 7.5 Record Accounting Journal Entry for the Refund
        const isDeferred = sale.paymentMethod === 'DEFERRED' || sale.paymentMethod === 'ACCOUNT';
        await AccountingEngine.recordTransaction({
            description: `Partial Refund: Sale #${saleId.split('-')[0]}`,
            reference: saleId,
            saleId: saleId,
            lines: [
                { accountCode: '4000', debit: Number(refundTotal), credit: 0, description: 'Sales Revenue Reversed (Partial)' },
                {
                    accountCode: isDeferred ? '1200' : '1000',
                    debit: 0,
                    credit: Number(refundTotal),
                    description: isDeferred ? 'AR Reduced' : 'Cash Refunded'
                }
            ]
        }, tx);

        // 8. Audit log
        await tx.auditLog.create({
            data: {
                entityType: 'SALE',
                entityId: saleId,
                action: 'PARTIAL_REFUND',
                previousData: JSON.stringify({ status: sale.status, total: Number(sale.totalAmount) }),
                newData: JSON.stringify({ refundedItems: processedItems.map(p => ({ name: p.item.product.name, qty: p.refundQty, amount: p.lineTotal })), refundTotal, newTotal }),
                reason: reason || 'مرتجع جزئي',
                user: currentUser.username || currentUser.name,
                branchId: currentUser.branchId
            }
        });

        return {
            refundTotal,
            allReturned,
            itemCount: processedItems.length,
            newTotal,
            updatedItems: allItemsAfter.map(i => ({
                id: i.id,
                quantity: i.quantity,
                refundedQty: (i as any).refundedQty,
                unitPrice: Number(i.unitPrice),
            }))
        };

    });

    revalidatePath("/pos");
    revalidatePath("/logs");
    revalidatePath("/reports");

    return {
        success: true,
        message: `تم إرجاع ${result.itemCount} صنف بمبلغ ${result.refundTotal.toFixed(2)}`,
        refundedAmount: result.refundTotal,
        allReturned: result.allReturned,
        newTotal: result.newTotal,
        updatedItems: result.updatedItems,
    };
}, { permission: PERMISSIONS.POS_ACCESS });
