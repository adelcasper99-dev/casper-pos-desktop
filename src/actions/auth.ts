"use server";

import { prisma } from "@/lib/prisma";
import { createUserSession, getSession, destroySession } from "@/lib/auth"; // Fixed import
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

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
        const hashedPassword = await bcrypt.hash("admin123", 10);
        await prisma.user.create({
            data: {
                username: "admin",
                password: hashedPassword,
                name: "Admin",
                roleStr: "ADMIN"
            }
        });
    }

    const t = (key: string) => key; // Simple mock

    const user = await prisma.user.findUnique({
        where: { username }
    });

    if (!user) {
        return { success: false, message: "Invalid credentials" };
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        return { success: false, message: "Invalid credentials" };
    }

    // Create Session
    await createUserSession({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.roleStr,
        branchId: user.branchId,
        permissions: [], // Simplify
        rememberMe
    }, rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60);

    redirect("/");
}

export async function logout() {
    await destroySession();
    redirect("/login");
}

export async function getCurrentUser() {
    const session = await getSession();
    return session?.user || null;
}
