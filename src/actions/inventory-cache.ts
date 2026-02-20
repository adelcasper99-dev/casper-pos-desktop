'use server';

import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { CACHE_KEYS, CACHE_TAGS, CACHE_CONFIG } from "@/lib/cache-keys";

import { trackCacheHit, trackCacheMiss } from "@/lib/metrics";

/**
 * Get all products with caching (5-minute cache)
 * High-frequency query - called on every inventory page load
 */
export async function getCachedProducts() {
    const startTime = Date.now();

    const result = await unstable_cache(
        async () => {
            trackCacheMiss(); // Cache miss - hitting DB
            const products = await prisma.product.findMany({
                where: { deletedAt: null },
                include: {
                    category: true,
                },
                orderBy: { name: 'asc' },
            });
            return products;
        },
        [CACHE_KEYS.PRODUCTS_ALL],
        CACHE_CONFIG.PRODUCTS
    )();

    const duration = Date.now() - startTime;
    // If response was very fast (<10ms), it was cached
    if (duration < 10) {
        trackCacheHit();
    }

    return result;
}

/**
 * Get product by ID with caching
 */
export async function getCachedProductById(id: string) {
    return unstable_cache(
        async () => {
            const product = await prisma.product.findUnique({
                where: { id },
                include: { category: true },
            });
            return product;
        },
        [CACHE_KEYS.PRODUCT_BY_ID(id)],
        CACHE_CONFIG.PRODUCTS
    )();
}

/**
 * Get product by SKU (for barcode scanning)
 * Very high frequency in POS
 */
export async function getCachedProductBySku(sku: string) {
    return unstable_cache(
        async () => {
            const product = await prisma.product.findUnique({
                where: { sku },
                include: { category: true },
            });
            return product;
        },
        [CACHE_KEYS.PRODUCT_BY_SKU(sku)],
        CACHE_CONFIG.PRODUCTS
    )();
}

/**
 * Get low stock products with caching (15-minute cache - less critical)
 */
export async function getCachedLowStockProducts() {
    return unstable_cache(
        async () => {
            const products = await prisma.product.findMany({
                where: {
                    stock: { lt: 10 },
                    deletedAt: null,
                },
                include: { category: true },
                orderBy: { stock: 'asc' },
                take: 50,
            });
            return products;
        },
        [CACHE_KEYS.PRODUCTS_LOW_STOCK],
        {
            revalidate: CACHE_CONFIG.DASHBOARD.revalidate,
            tags: [CACHE_TAGS.PRODUCTS, CACHE_TAGS.INVENTORY, CACHE_TAGS.DASHBOARD],
        }
    )();
}

/**
 * Get all categories with caching (1-hour cache - rarely changes)
 */
export async function getCachedCategories() {
    return unstable_cache(
        async () => {
            const categories = await prisma.category.findMany({
                orderBy: { name: 'asc' },
            });
            return categories;
        },
        [CACHE_KEYS.CATEGORIES_ALL],
        {
            revalidate: 3600, // 1 hour
            tags: [CACHE_TAGS.CATEGORIES],
        }
    )();
}

/**
 * Get all suppliers with caching (15-minute cache)
 */
export async function getCachedSuppliers() {
    return unstable_cache(
        async () => {
            const suppliers = await prisma.supplier.findMany({
                orderBy: { name: 'asc' },
            });
            return suppliers;
        },
        ['suppliers-all'],
        {
            revalidate: 900, // 15 minutes
            tags: [CACHE_TAGS.INVENTORY],
        }
    )();
}

/**
 * Get warehouse stock with caching (5-minute cache)
 */
export async function getCachedWarehouseStock(warehouseId: string) {
    return unstable_cache(
        async () => {
            const stocks = await prisma.stock.findMany({
                where: { warehouseId, quantity: { gt: 0 } },
                include: { product: true },
                orderBy: { product: { name: 'asc' } },
            });
            return stocks;
        },
        [CACHE_KEYS.STOCK_BY_WAREHOUSE(warehouseId)],
        CACHE_CONFIG.STOCK
    )();
}

/**
 * Get recent sales with caching (1-minute cache - very dynamic)
 */
export async function getCachedRecentSales(limit: number = 50) {
    return unstable_cache(
        async () => {
            const sales = await prisma.sale.findMany({
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    items: {
                        include: { product: true },
                    },
                },
            });
            return sales;
        },
        [CACHE_KEYS.RECENT_SALES],
        CACHE_CONFIG.SALES
    )();
}

/**
 * Get daily revenue with caching
 */
export async function getCachedDailyRevenue(date?: Date) {
    const today = date || new Date();
    const dateKey = today.toISOString().split('T')[0];

    return unstable_cache(
        async () => {
            const startOfDay = new Date(today.setHours(0, 0, 0, 0));
            const endOfDay = new Date(today.setHours(23, 59, 59, 999));

            const result = await prisma.sale.aggregate({
                where: {
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
                _sum: { totalAmount: true },
                _count: true,
            });

            return {
                revenue: Number(result._sum.totalAmount || 0),
                count: result._count,
                date: dateKey,
            };
        },
        [CACHE_KEYS.DAILY_REVENUE(dateKey)],
        {
            revalidate: 300, // 5 minutes
            tags: [CACHE_TAGS.REVENUE, CACHE_TAGS.DASHBOARD],
        }
    )();
}
