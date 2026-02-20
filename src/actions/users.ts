'use server'

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { secureAction } from '@/lib/safe-action';
import { z } from 'zod';
import { userSchema } from '@/lib/validation/users';
import { logger } from '@/lib/logger';
import { getSession, invalidateUserSessions } from '@/lib/auth';

type UserWithRelations = Prisma.UserGetPayload<{
    include: {
        role: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
    }
}>;

export const getUsers = secureAction(async () => {
    const session = await getSession();
    const canViewSalary = session?.user?.permissions?.includes('HR_VIEW_COMPENSATION')
        || session?.user?.role === 'ADMIN';

    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    const serializedUsers = users.map((user: UserWithRelations) => ({
        ...user,
        // ⭐ PRIVACY: Only expose salary to users with HR_VIEW_COMPENSATION permission
        // salary: canViewSalary ? (user.salary ? Number(user.salary) : 0) : undefined
    }))

    return { data: serializedUsers }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const getUsersByBranch = secureAction(async (branchId: string) => {
    const session = await getSession();
    const canViewSalary = session?.user?.permissions?.includes('HR_VIEW_COMPENSATION')
        || session?.user?.role === 'ADMIN';

    const users = await prisma.user.findMany({
        where: { branchId },
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    const serializedUsers = users.map((user: UserWithRelations) => ({
        ...user,
        // salary: canViewSalary ? (user.salary ? Number(user.salary) : 0) : undefined
    }))

    return { data: serializedUsers }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const createUser = secureAction(async (data: z.infer<typeof userSchema>) => {
    const startTime = Date.now();
    const { name, username, password, roleId, branchId, salary, managedHQIds, isGlobalAdmin, phone } = data;

    // Global Phone Uniqueness Check
    if (phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(phone, 'USER');
        if (!phoneCheck.unique) {
            throw new Error(`Phone number is already in use by a ${phoneCheck.usedBy} (${phoneCheck.entityName || 'Unknown'})`);
        }
    }

    if (!password) {
        throw new Error('Password is required for new users');
    }

    // Check existing
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
        throw new Error('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    // Fetch Role Name for legacy support
    let roleName = "STAFF";
    if (roleId) {
        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (role) roleName = role.name;
    }

    await prisma.user.create({
        data: {
            name,
            username,
            password: hashedPassword,
            roleId: roleId || undefined,
            roleStr: roleName,
            branchId,
            // salary: salary ? Number(salary) : undefined,
            managedHQIds: managedHQIds ? JSON.stringify(managedHQIds) : "[]",
            isGlobalAdmin: isGlobalAdmin || false,
            phone: phone || null
        }
    })

    logger.info('User created', {
        userId: username,
        role: roleName,
        duration: Date.now() - startTime,
    });

    revalidatePath('/settings')
    return { success: true }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const updateUser = secureAction(async (id: string, data: z.infer<typeof userSchema>) => {
    // Note: password is optional in update
    const { name, username, password, roleId, branchId, salary, managedHQIds, isGlobalAdmin, phone } = data;

    // Global Phone Uniqueness Check (Exclude self)
    if (phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(phone, 'USER', id);
        if (!phoneCheck.unique) {
            throw new Error(`Phone number is already in use by a ${phoneCheck.usedBy} (${phoneCheck.entityName || 'Unknown'})`);
        }
    }

    const updateData: Prisma.UserUpdateInput = {
        name,
        username,
        role: roleId ? { connect: { id: roleId } } : { disconnect: true },
        branch: { connect: { id: branchId } },
        // salary: salary ? Number(salary) : null,
        managedHQIds: managedHQIds ? JSON.stringify(managedHQIds) : undefined,
        isGlobalAdmin: isGlobalAdmin || false,
        phone: phone || null
    }

    if (password && password.trim() !== '') {
        updateData.password = await bcrypt.hash(password, 10)
    }

    // Sync roleStr
    if (roleId) {
        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (role) updateData.roleStr = role.name;
    }

    await prisma.user.update({
        where: { id },
        data: updateData
    })

    // Invalidate user sessions to force fresh login with new permissions/details
    await invalidateUserSessions(id);

    revalidatePath('/settings')
    return { success: true }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const deleteUser = secureAction(async (data: { id: string }) => {
    const startTime = Date.now();
    const { id } = data;

    try {
        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            logger.warn('Delete attempt on non-existent user', { userId: id });
            return { success: false, error: 'User not found' };
        }

        // Invalidate sessions before deletion (best effort)
        await invalidateUserSessions(id);

        // Now delete the user
        await prisma.user.delete({
            where: { id }
        });

        logger.warn('User deleted', {
            userId: id,
            username: user.username,
            duration: Date.now() - startTime,
        });

        revalidatePath('/settings');
        return { success: true };
    } catch (error: any) {
        logger.error('Failed to delete user', {
            userId: id,
            error: error.message,
            duration: Date.now() - startTime,
        });
        return {
            success: false,
            error: `Failed to delete user: ${error.message}`
        };
    }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

/**
 * Server-side data fetching for Server Components
 * Throws an error if unauthorized instead of returning error response
 */
export async function getUsersForPage() {
    const session = await getSession();
    if (!session?.user) {
        throw new Error("Unauthorized: Please log in.");
    }

    // Check if user has MANAGE_USERS permission or is ADMIN
    const user = session.user;
    const hasPermission = user.permissions?.includes('MANAGE_USERS') || user.role === 'ADMIN';

    if (!hasPermission) {
        throw new Error("Forbidden: Insufficient permissions.");
    }

    // ⭐ PRIVACY FIX: Check if user can view salary information
    const canViewSalary = user.permissions?.includes('HR_VIEW_COMPENSATION') || user.role === 'ADMIN';

    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    return users.map((user: UserWithRelations) => ({
        ...user,
        // ⭐ PRIVACY: Only expose salary to users with HR_VIEW_COMPENSATION permission
        // salary: canViewSalary ? (user.salary ? Number(user.salary) : 0) : undefined
    }));
}
