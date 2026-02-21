import { z } from 'zod';

export const settingsSchema = z.object({
    name: z.string().min(1, "Name is required").optional(), // Required in DB, use optional for update logic
    phone: z.string().nullish(), // Nullable in DB
    address: z.string().nullish(), // Nullable in DB
    vatNumber: z.string().nullish(), // Nullable in DB
    taxRate: z.coerce.number().min(0).max(100).optional(),
    currency: z.string().optional(), // Required in DB with default
    receiptFooter: z.string().optional(), // Required in DB with default
    logoUrl: z.string().nullish(),
    autoPrint: z.boolean().optional(),
    paperSize: z.string().optional(), // Required in DB with default
    features: z.string().optional(), // JSON string, Required in DB with default
    labelTemplate: z.any().optional(),
    locationLat: z.coerce.number().optional(),
    locationLng: z.coerce.number().optional(),
    locationRadius: z.coerce.number().optional(),
});
