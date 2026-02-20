import { offlineDB } from './offline-db';
import { ProductCacheService } from './product-cache';

// 👤 USABILITY: Initialize offline DB and cache products on app load
export async function initializeOfflineMode() {
    try {
        console.log('🔄 Initializing offline mode...');

        // Initialize IndexedDB
        const dbInitialized = await offlineDB.open();
        if (!dbInitialized) {
            console.error('❌ Failed to initialize IndexedDB');
            return false;
        }

        // Check if products are already cached
        const syncStatus = await ProductCacheService.getSyncStatus();
        const lastSynced = syncStatus.lastSynced;
        const now = new Date();

        // ⚡ SPEED: Only sync if cache is older than 24 hours or empty
        const needsSync = !lastSynced ||
            (now.getTime() - lastSynced.getTime()) > 24 * 60 * 60 * 1000;

        if (needsSync && navigator.onLine) {
            console.log('📥 Fetching products for offline cache...');

            try {
                // Fetch products from API
                const response = await fetch('/api/products');
                if (response.ok) {
                    const products = await response.json();

                    // Cache products
                    await ProductCacheService.syncProducts(products);
                    console.log(`✅ Cached ${products.length} products for offline use`);
                }
            } catch (error) {
                console.error('⚠️ Failed to cache products:', error);
                // Continue anyway - offline mode will use existing cache
            }
        } else {
            console.log(`✅ Using cached products (${syncStatus.count} items)`);
        }

        return true;
    } catch (error) {
        console.error('❌ Offline mode initialization failed:', error);
        return false;
    }
}

// 🛡️ RELIABILITY: Safe initialization wrapper
export function setupOfflineMode() {
    if (typeof window !== 'undefined') {
        // Initialize on page load
        window.addEventListener('load', () => {
            initializeOfflineMode().catch(console.error);
        });

        // Re-sync when coming back online
        window.addEventListener('online', () => {
            console.log('🌐 Network restored - syncing data...');
            initializeOfflineMode().catch(console.error);
        });
    }
}
