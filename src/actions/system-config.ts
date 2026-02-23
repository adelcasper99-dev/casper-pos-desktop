"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Electron-safe in-memory cache
let cachedConfig: any = null;

export async function getSystemConfig() {
    try {
        if (cachedConfig) {
            return {
                success: true,
                ...cachedConfig,
                taxRate: cachedConfig.taxRate ? Number(cachedConfig.taxRate) : 0
            };
        }

        const config = await prisma.systemConfig.findUnique({
            where: { id: "default" }
        });

        if (!config) {
            // Create default if not exists
            const newConfig = await prisma.systemConfig.create({
                data: {
                    id: "default",
                    warrantyDays: 30,
                    returnClawbackEnabled: true,
                    taxEnabled: false
                }
            });
            cachedConfig = newConfig;
            return {
                success: true,
                ...newConfig,
                taxRate: newConfig.taxRate ? Number(newConfig.taxRate) : 0
            };
        }

        cachedConfig = config;
        return {
            success: true,
            ...config,
            taxRate: config.taxRate ? Number(config.taxRate) : 0
        };
    } catch (error) {
        console.error("Failed to get system config:", error);
        return { success: false, error: "Failed to get config" };
    }
}

export async function updateSystemConfig(data: any) {
    try {
        await prisma.systemConfig.upsert({
            where: { id: "default" },
            update: data,
            create: {
                id: "default",
                ...data
            }
        });

        // Invalidate the in-memory cache
        cachedConfig = null;

        revalidatePath("/settings");
        return { success: true };
    } catch (error) {
        console.error("Failed to update system config:", error);
        return { success: false, error: "Update failed" };
    }
}
