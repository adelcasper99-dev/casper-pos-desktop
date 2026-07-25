import { describe, it, expect } from 'vitest';
import { calculateStockAlertSeverity, filterLowStockAlerts } from '@/lib/stock-alerts';
import { Decimal } from 'decimal.js';

describe('Low Stock Alert Notification Engine', () => {
    it('should categorize stock <= 0 as CRITICAL_OUT_OF_STOCK', () => {
        expect(calculateStockAlertSeverity(0, 5)).toBe('CRITICAL_OUT_OF_STOCK');
        expect(calculateStockAlertSeverity(-2, 5)).toBe('CRITICAL_OUT_OF_STOCK');
        expect(calculateStockAlertSeverity(new Decimal(0), new Decimal(10))).toBe('CRITICAL_OUT_OF_STOCK');
    });

    it('should categorize 0 < stock <= minStock as REORDER_WARNING', () => {
        expect(calculateStockAlertSeverity(3, 5)).toBe('REORDER_WARNING');
        expect(calculateStockAlertSeverity(5, 5)).toBe('REORDER_WARNING');
        expect(calculateStockAlertSeverity(new Decimal(4.5), new Decimal(5))).toBe('REORDER_WARNING');
    });

    it('should return null when stock > minStock', () => {
        expect(calculateStockAlertSeverity(10, 5)).toBe(null);
        expect(calculateStockAlertSeverity(new Decimal(15), new Decimal(5))).toBe(null);
    });

    it('should filter out untracked products (trackStock = false) and deleted items', () => {
        const products = [
            { id: '1', sku: 'SKU1', name: 'Product 1', stock: 2, minStock: 5, trackStock: true },
            { id: '2', sku: 'SKU2', name: 'Labor Service', stock: 0, minStock: 5, trackStock: false },
            { id: '3', sku: 'SKU3', name: 'Deleted Item', stock: 0, minStock: 5, trackStock: true, deletedAt: new Date() },
            { id: '4', sku: 'SKU4', name: 'Out of Stock Item', stock: 0, minStock: 5, trackStock: true },
        ];

        const alerts = filterLowStockAlerts(products);

        expect(alerts).toHaveLength(2);
        expect(alerts[0].productId).toBe('1');
        expect(alerts[0].severity).toBe('REORDER_WARNING');
        expect(alerts[1].productId).toBe('4');
        expect(alerts[1].severity).toBe('CRITICAL_OUT_OF_STOCK');
    });
});
