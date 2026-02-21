/**
 * Atomic Warehouse Stock Decrement — stock-helpers.ts
 *
 * Shared utility that atomically decrements BOTH Product.stock (global) AND
 * Stock.quantity (per-warehouse) in a single transaction step.
 *
 * Fixes BL-06 (dual stock divergence) and BL-07 (no warehouse stock guard).
 *
 * Usage:
 *   import { decrementWarehouseStock, incrementWarehouseStock } from '@/lib/stock-helpers';
 *
 *   await prisma.$transaction(async (tx) => {
 *       await decrementWarehouseStock(tx, productId, warehouseId, quantity);
 *       // rest of transaction...
 *   });
 */

export async function decrementWarehouseStock(
    tx: any, // PrismaTransactionClient
    productId: string,
    warehouseId: string,
    qty: number
): Promise<void> {
    if (qty <= 0) throw new Error('[stock-helpers] decrementWarehouseStock: qty must be > 0');

    // Atomically decrement warehouse stock, only if sufficient quantity exists
    const updated = await tx.stock.updateMany({
        where: {
            productId,
            warehouseId,
            quantity: { gte: qty },
        },
        data: { quantity: { decrement: qty } },
    });

    if (updated.count === 0) {
        throw new Error(
            `Insufficient warehouse stock for product ${productId} in warehouse ${warehouseId} (requested: ${qty})`
        );
    }

    // Keep global Product.stock in sync
    await tx.product.update({
        where: { id: productId },
        data: { stock: { decrement: qty } },
    });
}

export async function incrementWarehouseStock(
    tx: any, // PrismaTransactionClient
    productId: string,
    warehouseId: string,
    qty: number
): Promise<void> {
    if (qty <= 0) throw new Error('[stock-helpers] incrementWarehouseStock: qty must be > 0');

    await tx.stock.upsert({
        where: { productId_warehouseId: { productId, warehouseId } },
        update: { quantity: { increment: qty } },
        create: { productId, warehouseId, quantity: qty },
    });

    // Keep global Product.stock in sync
    await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: qty } },
    });
}
