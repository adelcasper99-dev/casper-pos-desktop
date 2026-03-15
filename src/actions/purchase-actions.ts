"use server";

import { prisma } from '@/lib/prisma';
import { secureAction } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingEngine } from '@/lib/accounting/transaction-factory';
import { getCurrentUser } from './auth';
import { getCurrentShiftInternal } from './shift-management-actions';
import { PERMISSIONS } from '@/lib/permissions';
import { calculateProratedRefundValue } from '@/utils/refund-calculations';

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
        if (invoice.status === 'RETURNED') throw new Error("Already returned");

        const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
        const currentShift = shiftResult.shift;

        // 🔍 Calculate exactly what remains to be returned
        const previousReturns = await (tx.purchaseInvoice as any).findMany({
            where: { parentId: id, isReturn: true }
        });

        const totalReturnedValue = (previousReturns as any[]).reduce((s, r) => s.plus(new Decimal(r.totalAmount).abs()), new Decimal(0));
        const totalReturnedPaid = (previousReturns as any[]).reduce((s, r) => s.plus(new Decimal(r.paidAmount).abs()), new Decimal(0));
        
        const remainingTotalAmount = Decimal.max(0, new Decimal(invoice.totalAmount).minus(totalReturnedValue));
        const remainingPaidAmount = Decimal.max(0, new Decimal(invoice.paidAmount).minus(totalReturnedPaid));

        if (remainingTotalAmount.lte(0)) {
            throw new Error("هذه الفاتورة تم إرجاعها بالكامل بالفعل عبر مستندات مرتجع جزئية");
        }

        // ─── Create NEW Return Invoice document ───
        const timestamp = new Date().getTime().toString().slice(-4);
        const returnInvoice = await tx.purchaseInvoice.create({
            data: {
                invoiceNumber: `RTN-${invoice.invoiceNumber || invoice.id.split('-')[0]}-${timestamp}`,
                supplierId: invoice.supplierId,
                warehouseId: invoice.warehouseId,
                totalAmount: remainingTotalAmount.negated(),
                paidAmount: new Decimal(0), // Full credit by default, unless handled below
                status: 'RETURN',
                paymentMethod: invoice.paymentMethod,
                // @ts-ignore
                isReturn: true,
                // @ts-ignore
                parentId: id,
                items: {
                    create: invoice.items.map((i: any) => {
                        // Check if this specific item has remaining qty
                        const alreadyReturnedQty = (previousReturns as any[]).reduce((sum, ret) => {
                            const matched = (ret.items || []).find((ii: any) => ii.productId === i.productId);
                            return sum + (matched?.quantity || 0);
                        }, 0);
                        const availableQty = Math.max(0, i.quantity - alreadyReturnedQty);
                        return {
                            productId: i.productId,
                            quantity: availableQty,
                            unitCost: i.unitCost
                        };
                    }).filter(i => i.quantity > 0)
                }
            }
        });

        // 2. Reverse Inventory (Restoring only the REMAINING items)
        for (const item of (returnInvoice as any).items) {
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
                    reason: `Void (Remaining): Purchase Invoice #${invoice.invoiceNumber || invoice.id.split('-')[0]}`,
                    performedById: currentUser.id === 'super-admin' ? null : currentUser.id
                }
            });
        }

        // 3. Supplier Balance Adjustment (Full return amount goes to balance/credit)
        await tx.supplier.update({
            where: { id: invoice.supplierId },
            data: { balance: { decrement: remainingTotalAmount } }
        });

        // 4. Treasury Reversal (Optional: we skip this to allow full credit as per user request, 
        // but if they specifically want cash back, they can record a separate treasury out.
        // For standard ERP Return, it's usually Full Credit Note.)
        /*
        if (remainingPaidAmount > 0) {
            // ... original treasury code ...
        }
        */

        // 5. Update Status and items
        await tx.purchaseInvoice.update({
            where: { id },
            data: {
                status: 'RETURNED',
                voidReason: reason || 'Purchase Return',
                voidedAt: new Date(),
                voidedBy: currentUser.id
            }
        });

        // 5.1 Increment returnedQty on all original items
        for (const item of invoice.items) {
            const alreadyReturnedQty = (previousReturns as any[]).reduce((sum, ret) => {
                const matched = (ret.items || []).find((ii: any) => ii.productId === item.productId);
                return sum + (matched?.quantity || 0);
            }, 0);
            const qtyToReturn = Math.max(0, item.quantity - alreadyReturnedQty);
            
            if (qtyToReturn > 0) {
                await tx.purchaseItem.update({
                    where: { id: item.id },
                    data: { returnedQty: { increment: qtyToReturn } }
                });
            }
        }

        // 6. Accounting Reversal (Remaining AP + Cash split)
        const unpaidAmount = new Decimal(remainingTotalAmount).minus(remainingPaidAmount);
        const accountingLines = [];
        
        if (unpaidAmount.gt(0)) {
            accountingLines.push({ accountCode: '2000', debit: unpaidAmount.toNumber(), credit: 0, description: 'AP Reversed (Void Remaining)' });
        }
        if (remainingPaidAmount.gt(0)) {
            accountingLines.push({ accountCode: '1000', debit: remainingPaidAmount.toNumber(), credit: 0, description: 'Cash Refund Received (Void Remaining)' });
        }
        accountingLines.push({ accountCode: '1200', debit: 0, credit: remainingTotalAmount.toNumber(), description: 'Inventory Asset Reversed (Void Remaining)' });

        await AccountingEngine.recordTransaction({
            description: `Return Invoice (Void): ${returnInvoice.invoiceNumber}`,
            reference: returnInvoice.id,
            purchaseId: returnInvoice.id,
            lines: accountingLines
        }, tx);

        return { ...returnInvoice, supplierId: invoice.supplierId };
    });

    revalidatePath("/inventory");
    revalidatePath("/logs");
    revalidatePath("/reports");
    revalidatePath("/purchasing");
    if (result.supplierId) {
        revalidatePath(`/inventory/suppliers/${result.supplierId}`);
    }

    return {
        success: true,
        message: "Purchase voided successfully",
        data: result
    };
}, { permission: PERMISSIONS.INVENTORY_MANAGE, requireCSRF: false });

