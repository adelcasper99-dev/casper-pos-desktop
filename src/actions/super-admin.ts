"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { getSession } from "@/lib/auth";
import { AppError, ErrorCodes } from "@/lib/errors";
import bcrypt from "bcryptjs";
import { z } from "zod";

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "الرقم السري الحالي مطلوب"),
    newPassword: z.string().min(8, "الرقم السري الجديد يجب أن يكون 8 حروف على الأقل"),
    confirmPassword: z.string().min(1, "تأكيد الرقم السري مطلوب")
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "الأرقام السرية غير متطابقة",
    path: ["confirmPassword"]
});

export const changeSuperAdminPassword = secureAction(async (data: any) => {
    // 1. Session Guard (Strictly check if ID is super-admin)
    const session = await getSession();
    if (!session || session.user.id !== 'super-admin') {
        throw new AppError(ErrorCodes.FORBIDDEN, "غير مصرح لك بتغيير الرقم السري للمشرف العام");
    }

    // 2. Parse and validate parameters
    const validated = changePasswordSchema.parse(data);

    // 3. Retrieve store settings for current super admin password verification
    const settings = await prisma.storeSettings.findFirst({});

    let isCurrentValid = false;
    const defaultPass = process.env.SUPER_ADMIN_PASS || 'GenuineWise@92';

    if (settings?.superAdminHash) {
        isCurrentValid = await bcrypt.compare(validated.currentPassword, settings.superAdminHash);
    } else {
        isCurrentValid = validated.currentPassword === defaultPass;
    }

    if (!isCurrentValid) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "الرقم السري الحالي غير صحيح");
    }

    // 4. Hash new password and update the database
    const newHash = await bcrypt.hash(validated.newPassword, 12);

    await prisma.storeSettings.upsert({
        where: { tenantId: "default" },
        update: {
            superAdminHash: newHash
        },
        create: {
            tenantId: "default",
            superAdminHash: newHash,
            name: "Casper Store",
            currency: "EGP",
            features: "{}"
        }
    });

    // Write system audit log for this security-critical change
    try {
        await prisma.actionLog.create({
            data: {
                action: "SUPER_ADMIN_PASSWORD_CHANGED",
                details: `Super Admin password successfully updated. Origin IP: ${session.user.deviceFingerprint || 'Unknown'}`,
                userId: "super-admin"
            }
        });
    } catch (logError) {
        console.error("Failed to log super admin password change to audit logs:", logError);
    }

    return { success: true };
}, { requireCSRF: false });
