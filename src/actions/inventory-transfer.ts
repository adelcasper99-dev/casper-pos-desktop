'use server';

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { z } from "zod";
import { getSession } from "@/lib/auth";

// Schema for validation
const TransferItemSchema = z.object({
    productId: z.string(),
    quantity: z.number().min(1),
});

const TransferStockSchema = z.object({
    sourceId: z.string(), // Engineer ID or Warehouse ID
    sourceType: z.enum(['ENGINEER', 'WAREHOUSE']),
    destinationId: z.string(), // Engineer ID or Warehouse ID
    destinationType: z.enum(['ENGINEER', 'WAREHOUSE']),
    items: z.array(TransferItemSchema),
    csrfToken: z.string().optional(),
});

/**
 * Generic Stock Transfer Action
 * Supports:
 * - Warehouse -> Warehouse
 * - Warehouse -> Engineer
 * - Engineer -> Warehouse
 * - Engineer -> Engineer
 */
export const transferStock = secureAction(async (data: z.infer<typeof TransferStockSchema>) => {
    const { sourceId, sourceType, destinationId, destinationType, items } = data;

    // Get current user for logging
    const session = await getSession();
    const performedById = session?.user?.id;

    if (!items || items.length === 0) {
        throw new Error("No items selected for transfer.");
    }

    if (sourceId === destinationId && sourceType === destinationType) {
        throw new Error("Source and Destination cannot be the same.");
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Resolve Source Warehouse ID
            let sourceWarehouseId: string | null = null;
            let sourceName = "Unknown";

            if (sourceType === 'ENGINEER') {
                const tech = await tx.technician.findUnique({
                    where: { id: sourceId },
                    include: { warehouse: true }
                });
                if (!tech?.warehouseId) throw new Error("Source engineer has no custody warehouse.");
                sourceWarehouseId = tech.warehouseId;
                sourceName = tech.name;
            } else {
                const wh = await tx.warehouse.findUnique({ where: { id: sourceId } });
                if (!wh) throw new Error("Source warehouse not found.");
                sourceWarehouseId = wh.id;
                sourceName = wh.name;
            }

            // 2. Resolve Destination Warehouse ID (and create if missing for Engineer)
            let destWarehouseId: string | null = null;
            let destName = "Unknown";

            if (destinationType === 'ENGINEER') {
                const tech = await tx.technician.findUnique({
                    where: { id: destinationId },
                    include: { user: true, warehouse: true }
                });
                if (!tech) throw new Error("Destination engineer not found.");
                destName = tech.name;
                destWarehouseId = tech.warehouseId;

                // Auto-create/Fix warehouse for Engineer if missing
                if (!destWarehouseId) {
                    let branchId = tech.user?.branchId;
                    if (!branchId) {
                        // Fallback to Main or Any branch
                        const main = await tx.branch.findFirst({ where: { code: 'MAIN' } });
                        const anyBranch = await tx.branch.findFirst();
                        branchId = main?.id || anyBranch?.id || "";
                    }
                    if (!branchId) throw new Error("System Error: No branch available to create warehouse.");

                    const newWh = await tx.warehouse.create({
                        data: {
                            name: `${tech.name}'s Custody`,
                            branchId,
                            isDefault: false
                        }
                    });
                    await tx.technician.update({
                        where: { id: tech.id },
                        data: { warehouseId: newWh.id }
                    });
                    destWarehouseId = newWh.id;
                }
            } else {
                const wh = await tx.warehouse.findUnique({ where: { id: destinationId } });
                if (!wh) throw new Error("Destination warehouse not found.");
                destWarehouseId = wh.id;
                destName = wh.name;
            }

            // 3. Process Items
            for (const item of items) {
                // Validate Source Stock
                const sourceStock = await tx.stock.findUnique({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId: sourceWarehouseId } }
                });

                if (!sourceStock || sourceStock.quantity < item.quantity) {
                    throw new Error(`Insufficient stock for product. Available: ${sourceStock?.quantity || 0}, Requested: ${item.quantity}`);
                }

                // Move Stock
                await tx.stock.update({
                    where: { id: sourceStock.id },
                    data: { quantity: { decrement: item.quantity } }
                });

                await tx.stock.upsert({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId: destWarehouseId } },
                    update: { quantity: { increment: item.quantity } },
                    create: {
                        productId: item.productId,
                        warehouseId: destWarehouseId,
                        quantity: item.quantity
                    }
                });

                // Log Movement
                await tx.stockMovement.create({
                    data: {
                        type: 'TRANSFER',
                        productId: item.productId,
                        fromWarehouseId: sourceWarehouseId,
                        toWarehouseId: destWarehouseId,
                        quantity: item.quantity,
                        reason: `Transfer from ${sourceName} (${sourceType}) to ${destName} (${destinationType})`,
                        performedById // Add user tracking
                    }
                });
            }

            return { count: items.length, source: sourceName, dest: destName };
        });

        revalidatePath('/maintenance');
        revalidatePath('/inventory');
        return { success: true, message: `Successfully transferred ${result.count} items from ${result.source} to ${result.dest}` };

    } catch (error: any) {
        console.error("Transfer failed:", error);
        // Return the specific error message to the client
        return { success: false, message: error.message || "Transfer failed." };
    }
}, { permission: PERMISSIONS.INVENTORY_MANAGE });

