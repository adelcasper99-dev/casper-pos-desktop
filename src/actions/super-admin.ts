"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { getSession } from "@/lib/auth";
import { runWithTenant } from "@/lib/prisma-tenant-extension";
import { AppError, ErrorCodes } from "@/lib/errors";
import bcrypt from "bcryptjs";
import { z } from "zod";

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "الرقم السري الحالي مطلوب"),
    newPassword: z.string().min(6, "الرقم السري الجديد يجب أن يكون 6 حروف على الأقل"),
    confirmPassword: z.string().min(1, "تأكيد الرقم السري مطلوب"),
    csrfToken: z.string().optional()
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "الأرقام السرية غير متطابقة",
    path: ["confirmPassword"]
});

export const changeSuperAdminPassword = secureAction(async (data: z.infer<typeof changePasswordSchema>) => {
    // 1. Session Guard (Global Admin or Super Admin session)
    const session = await getSession();
    const isGlobal = Boolean(
        session?.user?.isGlobalAdmin ||
        session?.user?.id === 'super-admin' ||
        session?.user?.role === 'SUPER_ADMIN'
    );
    if (!session || !isGlobal) {
        throw new AppError(ErrorCodes.FORBIDDEN, "غير مصرح لك بتغيير الرقم السري للمشرف العام");
    }

    // 2. Parse and validate parameters
    const validated = changePasswordSchema.parse(data);

    return await runWithTenant('SYSTEM', async () => {
        // 3. Check current password validity
        let isCurrentValid = false;
        const defaultPass = process.env.SUPER_ADMIN_PASS || 'GenuineWise@92';

        // Check against current user in database if logged in as DB user
        let currentUser: { id: string; password?: string | null } | null = null;
        if (session.user.id && session.user.id !== 'super-admin') {
            currentUser = await prisma.user.findUnique({
                where: { id: session.user.id }
            });
            if (currentUser?.password) {
                isCurrentValid = await bcrypt.compare(validated.currentPassword, currentUser.password);
            }
        }

        // Fallback check against storeSettings or env default
        if (!isCurrentValid) {
            const settings = await prisma.storeSettings.findFirst({});
            if (settings?.superAdminHash) {
                isCurrentValid = await bcrypt.compare(validated.currentPassword, settings.superAdminHash);
            } else {
                isCurrentValid = validated.currentPassword === defaultPass;
            }
        }

        if (!isCurrentValid) {
            throw new AppError(ErrorCodes.VALIDATION_ERROR, "الرقم السري الحالي غير صحيح");
        }

        // 4. Hash new password and update
        const newHash = await bcrypt.hash(validated.newPassword, 12);

        // Update active database user if exists
        if (currentUser) {
            await prisma.user.update({
                where: { id: currentUser.id },
                data: { password: newHash }
            });
        }

        // Also update all HQ super-admin users for consistency
        await prisma.user.updateMany({
            where: { tenantId: 'casper-hq', isGlobalAdmin: true },
            data: { password: newHash }
        });

        // Update store settings recovery hash
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

        // Write system audit log
        try {
            await prisma.actionLog.create({
                data: {
                    action: "SUPER_ADMIN_PASSWORD_CHANGED",
                    details: `Super Admin password successfully updated by ${session.user.username || 'super-admin'}`,
                    userId: session.user.id || "super-admin"
                }
            });
        } catch (logError) {
            console.error("Failed to log super admin password change to audit logs:", logError);
        }

        return { success: true, message: "تم تغيير كلمة مرور المشرف العام بنجاح" };
    });
}, { requireCSRF: false });
