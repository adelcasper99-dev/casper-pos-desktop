import { z } from 'zod';

export const settingsSchema = z.object({
    name: z.string().nullish(),
    phone: z.string().nullish(),
    address: z.string().nullish(),
    vatNumber: z.string().nullish(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    currency: z.string().nullish(),
    receiptFooter: z.string().nullish(),
    logoUrl: z.string().nullish(),
    autoPrint: z.boolean().optional(),
    paperSize: z.string().nullish(),
    features: z.string().nullish(), // JSON string
    labelTemplate: z.any().optional(),
    locationLat: z.coerce.number().optional(),
    locationLng: z.coerce.number().optional(),
    locationRadius: z.coerce.number().optional(),
});
