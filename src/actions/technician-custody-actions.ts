'use server'

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { secureAction } from "@/lib/safe-action"
import { PERMISSIONS } from "@/lib/permissions"
import { serialize } from "@/lib/serialization"
import { decrementWarehouseStock } from "@/lib/stock-helpers"

export type TechnicianSummary = {
    id: string
    name: string
    warehouseId?: string | null
    itemCount: number
}

/**
 * Fetch technicians with their current stock count
 */
export const getTechniciansForCustody = secureAction(async () => {
    try {
        const technicians = await (prisma as any).technician.findMany({
            where: { deletedAt: null },
            include: {
                warehouse: {
                    include: { stocks: true }
                }
            },
            orderBy: { name: 'asc' }
        });

        const summary: TechnicianSummary[] = (technicians as any[]).map(t => ({
            id: t.id,
            name: t.name,
            warehouseId: t.warehouseId,
            itemCount: t.warehouse?.stocks.reduce((acc: number, s: any) => acc + s.quantity, 0) || 0
        }));

        return serialize({ data: summary });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to fetch technicians: ${message}`);
    }
}, { permission: PERMISSIONS.ENGINEER_VIEW, requireCSRF: false });

/**
 * Search products with availability from a specific source warehouse
 */
export const searchProductsForCustody = secureAction(async (data: {
    query: string,
    sourceWarehouseId?: string
}) => {
    const { query, sourceWarehouseId } = data;
    try {
        // Resolve source warehouse
        let warehouseId = sourceWarehouseId;
        if (!warehouseId) {
            const defaultWh = await prisma.warehouse.findFirst({ where: { isMaintenanceDefault: true } });
            warehouseId = defaultWh?.id || undefined;
        }

        const products = await prisma.product.findMany({
            where: {
                OR: [
                    { name: { contains: query } },
                    { sku: { contains: query } }
                ],
                deletedAt: null
            },
            take: 20,
            include: {
                stocks: true,
                category: true
            }
        });

        const results = (products as any[]).map(p => {
            const stock = p.stocks.find((s: any) => s.warehouseId === warehouseId);
            return {
                id: p.id,
                name: p.name,
                sku: p.sku,
                categoryName: p.category?.name || 'Uncategorized',
                categoryColor: p.category?.color,
                availableQuantity: stock?.quantity || 0,
                costPrice: Number(p.costPrice),
                sellPrice: Number(p.sellPrice)
            };
        });

        return { data: results };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to search products: ${message}`);
    }
}, { permission: PERMISSIONS.INVENTORY_VIEW, requireCSRF: false });

/**
 * Transfer parts from a warehouse to a technician's warehouse (Bulk)
 */