export interface PartialPurchaseReturnResult {
    returnedAmount: number;
    returnId: string;
    allReturned: boolean;
    newTotal: number;
}

/**
 * Partial Purchase Return — return specific items from a purchase invoice
 */
export const partialReturnPurchase = secureAction(async (data: {
    purchaseId: string;
    items: { itemId: string; quantity: number }[];
    reason?: string;
    csrfToken?: string;
}): Promise<PartialPurchaseReturnResult> => {
    const { purchaseId, items: returnItems, reason } = data;

    if (!returnItems || returnItems.length === 0) {
        throw new Error("يجب اختيار صنف واحد على الأقل للإرجاع");
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const result = await prisma.$transaction(async (tx) => {
        const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
        const currentShift = shiftResult.shift;

        // 1. Fetch original invoice with items
        const invoice = await tx.purchaseInvoice.findUnique({
            where: { id: purchaseId },
            include: { items: { include: { product: true } } }
        });

        if (!invoice) throw new Error("الفاتورة غير موجودة");
        if (invoice.status === 'VOIDED') throw new Error("هذه الفاتورة ملغاة بالفعل");

        // 2. Validate return quantities (Aggregated check across all linked returns)
        const previousReturns = await (tx.purchaseInvoice as any).findMany({
            where: { parentId: purchaseId, isReturn: true },
            include: { items: true }
        });

        const totalReturnedValueSoFar = (previousReturns as any[]).reduce((s, r) => s.plus(new Decimal(r.totalAmount).abs()), new Decimal(0));
        const totalReturnedPaidSoFar = (previousReturns as any[]).reduce((s, r) => s.plus(new Decimal(r.paidAmount).abs()), new Decimal(0));

        let returnTotal = new Decimal(0);
        const processedItems: { productId: string; returnQty: number; unitCost: number; name: string }[] = [];

        for (const returnItem of returnItems) {
            const originalItem = invoice.items.find((i: any) => i.id === returnItem.itemId);
            if (!originalItem) throw new Error(`الصنف غير موجود في الفاتورة`);

            // Check how many have been returned in PREVIOUS separate return documents
            const alreadyReturned = (previousReturns as any[]).reduce((sum: number, ret: any) => {
                const matchedItem = (ret.items as any[]).find((i: any) => i.productId === originalItem.productId);
                return sum + (matchedItem?.quantity || 0);
            }, 0);

            const availableQty = originalItem.quantity - alreadyReturned;

            if (returnItem.quantity <= 0) throw new Error(`الكمية يجب أن تكون أكبر من صفر`);
            if (returnItem.quantity > availableQty) {
                throw new Error(`الكمية المتبقية للإرجاع هي (${availableQty}). لا يمكن إرجاع (${returnItem.quantity}) من "${originalItem.product.name}"`);
            }

            const lineCost = new Decimal(originalItem.unitCost).times(returnItem.quantity);
            returnTotal = returnTotal.plus(lineCost);
            processedItems.push({
                productId: originalItem.productId,
                returnQty: returnItem.quantity,
                unitCost: new Decimal(originalItem.unitCost).toNumber(),
                name: originalItem.product.name
            });

            // 2.1 Update original item returnedQty
            await tx.purchaseItem.update({
                where: { id: originalItem.id },
                data: { returnedQty: { increment: returnItem.quantity } }
            });
        }

        // 📊 Determine remaining debt and cash on the ORIGINAL invoice
        const currentUnpaidAmount = Decimal.max(0, new Decimal(invoice.totalAmount).minus(invoice.paidAmount).minus(totalReturnedValueSoFar.minus(totalReturnedPaidSoFar)));
        const currentPaidCashRemaining = Decimal.max(0, new Decimal(invoice.paidAmount).minus(totalReturnedPaidSoFar));

        // 🔀 Split the return between debt-reduction and cash-back
        const debtReduction = Decimal.min(returnTotal, currentUnpaidAmount);
        const cashReversal = returnTotal.minus(debtReduction);

        // 3. Create NEW Return Invoice
        const timestamp = new Date().getTime().toString().slice(-4);
        const returnInvoice = await tx.purchaseInvoice.create({
            data: {
                invoiceNumber: `RTN-${invoice.invoiceNumber || invoice.id.split('-')[0]}-${timestamp}`,
                supplierId: invoice.supplierId,
                warehouseId: invoice.warehouseId,
                totalAmount: returnTotal.negated(),
                paidAmount: new Decimal(0), // All go to balance/credit
                status: 'RETURN',
                paymentMethod: invoice.paymentMethod,
                // @ts-ignore
                isReturn: true,
                // @ts-ignore
                parentId: purchaseId,
                items: {
                    create: processedItems.map(p => ({
                        productId: p.productId,
                        quantity: p.returnQty,
                        unitCost: new Decimal(p.unitCost)
                    }))
                }
            }
        });

        // 4. Update Original Invoice Status (but keep totals)
        const allItemsOriginal = invoice.items;
        const totalPurchasedQty = allItemsOriginal.reduce((s: number, i: any) => s + i.quantity, 0);
        
        // Sum all returned quantities for ALL items in ALL related return invoices
        const totalReturnedQtySoFar = previousReturns.reduce((s: number, r: any) => s + r.items.reduce((ss: number, ii: any) => ss + ii.quantity, 0), 0) + 
                                     processedItems.reduce((s: number, p: any) => s + p.returnQty, 0);

        await tx.purchaseInvoice.update({
            where: { id: purchaseId },
            data: {
                status: totalReturnedQtySoFar >= totalPurchasedQty ? 'RETURNED' : 'PARTIAL_RETURN',
                voidReason: reason || 'مرتجع جزئي'
            }
        });

        // 5. Reverse inventory (decrement stock)
        for (const p of processedItems) {
            await tx.product.update({
                where: { id: p.productId },
                data: { stock: { decrement: p.returnQty } }
            });

            await tx.stock.updateMany({
                where: { productId: p.productId, warehouseId: invoice.warehouseId },
                data: { quantity: { decrement: p.returnQty } }
            });

            await tx.stockMovement.create({
                data: {
                    type: 'RETURN',
                    productId: p.productId,
                    fromWarehouseId: invoice.warehouseId,
                    toWarehouseId: null,
                    quantity: p.returnQty,
                    reason: `مرتجع مشتريات (مستند جديد) — فاتورة مرتجع #${returnInvoice.invoiceNumber}`,
                    performedById: currentUser.id === 'super-admin' ? null : currentUser.id
                }
            });
        }

        // 6. Supplier Balance Adjustment (Full amount goes to balance/credit)
        await tx.supplier.update({
            where: { id: invoice.supplierId },
            data: { balance: { decrement: returnTotal } }
        });

        /* Skipping Treasury Adjustment to keep full amount in Supplier Balance (Credit) */

        // 7. Accounting Entry for the Return Invoice
        const accountingLines = [];
        if (debtReduction.gt(0)) {
            accountingLines.push({ accountCode: '2000', debit: debtReduction.toNumber(), credit: 0, description: 'AP Reduced (Purchase Return)' });
        }
        if (cashReversal.gt(0)) {
            accountingLines.push({ accountCode: '1000', debit: cashReversal.toNumber(), credit: 0, description: 'Cash Refund Received' });
        }
        // Always credit inventory for the full return amount
        accountingLines.push({ accountCode: '1200', debit: 0, credit: returnTotal.toNumber(), description: 'Inventory Asset Reduced' });

        await AccountingEngine.recordTransaction({
            description: `Return Invoice: ${returnInvoice.invoiceNumber}`,
            reference: returnInvoice.id,
            purchaseId: returnInvoice.id,
            lines: accountingLines
        }, tx);

        // 8. Audit Log
        await tx.auditLog.create({
            data: {
                entityType: 'PURCHASE',
                entityId: returnInvoice.id,
                action: 'CREATE_RETURN',
                previousData: JSON.stringify({ originalId: purchaseId }),
                newData: JSON.stringify({ 
                    returnInvoiceId: returnInvoice.id,
                    items: processedItems,
                    total: returnTotal.toNumber()
                }),
                reason: reason || 'مرتجع مشتريات',
                user: currentUser.id === 'super-admin' ? 'super-admin' : (currentUser.username || currentUser.name),
                branchId: currentUser.branchId
            }
        });

        return {
            returnTotal: returnTotal.toNumber(),
            returnId: returnInvoice.id,
            itemCount: processedItems.length,
            invoiceNumber: returnInvoice.invoiceNumber,
            supplierId: invoice.supplierId,
            totalReturnedQtySoFar,
            totalPurchasedQty,
            newTotal: Number(invoice.totalAmount) // Keeping original total for reference or tracking
        };
    });

    revalidatePath("/inventory");
    revalidatePath("/logs");
    revalidatePath("/reports");
    revalidatePath("/purchasing");
    if (result.supplierId) {
        revalidatePath(`/inventory/suppliers/${result.supplierId}`);
    }

    return {
        returnedAmount: result.returnTotal,
        returnId: result.returnId,
        allReturned: result.totalReturnedQtySoFar >= result.totalPurchasedQty,
        newTotal: result.newTotal
    };
}, { permission: PERMISSIONS.INVENTORY_MANAGE });
