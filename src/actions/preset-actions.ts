"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const DEFAULT_ISSUES = ['شاشة مكسورة', 'بطارية ضعيفة', 'لا يشحن', 'فاصل باور', 'مشاكل في الصوت', 'عطل في الكاميرا', 'تحديث سوفت وير', 'نسيان رمز القفل'];
const DEFAULT_CONDITIONS = ['خدوش', 'نقرات / صدمات', 'كسر / شرخ', 'انحناء في الإطار', 'تعرض للسوائل', 'أزرار مفقودة', 'تقشير في الطلاء'];

const PRESET_TRANSLATIONS: Record<string, string> = {
    'Broken Screen': 'شاشة مكسورة',
    'Weak Battery': 'بطارية ضعيفة',
    'Not Charging': 'لا يشحن',
    'No Power': 'فاصل باور',
    'Audio Issues': 'مشاكل في الصوت',
    'Camera Fault': 'عطل في الكاميرا',
    'Software Update': 'تحديث سوفت وير',
    'Forgot Passcode': 'نسيان رمز القفل',
    'Scratch': 'خدوش',
    'Dent': 'نقرات / صدمات',
    'Crack': 'كسر / شرخ',
    'Bent Frame': 'انحناء في الإطار',
    'Water Damage': 'تعرض للسوائل',
    'Missing Buttons': 'أزرار مفقودة',
    'Peeling Paint': 'تقشير في الطلاء'
};

export async function getPresets(type: "ISSUE" | "CONDITION") {
    try {
        // One-time migration of existing English presets
        const allPresets = await prisma.ticketPreset.findMany({ where: { type } });

        for (const preset of allPresets) {
            if (PRESET_TRANSLATIONS[preset.name]) {
                await prisma.ticketPreset.update({
                    where: { id: preset.id },
                    data: { name: PRESET_TRANSLATIONS[preset.name] }
                });
            }
        }

        const presets = await prisma.ticketPreset.findMany({
            where: { type },
            orderBy: { name: 'asc' }
        });

        if (presets.length === 0) {
            // Auto-seed defaults if empty
            const defaults = type === "ISSUE" ? DEFAULT_ISSUES : DEFAULT_CONDITIONS;
            await prisma.ticketPreset.createMany({
                data: defaults.map(name => ({ type, name }))
            });
            return await prisma.ticketPreset.findMany({ where: { type }, orderBy: { name: 'asc' } });
        }

        return presets;
    } catch (error) {
        console.error("Failed to get presets", error);
        return [];
    }
}

export async function addPreset(type: "ISSUE" | "CONDITION", name: string) {
    try {
        await prisma.ticketPreset.create({
            data: { type, name }
        });
        revalidatePath('/ar/maintenance/tickets/new');
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to add preset" };
    }
}

export async function deletePreset(id: string) {
    try {
        await prisma.ticketPreset.delete({
            where: { id }
        });
        revalidatePath('/ar/maintenance/tickets/new');
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to delete preset" };
    }
}
