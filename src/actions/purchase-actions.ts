"use server";

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { secureAction } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { Decimal } from 'decimal.js';
import { AccountingEngine, TransactionLineInput } from '@/lib/accounting/transaction-factory';
import { getCurrentUser } from './auth';
import { getCurrentShiftInternal } from './shift-management-actions';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { calculateProratedRefundValue } from '@/utils/refund-calculations';
import { GL } from '@/shared/constants/accounting-mappings';
import { PurchaseInvoice } from '@/types/product';
import { toDecimal } from '@/lib/decimal-utils';

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
    try {
        const { startDate, endDate, supplierId, status } = filters || {};

        const where: Prisma.PurchaseInvoiceWhereInput = {};

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
                    select: { name: true, branch: { select: { name: true, code: true } } }
                },
                items: {
                    include: {
                        product: {
                            select: {
                                name: true,
                                sku: true,
                                modelId: true,
                                model: { select: { name: true } },
                                attributeId: true,
                                attribute: { select: { name: true } },
                                stocks: {
                                    select: { warehouseId: true, quantity: true }
                                }
                            }
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
                totalAmount: toDecimal(p.totalAmount).toFixed(2),
                paidAmount: toDecimal(p.paidAmount).toFixed(2),
                deliveryCharge: toDecimal(p.deliveryCharge).toFixed(2),
                items: p.items.map(i => ({
                    ...i,
                    unitCost: toDecimal(i.unitCost).toFixed(2)
                }))
            })) as PurchaseInvoice[]
        };
    } catch (error: unknown) {
        console.error('[getPurchasesHistory] Error:', error);
        return { success: false, purchases: [], error: error instanceof Error ? error.message : "Unknown error" };
    }
}, { permission: PERMISSIONS.PURCHASING_VIEW, requireCSRF: false });

/**
 * Fetch a single purchase for editing
 */
