import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deductBundleStock, restoreBundleStock, BundleComponentItem } from '@/lib/stock-helpers';

describe('Dynamic Bundle Stock Deduction & Restoration', () => {
    let mockTx: any;
    let updateManyCalls: any[];
    let productUpdateCalls: any[];
    let stockUpsertCalls: any[];

    beforeEach(() => {
        updateManyCalls = [];
        productUpdateCalls = [];
        stockUpsertCalls = [];

        mockTx = {
            stock: {
                updateMany: vi.fn().mockImplementation((args) => {
                    updateManyCalls.push(args);
                    return Promise.resolve({ count: 1 });
                }),
                upsert: vi.fn().mockImplementation((args) => {
                    stockUpsertCalls.push(args);
                    return Promise.resolve(args);
                }),
            },
            product: {
                update: vi.fn().mockImplementation((args) => {
                    productUpdateCalls.push(args);
                    return Promise.resolve(args);
                }),
            },
        };
    });

    it('should throw if bundleQty <= 0', async () => {
        const components: BundleComponentItem[] = [{ componentProductId: 'p1', quantityPerBundle: 2 }];
        await expect(deductBundleStock(mockTx, 'bundle-1', 'wh-1', 0, components)).rejects.toThrow(
            '[stock-helpers] deductBundleStock: bundleQty must be > 0'
        );
    });

    it('should throw if components array is empty', async () => {
        await expect(deductBundleStock(mockTx, 'bundle-1', 'wh-1', 2, [])).rejects.toThrow(
            '[stock-helpers] deductBundleStock: components array cannot be empty'
        );
    });

    it('should atomically deduct stock for all components based on bundle quantity', async () => {
        const components: BundleComponentItem[] = [
            { componentProductId: 'filter-1', quantityPerBundle: 1 },
            { componentProductId: 'oil-bottle-1', quantityPerBundle: 2 },
            { componentProductId: 'spark-plug-1', quantityPerBundle: 4 },
        ];

        // Deduct 2 bundles -> requires 2 filters, 4 oil bottles, 8 spark plugs
        await deductBundleStock(mockTx, 'bundle-maintenance-kit', 'wh-main', 2, components);

        expect(updateManyCalls).toHaveLength(3);
        expect(updateManyCalls[0].where).toEqual({ productId: 'filter-1', warehouseId: 'wh-main', quantity: { gte: 2 } });
        expect(updateManyCalls[1].where).toEqual({ productId: 'oil-bottle-1', warehouseId: 'wh-main', quantity: { gte: 4 } });
        expect(updateManyCalls[2].where).toEqual({ productId: 'spark-plug-1', warehouseId: 'wh-main', quantity: { gte: 8 } });
    });

    it('should atomically restore stock for all components upon return', async () => {
        const components: BundleComponentItem[] = [
            { componentProductId: 'filter-1', quantityPerBundle: 1 },
            { componentProductId: 'oil-bottle-1', quantityPerBundle: 2 },
        ];

        // Restore 3 bundles -> restores 3 filters, 6 oil bottles
        await restoreBundleStock(mockTx, 'bundle-maintenance-kit', 'wh-main', 3, components);

        expect(stockUpsertCalls).toHaveLength(2);
        expect(stockUpsertCalls[0].update).toEqual({ quantity: { increment: 3 } });
        expect(stockUpsertCalls[1].update).toEqual({ quantity: { increment: 6 } });
    });
});
