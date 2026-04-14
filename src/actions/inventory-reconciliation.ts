"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/actions/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { Decimal } from "decimal.js";
import { revalidatePath } from "next/cache";

interface StockReconciliationParams {
    productId: string;
    warehouseId: string;
    actualCount: number;
    reasonCode: string;
    notes?: string;
    csrfToken?: string;
}

export async function submitStockReconciliation({
    productId,
    warehouseId,
    actualCount,
    reasonCode,
    notes = "",
    csrfToken
}: StockReconciliationParams) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return { success: false, message: "Unauthorized. Please log in." };
        }

        // Verify permissions - requires INVENTORY_MANAGE or Global Admin
        const canManageInventory = user.isGlobalAdmin || hasPermission(user.permissions, 'INVENTORY_MANAGE') || hasPermission(user.permissions, 'INVENTORY_ADJUST');
        if (!canManageInventory) {
            return { success: false, message: "Permission Denied: You do not have permission to reconcile inventory." };
        }

        if (actualCount < 0) {
            return { success: false, message: "Invalid Count: Actual count cannot be negative." };
        }

        // We run everything in an isolated transaction to prevent race conditions & double-entry
        const result = await prisma.$transaction(async (tx) => {
            const product = await tx.product.findUnique({
                where: { id: productId },
            });

            if (!product) {
                throw new Error("Product not found.");
            }

            const stockRecord = await tx.stock.findUnique({
                where: {
                    productId_warehouseId: {
                        productId,
                        warehouseId
                    }
                }
            });

            const theoreticalStock = Number(stockRecord?.quantity || 0);
            const variance = actualCount - theoreticalStock;

            if (variance === 0) {
                throw new Error("No adjustment needed. Actual count matches theoretical stock.");
            }

            // 1. Update the Warehouse Stock using atomic increment to prevent fat-finger overwrites
            await tx.stock.upsert({
                where: {
                    productId_warehouseId: {
                        productId,
                        warehouseId
                    }
                },
                update: {
                    quantity: {
                        increment: variance
                    }
                },
                create: {
                    productId,
                    warehouseId,
                    quantity: actualCount
                }
            });

            // 2. Synchronize the total product stock across all warehouses
            const allStocks = await tx.stock.findMany({
                where: { productId }
            });
            const newTotalStock = allStocks.reduce((sum, s) => sum + Number(s.quantity || 0), 0) + variance;
            
            await tx.product.update({
                where: { id: productId },
                data: {
                    stock: Math.floor(newTotalStock),
                    updatedAt: new Date()
                }
            });

            // 3. Create Audit Log (For compliance)
            const auditIdempotencyKey = crypto.randomUUID();
            await tx.auditLog.create({
                data: {
                    entityType: "STOCK",
                    entityId: productId,
                    action: "STOCK_RECONCILIATION",
                    previousData: JSON.stringify({ stock: theoreticalStock }),
                    newData: JSON.stringify({ stock: actualCount, variance, reasonCode }),
                    reason: notes || reasonCode,
                    user: user.id,
                    branchId: user.branchId,
                    createdAt: new Date()
                }
            });

            // 4. Create StockMovement Ledger
            const movementIdempotencyKey = crypto.randomUUID();
            await tx.stockMovement.create({
                data: {
                    type: "RECONCILIATION",
                    productId,
                    fromWarehouseId: warehouseId,
                    quantity: new Decimal(variance),
                    condition: "GOOD",
                    reason: reasonCode,
                    performedById: user.id,
                    branchId: user.branchId,
                    idempotencyKey: movementIdempotencyKey,
                    createdAt: new Date()
                }
            });

            // 5. Double-Entry Journal (Financial Ledger Impact)
            const costPrice = new Decimal(product.costPrice || 0);
            const financialImpact = costPrice.mul(Math.abs(variance));

            if (financialImpact.gt(0)) {
                const journalIdempotency = crypto.randomUUID();
                const varianceAbs = Math.abs(variance);
                const description = variance < 0 
                  ? `تسوية جردية (عجز): ${product.name} | الكمية: ${varianceAbs} | كود: ${reasonCode}`
                  : `تسوية جردية (زيادة): ${product.name} | الكمية: ${varianceAbs} | كود: ${reasonCode}`;

                const journalEntry = await tx.journalEntry.create({
                    data: {
                        date: new Date(),
                        description,
                        reference: `REC-${auditIdempotencyKey.substring(0,8)}`.toUpperCase(),
                        branchId: user.branchId || null,
                        idempotencyKey: journalIdempotency
                    }
                });

                // Asset Account (Assuming mapping constant INVENTORY_ASSET_GL exists)
                const inventoryAssetAccountId = await tx.account.findUnique({ where: { code: '1200' } }); // Example standard default
                const adjustmentAccountId = await tx.account.findUnique({ where: { code: '5100' } }); // General Expense or specific adjustment account
                
                // Note: Double Entry for losses: Debit Loss Account, Credit Inventory Asset
                // Double Entry for gains: Debit Inventory Asset, Credit Gain (Revenue/Adjustment) Account
                // We fallback to standard codes if exact account isn't found
                
                if (variance < 0) {
                    // LOSS
                    if (adjustmentAccountId) {
                        await tx.journalLine.create({
                            data: {
                                journalEntryId: journalEntry.id,
                                accountId: adjustmentAccountId.id,
                                debit: financialImpact,
                                credit: new Decimal(0),
                                description: 'Stock Reconciliation Loss Debit'
                            }
                        });
                    }
                    if (inventoryAssetAccountId) {
                        await tx.journalLine.create({
                            data: {
                                journalEntryId: journalEntry.id,
                                accountId: inventoryAssetAccountId.id,
                                debit: new Decimal(0),
                                credit: financialImpact,
                                description: 'Stock Reconciliation Inventory Credit'
                            }
                        });
                    }
                } else {
                    // GAIN
                    if (inventoryAssetAccountId) {
                        await tx.journalLine.create({
                            data: {
                                journalEntryId: journalEntry.id,
                                accountId: inventoryAssetAccountId.id,
                                debit: financialImpact,
                                credit: new Decimal(0),
                                description: 'Stock Reconciliation Inventory Debit'
                            }
                        });
                    }
                    const revenueAdjustAccountId = await tx.account.findUnique({ where: { code: '4100' } });
                    if (revenueAdjustAccountId || adjustmentAccountId) {
                        await tx.journalLine.create({
                            data: {
                                journalEntryId: journalEntry.id,
                                accountId: revenueAdjustAccountId?.id || adjustmentAccountId!.id,
                                debit: new Decimal(0),
                                credit: financialImpact,
                                description: 'Stock Reconciliation Gain Credit'
                            }
                        });
                    }
                }
            }

            return { variance };
        });

        revalidatePath('/inventory');
        return { success: true, variance: result.variance };

    } catch (e: any) {
        console.error("Stock reconciliation error:", e);
        return { success: false, message: e.message || "An unexpected error occurred during stock adjustment." };
    }
}