export const getPurchase = secureAction(async (id: string) => {
    const purchase = await prisma.purchaseInvoice.findUnique({
        where: { id },
        include: {
            items: {
                include: {
                    product: {
                        include: {
                            model: { select: { name: true } },
                            attribute: { select: { name: true } }
                        }
                    }
                }
            }
        }
    });

    if (!purchase) return { success: false, error: "Purchase not found" };

    return {
        success: true,
        data: {
            ...purchase,
            totalAmount: toDecimal(purchase.totalAmount).toFixed(2),
            paidAmount: toDecimal(purchase.paidAmount).toFixed(2),
            deliveryCharge: toDecimal(purchase.deliveryCharge).toFixed(2),
            items: purchase.items.map(i => ({
                ...i,
                unitCost: toDecimal(i.unitCost).toFixed(2)
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
        const previousReturns = await tx.purchaseInvoice.findMany({
            where: { parentId: id, isReturn: true },
            include: { items: true }
        });

        const totalReturnedValue = previousReturns.reduce((s, r) => s.plus(new Decimal(r.totalAmount.toString()).abs()), new Decimal(0));
        const totalReturnedPaid = previousReturns.reduce((s, r) => s.plus(new Decimal(r.paidAmount.toString()).abs()), new Decimal(0));
        
        const remainingTotalAmount = Decimal.max(0, new Decimal(invoice.totalAmount.toString()).minus(totalReturnedValue));
        const remainingPaidAmount = Decimal.max(0, new Decimal(invoice.paidAmount.toString()).minus(totalReturnedPaid));

        if (remainingTotalAmount.lte(0)) {
            throw new Error("هذه الفاتورة تم إرجاعها بالكامل بالفعل عبر مستندات مرتجع جزئية");
        }

        // 🔒 Pre-compute items to return, capped by actual warehouse stock
        const returnableItems: { productId: string; quantity: number; unitCost: string }[] = [];
        for (const i of invoice.items) {
            const alreadyReturnedQty = previousReturns.reduce((sum, ret) => {
                const matched = ret.items?.find((ii) => ii.productId === i.productId);
                return sum + Number(matched?.quantity || 0);
            }, 0);
            const invoiceRemaining = Math.max(0, Number(i.quantity) - alreadyReturnedQty);
            if (invoiceRemaining <= 0) continue;

            // Cap by actual stock in warehouse
            const stockRecord = await tx.stock.findFirst({
                where: { productId: i.productId, warehouseId: invoice.warehouseId }
            });
            const actualStock = stockRecord ? Number(stockRecord.quantity) : 0;
            const qtyToReturn = Math.min(invoiceRemaining, actualStock);
            if (qtyToReturn <= 0) continue;

            returnableItems.push({ productId: i.productId, quantity: qtyToReturn, unitCost: i.unitCost.toString() });
        }

        if (returnableItems.length === 0) {
            throw new Error("لا توجد كميات متاحة للإرجاع في المخزون — ربما تم بيع جميع القطع مسبقاً.");
        }

        // Compute actual total based on returnable items only
        const actualReturnAmount = returnableItems.reduce(
            (acc, item) => acc.plus(new Decimal(item.unitCost).times(item.quantity)),
            new Decimal(0)
        );

        // ─── Create NEW Return Invoice document ───
        const hexSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        const returnInvoice = await tx.purchaseInvoice.create({
            data: {
                invoiceNumber: `RTN-${invoice.invoiceNumber || invoice.id.split('-')[0]}-${hexSuffix}`,
                supplierId: invoice.supplierId,
                warehouseId: invoice.warehouseId,
                totalAmount: actualReturnAmount.negated(),
                paidAmount: new Decimal(0),
                status: 'RETURN',
                paymentMethod: invoice.paymentMethod,
                isReturn: true,
                parentId: id,
                branchId: invoice.branchId || currentUser.branchId || null,
                items: {
                    create: returnableItems.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        unitCost: new Decimal(item.unitCost)
                    }))
                }
            }
        });

        // 2. Reverse Inventory (only for items that are actually in stock)
        for (const item of returnableItems) {
            await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: item.quantity } }
            });

            await tx.stock.updateMany({
                where: { productId: item.productId, warehouseId: invoice.warehouseId },
                data: { quantity: { decrement: item.quantity } }
            });

            // Post-update stock underflow guard
            const postUpdate = await tx.stock.findFirst({
                where: { productId: item.productId, warehouseId: invoice.warehouseId }
            });
            if (postUpdate && Number(postUpdate.quantity) < 0) {
                throw new Error('مخزون سالب — تعذّر إكمال الإرجاع، راجع الكميات الحالية');
            }

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

        // 3. Supplier Balance Adjustment (based on actual returned amount)
        // Guard: Prevent silent negative supplier balance on void if not authorized
        const supplierForCheck = await tx.supplier.findUnique({
            where: { id: invoice.supplierId },
            select: { balance: true, name: true }
        });
        const currentBalance = new Decimal(supplierForCheck?.balance?.toString() || '0');
        const willGoNegative = currentBalance.lt(actualReturnAmount);

        if (willGoNegative) {
            const canGoNegative = hasPermission(
                currentUser?.permissions,
                PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE
            );
            if (!canGoNegative) {
                throw new Error(
                    `رصيد المورد الحالي (${currentBalance.toFixed(2)}) غير كافٍ لإتمام الإرجاع. ` +
                    `يُرجى مراجعة المدير أو تسوية الرصيد أولاً.`
                );
            }
        }

        await tx.supplier.update({
            where: { id: invoice.supplierId },
            data: { balance: { decrement: actualReturnAmount } }
        });

        // 4. Treasury Reversal skipped — amount stays as credit in supplier balance

        // 5. Update Status
        await tx.purchaseInvoice.update({
            where: { id },
            data: {
                status: 'RETURNED',
                voidReason: reason || 'Purchase Return',
                voidedAt: new Date(),
                voidedBy: currentUser.id
            }
        });

        // 5.1 Increment returnedQty on original items
        for (const item of returnableItems) {
            const originalItem = invoice.items.find((i) => i.productId === item.productId);
            if (originalItem) {
                await tx.purchaseItem.update({
                    where: { id: originalItem.id },
                    data: { returnedQty: { increment: item.quantity } }
                });
            }
        }

        // 6. Accounting Reversal
        const accountingLines: TransactionLineInput[] = [];
        accountingLines.push({ accountCode: GL.LIABILITIES.PAYABLES, debit: actualReturnAmount, credit: 0, description: 'AP Reduced (Purchase Return)' });
        accountingLines.push({ accountCode: GL.ASSETS.INVENTORY, debit: 0, credit: actualReturnAmount, description: 'Inventory Asset Reversed (Purchase Return)' });

        await AccountingEngine.recordTransaction({
            description: `Return Invoice (Void): ${returnInvoice.invoiceNumber}`,
            reference: returnInvoice.id,
            purchaseId: returnInvoice.id,
            branchId: returnInvoice.branchId ?? currentUser.branchId ?? undefined,
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
}, { permission: PERMISSIONS.INVENTORY_MANAGE, requireCSRF: true });

export interface PartialPurchaseReturnResult {
    returnedAmount: string;
    returnId: string;
    allReturned: boolean;
    newTotal: string;
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
        if (invoice.status === 'CANCELLED') throw new Error("هذه الفاتورة ملغاة ولا يمكن إرجاعها");
        if (invoice.status === 'RETURNED') throw new Error("هذه الفاتورة مُرجَّعة بالكامل بالفعل");

        // 2. Validate return quantities (Aggregated check across all linked returns)
        const previousReturns = await tx.purchaseInvoice.findMany({
            where: { parentId: purchaseId, isReturn: true },
            include: { items: true }
        });

        const totalReturnedValueSoFar = previousReturns.reduce((s, r) => s.plus(new Decimal(r.totalAmount.toString()).abs()), new Decimal(0));
        const totalReturnedPaidSoFar = previousReturns.reduce((s, r) => s.plus(new Decimal(r.paidAmount.toString()).abs()), new Decimal(0));

        let returnTotal = new Decimal(0);
        const processedItems: { productId: string; returnQty: number; unitCost: string; name: string }[] = [];

        for (const returnItem of returnItems) {
            const originalItem = invoice.items.find((i) => i.id === returnItem.itemId);
            if (!originalItem) throw new Error(`الصنف غير موجود في الفاتورة`);

            // Check how many have been returned in PREVIOUS separate return documents
            const alreadyReturned = previousReturns.reduce((sum: number, ret) => {
                const matchedItem = ret.items.find((i) => i.productId === originalItem.productId);
                return sum + Number(matchedItem?.quantity || 0);
            }, 0);

            const availableFromInvoice = Number(originalItem.quantity) - alreadyReturned;

            // 🔒 Check actual stock in warehouse — sold items cannot be returned to supplier
            const stockRecord = await tx.stock.findFirst({
                where: {
                    productId: originalItem.productId,
                    warehouseId: invoice.warehouseId
                }
            });
            const currentStock = stockRecord ? Number(stockRecord.quantity) : 0;
            const availableQty = Math.min(availableFromInvoice, currentStock);

            if (returnItem.quantity <= 0) throw new Error(`الكمية يجب أن تكون أكبر من صفر`);
            if (returnItem.quantity > availableQty) {
                if (currentStock < availableFromInvoice && returnItem.quantity > currentStock) {
                    throw new Error(
                        `لا يمكن إرجاع (${returnItem.quantity}) من "${originalItem.product.name}". ` +
                        `الموجود فعلاً في المخزون (${currentStock}) فقط — ` +
                        `${availableFromInvoice - currentStock} وحدة تم بيعها مسبقاً ولا يمكن إرجاعها.`
                    );
                }
                throw new Error(
                    `الكمية المتاحة للإرجاع هي (${availableQty}). لا يمكن إرجاع (${returnItem.quantity}) من "${originalItem.product.name}"`
                );
            }

            const lineCost = new Decimal(originalItem.unitCost).times(returnItem.quantity);
            returnTotal = returnTotal.plus(lineCost);
            processedItems.push({
                productId: originalItem.productId,
                returnQty: returnItem.quantity,
                unitCost: new Decimal(originalItem.unitCost).toString(),
                name: originalItem.product.name
            });

            // 2.1 Update original item returnedQty
            await tx.purchaseItem.update({
                where: { id: originalItem.id },
                data: { returnedQty: { increment: returnItem.quantity } }
            });
        }

        // 📊 Determine remaining debt and cash on the ORIGINAL invoice
        const currentUnpaidAmount = Decimal.max(0, new Decimal(invoice.totalAmount.toString()).minus(new Decimal(invoice.paidAmount.toString())).minus(totalReturnedValueSoFar.minus(totalReturnedPaidSoFar)));
        const currentPaidCashRemaining = Decimal.max(0, new Decimal(invoice.paidAmount.toString()).minus(totalReturnedPaidSoFar));

        // 🔀 Split the return between debt-reduction and cash-back
        const debtReduction = Decimal.min(returnTotal, currentUnpaidAmount);
        const cashReversal = returnTotal.minus(debtReduction);

        // 3. Create NEW Return Invoice
        const hexSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        const returnInvoice = await tx.purchaseInvoice.create({
            data: {
                invoiceNumber: `RTN-${invoice.invoiceNumber || invoice.id.split('-')[0]}-${hexSuffix}`,
                supplierId: invoice.supplierId,
                warehouseId: invoice.warehouseId,
                totalAmount: returnTotal.negated(),
                paidAmount: new Decimal(0), // All go to balance/credit
                status: 'RETURN',
                paymentMethod: invoice.paymentMethod,
                isReturn: true,
                parentId: purchaseId,
                branchId: invoice.branchId || currentUser.branchId || null,
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
        const totalPurchasedQty = allItemsOriginal.reduce((s: number, i) => s + Number(i.quantity), 0);
        
        // Sum all returned quantities for ALL items in ALL related return invoices
        const totalReturnedQtySoFar = previousReturns.reduce((s: number, r) => s + r.items.reduce((ss: number, ii) => ss + Number(ii.quantity), 0), 0) + 
                                     processedItems.reduce((s: number, p) => s + p.returnQty, 0);

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

            // Post-update stock underflow guard
            const postUpdate = await tx.stock.findFirst({
                where: { productId: p.productId, warehouseId: invoice.warehouseId }
            });
            if (postUpdate && Number(postUpdate.quantity) < 0) {
                throw new Error('مخزون سالب — تعذّر إكمال الإرجاع، راجع الكميات الحالية');
            }

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
        const accountingLines: TransactionLineInput[] = [];
        accountingLines.push({ accountCode: GL.LIABILITIES.PAYABLES, debit: returnTotal, credit: 0, description: 'AP Reduced (Purchase Return)' });
        accountingLines.push({ accountCode: GL.ASSETS.INVENTORY, debit: 0, credit: returnTotal, description: 'Inventory Asset Reversed (Purchase Return)' });

        await AccountingEngine.recordTransaction({
            description: `Partial Return Invoice: ${returnInvoice.invoiceNumber}`,
            reference: returnInvoice.id,
            purchaseId: returnInvoice.id,
            branchId: currentUser.branchId ?? undefined,
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
            returnTotal: returnTotal.toString(),
            returnId: returnInvoice.id,
            itemCount: processedItems.length,
            invoiceNumber: returnInvoice.invoiceNumber,
            supplierId: invoice.supplierId,
            totalReturnedQtySoFar,
            totalPurchasedQty,
            newTotal: invoice.totalAmount.toString() // Keeping original total for reference or tracking
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