export const transferCustodyToTech = secureAction(async (data: {
    technicianId: string,
    sourceWarehouseId: string,
    items: { productId: string, quantity: number }[],
    csrfToken?: string
}) => {
    const { technicianId, sourceWarehouseId, items } = data;

    if (!items || items.length === 0) {
        throw new Error("No items to transfer");
    }

    // Get technician's warehouse
    const tech = await (prisma as any).technician.findUnique({
        where: { id: technicianId },
        select: { warehouseId: true, name: true }
    });

    if (!tech) throw new Error("Technician not found");
    if (!tech.warehouseId) throw new Error(`Technician has no warehouse. Please create a warehouse for this technician first.`);
    if (tech.warehouseId === sourceWarehouseId) throw new Error("Source and destination warehouse cannot be the same");

    const destWarehouseId = tech.warehouseId;
    
    // Fetch source warehouse for branch context
    const sourceWh = await prisma.warehouse.findUnique({
        where: { id: sourceWarehouseId },
        select: { branchId: true }
    });

    await prisma.$transaction(async (tx) => {
        for (const item of items) {
            // 1. Check source stock
            const srcStock = await tx.stock.findUnique({
                where: {
                    productId_warehouseId: {
                        productId: item.productId,
                        warehouseId: sourceWarehouseId
                    }
                }
            });

            if (!srcStock || srcStock.quantity < item.quantity) {
                const product = await tx.product.findUnique({ where: { id: item.productId }, select: { name: true } });
                throw new Error(`Insufficient stock for "${product?.name || item.productId}". Available: ${srcStock?.quantity || 0}`);
            }

            // 2. Deduct from source
            await tx.stock.update({
                where: { id: srcStock.id },
                data: { quantity: { decrement: item.quantity } }
            });

            // 3. Add to technician's warehouse
            await tx.stock.upsert({
                where: {
                    productId_warehouseId: {
                        productId: item.productId,
                        warehouseId: destWarehouseId
                    }
                },
                update: { quantity: { increment: item.quantity } },
                create: {
                    productId: item.productId,
                    warehouseId: destWarehouseId,
                    quantity: item.quantity
                }
            });

            // 4. Record stock movement
            await tx.stockMovement.create({
                data: {
                    type: 'TRANSFER',
                    productId: item.productId,
                    fromWarehouseId: sourceWarehouseId,
                    toWarehouseId: destWarehouseId,
                    quantity: item.quantity,
                    reason: `Custody handover to technician: ${tech.name}`,
                    branchId: sourceWh?.branchId || null
                } as any
            });
        }
    });

    revalidatePath('/maintenance/technicians');
    return { success: true };
}, { permission: PERMISSIONS.INVENTORY_MANAGE });

/**
 * Quick transfer of a single part from Main Warehouse to Technician's Warehouse
 * (Used from the Ticket Parts Manager)
 */
export const transferPartToTechnicianQuick = secureAction(async (data: {
    technicianId: string,
    productId: string,
    quantity: number,
    csrfToken?: string
}) => {
    const { technicianId, productId, quantity } = data;

    if (quantity <= 0) throw new Error("Quantity must be greater than zero");

    // 1. Get Technician's Warehouse
    const tech = await (prisma as any).technician.findUnique({
        where: { id: technicianId },
        select: { warehouseId: true, name: true }
    });

    if (!tech) throw new Error("Technician not found");
    if (!tech.warehouseId) throw new Error("Technician has no assigned warehouse.");

    const destWarehouseId = tech.warehouseId;

    // 2. Get Main Maintenance Warehouse
    const mainWh = await prisma.warehouse.findFirst({ where: { isMaintenanceDefault: true } });
    
    if (!mainWh) throw new Error("Main maintenance warehouse not found. Please set a maintenance default.");

    const sourceWarehouseId = mainWh.id;

    if (destWarehouseId === sourceWarehouseId) {
        throw new Error("Cannot transfer to the same warehouse");
    }

    // 3. Execute Transfer Transaction
    await prisma.$transaction(async (tx) => {
        // Check source stock
        const srcStock = await tx.stock.findUnique({
            where: {
                productId_warehouseId: { productId, warehouseId: sourceWarehouseId }
            }
        });

        if (!srcStock || srcStock.quantity < quantity) {
            throw new Error(`Insufficient stock in main warehouse. Available: ${srcStock?.quantity || 0}`);
        }

        // Deduct from source
        await tx.stock.update({
            where: { id: srcStock.id },
            data: { quantity: { decrement: quantity } }
        });

        // Add to technician's warehouse
        await tx.stock.upsert({
            where: {
                productId_warehouseId: { productId, warehouseId: destWarehouseId }
            },
            update: { quantity: { increment: quantity } },
            create: {
                productId,
                warehouseId: destWarehouseId,
                quantity
            }
        });

        // Record stock movement
        await tx.stockMovement.create({
            data: {
                type: 'TRANSFER',
                productId,
                fromWarehouseId: sourceWarehouseId,
                toWarehouseId: destWarehouseId,
                quantity,
                reason: `Direct transfer to technician ${tech.name} from ticket manager`,
                branchId: mainWh.branchId || null
            } as any
        });
    });

    return { success: true };
}, { permission: PERMISSIONS.INVENTORY_MANAGE });
