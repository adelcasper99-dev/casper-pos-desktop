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
    warranty?: {
        warrantyDays?: number;
        warrantyExpiryDate?: Date;
    };
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

    // 1. Separate "force" flag and "warranty" from Schema validation
    // We treat 'rawData' as { items: [], ...others, force?: boolean, warranty?: {...} }
    const { force, warranty, ...schemaData } = rawData;
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

        // 0b. Fetch Settings for Tax
        const settings = await tx.storeSettings.findUnique({ where: { id: "settings" } });
        const taxRate = Number(settings?.taxRate || 0);

        // Recalculate Totals for Integrity
        const subTotal = data.items.reduce((acc, item) => acc + (item.quantity * item.price), 0);
        const taxAmount = subTotal * (taxRate / 100);
        const totalAmount = subTotal + taxAmount;

        // 1. Fetch product costPrices for COGS snapshot (Phase 2 fix)
        const productIds = data.items.map(item => item.id);
        const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, costPrice: true }
        });
        const costPriceMap = new Map(products.map((p) => [p.id, Number(p.costPrice)]));

        // 2. Create Sale Record (linked to shift, with warranty if provided)
        const sale = await tx.sale.create({
            data: {
                status: 'COMPLETED', // Explicitly mark as completed for dashboard visibility
                paymentMethod: data.paymentMethod,
                totalAmount: new Decimal(totalAmount),
                taxAmount: new Decimal(taxAmount),
                subTotal: new Decimal(subTotal),
                customerName: data.customer?.name,
                customerPhone: data.customer?.phone,
                customerId: data.customer?.id, // 🆕 Link to Customer Record
                customerAddress: data.customer?.address,
                warehouseId: mainWarehouseId,
                shiftId: currentShift.id, // 🆕 Link to shift
                // 🆕 Warranty Information
                warrantyDays: warranty?.warrantyDays || null,
                warrantyExpiryDate: warranty?.warrantyExpiryDate || null,
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

        // 2b. Deduct Stock (With Manager Override Support)
        for (const item of data.items) {
            if (force) {
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
                // SAFE MODE: BL-06/BL-07 fix — use shared atomic helper.
                // decrementWarehouseStock updates BOTH Product.stock AND Stock.quantity
                // in a single guarded operation, preventing dual-state divergence.
                await decrementWarehouseStock(tx, item.id, mainWarehouseId, item.quantity);
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
        // Pre-fetch all treasuries for this branch, keyed by paymentMethod
        let branchTreasuries: { id: string; paymentMethod: string | null; isDefault: boolean }[] = [];
        if (currentUser.branchId) {
            branchTreasuries = await tx.treasury.findMany({
                where: { branchId: currentUser.branchId, deletedAt: null },
                select: { id: true, paymentMethod: true, isDefault: true }
            });
        }

        const getTreasuryForMethod = (method: string): string | null => {
            // Find treasury for this specific payment method
            const byMethod = branchTreasuries.find(t => t.paymentMethod === method);
            if (byMethod) return byMethod.id;
            // Fallback to default treasury
            const def = branchTreasuries.find(t => t.isDefault);
            return def?.id || null;
        };

        for (const p of paymentsToProcess) {
            const amt = Number(p.amount);
            if (amt > 0) {
                const treasuryId = getTreasuryForMethod(p.method);
                await tx.transaction.create({
                    data: {
                        type: 'SALE',
                        amount: new Decimal(amt),
                        paymentMethod: p.method,
                        description: `Sale #${sale.id.split('-')[0].toUpperCase()}`,
                        shiftId: currentShift.id,
                        treasuryId
                    }
                });

                // Update treasury balance
                if (treasuryId && p.method !== 'ACCOUNT' && p.method !== 'DEFERRED') {
                    await tx.treasury.update({
                        where: { id: treasuryId },
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
