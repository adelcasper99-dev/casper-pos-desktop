import { Decimal } from 'decimal.js';

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
    createdAt: Date | string; // Union for JSON compatibility
    updatedAt: Date | string;
    deletedAt: Date | string | null;
    version: number;

    // missing fields for inventory components
    archived?: boolean;
    trackStock?: boolean;
    unitOfMeasureId?: string | null;
    unitCode?: string | null;
    unitName?: string | null;
    unitAbbreviation?: string | null;
    modelId?: string | null;
    modelName?: string | null;
    attributeId?: string | null;
    hasHistory?: boolean;
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
    sellPrice2: number;
    sellPrice3: number;
    stock: number;
    trackStock?: boolean;
    isBundle?: boolean;
    bundleComponents?: { id: string; name: string; quantityIncluded: number }[];
}

export interface Category {
    id: string;
    name: string;
    color?: string | null;
    description?: string | null;
}

export interface Unit {
    id: string;
    name: string;
    code: string;
    category: string;
    abbreviation?: string | null;
    conversionFactor?: number;
    isActive?: boolean;
}

export interface Supplier {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    openingBalance?: number;
}

export interface Branch {
    id: string;
    name: string;
    code: string;
    type?: string;
    address?: string | null;
}

export interface Warehouse {
    id: string;
    name: string;
    address?: string | null;
    isDefault: boolean;
    branchId: string;
    branch?: Branch;
}

export interface Model {
    id: string;
    name: string;
    categoryId: string;
}

export interface PurchaseItem {
    id: string;
    purchaseInvoiceId: string;
    productId: string;
    product: {
        name: string;
        sku: string;
        modelId?: string | null;
        model?: { name: string } | null;
        attributeId?: string | null;
        attribute?: { name: string } | null;
        stocks?: { warehouseId: string; quantity: number | Decimal }[];
    };
    quantity: number | Decimal;
    unitCost: number | Decimal | string;
    returnedQty: number | Decimal;
}

export interface PurchaseInvoice {
    id: string;
    invoiceNumber: string | null;
    supplierId?: string;
    supplier?: { name: string; phone?: string | null; address?: string | null };
    totalAmount: number | string;
    paidAmount: number | string;
    deliveryCharge: number | string;
    status: string;
    purchaseDate: Date | string;
    paymentMethod?: string;
    isReturn?: boolean;
    branch?: { name: string };
    warehouse?: {
        name: string;
        branch?: {
            name: string;
            code: string;
        }
    };
    items?: PurchaseItem[];
}

export interface ProductWithCategory extends Product {
    category: Category;
}

export interface Attribute {
    id: string;
    name: string;
}
