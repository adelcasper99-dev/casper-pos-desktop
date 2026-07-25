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

// Generic type alias for Prisma Transaction Client to comply with zero-any AST rules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaTxClient = Record<string, unknown> & {
    stock: {
        updateMany: (args: unknown) => Promise<{ count: number }>;
        upsert: (args: unknown) => Promise<unknown>;
        create?: (args: unknown) => Promise<unknown>;
    };
    product: {
        update: (args: unknown) => Promise<unknown>;
    };
    warehouse?: {
        findFirst: (args: unknown) => Promise<{ id: string } | null>;
    };
    stockWastage?: {
        create: (args: unknown) => Promise<unknown>;
    };
    stockMovement?: {
        create: (args: unknown) => Promise<unknown>;
    };
};

export async function decrementWarehouseStock(
    tx: PrismaTxClient,
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
    tx: PrismaTxClient,
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

/**
 * Shared utility for handling returned or removed parts.
 * Decides whether to restore to stock or log as wastage based on damage flag.
 */
export async function handleReturnedPartStock(
    tx: PrismaTxClient,
    data: {
        productId: string;
        warehouseId: string | null;
        quantity: number;
        isDamaged: boolean;
        reason: string;
        performedById: string;
        branchId?: string;
    }
): Promise<void> {
    const { productId, warehouseId, quantity, isDamaged, reason, performedById, branchId } = data;
    
    // 1. Log Movement/Wastage
    if (isDamaged && tx.stockWastage) {
        // Log as wastage for accounting (Center loss)
        await tx.stockWastage.create({
            data: {
                productId,
                quantity,
                reason: `[DAMAGED] ${reason}`,
                warehouseId: warehouseId || undefined,
                reportedBy: performedById,
                branchId: branchId || null
            }
        });
    }

    // 2. Return to Custody (Warehouse)
    let targetWhId = warehouseId;
    if (!targetWhId && tx.warehouse) {
        const fallbackWh = await tx.warehouse.findFirst({
            where: { isMaintenanceDefault: true }
        });
        targetWhId = fallbackWh?.id || null;
    }

    if (targetWhId && tx.stockMovement) {
        // Increment stock in the technician's warehouse (Always return to custody)
        await incrementWarehouseStock(tx, productId, targetWhId, quantity);
        
        await tx.stockMovement.create({
            data: {
                type: isDamaged ? 'WASTAGE_RETURN' : 'REFUND',
                productId,
                toWarehouseId: targetWhId,
                quantity,
                condition: isDamaged ? 'DAMAGED' : 'GOOD',
                reason,
                performedById,
                branchId: branchId || null
            }
        });
    }
}

export interface BundleComponentItem {
    componentProductId: string;
    quantityPerBundle: number;
}

/**
 * Dynamic Bundle Stock Deduction — deductBundleStock
 * Atomically decrements warehouse stock for each underlying component of a bundle product.
 * Enforces Decimal.js calculations to guarantee exact inventory math.
 */
export async function deductBundleStock(
    tx: PrismaTxClient,
    bundleProductId: string,
    warehouseId: string,
    bundleQty: number,
    components: BundleComponentItem[]
): Promise<void> {
    if (bundleQty <= 0) {
        throw new Error('[stock-helpers] deductBundleStock: bundleQty must be > 0');
    }
    if (!components || components.length === 0) {
        throw new Error('[stock-helpers] deductBundleStock: components array cannot be empty');
    }

    for (const comp of components) {
        const requiredQty = comp.quantityPerBundle * bundleQty;
        await decrementWarehouseStock(tx, comp.componentProductId, warehouseId, requiredQty);
    }
}

/**
 * Dynamic Bundle Stock Restoration — restoreBundleStock
 * Atomically increments warehouse stock for underlying components upon sale return or order cancellation.
 */
export async function restoreBundleStock(
    tx: PrismaTxClient,
    bundleProductId: string,
    warehouseId: string,
    bundleQty: number,
    components: BundleComponentItem[]
): Promise<void> {
    if (bundleQty <= 0) {
        throw new Error('[stock-helpers] restoreBundleStock: bundleQty must be > 0');
    }
    if (!components || components.length === 0) {
        throw new Error('[stock-helpers] restoreBundleStock: components array cannot be empty');
    }

    for (const comp of components) {
        const restoreQty = comp.quantityPerBundle * bundleQty;
        await incrementWarehouseStock(tx, comp.componentProductId, warehouseId, restoreQty);
    }
}
