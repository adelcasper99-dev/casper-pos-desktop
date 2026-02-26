'use server';

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { secureAction } from "@/lib/safe-action";

import { getCurrentUser } from "./auth";
import { getTranslations } from "@/lib/i18n-mock";

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
    // We check role OR if their branch type is 'CENTER' (HQ)
    const roleUpper = user.role?.toUpperCase() || '';
    const isHQUser = roleUpper === 'ADMIN' ||
        roleUpper === 'MANAGER' ||
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
    // Check if user can access this branch
    const roleUpper = user.role?.toUpperCase() || '';
    const isHQUser = roleUpper === 'ADMIN' ||
        roleUpper === 'MANAGER' ||
        user.branchType === 'CENTER';

    const t = await getTranslations('SystemMessages.Errors');

    if (!isHQUser && user.branchId !== branchId) {
        throw new Error(t('forbidden'));
    }

    const warehouses = await prisma.warehouse.findMany({
        where: { branchId },
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

    const roleUpper = user.role?.toUpperCase() || '';
    const isHQUser = roleUpper === 'ADMIN' ||
        roleUpper === 'MANAGER' ||
        user.branchType === 'CENTER';

    let where: Prisma.WarehouseWhereInput = {};
    if (!isHQUser && user.branchId) {
        where = { branchId: user.branchId };
    }

    const warehouses = await prisma.warehouse.findMany({
        where,
        include: { branch: true },
        orderBy: { name: 'asc' }
    });

    return { success: true, data: warehouses };
}, { requireCSRF: false });
