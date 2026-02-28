"use server";

/**
 * AUDIT TRAIL POLICY: This file performs sensitive financial/inventory operations.
 * All mutations MUST be accompanied by an AuditLog entry.
 * AuditLog is APPEND-ONLY and must not be deleted or modified.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from 'zod';
import { Decimal } from "@prisma/client/runtime/library";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { secureAction } from "@/lib/safe-action";
import { decrementWarehouseStock } from "@/lib/stock-helpers"; // BL-06/BL-07 fix

import { saleSchema } from "@/lib/validation/pos";
import { logger } from "@/lib/logger";
import { getCurrentShiftInternal, updateShiftHeartbeat } from "./shift-management-actions";
import { getCurrentUser } from "./auth";
import { PERMISSIONS } from "@/lib/permissions";

interface ProcessSaleData extends z.infer<typeof saleSchema> {
    registerId?: string;
    force?: boolean;
    tableId?: string;
    tableName?: string;
    warranty?: {
        warrantyDays?: number;
        warrantyExpiryDate?: Date;
    };
    offlineFlag?: boolean;
    csrfToken?: string;
}

export const processSale = secureAction(async (rawData: ProcessSaleData) => {
    const startTime = Date.now();

    // 🔒 SHIFT GUARD: Ensure active shift exists
    const currentUser = await getCurrentUser();

    // Import getTranslations if not already available in scope (it's not)
    const { getTranslations } = await import('@/lib/i18n-mock');
    const tErrors = await getTranslations('SystemMessages.Errors');

    if (!currentUser) throw new Error(tErrors('unauthorized'));
    const shiftResult = await getCurrentShiftInternal({
        userId: currentUser?.id,
        registerId: rawData.registerId // Support multi-register
    });

    // Internal function returns { shift } directly (no success wrapper)
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.POS');
        throw new Error(t('noActiveShift'));
    }

    const currentShift = shiftResult.shift;

    // 1. Separate "force", "warranty" and "treasuryId" from Schema validation
    // We treat 'rawData' as { items: [], ...others, force?: boolean, warranty?: {...}, treasuryId?: string }
    const { force, warranty, treasuryId, ...schemaData } = rawData;
    const data = saleSchema.parse(schemaData);

    const result = await prisma.$transaction(async (tx) => {
        // 0. Ensure Main Warehouse exists/get it
        const mainWarehouseRaw = await tx.warehouse.findFirst({ where: { isDefault: true } });
        if (!mainWarehouseRaw) {
            const { getTranslations } = await import('@/lib/i18n-mock');
            const t = await getTranslations('SystemMessages.Errors');
            throw new Error(t('mainWarehouseMissing'));
        }
        const mainWarehouseId = mainWarehouseRaw.id;

        // 0b. Fetch Settings for Tax & Stock Policy
        const settings = await tx.storeSettings.findUnique({ where: { id: "settings" } });
        const taxRate = Number(settings?.taxRate || 0);
        const globalAllowNegative = (settings as any)?.allowNegativeStock ?? false;
        const effectiveForce = force || globalAllowNegative;

        // 🛡️ SHIFT FK GUARD: Ensure currentShift.id is valid
        const shiftExists = await tx.shift.findUnique({ where: { id: currentShift.id } });
        if (!shiftExists) {
            const { getTranslations } = await import('@/lib/i18n-mock');
            const t = await getTranslations('SystemMessages.Errors');
            throw new Error(t('shiftNotFound'));
        }


        // Recalculate Totals for Integrity
        const subTotalAmount = data.items.reduce((acc, item) => acc + (item.quantity * item.price), 0);
        const discountAmount = data.discountAmount || 0;

        // Guard: Discount cannot exceed subtotal
        const effectiveSubTotal = Math.max(0, subTotalAmount - discountAmount);

        const taxAmount = effectiveSubTotal * (taxRate / 100);
        const totalAmount = effectiveSubTotal + taxAmount;

        // 1. Fetch product details for COGS snapshot and bundle detection
        const productIds = data.items.map(item => item.id);
        const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            // @ts-ignore: isBundle exists in schema but might be missing in cached types
            select: { id: true, costPrice: true, name: true, isBundle: true }
        });

        // 🛡️ FK GUARD: Ensure all products exist
        if (products.length !== data.items.length) {
            const missingIds = productIds.filter(id => !products.find(p => p.id === id));
            throw new Error(`Invalid Product IDs detected: ${missingIds.join(', ')}`);
        }

        // Pre-fetch bundle components for any bundle items in the cart
        const bundleProductIds = products.filter((p: any) => p.isBundle).map(p => p.id);
        const bundleComponentsMap = new Map<string, any[]>();
        for (const bid of bundleProductIds) {
            const comps = await (tx as any).bundleItem.findMany({
                where: { bundleProductId: bid },
                include: {
                    componentProduct: {
                        select: { id: true, costPrice: true, trackStock: true, stock: true }
                    }
                }
            });
            bundleComponentsMap.set(bid, comps);
        }

        // Build cost map — for bundles, sum component costs live
        const costPriceMap = new Map<string, number>();
        for (const p of products) {
            if ((p as any).isBundle) {
                const comps = bundleComponentsMap.get(p.id) || [];
                const bundleCost = comps.reduce(
                    (sum: number, c: any) => sum + (Number(c.componentProduct.costPrice) * c.quantityIncluded),
                    0
                );
                costPriceMap.set(p.id, bundleCost);
            } else {
                costPriceMap.set(p.id, Number(p.costPrice));
            }
        }

        // 2. Create Sale Record
        // Audit: ensure valid DB userId
        let creatorId: string | null = currentUser.id;
        if (creatorId === 'super-admin') {
            const fallback = await tx.user.findFirst({ where: { roleStr: 'ADMIN' } }) || await tx.user.findFirst({ where: { isGlobalAdmin: true } });
            creatorId = fallback?.id || null;
        }

        const sale = await tx.sale.create({
            data: {
                customerId: (data.customer?.id && data.customer.id.trim() !== "") ? data.customer.id : null,
                warehouseId: mainWarehouseId,
                totalAmount: new Decimal(totalAmount),
                subTotal: new Decimal(subTotalAmount),
                discountAmount: new Decimal(discountAmount),
                discountPercentage: data.discountPercentage ? new Decimal(data.discountPercentage) : null,
                taxAmount: new Decimal(taxAmount),
                paymentMethod: data.paymentMethod,
                shiftId: currentShift.id,
                userId: creatorId,
                status: 'COMPLETED',
                customerName: data.customer?.name,
                customerPhone: data.customer?.phone,
                customerAddress: data.customer?.address,
                warrantyDays: warranty?.warrantyDays || null,
                warrantyExpiryDate: warranty?.warrantyExpiryDate || null,
                tableName: rawData.tableName || null,
                tableId: rawData.tableId || null,
                offlineFlag: rawData.offlineFlag || false,
                syncStatus: rawData.offlineFlag ? 'SYNCED' : 'PENDING',
                items: {
                    create: data.items.map((item) => ({
                        productId: item.id,
                        quantity: item.quantity,
                        unitPrice: item.price,
                        unitCost: costPriceMap.get(item.id) || 0 // 🆕 COGS snapshot
                    }))
                },
                payments: {
                    create: data.payments ? data.payments.map(p => ({
                        method: p.method,
                        amount: new Decimal(p.amount)
                    })) : {
                        method: data.paymentMethod,
                        amount: new Decimal(totalAmount)
                    }
                }
            }
        });




        // 2. Deduction Logic (Employee Salary or Customer Account)
        if (data.paymentMethod === 'ACCOUNT' || data.paymentMethod === 'DEFERRED') {
            const customerId = data.customer?.id;

            // Priority: Linked Customer (New Logic)
            if (customerId) {
                // 1. Create Ledger Entry
                await tx.customerTransaction.create({
                    data: {
                        customerId: customerId,
                        type: 'DEBIT', // They owe us
                        amount: new Decimal(totalAmount),
                        description: `Purchase: ${data.items.length} items`,
                        reference: sale.id,
                        createdBy: currentUser.id
                    }
                });

                // 2. Update Customer Balance
                await tx.customer.update({
                    where: { id: customerId },
                    data: { balance: { increment: totalAmount } }
                });

            } else {
                // Fallback: Employee Phone Lookup (Legacy Logic) - REMOVED for Desktop
                // const phone = data.customer?.phone;
                // if (phone) {
                //    // Logic removed
                // }
            }
        }

        // 2b. Deduct Stock — bundles deduct from components, not themselves
        const productInfoMap = new Map(products.map(p => [p.id, p]));
        for (const item of data.items) {
            const productInfo = productInfoMap.get(item.id) as any;

            if ((productInfo as any)?.isBundle) {
                // BUNDLE: deduct from each component
                const components = bundleComponentsMap.get(item.id) || [];
                for (const comp of components) {
                    if (!comp.componentProduct.trackStock) continue;
                    if (effectiveForce) {
                        await tx.product.update({
                            where: { id: comp.componentProductId },
                            data: { stock: { decrement: item.quantity * comp.quantityIncluded } }
                        });
                        await tx.stock.upsert({
                            where: { productId_warehouseId: { productId: comp.componentProductId, warehouseId: mainWarehouseId } },
                            update: { quantity: { decrement: item.quantity * comp.quantityIncluded } },
                            create: { productId: comp.componentProductId, warehouseId: mainWarehouseId, quantity: -(item.quantity * comp.quantityIncluded) }
                        });
                        await tx.stockMovement.create({
                            data: {
                                type: 'SALE_FORCE',
                                productId: comp.componentProductId,
                                fromWarehouseId: mainWarehouseId,
                                toWarehouseId: null,
                                quantity: item.quantity * comp.quantityIncluded,
                                reason: `Bundle Sale (Force) #${sale.id.slice(0, 8)} — component of ${item.id.slice(0, 8)}`
                            }
                        });
                    } else {
                        await decrementWarehouseStock(tx, comp.componentProductId, mainWarehouseId, item.quantity * comp.quantityIncluded);
                    }
                }
            } else {
                // REGULAR product: existing logic
                const product = productInfo;
                if (product && !(product as any).trackStock) {
                    logger.info(`[POS] Skipping stock deduction for product: ${item.id} (trackStock=false)`);
                    continue;
                }

                if (effectiveForce) {
                    // FORCE MODE: Blind Decrement (Allowed to go negative)
                    await tx.product.update({
                        where: { id: item.id },
                        data: { stock: { decrement: item.quantity } }
                    });

                    // Warehouse (Upsert to ensure record exists, then decrement)
                    await tx.stock.upsert({
                        where: { productId_warehouseId: { productId: item.id, warehouseId: mainWarehouseId } },
                        update: { quantity: { decrement: item.quantity } },
                        create: { productId: item.id, warehouseId: mainWarehouseId, quantity: -item.quantity }
                    });

                    // Audit Log for Forced Sale
                    await tx.stockMovement.create({
                        data: {
                            type: 'SALE_FORCE',
                            productId: item.id,
                            fromWarehouseId: mainWarehouseId,
                            toWarehouseId: null,
                            quantity: item.quantity,
                            reason: `Forced Sale #${sale.id.slice(0, 8)} (Override)`
                        }
                    });
                } else {
                    await decrementWarehouseStock(tx, item.id, mainWarehouseId, item.quantity);
                }
            }
        }

        // 2b. 🔒 ATOMIC SHIFT UPDATE (Real-time Synchronization)
        // We accumulate totals based on the payments in this specific sale
        let cashIncrement = 0;
        let cardIncrement = 0;
        let walletIncrement = 0;
        let instapayIncrement = 0;

        // Iterate over the payments we just prepared for creation
        // Note: We use data.payments if available, otherwise fallback to single method
        const paymentsToProcess = data.payments || [{ method: data.paymentMethod, amount: totalAmount }];

        for (const p of paymentsToProcess) {
            const amt = Number(p.amount);
            switch (p.method) {
                case 'CASH': cashIncrement += amt; break;
                case 'VISA':
                case 'CARD': cardIncrement += amt; break;
                case 'WALLET': walletIncrement += amt; break;
                case 'INSTAPAY': instapayIncrement += amt; break;
            }
        }

        await tx.shift.update({
            where: { id: currentShift.id },
            data: {
                totalSales: { increment: 1 },
                totalCashSales: { increment: cashIncrement },
                totalCardSales: { increment: cardIncrement },
                totalWalletSales: { increment: walletIncrement },
                totalInstapay: { increment: instapayIncrement },
                lastHeartbeat: new Date()
            }
        });

        // 3. Record in Treasury/Ledger (per payment method treasury)
        // If an explicit treasuryId was provided for the main payment, we will use it.
        // Otherwise, fallback to the legacy method lookup.

        let branchTreasuries: { id: string; paymentMethod: string | null; isDefault: boolean }[] = [];
        if (currentUser.branchId || treasuryId) {
            // We fetch the treasuries for the branch OR the explicitly requested treasury to ensure it exists
            branchTreasuries = await tx.treasury.findMany({
                where: {
                    OR: [
                        { branchId: currentUser.branchId || undefined },
                        { id: treasuryId || undefined }
                    ],
                    deletedAt: null
                },
                select: { id: true, paymentMethod: true, isDefault: true }
            });
        }

        const getTreasuryForMethod = (method: string, passedTreasuryId?: string): string | null => {
            // If explicit treasuryId is provided and we found it, use it
            if (passedTreasuryId) {
                const explicit = branchTreasuries.find(t => t.id === passedTreasuryId);
                if (explicit) return explicit.id;
            }
            // Fallback: Find treasury for this specific payment method
            const byMethod = branchTreasuries.find(t => t.paymentMethod === method);
            if (byMethod) return byMethod.id;
            // Absolute Fallback to default treasury
            const def = branchTreasuries.find(t => t.isDefault);
            return def?.id || null;
        };

        for (const p of paymentsToProcess) {
            const amt = Number(p.amount);
            if (amt > 0) {
                // Determine if this specific payment record uses the explicitly passed treasuryId
                // (usually only the main payment method would, but for simplicity we bind it to the matching method)
                const isMainPayment = p.method === data.paymentMethod;
                const assignedTreasuryId = getTreasuryForMethod(p.method, isMainPayment ? treasuryId : undefined);

                await tx.transaction.create({
                    data: {
                        type: 'SALE',
                        amount: new Decimal(amt),
                        paymentMethod: p.method,
                        description: `Sale #${sale.id.split('-')[0].toUpperCase()}`,
                        shiftId: currentShift.id,
                        treasuryId: assignedTreasuryId || undefined
                    }
                });

                // Update treasury balance
                if (assignedTreasuryId && p.method !== 'ACCOUNT' && p.method !== 'DEFERRED') {
                    await tx.treasury.update({
                        where: { id: assignedTreasuryId },
                        data: { balance: { increment: amt } }
                    });
                }
            }
        }

        // BL-01 fix: Accounting is inside the transaction.
        // If journal entry fails, the entire sale rolls back automatically.
        await AccountingEngine.recordSale(
            sale.id,
            paymentsToProcess.map(p => ({ method: p.method, amount: Number(p.amount) })),
            tx
        );

        return sale;
    }, { timeout: 20000 });

    // BL-01: Accounting now runs inside the transaction above — removed from here.

    // 🆕 Update shift heartbeat to prevent orphan detection
    try {
        await updateShiftHeartbeat(currentShift.id);
    } catch (heartbeatError) {
        // Non-critical error, log but don't fail the sale
        console.error("Shift heartbeat update failed:", heartbeatError);
    }

    logger.info('Sale processed successfully', {
        saleId: result.id,
        total: result.totalAmount,
        itemCount: data.items.length,
        duration: Date.now() - startTime,
        forced: force || false,
        shiftId: currentShift.id // 🆕 Log shift ID
    });

    revalidatePath("/", 'page');
    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidatePath("/logs", 'page');
    revalidatePath("/reports", 'page');
    revalidatePath("/accounting", 'page');
    revalidateTag("dashboard");

    return { message: "Sale processed successfully", saleId: result.id, sale: result };

}, { permission: PERMISSIONS.POS_ACCESS }); // Strict POS permission
