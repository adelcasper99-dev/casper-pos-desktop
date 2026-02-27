import { z } from 'zod';

export const bundleItemSchema = z.object({
    componentProductId: z.string().min(1),
    quantityIncluded: z.coerce.number().int().min(1),
});

export const productSchema = z.object({
    name: z.string().min(1),
    sku: z.string().min(1),
    costPrice: z.coerce.number().min(0),
    sellPrice: z.coerce.number().min(0),
    sellPrice2: z.coerce.number().optional(),
    sellPrice3: z.coerce.number().optional(),
    stock: z.coerce.number().int().default(0),
    minStock: z.coerce.number().int().default(5),
    categoryId: z.string().optional(),
    trackStock: z.boolean().default(true),
    isBundle: z.boolean().default(false),
    bundleItems: z.array(bundleItemSchema).optional(),
});

export const supplierSchema = z.object({
    name: z.string().min(1, "Supplier Name is required"),
    phone: z.string().optional()
        .refine(val => !val || /^\d{11}$/.test(val), "Phone number must be exactly 11 digits"),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
});

export const categorySchema = z.object({
    name: z.string().min(1, "Category Name is required"),
    color: z.string().optional(),
});

const purchaseItemSchema = z.object({
    productId: z.string().optional(),
    name: z.string().optional(),
    sku: z.string().optional(),
    categoryId: z.string().optional(),
    quantity: z.coerce.number().min(1),
    unitCost: z.coerce.number().min(0),
    sellPrice: z.coerce.number().optional(),
    sellPrice2: z.coerce.number().optional(),
    sellPrice3: z.coerce.number().optional(),
});

export const purchaseSchema = z.object({
    supplierId: z.string().min(1, "Supplier is required"),
    invoiceNumber: z.string().optional(),
    warehouseId: z.string().optional(),
    items: z.array(purchaseItemSchema).min(1, "At least one item is required"),
    paidAmount: z.coerce.number().min(0).optional(),
    deliveryCharge: z.coerce.number().min(0).optional(),
    paymentMethod: z.string().optional(),
    treasuryId: z.string().optional(),
});

export const warehouseSchema = z.object({
    name: z.string().min(1, "Warehouse Name is required"),
    address: z.string().optional(),
    branchId: z.string().optional(),
});
