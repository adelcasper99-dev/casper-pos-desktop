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
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import {
    splitDeferredRefund,
    calculateProratedRefundValue,
    calculateCogsReversal
} from '@/utils/refund-calculations';
import {
    createCustomerTransactionJournal,
    createSupplierPaymentJournal 
} from '@/lib/accounting/inline-journal-helpers';
import { CustomerIndexingService } from '@/lib/customer-indexing-service';
import { logger } from '@/lib/logger';

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
                invoiceNumber: `${(s as any).isReturn ? 'RTN-S' : 'S'}-${s.id.split('-')[0].toUpperCase()}`,
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
 * Fetch a single sale by ID with relations
 */
export async function getSaleById(saleId: string) {
    try {
        const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            include: {
                customer: { select: { name: true, phone: true, address: true } },
                items: {
                    include: {
                        product: { select: { name: true, sku: true } }
                    }
                },
                user: { select: { name: true, username: true } },
                payments: true
            }
        });

        if (!sale) return { success: false, error: "Sale not found" };

        return {
            success: true,
            sale: {
                ...sale,
                invoiceNumber: `S-${sale.id.split('-')[0].toUpperCase()}`,
                totalAmount: Number(sale.totalAmount),
                taxAmount: Number(sale.taxAmount),
                subTotal: Number(sale.subTotal),
                discountAmount: Number(sale.discountAmount),
                items: sale.items.map(i => ({
                    ...i,
                    unitPrice: Number(i.unitPrice),
                    unitCost: Number(i.unitCost)
                }))
            }
        };
    } catch (error: any) {
        console.error('[getSaleById] Error:', error);
        return { success: false, error: error.message };
    }
}



/**
 * Refund a sale (Ported Logic)
 */
