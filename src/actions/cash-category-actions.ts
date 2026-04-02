"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { secureAction } from "@/lib/safe-action";
import { serialize } from "@/lib/serialization";
import { z } from "zod";

export const getCashCategories = secureAction(async (filters?: {
    type?: string;
    isActive?: boolean;
}) => {
    const where: any = {};
    
    if (filters?.type) where.type = filters.type;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    const categories = await prisma.cashCategory.findMany({
        where,
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }]
    });

    return serialize({ categories });
});

export const createCashCategory = secureAction(async (data: {
    name: string;
    type: "IN" | "OUT";
    glCode?: string;
}) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    const exists = await prisma.cashCategory.findFirst({
        where: { name: data.name }
    });

    if (exists) {
        throw new Error("Category with this name already exists");
    }

    const category = await prisma.cashCategory.create({
        data: {
            name: data.name,
            type: data.type,
            glCode: data.glCode || '3000',
            isSystem: false,
            isActive: true
        }
    });

    revalidatePath("/treasury");
    revalidatePath("/pos");

    return serialize({ success: true, category });
}, { permission: "TREASURY_MANAGE" });

export const updateCashCategory = secureAction(async (data: {
    id: string;
    name?: string;
    isActive?: boolean;
    glCode?: string;
}) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    const existing = await prisma.cashCategory.findUnique({
        where: { id: data.id }
    });

    if (!existing) {
        throw new Error("Category not found");
    }

    if (existing.isSystem) {
        throw new Error("Cannot modify system categories");
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.glCode) updateData.glCode = data.glCode;

    const category = await prisma.cashCategory.update({
        where: { id: data.id },
        data: updateData
    });

    revalidatePath("/treasury");
    revalidatePath("/pos");

    return serialize({ success: true, category });
}, { permission: "TREASURY_MANAGE" });

export const deleteCashCategory = secureAction(async (id: string) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    const existing = await prisma.cashCategory.findUnique({
        where: { id }
    });

    if (!existing) {
        throw new Error("Category not found");
    }

    if (existing.isSystem) {
        throw new Error("Cannot delete system categories");
    }

    // Check if category is in use
    const transactions = await prisma.transaction.count({
        where: { categoryId: id }
    });

    if (transactions > 0) {
        // Soft delete - just deactivate
        await prisma.cashCategory.update({
            where: { id },
            data: { isActive: false }
        });
    } else {
        await prisma.cashCategory.delete({
            where: { id }
        });
    }

    revalidatePath("/treasury");
    revalidatePath("/pos");

    return serialize({ success: true });
}, { permission: "TREASURY_MANAGE" });

export const getArchivedCashCategories = secureAction(async () => {
    const categories = await prisma.cashCategory.findMany({
        where: { isActive: false },
        orderBy: { name: 'asc' }
    });

    return serialize({ categories });
});

export const restoreCashCategory = secureAction(async (id: string) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    const category = await prisma.cashCategory.update({
        where: { id },
        data: { isActive: true }
    });

    revalidatePath("/treasury");
    revalidatePath("/pos");

    return serialize({ success: true, category });
}, { permission: "TREASURY_MANAGE" });

export async function getSystemCashCategory(type: "IN" | "OUT"): Promise<string | null> {
    const category = await prisma.cashCategory.findFirst({
        where: { 
            type,
            isSystem: true,
            isActive: true
        }
    });
    return category?.id || null;
}
