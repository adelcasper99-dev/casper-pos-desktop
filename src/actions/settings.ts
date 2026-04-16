"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { secureAction } from "@/lib/safe-action";

import { settingsSchema } from "@/lib/validation/settings";
import { ensureMainBranch, syncMainBranchDetails } from "@/lib/ensure-main-branch";

import { getSession } from "@/lib/auth";

/**
 * Get store settings - PUBLIC endpoint (no auth required but protected by CSRF)
 * Used by client components for read-only access to store configuration
 */
export const getStoreSettings = secureAction(async () => {
    try {
        let settings = await prisma.storeSettings.findUnique({
            where: { id: "settings" }
        });

        // Ensure one main branch exists (single-branch mode)
        await ensureMainBranch();

        // Serialize Decimal fields for client consumption
        return {
            success: true,
            data: {
                id: settings?.id || "settings",
                name: settings?.name || "Casper Store",
                phone: settings?.phone || null,
                address: settings?.address || null,
                currency: settings?.currency || "EGP",
                taxRate: Number(settings?.taxRate || 0),
                vatNumber: settings?.vatNumber || null,
                receiptFooter: settings?.receiptFooter || "Thank you for shopping with us!",
                logoUrl: settings?.logoUrl || null,
                autoPrint: settings?.autoPrint || false,
                autoPrintTicket: settings?.autoPrintTicket || false,
                autoPrintEngineerCopy: settings?.autoPrintEngineerCopy || false,
                paperSize: settings?.paperSize || "80mm",
                features: settings?.features || "{}",
                locationLat: settings?.locationLat || 24.7136,
                locationLng: settings?.locationLng || 46.6753,
                locationRadius: settings?.locationRadius || 500,
                allowNegativeStock: settings?.allowNegativeStock || false,
                blindCloseEnabled: settings?.blindCloseEnabled ?? true,
            }
        };
    } catch (error: any) {
        console.error("Error fetching store settings:", error);
        return { success: false, error: error.message };
    }
}, { requireCSRF: false });

export const getEffectiveStoreSettings = secureAction(async () => {
    try {
        // 1. Get Base Settings
        const baseSettingsRes = await getStoreSettings();
        if (!baseSettingsRes.success || !baseSettingsRes.data) {
            const { getTranslations } = await import('@/lib/i18n-mock');
            const t = await getTranslations('SystemMessages.Errors');
            return { success: false, error: t('generic') };
        }

        // Initialize settings
        let settings: any = { ...baseSettingsRes.data };

        // 2. Get User Session to check for Branch Override
        try {
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
        } catch (sessionError) {
            // Ignore session errors for unauthenticated users
        }

        return { success: true, data: settings };
    } catch (error: any) {
        console.error("Error fetching effective store settings:", error);
        return { success: false, error: error.message };
    }
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
            autoPrintTicket: validated.autoPrintTicket ?? undefined,
            autoPrintEngineerCopy: validated.autoPrintEngineerCopy ?? undefined,
            paperSize: validated.paperSize ?? undefined,
            features: validated.features ?? undefined,
            labelTemplate: validated.labelTemplate ?? undefined,
            locationLat: validated.locationLat ?? undefined,
            locationLng: validated.locationLng ?? undefined,
            locationRadius: validated.locationRadius ?? undefined,
            allowNegativeStock: validated.allowNegativeStock ?? undefined,
            blindCloseEnabled: validated.blindCloseEnabled ?? undefined,
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
            autoPrintTicket: validated.autoPrintTicket || false,
            autoPrintEngineerCopy: validated.autoPrintEngineerCopy || false,
            paperSize: validated.paperSize || "80mm",
            features: validated.features || "{}",
            labelTemplate: validated.labelTemplate || null,
            locationLat: validated.locationLat || 24.7136,
            locationLng: validated.locationLng || 46.6753,
            locationRadius: validated.locationRadius || 500,
            allowNegativeStock: validated.allowNegativeStock || false,
            blindCloseEnabled: true,
        }
    });

    // Sync main branch details with store settings (single-branch mode)
    await syncMainBranchDetails({
        name: validated.name,
        phone: validated.phone,
        address: validated.address
    });

    revalidatePath("/settings");
    revalidatePath("/pos");
    return { success: true };
}, { permission: 'MANAGE_SETTINGS', requireCSRF: false });

