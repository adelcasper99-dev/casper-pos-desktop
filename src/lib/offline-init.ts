import { db } from './offline-db';
import { logger } from './logger';
import { ProductCacheService } from './product-cache';
import { LocalPersistenceService } from './local-persistence';

// 👤 USABILITY: Initialize offline DB and cache products on app load
export async function initializeOfflineMode() {
    try {
        logger.info('🔄 Initializing offline mode...');

        // 1. Initialize IndexedDB
        const dbInitialized = await db.open();
        if (!dbInitialized) {
            logger.error('❌ Failed to initialize IndexedDB');
            return false;
        }

        // 2. RESTORATION: If DB is empty, try to restore from local filesystem backup (Electron)
        await LocalPersistenceService.restoreFromFilesystem();

        // 3. PRODUCT CACHE: Check if products are already cached
        const syncStatus = await ProductCacheService.getSyncStatus();
        const lastSynced = syncStatus.lastSynced;
        const now = new Date();

        // ⚡ SPEED: Only sync if cache is older than 24 hours or empty
        const needsSync = !lastSynced ||
            (now.getTime() - lastSynced.getTime()) > 24 * 60 * 60 * 1000;

        // 1. Fetch products if online
        if (needsSync && typeof navigator !== 'undefined' && navigator.onLine) {
            logger.info('📥 Fetching products for offline cache...');

            try {
                // Fetch products from API
                const response = await fetch('/api/products');
                if (response.ok) {
                    const products = await response.json();

                    // Cache products
                    await ProductCacheService.syncProducts(products);
                    logger.info(`✅ Cached ${products.length} products for offline use`);

                    // Trigger a filesystem backup after fresh product sync
                    await LocalPersistenceService.backupToFilesystem();
                }
            } catch (error) {
                logger.error('⚠️ Failed to cache products:', error);
                // Continue anyway - offline mode will use existing cache
            }
        } else if (syncStatus) {
            logger.info(`✅ Using cached products (${syncStatus.count} items)`);
        }

        return true;
    } catch (error) {
        logger.error('❌ Offline mode initialization failed:', error);
        return false;
    }
}

// 🛡️ RELIABILITY: Safe initialization wrapper
export function setupOfflineMode() {
    if (typeof window !== 'undefined') {
        // Initialize on page load
        window.addEventListener('load', () => {
            initializeOfflineMode()
                .then(() => {
                    // Start periodic auto-backup to filesystem
                    LocalPersistenceService.startAutoBackup();
                })
                .catch(logger.error);
        });

        // Re-sync when coming back online
        window.addEventListener('online', async () => {
            logger.info('🌐 Network restored - syncing data...');
            initializeOfflineMode().catch(logger.error);
        });
    }
}
