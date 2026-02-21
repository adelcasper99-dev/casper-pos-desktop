/**
 * Shared TypeScript type definitions for Product entities
 * Used across POS, Cart, Inventory, and Purchasing modules
 */

/**
 * Product data structure from Prisma
 * Matches prisma/schema.prisma Product model
 */
export interface Product {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    costPrice: number; // Converted from Decimal
    sellPrice: number; // Converted from Decimal (Price 1)
    sellPrice2: number; // Converted from Decimal
    sellPrice3: number; // Converted from Decimal
    stock: number;
    minStock: number;
    categoryId: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    version: number;
}

/**
 * Minimal product data for cart operations
 * Only includes fields needed for adding to cart
 */
export interface CartProduct {
    id: string;
    sku: string;
    name: string;
    sellPrice: number;
    stock: number;
    trackStock?: boolean;
}

/**
 * Product with category information
 * Used in inventory lists and product displays
 */
export interface ProductWithCategory extends Product {
    category: {
        id: string;
        name: string;
        color: string | null;
    };
}
