import { z } from 'zod';

export const settingsSchema = z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    vatNumber: z.string().optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    currency: z.string().optional(),
    receiptFooter: z.string().optional(),
    logoUrl: z.string().optional(),
    autoPrint: z.boolean().optional(),
    paperSize: z.string().optional(),
    features: z.string().optional(), // JSON string
    labelTemplate: z.any().optional(),
});
