import { z } from 'zod';

export const refundSaleSchema = z.object({
    saleId: z.string().min(1, "Sale ID is required"),
    reason: z.string().optional(),
    refundMethod: z.enum(['CASH', 'STORE_CREDIT']).optional().default('CASH'),
    isDamaged: z.boolean().optional().default(false),
    treasuryId: z.string().optional(),
    idempotencyKey: z.string().optional(),
    csrfToken: z.string().optional(),
});

export const partialRefundItemSchema = z.object({
    itemId: z.string().min(1, "Item ID is required"),
    quantity: z.coerce.number().min(0.001, "Quantity must be greater than 0"),
    isDamaged: z.boolean().optional().default(false),
});

export const partialRefundSaleSchema = z.object({
    saleId: z.string().min(1, "Sale ID is required"),
    items: z.array(partialRefundItemSchema).min(1, "At least one item is required for partial refund"),
    reason: z.string().optional(),
    refundMethod: z.enum(['CASH', 'STORE_CREDIT']).optional().default('CASH'),
    treasuryId: z.string().optional(),
    idempotencyKey: z.string().optional(),
    csrfToken: z.string().optional(),
});
