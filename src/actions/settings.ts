"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { secureAction } from "@/lib/safe-action";

import { settingsSchema } from "@/lib/validation/settings";


import { getSession } from "@/lib/auth";

export const getStoreSettings = secureAction(async () => {
    let settings = await prisma.storeSettings.findUnique({
        where: { id: "settings" }
    });

    if (!settings) {
        settings = await prisma.storeSettings.create({
            data: {
                id: "settings",
                name: "Casper Store",
                currency: "SAR",
                taxRate: 0.0
            }
        });
    }
    // Serialize Decimal fields for client consumption
    return {
        data: {
            ...settings,
            taxRate: Number(settings.taxRate)
        }
    };
}, { requireCSRF: false }); // Public read (mostly, or restrict to logged in users via secureAction default)

export const getEffectiveStoreSettings = secureAction(async () => {
    // 1. Get Base Settings
    const baseSettingsRes = await getStoreSettings();
    if (!baseSettingsRes.success || !baseSettingsRes.data) throw new Error("Failed to load base settings");

    // Initialize with extended type to support branch overrides
    let settings: any = { ...baseSettingsRes.data, printHeader: null };

    // 2. Get User Session to check for Branch Override
    const session = await getSession();
    const branchId = session?.user?.branchId;

    if (branchId) {
        const branch = await prisma.branch.findUnique({ where: { id: branchId } }) as any;
        if (branch) {
            settings = {
                ...settings,
                // Override with branch specific values if they exist
                name: branch.displayName || branch.name || settings.name,
                address: branch.address || settings.address,
                phone: branch.phone || settings.phone,
                logoUrl: branch.logoUrl || settings.logoUrl,
                receiptFooter: branch.printFooter || settings.receiptFooter,
                printHeader: branch.printHeader || null,
                // Also merge printSettings JSON if applicable
                ...(typeof branch.printSettings === 'object' ? branch.printSettings : {}),
            };
        }
    }

    return { data: settings };
}, { requireCSRF: false });

export const updateStoreSettings = secureAction(async (data: any) => {
    const validated = settingsSchema.parse(data);

    await prisma.storeSettings.upsert({
        where: { id: "settings" },
        update: validated,
        create: {
            id: "settings",
            // @ts-ignore - TS might complain about optional mismatch but Zod ensures types
            ...validated
        }
    });

    revalidatePath("/settings");
    revalidatePath("/pos");
    return { success: true };
}, { permission: 'MANAGE_SETTINGS' });

