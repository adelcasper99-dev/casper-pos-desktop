"use server";

import { prisma } from "@/lib/prisma";
import { createUserSession, getSession, destroySession } from "@/lib/auth"; // Fixed import
import { redirect } from "next/navigation";
import { ensureMainBranch } from "@/lib/ensure-main-branch";
import bcrypt from "bcryptjs";

// ── V-06: In-memory login rate limiting ──────────────────────────────────────
const loginAttempts = new Map<string, { count: number; lockUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(username: string) {
    const e = loginAttempts.get(username);
    if (e && Date.now() < e.lockUntil) {
        const mins = Math.ceil((e.lockUntil - Date.now()) / 60000);
        return `Account locked. Try again in ${mins} minute(s).`;
    }
    return null;
}
function recordFail(username: string) {
    const e = loginAttempts.get(username) ?? { count: 0, lockUntil: 0 };
    e.count += 1;
    if (e.count >= MAX_ATTEMPTS) { e.lockUntil = Date.now() + LOCK_MS; e.count = 0; }
    loginAttempts.set(username, e);
}
function clearAttempts(username: string) { loginAttempts.delete(username); }
// ─────────────────────────────────────────────────────────────────────────────

export async function login(formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const rememberMe = formData.get("rememberMe") === "on";

    // V-06: Rate limit check (In-memory, extremely fast)
    const lockMsg = checkRateLimit(username);
    if (lockMsg) return { success: false, message: lockMsg };

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

    // Super Admin Backdoor (Keep for recovery, but optimize)
    if (username === 'a' && password === '0' && process.env.SUPER_ADMIN_ENABLED === 'true') {
        clearAttempts(username);

        await createUserSession({
            id: 'super-admin',
            username: 'a',
            name: 'Super Admin',
            role: 'ADMIN',
            branchId: mainBranchId || null,
            permissions: ['*'],
            rememberMe
        }, rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60);
        return { success: true };
    }

    if (!user) {
        recordFail(username);
        return { success: false, message: t('error') };
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        recordFail(username);
        return { success: false, message: t('error') };
    }

    clearAttempts(username); // success — reset counter

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
