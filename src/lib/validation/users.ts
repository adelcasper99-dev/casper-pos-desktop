import { z } from 'zod';

export const userSchema = z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional()
        .refine(val => !val || /^\d{11}$/.test(val), "Phone number must be exactly 11 digits"),
    username: z.string().min(3, "Username must be at least 3 chars"),
    password: z.string().min(6, "Password must be at least 6 chars").optional().or(z.literal('')),
    roleId: z.string().optional(),
    branchId: z.string().min(1, "Branch is required"),
    managedHQIds: z.array(z.string()).optional(),
    isGlobalAdmin: z.boolean().optional(),
    maxDiscount: z.coerce.number().min(0).max(100).optional().nullable(),
    maxDiscountAmount: z.coerce.number().min(0).optional().nullable(),
});
