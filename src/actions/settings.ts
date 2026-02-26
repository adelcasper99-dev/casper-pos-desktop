"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { secureAction } from "@/lib/safe-action";

import { settingsSchema } from "@/lib/validation/settings";
import { ensureMainBranch, syncMainBranchName } from "@/lib/ensure-main-branch";

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
                currency: "EGP",
                taxRate: 0.0
            }
        });
    }

    // Ensure one main branch exists (single-branch mode)
    await ensureMainBranch();

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
    if (!baseSettingsRes.success || !baseSettingsRes.data) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('generic'));
    }

    // Initialize settings
    let settings: any = { ...baseSettingsRes.data };

    // 2. Get User Session to check for Branch Override
    const session = await getSession();
    const branchId = session?.user?.branchId;

    if (branchId) {
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (branch) {
            settings = {
                ...settings,
                // Override with branch specific values if they exist (single-branch mode)
                name: branch.name || settings.name,
                address: branch.address || settings.address,
                phone: branch.phone || settings.phone,
            };
        }
    }

    return { data: settings };
}, { requireCSRF: false });

export const updateStoreSettings = secureAction(async (data: any) => {
    const validated = settingsSchema.parse(data);

    await prisma.storeSettings.upsert({
        where: { id: "settings" },
        update: {
            name: validated.name ?? undefined,
            phone: validated.phone ?? undefined,
            address: validated.address ?? undefined,
            taxRate: validated.taxRate !== undefined ? new Prisma.Decimal(validated.taxRate) : undefined,
            currency: validated.currency ?? undefined,
            vatNumber: validated.vatNumber ?? undefined,
            receiptFooter: validated.receiptFooter ?? undefined,
            logoUrl: validated.logoUrl ?? undefined,
            autoPrint: validated.autoPrint ?? undefined,
            paperSize: validated.paperSize ?? undefined,
            features: validated.features ?? undefined,
            labelTemplate: validated.labelTemplate ?? undefined,
            locationLat: validated.locationLat ?? undefined,
            locationLng: validated.locationLng ?? undefined,
            locationRadius: validated.locationRadius ?? undefined,
            allowNegativeStock: validated.allowNegativeStock ?? undefined,
        },
        create: {
            id: "settings",
            name: validated.name || "Casper Store",
            phone: validated.phone || null,
            address: validated.address || null,
            taxRate: new Prisma.Decimal(validated.taxRate || 0),
            currency: validated.currency || "EGP",
            vatNumber: validated.vatNumber || null,
            receiptFooter: validated.receiptFooter || "Thank you for shopping with us!",
            logoUrl: validated.logoUrl || null,
            autoPrint: validated.autoPrint || false,
            paperSize: validated.paperSize || "80mm",
            features: validated.features || "{}",
            labelTemplate: validated.labelTemplate || null,
            locationLat: validated.locationLat || 24.7136,
            locationLng: validated.locationLng || 46.6753,
            locationRadius: validated.locationRadius || 500,
            allowNegativeStock: validated.allowNegativeStock || false,
        }
    });

    // Sync main branch name with store name (single-branch mode)
    if (validated.name) {
        await syncMainBranchName(validated.name);
    }

    revalidatePath("/settings");
    revalidatePath("/pos");
    return { success: true };
}, { permission: 'MANAGE_SETTINGS', requireCSRF: false });

