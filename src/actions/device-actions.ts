"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { modelsByBrand as staticModels } from "@/lib/mobileModels"; // Import existing static data

export async function getDevicePresets() {
    try {
        const devices = await prisma.devicePreset.findMany({
            orderBy: [{ brand: 'asc' }, { model: 'asc' }]
        });

        if (devices.length === 0) {
            // Auto-seed from static file
            const seedData = [];
            for (const [brand, models] of Object.entries(staticModels)) {
                for (const model of models) {
                    seedData.push({ brand, model });
                }
            }

            // Batch create
            await prisma.devicePreset.createMany({
                data: seedData
            });

            return await prisma.devicePreset.findMany({ orderBy: [{ brand: 'asc' }, { model: 'asc' }] });
        }

        return devices;
    } catch (error) {
        console.error("Failed to get device presets", error);
        return [];
    }
}

export async function upsertDevice(brand: string, model: string) {
    if (!brand || !model) return { success: false, error: "Missing brand or model" };

    try {
        await prisma.devicePreset.upsert({
            where: {
                brand_model: {
                    brand,
                    model
                }
            },
            update: {}, // No update needed, just ensure existence
            create: {
                brand,
                model
            }
        });
        revalidatePath('/ar/maintenance/tickets/new');
        return { success: true };
    } catch (error) {
        console.error("Failed to upsert device", error);
        return { success: false, error: "Failed to save device" };
    }
}
