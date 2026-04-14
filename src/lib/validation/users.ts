import { z } from 'zod';

export const userSchema = z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().min(1, "Phone number is required")
        .refine(val => /^\d{11}$/.test(val), "Phone number must be exactly 11 digits"),
    username: z.string().min(3, "Username must be at least 3 chars"),
    password: z.string().min(4, "يجب أن تتكون كلمة المرور من 4 أحرف على الأقل").optional().or(z.literal('')),
    roleId: z.string().optional(),
    branchId: z.string().optional().nullable(),
    managedHQIds: z.array(z.string()).optional(),
    isGlobalAdmin: z.boolean().optional(),
    maxDiscount: z.coerce.number().min(0).max(100).optional().nullable(),
    maxDiscountAmount: z.coerce.number().min(0).optional().nullable(),
    salary: z.coerce.number().min(0).optional().nullable(),
    hireDate: z.string().optional().nullable(),
});
