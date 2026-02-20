import { z } from 'zod';

export const ticketSchema = z.object({
    customerName: z.string().min(1, "Customer Name is required"),
    customerPhone: z.string()
        .regex(/^\d{11}$/, "Phone number must be exactly 11 digits"),
    customerEmail: z.string().email().optional().or(z.literal('')),

    deviceBrand: z.string().min(1, "Brand is required"),
    deviceModel: z.string().min(1, "Model is required"),
    deviceImei: z.string().optional(),
    deviceColor: z.string().optional(),

    issueDescription: z.string().min(1, "Issue description is required"),
    conditionNotes: z.string().optional(),

    securityCode: z.string().optional(),
    patternData: z.string().optional(),

    repairPrice: z.coerce.number().min(0).optional(),
    expectedDuration: z.coerce.number().int().min(0).optional(),
});

export type CreateTicketInput = z.infer<typeof ticketSchema>;
