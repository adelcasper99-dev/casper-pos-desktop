"use server";

import { prisma } from "@/lib/prisma";
import { createUserSession, getSession, destroySession } from "@/lib/auth"; // Fixed import
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { ensureMainBranch } from "@/lib/ensure-main-branch";

// Mock permissions for now or simple string check
const PERMISSIONS = {
    ADMIN: ["*"],
    STAFF: ["pos", "inventory"]
};

export async function login(formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const rememberMe = formData.get("rememberMe") === "on";

    // Auto-seed admin if no users exist
    const userCount = await prisma.user.count();
    if (userCount === 0) {
        // Create main branch first, then create admin linked to it
        const mainBranchId = await ensureMainBranch();
        const hashedPassword = await bcrypt.hash("admin123", 10);
        await prisma.user.create({
            data: {
                username: "admin",
                password: hashedPassword,
                name: "Admin",
                roleStr: "ADMIN",
                branchId: mainBranchId
            }
        });
    }

    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('Auth');

    const user = await prisma.user.findUnique({
        where: { username },
        include: { role: true }
    });

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

    // Ensure main branch exists and assign user if needed (single-branch mode)
    const mainBranchId = await ensureMainBranch();
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

    redirect("/dashboard");
}

export async function logout() {
    await destroySession();
    redirect("/");
}

export async function getCurrentUser() {
    const session = await getSession();
    return session?.user || null;
}