export const refundSale = secureAction(async (data: {
    saleId: string;
    reason?: string;
    refundMethod?: 'CASH' | 'STORE_CREDIT';
    isDamaged?: boolean;
    treasuryId?: string;
    idempotencyKey?: string;
    csrfToken?: string;
}) => {
    const { saleId, reason, refundMethod = 'CASH', isDamaged = false, treasuryId, idempotencyKey } = data;
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
        // RF-03: Idempotency Lock Check
        if (idempotencyKey) {
            const existingRefund = await (tx.sale as any).findFirst({
                where: { parentId: saleId, isReturn: true, refundReason: { contains: `[IDEM:${idempotencyKey}]` } }
            });
            if (existingRefund) {
                return { isIdempotentHit: true, ...existingRefund };
            }
        }

        // 1. Fetch original sale
        const sale = await (tx.sale.findUnique as any)({
            where: { id: saleId },
            include: {
                customer: { select: { linkedEmployeeId: true } },
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

        // 🔍 Calculate exactly what remains to be returned (values are negative in return docs)
        const previousReturns = await (tx.sale as any).findMany({
            where: { parentId: saleId, isReturn: true }
        });

        const totalReturnedValue = (previousReturns as any[]).reduce((s, r) => s.plus(new Decimal(r.totalAmount).abs()), new Decimal(0));
        const totalReturnedPaid = (previousReturns as any[]).reduce((s, r) => s.plus(new Decimal(r.paidAmount || 0).abs()), new Decimal(0));
        
        const remainingTotalAmount = Decimal.max(0, new Decimal(sale.totalAmount).sub(totalReturnedValue));
        const originalPaidCashOverall = (sale.payments as any[]).filter(
            (p: any) => p.method !== 'ACCOUNT' && p.method !== 'DEFERRED'
        ).reduce((s: Decimal, p: any) => s.plus(new Decimal(p.amount)), new Decimal(0));

        const currentPaidCashRemaining = Decimal.max(0, originalPaidCashOverall.sub(totalReturnedPaid));

        if (remainingTotalAmount.lte(0)) {
            throw new Error("هذه الفاتورة تم إرجاعها بالكامل بالفعل عبر مستندات مرتجع جزئية");
        }

        // 🔀 Determine how much of the REMAINING value is cash vs account
        const { amountToCash, amountToAccount } = splitDeferredRefund(
            sale.paymentMethod,
            remainingTotalAmount.toNumber(),
            currentPaidCashRemaining.toNumber()
        );

        // If user wants store credit instead of cash, we re-route the cash portion to wallet
        const finalRefundMethod = refundMethod === 'STORE_CREDIT' ? 'STORE_CREDIT' : (amountToCash > 0 ? (sale.paymentMethod || 'CASH') : 'ACCOUNT');
        const amountToWallet = refundMethod === 'STORE_CREDIT' ? amountToCash : 0;
        const finalAmountToCash = refundMethod === 'STORE_CREDIT' ? 0 : amountToCash;

        // 🏦 Find treasury when the refund needs to touch physical cash
        let treasury = null;
        if (treasuryId) {
            treasury = await tx.treasury.findUnique({ where: { id: treasuryId } });
        }
        if (!treasury && finalAmountToCash > 0) {
            treasury = await tx.treasury.findFirst({
                where: {
                    branchId: currentUser.branchId || undefined,
                    paymentMethod: sale.paymentMethod || 'CASH',
                    isDefault: true
                }
            }) || await tx.treasury.findFirst({ where: { isDefault: true } });
        }

        // ─── Create NEW Return Sale Record ───
        const returnSale = await tx.sale.create({
            data: {
                customerName: sale.customerName,
                customerPhone: sale.customerPhone,
                customerAddress: sale.customerAddress,
                warehouseId: sale.warehouseId,
                totalAmount: remainingTotalAmount.negated(),
                paymentMethod: finalRefundMethod,
                branchId: (sale as any).branchId || currentUser.branchId || null,
                status: 'REFUNDED',
                refundReason: `${reason || 'بدون سبب'} ${idempotencyKey ? `[IDEM:${idempotencyKey}]` : ''}`,
                subTotal: new Decimal(sale.subTotal || 0).negated().mul(remainingTotalAmount.div(new Decimal(sale.totalAmount))), // Prorated subtotal
                taxAmount: new Decimal(sale.taxAmount || 0).negated().mul(remainingTotalAmount.div(new Decimal(sale.totalAmount))), // Prorated tax
                discountAmount: new Decimal(sale.discountAmount || 0).negated().mul(remainingTotalAmount.div(new Decimal(sale.totalAmount))), // Prorated discount
                shiftId: currentShift.id,
                customerId: sale.customerId,
                userId: currentUser.id,
                // @ts-ignore
                isReturn: true,
                // @ts-ignore
                parentId: saleId,
                items: {
                    create: sale.items.map((i: any) => {
                        const alreadyReturnedQty = (previousReturns as any[]).reduce((sum, ret) => {
                            const matched = (ret.items || []).find((ii: any) => ii.productId === i.productId);
                            return sum + (matched?.quantity || 0);
                        }, 0);
                        return {
                            productId: i.productId,
                            quantity: Math.max(0, i.quantity - alreadyReturnedQty),
                            unitPrice: new Decimal(i.unitPrice),
                            unitCost: new Decimal(i.unitCost)
                        };
                    }).filter((i: any) => i.quantity > 0)
                }
            } as any
        });

        // ─── REFUND transaction record (Cash portion only) ───
        if (amountToCash > 0) {
            await tx.transaction.create({
                data: {
                    type: 'REFUND',
                    amount: new Decimal(-finalAmountToCash),
                    paymentMethod: finalRefundMethod,
                    description: `Refund (Cash) for Sale #${sale.id.split('-')[0].toUpperCase()}${reason ? ` - ${reason}` : ''}`,
                    shiftId: currentShift.id,
                    treasuryId: treasury?.id || null,
                    referenceId: returnSale.id,
                    referenceType: 'SALE_RETURN'
                }
            });
        }

        // 🏦 Deduct physical cash from treasury (only the cash portion)
        if (treasury && finalAmountToCash > 0) {
            // Check for negative balance permission
            if (Number(treasury.balance) < finalAmountToCash) {
                const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                if (!canGoNegative) {
                    throw new Error(`رصيد الخزنة غير كافٍ (${Number(treasury.balance)}). ولا تملك صلاحية السحب بالسالب لإتمام المرتجع.`);
                }
            }
            await tx.treasury.update({
                where: { id: treasury.id },
                data: { balance: { decrement: finalAmountToCash } }
            });
        }

        // 💳 Store Credit Handling
        if (sale.customerId && amountToWallet > 0) {
            await tx.customer.update({
                where: { id: sale.customerId },
                data: { walletBalance: { increment: amountToWallet } } as any
            });

            const walletTx = await tx.customerTransaction.create({
                data: {
                    customerId: sale.customerId,
                    type: 'CREDIT',
                    amount: new Decimal(amountToWallet),
                    description: `Store Credit Issued (Refund for Sale #${sale.id.split('-')[0]})`,
                    reference: returnSale.id,
                    createdBy: currentUser.id
                }
            });
            // Auto-create journal entry
            await createCustomerTransactionJournal(tx, {
                customerTransactionId: walletTx.id,
                customerId: sale.customerId,
                type: 'CREDIT',
                amount: amountToWallet,
                description: `Store Credit: ${walletTx.description}`,
                reference: returnSale.id,
                branchId: (sale as any).branchId
            });
        }

        // 3. Handle Customer Account Reversal (credit portion or full ACCOUNT sale)
        if (sale.customerId && amountToAccount > 0) {
            const accountTx = await tx.customerTransaction.create({
                data: {
                    customerId: sale.customerId,
                    type: 'CREDIT',
                    amount: new Decimal(-amountToAccount),
                    description: `Refund (account portion) for Sale #${sale.id.split('-')[0]}`,
                    reference: returnSale.id,
                    createdBy: currentUser.id
                }
            });
            // Auto-create journal entry
            await createCustomerTransactionJournal(tx, {
                customerTransactionId: accountTx.id,
                customerId: sale.customerId,
                type: 'REFUND',
                amount: amountToAccount,
                description: `Refund: ${accountTx.description}`,
                reference: returnSale.id,
                branchId: (sale as any).branchId
            });

            await tx.customer.update({
                where: { id: sale.customerId },
                data: { balance: { decrement: amountToAccount } }
            });
        }

        // 🆕 Supplier Offset Reversal (B44)
        if ((sale as any).relatedSupplierId) {
            await tx.supplier.update({
                where: { id: (sale as any).relatedSupplierId },
                data: { balance: { decrement: remainingTotalAmount } }
            });

            const supplierPay = await tx.supplierPayment.create({
                data: {
                    supplierId: (sale as any).relatedSupplierId,
                    amount: new Decimal(remainingTotalAmount),
                    method: 'ADJUSTMENT',
                    notes: `Refund Adjustment for Sale #${sale.id.split('-')[0]}`
                }
            });
            // Auto-create journal entry
            await createSupplierPaymentJournal(tx, {
                supplierPaymentId: supplierPay.id,
                supplierId: (sale as any).relatedSupplierId,
                amount: remainingTotalAmount,
                method: 'ADJUSTMENT',
                notes: supplierPay.notes || undefined,
                branchId: (sale as any).branchId || undefined
            });
        }

        // 4. Reverse inventory (Restoring only the REMAINING items)
        for (const item of (returnSale as any).items) {
            const product = await tx.product.findUnique({ 
                where: { id: item.productId }, 
                select: { id: true, isBundle: true, itemType: true, trackStock: true } as any
            }) as any;
            
            // Bypass inventory if item is a SERVICE or doesn't track stock
            if (product?.itemType === 'SERVICE' || product?.trackStock === false) {
                continue;
            }

            const targetWarehouseId = sale.warehouseId;
            const stockCondition = 'GOOD';
            const isBundle = product?.isBundle;

            // V-07 audit fix: ensure valid DB userId for StockMovement constraint
            let performedById: string | undefined = currentUser.id;
            if (performedById === 'super-admin') {
                const fallback = await tx.user.findFirst({ where: { roleStr: 'ADMIN' } }) || await tx.user.findFirst();
                performedById = fallback?.id || undefined;
            }

            const warehouse = await tx.warehouse.findUnique({
                where: { id: sale.warehouseId },
                select: { branchId: true }
            });

            if (isDamaged) {
                // BUG B13 FIX: Route directly to Wastage (Do NOT restore to stock)
                if (isBundle) {
                    const components = await (tx as any).bundleItem.findMany({
                        where: { bundleProductId: item.productId },
                        include: { componentProduct: { select: { id: true, trackStock: true } } }
                    });
                    for (const comp of components) {
                        if (!comp.componentProduct.trackStock) continue;
                        const wasteQty = item.quantity * comp.quantityIncluded;
                        
                        await tx.stockWastage.create({
                            data: {
                                productId: comp.componentProductId,
                                warehouseId: sale.warehouseId,
                                quantity: wasteQty,
                                reason: 'تالف مرتجع مبيعات (POS)',
                                reportedBy: performedById!,
                                branchId: warehouse?.branchId || null
                            } as any
                        });

                        await tx.stockMovement.create({
                            data: {
                                type: 'WASTAGE',
                                productId: comp.componentProductId,
                                fromWarehouseId: sale.warehouseId,
                                quantity: wasteQty,
                                reason: `Wastage (Damaged Return): Sale #${sale.id.split('-')[0]} — component of bundle ${item.productId.slice(0, 8)}`,
                                performedById: performedById,
                                branchId: warehouse?.branchId || null
                            } as any
                        });
                    }
                } else {
                    await tx.stockWastage.create({
                        data: {
                            productId: item.productId,
                            warehouseId: sale.warehouseId,
                            quantity: item.quantity,
                            reason: 'تالف مرتجع مبيعات (POS)',
                            reportedBy: performedById!,
                            branchId: warehouse?.branchId || null
                        } as any
                    });

                    await tx.stockMovement.create({
                        data: {
                            type: 'WASTAGE',
                            productId: item.productId,
                            fromWarehouseId: sale.warehouseId,
                            quantity: item.quantity,
                            reason: `Wastage (Damaged Return): Sale #${sale.id.split('-')[0]}`,
                            performedById: performedById,
                            branchId: warehouse?.branchId || null
                        } as any
                    });
                }
            } else {
                // NOT DAMAGED: Restore to stock normally
                if (isBundle) {
                    // BUNDLE: restore components for the REMAINING quantity
                    const components = await (tx as any).bundleItem.findMany({
                        where: { bundleProductId: item.productId },
                        include: { componentProduct: { select: { id: true, trackStock: true } } }
                    });
                    for (const comp of components) {
                        if (!comp.componentProduct.trackStock) continue;
                        const restoreQty = item.quantity * comp.quantityIncluded;
                        await tx.product.update({
                            where: { id: comp.componentProductId },
                            data: { stock: { increment: restoreQty } }
                        });
                        await tx.stock.upsert({
                            where: { productId_warehouseId: { productId: comp.componentProductId, warehouseId: targetWarehouseId } },
                            update: { quantity: { increment: restoreQty } },
                            create: { productId: comp.componentProductId, warehouseId: targetWarehouseId, quantity: restoreQty }
                        });
                        await tx.stockMovement.create({
                            data: {
                                type: 'REFUND',
                                productId: comp.componentProductId,
                                toWarehouseId: targetWarehouseId,
                                quantity: restoreQty,
                                condition: stockCondition,
                                reason: `Refund (Remaining): Sale #${sale.id.split('-')[0]} — component of bundle ${item.productId.slice(0, 8)}`,
                                performedById: performedById,
                                branchId: warehouse?.branchId || (sale as any).branchId || null
                            } as any
                        });
                    }
                } else {
                    // REGULAR product: restore REMAINING quantity
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: { increment: item.quantity } }
                    });
                    await tx.stock.upsert({
                        where: { productId_warehouseId: { productId: item.productId, warehouseId: targetWarehouseId } },
                        update: { quantity: { increment: item.quantity } },
                        create: { productId: item.productId, warehouseId: targetWarehouseId, quantity: item.quantity }
                    });
                    await tx.stockMovement.create({
                        data: {
                            type: 'REFUND',
                            productId: item.productId,
                            toWarehouseId: targetWarehouseId,
                            quantity: item.quantity,
                            condition: stockCondition,
                            reason: `Refund (Remaining): Sale #${sale.id.split('-')[0]}`,
                            performedById: performedById,
                            branchId: warehouse?.branchId || (sale as any).branchId || null
                        } as any
                    });
                }
            }
        }

        // 5. Update original sale status and items
        await tx.sale.update({
            where: { id: saleId },
            data: {
                status: 'REFUNDED',
                refundReason: reason || 'Customer refund'
            }
        });

        // 5.1 Increment refundedQty on all original items
        for (const item of sale.items) {
            const alreadyReturnedQty = (previousReturns as any[]).reduce((sum, ret) => {
                const matched = (ret.items || []).find((ii: any) => ii.productId === item.productId);
                return sum + (matched?.quantity || 0);
            }, 0);
            const qtyToRefund = Math.max(0, item.quantity - alreadyReturnedQty);
            
            if (qtyToRefund > 0) {
                await tx.saleItem.update({
                    where: { id: item.id },
                    data: { refundedQty: { increment: qtyToRefund } }
                });
            }
        }

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

        // 7. Centralized Accounting Reversal (Sales Revenue + AR/Cash/Wallet Split + COGS Bypass)
        await AccountingEngine.recordSaleReturn({
            saleId,
            returnSaleId: returnSale.id,
            totalRefund: remainingTotalAmount,
            cashPortion: finalAmountToCash,
            arPortion: amountToAccount,
            walletPortion: amountToWallet,
            branchId: (sale as any).branchId || currentUser.branchId || undefined,
            items: (returnSale as any).items.map((i: any) => ({
                productId: i.productId,
                quantity: i.quantity,
                unitCost: Number(i.unitCost),
                isDamaged
            })),
            reason: reason || 'Customer refund'
        }, tx);

        await tx.shift.update({
            where: { id: currentShift.id },
            data: {
                totalRefunds: { increment: Number(remainingTotalAmount) },
                // @ts-ignore
                totalCashRefunds: { increment: finalAmountToCash },
                // @ts-ignore
                totalAccountRefunds: { increment: amountToAccount }
            }
        });

        return {
            sale: returnSale,
            refundedAmount: Number(remainingTotalAmount)
        };
    });

    revalidatePath("/pos");
    revalidatePath("/logs");
    revalidatePath("/reports");
    revalidatePath("/customers");

    // 🆕 Real-time Refresh for Hybrid Indexing Pattern
    if (result.sale.customerId) {
        CustomerIndexingService.refreshCustomer(result.sale.customerId).catch(err => 
            logger.error(`[Refund] Failed to refresh customer indexing for ${result.sale.customerId}`, err)
        );
    }

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
    items: { itemId: string; quantity: number; isDamaged?: boolean }[];
    reason?: string;
    refundMethod?: 'CASH' | 'STORE_CREDIT';
    treasuryId?: string;
    csrfToken?: string;
}) => {
    const { saleId, items: refundItems, reason, refundMethod = 'CASH', treasuryId } = data;

    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('POS');

    if (!refundItems || refundItems.length === 0) {
        throw new Error(t('atLeastOneItem'));
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error(t('noActiveShift'));
    }
    const currentShift = shiftResult.shift;

    const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch original sale with items AND payments
        const sale = await (tx.sale.findUnique as any)({
            where: { id: saleId },
            include: {
                customer: { select: { id: true, linkedEmployeeId: true } },
                items: {
                    include: {
                        product: { select: { id: true, name: true, isBundle: true } }
                    }
                },
                payments: true
            }
        });

        if (!sale) throw new Error(t('notFound'));
        if (sale.status === 'REFUNDED') throw new Error(t('alreadyRefundedFull'));

        // 2. Validate refund quantities
        const previousReturns = await (tx.sale as any).findMany({
            where: { parentId: saleId, isReturn: true },
            include: { items: true }
        });

        let refundTotal = new Decimal(0);
        const processedItems: { 
            itemId: string; 
            productId: string; 
            refundQty: number; 
            lineTotal: Decimal; 
            proratedTax: Decimal;
            proratedDiscount: Decimal;
            unitPrice: Decimal; 
            unitCost: Decimal; 
            name: string; 
            isDamaged: boolean 
        }[] = [];

        const originalItemsSubTotal = (sale.items as any[]).reduce(
            (s: Decimal, i: any) => s.plus(new Decimal(i.unitPrice).times(i.quantity)),
            new Decimal(0)
        );

        const finalSubTotal = originalItemsSubTotal.gt(0) ? originalItemsSubTotal : new Decimal(sale.subTotal || 0);

        for (const refundItem of refundItems) {
            const originalItem = (sale.items as any[]).find((i: any) => i.id === refundItem.itemId);
            if (!originalItem) throw new Error(`الصنف غير موجود في الفاتورة`);

            const alreadyRefunded = (previousReturns as any[]).reduce((sum: number, ret: any) => {
                const matchedItem = ret.items.find((i: any) => i.productId === originalItem.productId);
                return sum + (matchedItem?.quantity || 0);
            }, 0);

            const availableQty = (originalItem as any).quantity - alreadyRefunded;

            if (refundItem.quantity <= 0) throw new Error(t('qtyPositive'));
            if (refundItem.quantity > availableQty) {
                throw new Error(t('partialRefundQtyError', { qty: availableQty, name: originalItem.product.name }));
            }

            const itemLineTotal = new Decimal(originalItem.unitPrice).times(refundItem.quantity);
            const weightRatio = finalSubTotal.gt(0) ? itemLineTotal.div(finalSubTotal) : new Decimal(0);

            const lineTotal = new Decimal(calculateProratedRefundValue(
                Number(originalItem.unitPrice),
                refundItem.quantity,
                finalSubTotal.toNumber(),
                Number(sale.discountAmount),
                Number(sale.taxAmount)
            ));
            
            const proratedTax = new Decimal(sale.taxAmount || 0).times(weightRatio);
            const proratedDiscount = new Decimal(sale.discountAmount || 0).times(weightRatio);
            
            refundTotal = refundTotal.plus(lineTotal);
            processedItems.push({
                itemId: originalItem.id,
                productId: originalItem.productId,
                refundQty: refundItem.quantity,
                lineTotal,
                proratedTax,
                proratedDiscount,
                unitPrice: new Decimal(originalItem.unitPrice),
                unitCost: new Decimal(originalItem.unitCost),
                name: originalItem.product.name,
                isDamaged: refundItem.isDamaged || false
            });

            // 2.1 Update original item refundedQty
            await tx.saleItem.update({
                where: { id: originalItem.id },
                data: { refundedQty: { increment: refundItem.quantity } }
            });
        }

        // 3. Financial Calculations
        const totalReturnedPaidSoFar = (previousReturns as any[]).reduce((s, r) => s.plus(new Decimal(r.paidAmount).abs()), new Decimal(0));
        const originalPaidCashOverall = (sale.payments || []).filter(
            (p: any) => p.method !== 'ACCOUNT' && p.method !== 'DEFERRED'
        ).reduce((s: Decimal, p: any) => s.plus(new Decimal(p.amount)), new Decimal(0));

        const currentPaidCashRemaining = originalPaidCashOverall.minus(totalReturnedPaidSoFar);

        const { amountToCash, amountToAccount } = splitDeferredRefund(
            sale.paymentMethod,
            refundTotal.toNumber(),
            currentPaidCashRemaining.toNumber()
        );

        const finalRefundMethod = refundMethod === 'STORE_CREDIT' ? 'STORE_CREDIT' : (new Decimal(amountToCash).gt(0) ? (sale.paymentMethod || 'CASH') : 'ACCOUNT');
        const amountToWallet = refundMethod === 'STORE_CREDIT' ? amountToCash : 0;
        const finalAmountToCash = refundMethod === 'STORE_CREDIT' ? 0 : amountToCash;

        let treasury = null;
        if (finalAmountToCash > 0) {
            if (treasuryId) {
                treasury = await tx.treasury.findUnique({ where: { id: treasuryId } });
            }
            if (!treasury) {
                treasury = await tx.treasury.findFirst({
                    where: { branchId: currentUser.branchId || undefined, paymentMethod: sale.paymentMethod || 'CASH', isDefault: true }
                }) || await tx.treasury.findFirst({ where: { isDefault: true } });
            }
        }

        // 4. Create NEW Return Sale Record
        const returnSale = await tx.sale.create({
            data: {
                customerName: sale.customerName,
                customerPhone: sale.customerPhone,
                customerAddress: sale.customerAddress,
                warehouseId: sale.warehouseId,
                totalAmount: refundTotal.negated(),
                paymentMethod: finalRefundMethod,
                status: 'REFUNDED',
                subTotal: refundTotal.negated(),
                taxAmount: processedItems.reduce((s, p) => s.plus(p.proratedTax), new Decimal(0)).negated(),
                discountAmount: processedItems.reduce((s, p) => s.plus(p.proratedDiscount), new Decimal(0)).negated(),
                shiftId: currentShift.id,
                customerId: sale.customerId,
                userId: currentUser.id,
                // @ts-ignore
                isReturn: true,
                // @ts-ignore
                parentId: saleId,
                items: {
                    create: processedItems.map(p => ({
                        productId: p.productId,
                        quantity: p.refundQty,
                        unitPrice: new Decimal(p.unitPrice),
                        unitCost: new Decimal(p.unitCost)
                    }))
                }
            }
        });

        // 5. Update Original Sale status
        const totalSoldQty = (sale.items as any[]).reduce((s: number, i: any) => s + i.quantity, 0);
        const totalRefundedQtySoFar = (previousReturns as any[]).reduce((s: number, r: any) => s + (r.items as any[]).reduce((ss: number, ii: any) => ss + ii.quantity, 0), 0) + 
                                     processedItems.reduce((s: number, p: any) => s + p.refundQty, 0);

        await tx.sale.update({
            where: { id: saleId },
            data: {
                status: totalRefundedQtySoFar >= totalSoldQty ? 'REFUNDED' : 'PARTIAL_REFUND',
                refundReason: reason || t('partialRefundReason')
            }
        });

        // 6. Record Cash/Store-Credit/Account transactions
        if (finalAmountToCash > 0) {
            await tx.transaction.create({
                data: {
                    type: 'REFUND',
                    amount: new Decimal(-finalAmountToCash),
                    paymentMethod: finalRefundMethod,
                    description: t('partialRefundNoteInternal', { ref: sale.id.split('-')[0].toUpperCase(), items: processedItems.map(p => `${p.name} x${p.refundQty}`).join(', '), reason: reason || '' }),
                    shiftId: currentShift.id,
                    treasuryId: treasury?.id || null,
                    referenceId: returnSale.id,
                    referenceType: 'SALE_RETURN'
                }
            });
            if (treasury) {
                // Check for negative balance permission
                if (Number(treasury.balance) < finalAmountToCash) {
                    const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                    if (!canGoNegative) {
                        throw new Error(`رصيد الخزنة غير كافٍ (${Number(treasury.balance)}). ولا تملك صلاحية السحب بالسالب لإتمام المرتجع.`);
                    }
                }
                await tx.treasury.update({ where: { id: treasury.id }, data: { balance: { decrement: finalAmountToCash } } });
            }
        }

        if (sale.customerId && amountToWallet > 0) {
            await tx.customer.update({ where: { id: sale.customerId }, data: { walletBalance: { increment: amountToWallet } } as any });
            await tx.customerTransaction.create({
                data: {
                    customerId: sale.customerId,
                    type: 'CREDIT',
                    amount: new Decimal(amountToWallet),
                    description: `Store Credit: Partial Refund Sale #${sale.id.split('-')[0]}`,
                    reference: returnSale.id,
                    createdBy: currentUser.id
                }
            });
        }

        if (sale.customerId && amountToAccount > 0) {
            await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: amountToAccount } } });
            await tx.customerTransaction.create({
                data: {
                    customerId: sale.customerId,
                    type: 'CREDIT',
                    amount: new Decimal(-amountToAccount),
                    description: `AR Reversal: Partial Refund Sale #${sale.id.split('-')[0]}`,
                    reference: returnSale.id,
                    createdBy: currentUser.id
                }
            });
        }

        // 7. Stock Reversal with Wastage Routing
        for (const p of processedItems) {
            const product = await tx.product.findUnique({ 
                where: { id: p.productId }, 
                select: { id: true, isBundle: true, itemType: true, trackStock: true } as any
            }) as any;

            if (product?.itemType === 'SERVICE' || product?.trackStock === false) continue;

            const targetWhId = sale.warehouseId;
            const stockCondition = 'GOOD';

            // V-07 audit fix: ensure valid DB userId for StockMovement constraint
            let performedById: string | undefined = currentUser.id;
            if (performedById === 'super-admin') {
                const fallback = await tx.user.findFirst({ where: { roleStr: 'ADMIN' } }) || await tx.user.findFirst();
                performedById = fallback?.id || undefined;
            }

            if (p.isDamaged) {
                // BUG B13 FIX: Route directly to Wastage (Do NOT restore to stock)
                if (product?.isBundle) {
                    const components = await (tx as any).bundleItem.findMany({
                        where: { bundleProductId: p.productId },
                        include: { componentProduct: { select: { id: true, trackStock: true } } }
                    });
                    for (const comp of components) {
                        if (!comp.componentProduct.trackStock) continue;
                        const wasteQty = p.refundQty * comp.quantityIncluded;
                        await tx.stockWastage.create({
                            data: {
                                productId: comp.componentProductId,
                                warehouseId: sale.warehouseId,
                                quantity: wasteQty,
                                reason: 'تالف مرتجع مبيعات جزئي (POS)',
                                reportedBy: performedById!
                            }
                        });
                        await tx.stockMovement.create({
                            data: {
                                type: 'WASTAGE',
                                productId: comp.componentProductId,
                                fromWarehouseId: sale.warehouseId,
                                quantity: wasteQty,
                                reason: `Wastage (Damaged Return): Sale #${sale.id.split('-')[0]} — component of bundle ${p.productId.slice(0, 8)}`,
                                performedById: performedById
                            } as any
                        });
                    }
                } else {
                    await tx.stockWastage.create({
                        data: {
                            productId: p.productId,
                            warehouseId: sale.warehouseId,
                            quantity: p.refundQty,
                            reason: 'تالف مرتجع مبيعات جزئي (POS)',
                            reportedBy: performedById!
                        }
                    });
                    await tx.stockMovement.create({
                        data: {
                            type: 'WASTAGE',
                            productId: p.productId,
                            fromWarehouseId: sale.warehouseId,
                            quantity: p.refundQty,
                            reason: `Wastage (Damaged Return): doc #${returnSale.id.split('-')[0]}`,
                            performedById: performedById
                        } as any
                    });
                }
            } else {
                if (product?.isBundle) {
                    const components = await (tx as any).bundleItem.findMany({
                        where: { bundleProductId: p.productId },
                        include: { componentProduct: { select: { id: true, trackStock: true } } }
                    });
                    for (const comp of components) {
                        if (!comp.componentProduct.trackStock) continue;
                        const restoreQty = p.refundQty * comp.quantityIncluded;
                        await tx.product.update({ where: { id: comp.componentProductId }, data: { stock: { increment: restoreQty } } });
                        await tx.stock.upsert({
                            where: { productId_warehouseId: { productId: comp.componentProductId, warehouseId: targetWhId } },
                            update: { quantity: { increment: restoreQty } },
                            create: { productId: comp.componentProductId, warehouseId: targetWhId, quantity: restoreQty }
                        });
                        await tx.stockMovement.create({
                            data: {
                                type: 'REFUND',
                                productId: comp.componentProductId,
                                toWarehouseId: targetWhId,
                                quantity: restoreQty,
                                condition: stockCondition,
                                reason: `Partial Refund bundle component: Sale #${sale.id.split('-')[0]}`,
                                performedById: performedById
                            } as any
                        });
                    }
                } else {
                    await tx.product.update({ where: { id: p.productId }, data: { stock: { increment: p.refundQty } } });
                    await tx.stock.upsert({
                        where: { productId_warehouseId: { productId: p.productId, warehouseId: targetWhId } },
                        update: { quantity: { increment: p.refundQty } },
                        create: { productId: p.productId, warehouseId: targetWhId, quantity: p.refundQty }
                    });
                    await tx.stockMovement.create({
                        data: {
                            type: 'REFUND',
                            productId: p.productId,
                            toWarehouseId: targetWhId,
                            quantity: p.refundQty,
                            condition: stockCondition,
                            reason: `Partial Refund doc #${returnSale.id.split('-')[0]}`,
                            performedById: performedById
                        } as any
                    });
                }
            }
        }

        // 8. Centralized Accounting
        await AccountingEngine.recordSaleReturn({
            saleId,
            returnSaleId: returnSale.id,
            totalRefund: refundTotal.toNumber(),
            cashPortion: finalAmountToCash,
            arPortion: amountToAccount,
            walletPortion: amountToWallet,
            items: processedItems.map(p => ({
                productId: p.productId,
                quantity: p.refundQty,
                unitCost: p.unitCost.toNumber(),
                isDamaged: p.isDamaged
            })),
            reason: reason || 'Partial Refund',
            branchId: currentUser.branchId ?? undefined
        }, tx);

        await tx.shift.update({
            where: { id: currentShift.id },
            data: {
                totalRefunds: { increment: refundTotal },
                // @ts-ignore
                totalCashRefunds: { increment: finalAmountToCash },
                // @ts-ignore
                totalAccountRefunds: { increment: amountToAccount }
            }
        });

        return { refundTotal: refundTotal.toNumber(), returnSaleId: returnSale.id, itemCount: processedItems.length, customerId: sale.customerId };
    });

    revalidatePath("/pos");
    revalidatePath("/customers");

    // 🆕 Real-time Refresh for Hybrid Indexing Pattern
    if (result.customerId) {
        CustomerIndexingService.refreshCustomer(result.customerId).catch(err => 
            logger.error(`[PartialRefund] Failed to refresh customer indexing for ${result.customerId}`, err)
        );
    }

    return { success: true, message: t('partialRefundSuccess', { count: result.itemCount, amount: result.refundTotal.toFixed(2) }), refundedAmount: result.refundTotal, returnId: result.returnSaleId };
}, { permission: PERMISSIONS.POS_ACCESS });
