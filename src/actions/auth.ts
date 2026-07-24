"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createUserSession, getSession, destroySession } from "@/lib/auth"; // Fixed import
import { redirect } from "next/navigation";
import { ensureMainBranch } from "@/lib/ensure-main-branch";
import bcrypt from "bcryptjs";

// ── V-06: In-memory login rate limiting ──────────────────────────────────────
import { rateLimit } from "@/lib/rate-limit";

export async function login(formData: FormData) {
    const username = (formData.get("username") as string) || "unknown";
    const password = formData.get("password") as string;
    const rememberMe = formData.get("rememberMe") === "on";

    // SEC-02: Unified Rate Limiting (V-06 upgrade)
    const limit = await rateLimit(username, {
        keyPrefix: 'login',
        limit: 5,
        windowSeconds: 300 // 5 minute lockout window
    });

    if (!limit.success) {
        const mins = Math.ceil((limit.reset - Date.now()) / 60000);
        return { success: false, message: `Account locked. Try again in ${mins} minute(s).` };
    }

    // ── V-08: Parallelize User Lookup & Branch Sync ───────────────────────────
    const { runWithTenant } = await import('@/lib/prisma-tenant-extension');
    const userPromise = runWithTenant('SYSTEM', () =>
        prisma.user.findUnique({
            where: { username },
            include: { role: true, branch: { select: { type: true } } }
        })
    ) as Promise<any>;

    const [user, mainBranchId] = await Promise.all([
        userPromise,
        ensureMainBranch()
    ]);

    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('Auth');

    // SEC-01: Hardened Super Admin Recovery Access
    const superAdminUser = process.env.SUPER_ADMIN_USER || 'mocas';
    const superAdminPass = process.env.SUPER_ADMIN_PASS || 'GenuineWise@92';
    const isSuperEnabled = process.env.SUPER_ADMIN_ENABLED !== 'false';

    if (isSuperEnabled && username === superAdminUser) {
        const settings = await prisma.storeSettings.findFirst({});

        let isValid = false;
        let isDefaultUsed = false;

        if (settings?.superAdminHash) {
            isValid = await bcrypt.compare(password, settings.superAdminHash);
        } else {
            isValid = password === superAdminPass;
            isDefaultUsed = true;
        }

        if (isValid) {
            if (isDefaultUsed) {
                try {
                    const hashed = await bcrypt.hash(superAdminPass, 12);
                    await prisma.storeSettings.upsert({
                        where: { tenantId: "default" },
                        update: { superAdminHash: hashed },
                        create: {
                            tenantId: "default",
                            superAdminHash: hashed,
                            name: "Casper Store",
                            currency: "EGP",
                            taxRate: new Prisma.Decimal(0.00),
                            features: "{}"
                        }
                    });
                } catch (e) {
                    console.error("Failed to seed super admin hash on first login:", e);
                }

            }

            await createUserSession({
                id: 'super-admin',
                username: superAdminUser,
                name: 'Super Admin',
                role: 'ADMIN',
                branchId: mainBranchId || null,
                branchType: 'CENTER',
                permissions: ['*'],
                rememberMe
            }, rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60);
            return { success: true, isGlobalAdmin: true };
        }
    }

    if (!user) {
        return { success: false, message: t('error') };
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        return { success: false, message: t('error') };
    }

    // Parse Permissions
    let permissions: string[] = [];
    if (user.role && user.role.permissions) {
        try {
            permissions = JSON.parse(user.role.permissions);
        } catch (e) {
            console.error("Failed to parse permissions", e);
        }
    } else if (user.isGlobalAdmin) {
        // Fallback for global admin if no role assigned
        permissions = ['*'];
    }

    // V-08: Use cached/parallely fetched branchId
    const effectiveBranchId = user.branchId || mainBranchId;

    // Create Session
    await createUserSession({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.roleStr,
        tenantId: user.tenantId || null,
        branchId: effectiveBranchId,
        branchType: user.branch?.type ?? 'CENTER',
        permissions: permissions,
        rememberMe
    }, rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60);

    return { success: true, isGlobalAdmin: user.isGlobalAdmin };
}

export async function logout() {
    await destroySession();
    redirect("/");
}

export async function getCurrentUser() {
    const session = await getSession();
    return session?.user || null;
}
