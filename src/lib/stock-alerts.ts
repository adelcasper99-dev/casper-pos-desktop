import { Decimal } from 'decimal.js';

export interface LowStockAlertOptions {
    warehouseId?: string;
    globalMinStockThreshold?: number;
}

export interface LowStockAlertItem {
    productId: string;
    sku: string;
    name: string;
    effectiveStock: number;
    minStock: number;
    severity: 'CRITICAL_OUT_OF_STOCK' | 'REORDER_WARNING';
    warehouseId?: string | null;
}

/**
 * Core Low Stock Re-order Alert Helper — checkLowStockAlerts
 * Scans products with trackStock = true and calculates re-order warnings.
 * Uses Decimal.js math to guarantee zero-float precision errors.
 */
export function calculateStockAlertSeverity(
    effectiveStock: number | Decimal,
    minStock: number | Decimal
): 'CRITICAL_OUT_OF_STOCK' | 'REORDER_WARNING' | null {
    const stockDec = new Decimal(effectiveStock);
    const minStockDec = new Decimal(minStock);

    if (stockDec.lte(0)) {
        return 'CRITICAL_OUT_OF_STOCK';
    }
    if (stockDec.lte(minStockDec)) {
        return 'REORDER_WARNING';
    }
    return null;
}

/**
 * Filter low stock items from product records
 */
export function filterLowStockAlerts(
    products: Array<{
        id: string;
        sku: string;
        name: string;
        stock: number | Decimal;
        minStock: number | Decimal;
        trackStock?: boolean | null;
        deletedAt?: unknown;
    }>
): LowStockAlertItem[] {
    const alerts: LowStockAlertItem[] = [];

    for (const p of products) {
        // Untracked items (services/labor) or deleted items are ignored
        if (p.trackStock === false || p.deletedAt) continue;

        const severity = calculateStockAlertSeverity(p.stock, p.minStock);
        if (severity) {
            const stockDec = new Decimal(p.stock);
            const minStockDec = new Decimal(p.minStock);
            alerts.push({
                productId: p.id,
                sku: p.sku,
                name: p.name,
                effectiveStock: stockDec.toNumber(),
                minStock: minStockDec.toNumber(),
                severity,
            });
        }
    }

    return alerts;
}
