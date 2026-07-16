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
    autoPrintTicket: z.boolean().optional(),
    autoPrintEngineerCopy: z.boolean().optional(),
    paperSize: z.string().optional(), // Required in DB with default
    features: z.string().optional(), // JSON string, Required in DB with default
    labelTemplate: z.any().optional(),
    locationLat: z.coerce.number().optional(),
    locationLng: z.coerce.number().optional(),
    locationRadius: z.coerce.number().optional(),
    allowNegativeStock: z.boolean().optional(),
    googleDriveBackupPath: z.string().optional().nullable(),
    blindCloseEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
    whatsappTemplates: z.object({
        NEW: z.string().min(10, "رسالة قصيرة جداً").max(500).optional(),
        READY: z.string().min(10, "رسالة قصيرة جداً").max(500).optional(),
        PAID_DELIVERED: z.string().min(10, "رسالة قصيرة جداً").max(500).optional(),
        enabled: z.object({
            NEW: z.boolean().default(true),
            READY: z.boolean().default(true),
            PAID_DELIVERED: z.boolean().default(true),
        }).optional().default({ NEW: true, READY: true, PAID_DELIVERED: true }),
    }).nullish(),
});