const TransferHistoryFilterSchema = z.object({
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    searchQuery: z.string().optional(),
    warehouseId: z.string().optional(),
});

export const getTransferHistory = async (filters?: z.infer<typeof TransferHistoryFilterSchema>) => {
    try {
        // 1. Manual Auth & Permission Check
        const session = await getSession();
        if (!session?.user) {
            return { success: false, message: "Unauthorized" };
        }

        // Simple permission check
        const user = session.user;
        const hasPermission = user.permissions?.includes(PERMISSIONS.INVENTORY_VIEW) || user.role === 'ADMIN';
        if (!hasPermission) {
            return { success: false, message: "Insufficient permissions" };
        }

        const where: any = {
            type: 'TRANSFER'
        };

        if (filters) {
            if (filters.startDate) {
                where.createdAt = { ...where.createdAt, gte: filters.startDate };
            }
            if (filters.endDate) {
                // Set end date to end of day
                const end = new Date(filters.endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt = { ...where.createdAt, lte: end };
            }
            if (filters.warehouseId && filters.warehouseId !== 'ALL') {
                where.OR = [
                    { fromWarehouseId: filters.warehouseId },
                    { toWarehouseId: filters.warehouseId }
                ];
            }
            if (filters.searchQuery) {
                const query = filters.searchQuery.toLowerCase();
                where.product = {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { sku: { contains: query, mode: 'insensitive' } }
                    ]
                };
            }
        }

        const movements = await prisma.stockMovement.findMany({
            where,
            take: 50,
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                product: {
                    select: { name: true, sku: true }
                },
                fromWarehouse: {
                    select: { name: true }
                },
                toWarehouse: {
                    select: { name: true }
                },
                performedBy: { // Include user details
                    select: { name: true, username: true }
                }
            }
        });

        // Explicitly map to plain objects
        const plainMovements = movements.map(m => ({
            id: m.id,
            type: m.type,
            productId: m.productId,
            fromWarehouseId: m.fromWarehouseId,
            toWarehouseId: m.toWarehouseId,
            quantity: m.quantity,
            reason: m.reason,
            createdAt: m.createdAt,
            product: m.product ? { name: m.product.name, sku: m.product.sku } : { name: 'Unknown', sku: 'N/A' },
            fromWarehouse: m.fromWarehouse ? { name: m.fromWarehouse.name } : null,
            toWarehouse: m.toWarehouse ? { name: m.toWarehouse.name } : null,
            performedBy: m.performedBy ? { name: m.performedBy.name || m.performedBy.username } : null // Map user
        }));

        return { success: true, data: plainMovements };
    } catch (error) {
        console.error("Failed to fetch transfer history:", error);
        return { success: false, message: "Failed to load history" };
    }
};
