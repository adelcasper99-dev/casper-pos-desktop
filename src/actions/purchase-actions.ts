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
export async function getPurchasesHistory(filters?: PurchaseFilters): Promise<{ success: boolean; purchases?: any[]; error?: string }> {
    try {
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
    } catch (error: any) {
        console.error('[getPurchasesHistory] Error:', error);
        return { success: false, purchases: [], error: error.message };
    }
}

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
}, { permission: PERMISSIONS.PURCHASING_VIEW, requireCSRF: false });

/**
 * Void a purchase (refund)
 */
export const voidPurchase = secureAction(async (data: { id: string; reason?: string; csrfToken?: string }) => {
    const { id, reason } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch original invoice
        const invoice = await tx.purchaseInvoice.findUnique({
            where: { id },
            include: {
                items: true,
                warehouse: { include: { branch: true } }
            }
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
                    performedById: currentUser.id === 'super-admin' ? null : currentUser.id
                }
            });
        }

        // 3. Supplier Balance Adjustment
        // We decrement the unpaid portion to zero it out. 
        // We DON'T block negative balance here (matches refundPurchase fix)
        const unpaid = new Decimal(invoice.totalAmount).minus(invoice.paidAmount);
        await tx.supplier.update({
            where: { id: invoice.supplierId },
            data: { balance: { decrement: unpaid } }
        });

        // 4. Treasury Reversal (if paid)
        if (Number(invoice.paidAmount) > 0) {
            // 🔍 Trace original treasury from payment transaction
            const originalPaymentTx = await tx.transaction.findFirst({
                where: {
                    type: 'OUT',
                    description: { contains: invoice.invoiceNumber || invoice.id.split('-')[0] },
                    treasuryId: { not: null }
                },
                orderBy: { createdAt: 'desc' }
            });

            // Find treasury matching original or default
            const treasury = originalPaymentTx
                ? await tx.treasury.findUnique({ where: { id: originalPaymentTx.treasuryId! } })
                : await tx.treasury.findFirst({
                    where: { branchId: invoice.warehouse?.branchId || currentUser.branchId || undefined, isDefault: true }
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
    revalidatePath("/reports");
    revalidatePath("/purchasing");

    return {
        success: true,
        message: "Purchase voided successfully",
        data: result
    };
}, { permission: PERMISSIONS.INVENTORY_MANAGE });

/**
 * Partial Purchase Return — return specific items from a purchase invoice
 */
export const partialReturnPurchase = secureAction(async (data: {
    purchaseId: string;
    items: { itemId: string; quantity: number }[];
    reason?: string;
    csrfToken?: string;
}) => {
    const { purchaseId, items: returnItems, reason } = data;

    if (!returnItems || returnItems.length === 0) {
        throw new Error("يجب اختيار صنف واحد على الأقل للإرجاع");
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch original invoice with items
        const invoice = await tx.purchaseInvoice.findUnique({
            where: { id: purchaseId },
            include: { items: { include: { product: true } } }
        });

        if (!invoice) throw new Error("الفاتورة غير موجودة");
        if (invoice.status === 'VOIDED') throw new Error("هذه الفاتورة ملغاة بالفعل");

        // 2. Validate return quantities
        let returnTotal = 0;
        const processedItems: { item: any; returnQty: number; lineCost: number }[] = [];

        for (const returnItem of returnItems) {
            const originalItem = invoice.items.find(i => i.id === returnItem.itemId);
            if (!originalItem) throw new Error(`الصنف غير موجود في الفاتورة`);

            const alreadyReturned = (originalItem as any).returnedQty || 0;
            const availableQty = originalItem.quantity - alreadyReturned;

            if (returnItem.quantity <= 0) throw new Error(`الكمية يجب أن تكون أكبر من صفر`);
            if (returnItem.quantity > availableQty) {
                throw new Error(`الكمية المتبقية للإرجاع هي (${availableQty}). لا يمكن إرجاع (${returnItem.quantity}) من "${originalItem.product.name}"`);
            }

            const lineCost = Number(originalItem.unitCost) * returnItem.quantity;
            returnTotal += lineCost;
            processedItems.push({ item: originalItem, returnQty: returnItem.quantity, lineCost });
        }

        // 3. Reverse inventory (decrement stock)
        for (const { item, returnQty } of processedItems) {
            await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: returnQty } }
            });

            await tx.stock.updateMany({
                where: { productId: item.productId, warehouseId: invoice.warehouseId },
                data: { quantity: { decrement: returnQty } }
            });

            await tx.stockMovement.create({
                data: {
                    type: 'RETURN',
                    productId: item.productId,
                    fromWarehouseId: invoice.warehouseId,
                    toWarehouseId: null,
                    quantity: returnQty,
                    reason: `مرتجع مشتريات جزئي — فاتورة #${invoice.invoiceNumber || invoice.id.split('-')[0]}`,
                    performedById: currentUser.id === 'super-admin' ? null : currentUser.id
                }
            });

            // Update returnedQty on PurchaseItem
            await tx.purchaseItem.update({
                where: { id: item.id },
                data: { returnedQty: { increment: returnQty } } as any
            });
        }

        // 4. Supplier Balance Adjustment
        // Note: For purchases, we deduct the returned amount from the total and paid amounts
        // If the invoice was unpaid, we reduce the balance we owe.
        // If it was paid, we technically get credit or cash back, but here we'll simplify 
        // by reducing the debt or recording a reversal transaction if it was cash.

        const unpaidBefore = new Decimal(invoice.totalAmount).minus(invoice.paidAmount);
        const returnAmountDecimal = new Decimal(returnTotal);

        let debtReduction = 0;
        let cashReversal = 0;

        if (unpaidBefore.gte(returnAmountDecimal)) {
            // All return amount can be deducted from the debt
            debtReduction = returnTotal;
        } else {
            // Return amount is more than debt, some cash/credit is needed
            debtReduction = unpaidBefore.toNumber();
            cashReversal = returnAmountDecimal.minus(unpaidBefore).toNumber();
        }

        if (debtReduction > 0) {
            await tx.supplier.update({
                where: { id: invoice.supplierId },
                data: { balance: { decrement: debtReduction } }
            });
        }

        // 5. Treasury Reversal (if cash back needed)
        if (cashReversal > 0) {
            // 🔍 Trace original treasury from payment transaction
            const originalPaymentTx = await tx.transaction.findFirst({
                where: {
                    type: 'OUT',
                    description: { contains: invoice.invoiceNumber || invoice.id.split('-')[0] },
                    treasuryId: { not: null }
                },
                orderBy: { createdAt: 'desc' }
            });

            const treasury = originalPaymentTx
                ? await tx.treasury.findUnique({ where: { id: originalPaymentTx.treasuryId! } })
                : await tx.treasury.findFirst({
                    where: { branchId: currentUser.branchId || undefined, isDefault: true }
                }) || await tx.treasury.findFirst({ where: { isDefault: true } });

            if (treasury) {
                await tx.transaction.create({
                    data: {
                        type: 'IN', // Money coming back from supplier
                        amount: new Decimal(cashReversal),
                        description: `مرتجع مشتريات (استرداد نقدي) — فاتورة #${invoice.invoiceNumber || invoice.id.split('-')[0]}`,
                        paymentMethod: invoice.paymentMethod,
                        treasuryId: treasury.id
                    }
                });

                await tx.treasury.update({
                    where: { id: treasury.id },
                    data: { balance: { increment: cashReversal } }
                });
            }
        }

        // 6. Update Invoice Status and Totals
        const allItemsAfter = await tx.purchaseItem.findMany({ where: { purchaseInvoiceId: purchaseId } });
        const allReturned = allItemsAfter.every(i => (i as any).returnedQty === i.quantity);

        const newTotalAmount = Number(invoice.totalAmount) - returnTotal;
        const newPaidAmount = Math.max(0, Number(invoice.paidAmount) - cashReversal);

        await tx.purchaseInvoice.update({
            where: { id: purchaseId },
            data: {
                status: allReturned ? 'VOIDED' : 'PARTIAL_RETURN',
                totalAmount: newTotalAmount,
                paidAmount: newPaidAmount,
                voidReason: reason || 'مرتجع جزئي'
            } as any
        });

        // 7. Accounting Reversal
        await AccountingEngine.recordTransaction({
            description: `Partial Purchase Return: ${invoice.invoiceNumber || invoice.id.split('-')[0]}`,
            reference: invoice.id,
            purchaseId: invoice.id,
            lines: [
                { accountCode: '2000', debit: Number(returnTotal), credit: 0, description: 'AP Reduced (Purchase Return)' },
                { accountCode: '1200', debit: 0, credit: Number(returnTotal), description: 'Inventory Asset Reduced' }
            ]
        }, tx);

        // 8. Audit Log
        await tx.auditLog.create({
            data: {
                entityType: 'PURCHASE',
                entityId: purchaseId,
                action: 'PARTIAL_RETURN',
                previousData: JSON.stringify({ status: invoice.status, total: Number(invoice.totalAmount) }),
                newData: JSON.stringify({ returnedItems: processedItems.map(p => ({ name: p.item.product.name, qty: p.returnQty, amount: p.lineCost })), returnTotal, newTotalAmount }),
                reason: reason || 'مرتجع جزئي',
                user: currentUser.id === 'super-admin' ? 'super-admin' : (currentUser.username || currentUser.name),
                branchId: currentUser.branchId
            }
        });

        return {
            returnTotal,
            allReturned,
            itemCount: processedItems.length,
            newTotalAmount
        };
    });

    revalidatePath("/inventory");
    revalidatePath("/logs");
    revalidatePath("/reports");
    revalidatePath("/purchasing");

    return {
        success: true,
        message: `تم إرجاع ${result.itemCount} صنف بمبلغ ${result.returnTotal.toFixed(2)}`,
        returnedAmount: result.returnTotal,
        allReturned: result.allReturned,
        newTotal: result.newTotalAmount
    };
}, { permission: PERMISSIONS.INVENTORY_MANAGE });
