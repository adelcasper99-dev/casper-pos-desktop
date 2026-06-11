import { z } from 'zod';

export const bundleItemSchema = z.object({
    componentProductId: z.string().min(1),
    quantityIncluded: z.coerce.number().min(0.001, "Quantity must be at least 0.001"),
});

export const productSchema = z.object({
    name: z.string().min(1),
    sku: z.string().min(1),
    costPrice: z.coerce.number().min(0),
    sellPrice: z.coerce.number().min(0),
    sellPrice2: z.coerce.number().optional(),
    sellPrice3: z.coerce.number().optional(),
    stock: z.coerce.number().default(0),
    minStock: z.coerce.number().default(5),
    categoryId: z.string().optional(),
    modelId: z.string().optional().nullable(),
    attributeId: z.string().optional().nullable(),
    trackStock: z.boolean().default(true),
    isBundle: z.boolean().default(false),
    isDevice: z.boolean().default(false),
    deviceType: z.string().optional().nullable(),
    bundleItems: z.array(bundleItemSchema).optional(),
    unitOfMeasureId: z.string().optional().nullable(),
});

export const supplierSchema = z.object({
    name: z.string().min(1, "Supplier Name is required"),
    phone: z.string().optional()
        .refine(val => !val || /^\d{11}$/.test(val), "Phone number must be exactly 11 digits"),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    linkedEmployeeId: z.string().uuid().optional().nullable(),
    openingBalance: z.coerce.number().optional().default(0),
});

export const categorySchema = z.object({
    name: z.string().min(1, "Category Name is required"),
    color: z.string().optional(),
    isHidden: z.boolean().optional().default(false),
    parentId: z.string().optional().nullable(),
});

const purchaseItemSchema = z.object({
    productId: z.string().optional(),
    name: z.string().optional(),
    sku: z.string().optional(),
    categoryId: z.string().optional(),
    modelId: z.string().optional().nullable(),
    attributeId: z.string().optional().nullable(),
    quantity: z.coerce.number().min(0.001, "Quantity must be at least 0.001"),
    unitCost: z.union([z.string(), z.number()]).transform(v => String(v)),
    sellPrice: z.coerce.number().optional(),
    sellPrice2: z.coerce.number().optional(),
    sellPrice3: z.coerce.number().optional(),
    isDevice: z.boolean().optional(),
    deviceType: z.string().optional().nullable(),
    condition: z.string().optional().nullable(),
    imei: z.string().optional().nullable(),
    color: z.string().optional().nullable(),
    unitOfMeasureId: z.string().optional().nullable(),
    conversionFactor: z.coerce.number().optional().default(1.0),
});

export const purchaseSchema = z.object({
    supplierId: z.string().min(1, "Supplier is required"),
    invoiceNumber: z.string().optional(),
    warehouseId: z.string().optional(),
    items: z.array(purchaseItemSchema).min(1, "At least one item is required"),
    paidAmount: z.coerce.number().min(0).optional(),
    taxAmount: z.coerce.number().min(0).optional(),
    deliveryCharge: z.coerce.number().min(0).optional(),
    paymentMethod: z.string().optional(),
    treasuryId: z.string().optional(),
    isWalkin: z.boolean().optional(),
    walkinName: z.string().optional(),
    walkinPhone: z.string().optional(),
    walkinNationalId: z.string().optional(),
    attachmentUrl: z.string().optional(),
});

export const warehouseSchema = z.object({
    name: z.string().min(1, "Warehouse Name is required"),
    address: z.string().optional(),
    branchId: z.string().optional(),
});

export const unitOfMeasureSchema = z.object({
    name: z.string().min(1, "Unit Name is required"),
    code: z.string().min(1, "Unit Code is required"),
    abbreviation: z.string().optional(),
    conversionFactor: z.coerce.number().optional().default(1.0),
    isActive: z.boolean().optional().default(true),
});
