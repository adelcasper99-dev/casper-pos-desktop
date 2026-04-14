"use server";

import { prisma } from "@/lib/prisma";
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
    const [user, mainBranchId] = await Promise.all([
        prisma.user.findUnique({
            where: { username },
            include: { role: true }
        }),
        ensureMainBranch()
    ]);

    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('Auth');

    // SEC-01: Hardened Super Admin Recovery Access
    const superAdminUser = process.env.SUPER_ADMIN_USER;
    const superAdminPass = process.env.SUPER_ADMIN_PASS;
    const isSuperEnabled = process.env.SUPER_ADMIN_ENABLED === 'true';

    if (isSuperEnabled && superAdminUser && superAdminPass && username === superAdminUser && password === superAdminPass) {

        await createUserSession({
            id: 'super-admin',
            username: superAdminUser,
            name: 'Super Admin',
            role: 'ADMIN',
            branchId: mainBranchId || null,
            permissions: ['*'],
            rememberMe
        }, rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60);
        return { success: true };
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
    } else if (user.roleStr === 'ADMIN') {
        // Fallback for hardcoded admin if no role assigned
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
        branchId: effectiveBranchId,
        permissions: permissions,
        rememberMe
    }, rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60);

    return { success: true };
}

export async function logout() {
    await destroySession();
    redirect("/");
}

export async function getCurrentUser() {
    const session = await getSession();
    return session?.user || null;
}
