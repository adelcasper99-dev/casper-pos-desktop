import { z } from 'zod';

/**
 * 🛡️ Offline Sale Sync Schema
 * Validates the payload sent from Electron POS terminals to the Cloud API.
 */
// Authoritative payment method union — matches GL_ACCOUNT_MAP in accounting.ts
const PAYMENT_METHOD = z.enum([
    'CASH', 'CARD', 'SPLIT', 'E-WALLET', 'CREDIT',
    'VISA', 'MASTERCARD', 'BANK', 'INSTAPAY',
    'WALLET', 'VODAFONE_CASH', 'STORE_CREDIT', 'ACCOUNT',
]);

export const OfflineSaleSchema = z.object({
    id: z.string().uuid().optional(),
    tenantId: z.string().optional(),
    idempotencyKey: z.string().optional(),
    customerName: z.string().nullable().optional(),
    customerPhone: z.string().nullable().optional(),
    customerAddress: z.string().nullable().optional(),
    warehouseId: z.string().uuid(),
    branchId: z.string().uuid(),
    totalAmount: z.union([z.number(), z.string()]),
    paymentMethod: PAYMENT_METHOD,
    taxAmount: z.union([z.number(), z.string()]).default(0),
    subTotal: z.union([z.number(), z.string()]).optional(),
    discountAmount: z.union([z.number(), z.string()]).default(0),
    // Clamp to [0,100] — guards against tampered Electron payloads
    discountPercentage: z.number().min(0).max(100).default(0),
    shiftId: z.string().uuid().nullable().optional(),
    customerId: z.string().uuid().nullable().optional(),
    isSupplier: z.boolean().optional(),
    // F-1: IndexedDB stores createdAt as a UNIX ms number; ISO strings also accepted.
    // Both are normalized to ISO string via transform before downstream use.
    createdAt: z.union([
        z.string().datetime(),
        z.number().int().positive(),
    ]).optional().transform(v => v !== undefined ? new Date(v).toISOString() : undefined),
    isTimeSuspicious: z.boolean().default(false),
    items: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number(),
        unitPrice: z.union([z.number(), z.string()]),
        unitCost: z.union([z.number(), z.string()]).optional(),
        imei: z.string().nullable().optional(),
        condition: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
        deviceType: z.string().nullable().optional(),
    })).min(1, { message: 'A sale must contain at least one item' }),
});


/**
 * 🛡️ Offline Return Sync Schema
 */
export const OfflineReturnSchema = z.object({
    id: z.string().uuid().optional(),
    tenantId: z.string().optional(),
    idempotencyKey: z.string().optional(),
    originalSaleId: z.string().uuid(),
    // F-6: SPLIT is valid (return of a split-payment sale)
    returnType: z.enum(['CASH', 'CARD', 'SPLIT', 'E-WALLET']).default('CASH'),
    amount: z.union([z.number(), z.string()]),
    reason: z.string().nullable().optional(),
    items: z.array(z.object({
        productId: z.string().uuid(),
        // Enforce positive quantity — Math.abs handles negatives downstream but Zod should reject them at source
        quantity: z.number().positive(),
        unitPrice: z.union([z.number(), z.string()]),
        unitCost: z.union([z.number(), z.string()]).optional(),
    })),
    customerPhone: z.string().nullable().optional(),
    warehouseId: z.string().uuid().optional(),
    shiftId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    // F-1: same createdAt normalization as OfflineSaleSchema
    createdAt: z.union([
        z.string().datetime(),
        z.number().int().positive(),
    ]).optional().transform(v => v !== undefined ? new Date(v).toISOString() : undefined),
    isTimeSuspicious: z.boolean().default(false),
});


export type OfflineSaleInput = z.infer<typeof OfflineSaleSchema>;
export type OfflineReturnInput = z.infer<typeof OfflineReturnSchema>;
