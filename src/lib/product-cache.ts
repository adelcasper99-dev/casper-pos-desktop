import { offlineDB, OfflineProduct } from './offline-db';

export class ProductCacheService {
    // ⚡ SPEED: Smart caching - only cache frequently used products
    static async syncProducts(products: any[], topProductIds: string[] = []) {
        // Filter to top 500 products + recently sold + in-stock
        const smartProducts = products
            .filter(p =>
                topProductIds.includes(p.id) ||  // Top sellers
                p.stock > 0 ||                    // In stock
                products.indexOf(p) < 500          // First 500
            )
            .slice(0, 2000); // Max 2000 products

        const offlineProducts: OfflineProduct[] = smartProducts.map(p => ({
            id: p.id,
            name: p.name,
            barcode: p.barcode || '',
            price: Number(p.price),
            stock: p.stock || 0,
            categoryId: p.categoryId,
            categoryName: p.category?.name || 'Uncategorized',
            costPrice: Number(p.costPrice || 0),
            image: p.image,
            lastSynced: new Date(),
            syncPriority: topProductIds.includes(p.id) ? 10 : 1
        }));

        const success = await offlineDB.safeBulkPut(offlineDB.products, offlineProducts);

        if (success) {
            await offlineDB.syncMetadata.put({
                key: 'products',
                lastSyncTime: new Date(),
                syncStatus: 'success',
                recordCount: offlineProducts.length
            });
        }

        return success;
    }

    // 🎨 VISUAL CLARITY: Get all products with priority sorting
    static async getProducts() {
        return await offlineDB.products
            .orderBy('syncPriority')
            .reverse()
            .toArray();
    }

    // ⚡ SPEED: Fast search with indexed fields
    static async searchProducts(query: string) {
        const lowerQuery = query.toLowerCase();
        return await offlineDB.products
            .filter(p =>
                p.name.toLowerCase().includes(lowerQuery) ||
                p.barcode.includes(query)
            )
            .limit(50) // Limit results for performance
            .toArray();
    }

    static async getProductByBarcode(barcode: string) {
        return await offlineDB.products.where('barcode').equals(barcode).first();
    }

    static async getProductById(id: string) {
        return await offlineDB.safeGet(offlineDB.products, id);
    }

    static async getLastSyncTime() {
        const metadata = await offlineDB.syncMetadata.get('products');
        return metadata?.lastSyncTime;
    }

    static async getSyncStatus() {
        const metadata = await offlineDB.syncMetadata.get('products');
        return {
            lastSynced: metadata?.lastSyncTime,
            status: metadata?.syncStatus || 'pending',
            count: metadata?.recordCount || 0
        };
    }
}
