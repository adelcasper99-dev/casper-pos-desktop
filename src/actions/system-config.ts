"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getSystemConfig() {
    try {
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
            return { success: true, ...newConfig };
        }

        return { success: true, ...config };
    } catch (error) {
        console.error("Failed to get system config:", error);
        return { success: false, error: "Failed to get config" };
    }
}

export async function updateSystemConfig(data: any) {
    try {
        // We only support one config row with id="default"
        // But the schema implies id="default" is default.

        await prisma.systemConfig.upsert({
            where: { id: "default" },
            update: data,
            create: {
                id: "default",
                ...data
            }
        });

        revalidatePath("/settings");
        return { success: true };
    } catch (error) {
        console.error("Failed to update system config:", error);
        return { success: false, error: "Update failed" };
    }
}
