'use server';

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { secureAction } from "@/lib/safe-action";

import { getCurrentUser } from "./auth";
import { getTranslations } from "@/lib/i18n-mock";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";

/**
 * Get branches visible to current user
 * - Regular users: Only their branch
 * - HQ users (Admin/Manager): All branches
 */
export const getVisibleBranches = secureAction(async () => {
    const t = await getTranslations('SystemMessages.Errors');
    const user = await getCurrentUser();
    if (!user) throw new Error(t('unauthorized'));


    // Check if user is HQ/Admin who can see all branches
    // We check permissions OR if their branch type is 'CENTER' (HQ)
    const isHQUser = hasPermission(user.permissions, PERMISSIONS.BRANCH_VIEW) || 
        hasPermission(user.permissions, PERMISSIONS.REPORTS_VIEW_ALL) ||
        user.branchType === 'CENTER';

    // Fix: If user has no branchId but is not HQ, return all branches
    // This handles the case where user.branchId is undefined/null
    let whereClause: Prisma.BranchWhereInput = {};
    if (!isHQUser && user.branchId) {
        whereClause = { id: user.branchId };
    }
    // If !isHQUser && !user.branchId, we return all branches (empty where clause)
    // This allows the user to select a branch

    const branches = await prisma.branch.findMany({
        where: whereClause,
        orderBy: { name: 'asc' }
    });

    return { success: true, data: branches, isHQUser };
}, { requireCSRF: false });

/**
 * Get warehouses for a specific branch
 * Validates user has permission to access that branch
 */
export const getWarehousesByBranch = secureAction(async (branchId: string) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    // Check if user can access this branch
    const isHQUser = hasPermission(user.permissions, PERMISSIONS.BRANCH_VIEW) || 
        hasPermission(user.permissions, PERMISSIONS.REPORTS_VIEW_ALL) ||
        user.branchType === 'CENTER';

    const t = await getTranslations('SystemMessages.Errors');

    if (!isHQUser && user.branchId !== branchId) {
        throw new Error(t('forbidden'));
    }

    const warehouses = await prisma.warehouse.findMany({
        where: { branchId, deletedAt: null },
        include: { branch: true },
        orderBy: { isDefault: 'desc' }
    });

    return { success: true, data: warehouses };
}, { requireCSRF: false });

/**
 * Get all warehouses visible to the user
 */
export const getAllWarehouses = secureAction(async () => {
    const t = await getTranslations('SystemMessages.Errors');
    const user = await getCurrentUser();
    if (!user) throw new Error(t('unauthorized'));

    const isHQUser = hasPermission(user.permissions, PERMISSIONS.BRANCH_VIEW) || 
        hasPermission(user.permissions, PERMISSIONS.REPORTS_VIEW_ALL) ||
        user.branchType === 'CENTER';

    let where: Prisma.WarehouseWhereInput = { deletedAt: null };
    if (!isHQUser && user.branchId) {
        where = { branchId: user.branchId, deletedAt: null };
    }

    const warehouses = await prisma.warehouse.findMany({
        where,
        include: { branch: true },
        orderBy: { name: 'asc' }
    });

    return { success: true, data: warehouses };
}, { requireCSRF: false });

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const branchSchema = z.object({
    name: z.string().min(1, "الاسم مطلوب"),
    code: z.string().min(1, "الكود مطلوب"),
    type: z.string().min(1, "النوع مطلوب"),
    address: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    region: z.string().optional().nullable(),
    territoryCode: z.string().optional().nullable()
});

export const createBranch = secureAction(async (data: z.infer<typeof branchSchema> & { csrfToken?: string }) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    
    const isHQUser = hasPermission(user.permissions, PERMISSIONS.BRANCH_VIEW) || user.branchType === 'CENTER';
    if (!isHQUser) throw new Error("Unauthorized");

    const validated = branchSchema.parse(data);
    const branch = await prisma.branch.create({
        data: validated
    });
    
    revalidatePath('/settings');
    return { success: true, data: branch };
}, { requireCSRF: true });

export const updateBranch = secureAction(async (data: z.infer<typeof branchSchema> & { id: string, csrfToken?: string }) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    
    const isHQUser = hasPermission(user.permissions, PERMISSIONS.BRANCH_VIEW) || user.branchType === 'CENTER';
    if (!isHQUser) throw new Error("Unauthorized");

    const validated = branchSchema.parse(data);
    const branch = await prisma.branch.update({
        where: { id: data.id },
        data: validated
    });
    
    revalidatePath('/settings');
    return { success: true, data: branch };
}, { requireCSRF: true });

export const deleteBranch = secureAction(async (data: { id: string, csrfToken?: string }) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    
    const isHQUser = hasPermission(user.permissions, PERMISSIONS.BRANCH_VIEW) || user.branchType === 'CENTER';
    if (!isHQUser) throw new Error("Unauthorized");

    await prisma.branch.delete({
        where: { id: data.id }
    });
    
    revalidatePath('/settings');
    return { success: true };
}, { requireCSRF: true });
