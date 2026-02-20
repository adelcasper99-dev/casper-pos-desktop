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
import { ensureMainBranch } from '@/lib/ensure-main-branch';

type UserWithRelations = Prisma.UserGetPayload<{
    include: {
        role: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
    }
}>;

export const getUsers = secureAction(async () => {
    const session = await getSession();
    // In desktop project, simplified permissions might mean session.user.permissions is undefined or empty
    const canViewSalary = session?.user?.role === 'ADMIN' || session?.user?.permissions?.includes('HR_VIEW_COMPENSATION');

    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    const serializedUsers = users.map((user: UserWithRelations) => ({
        ...user,
        // Handle SQLite JSON string for managedHQIds
        managedHQIds: typeof user.managedHQIds === 'string' ? JSON.parse(user.managedHQIds) : user.managedHQIds
    }))

    return { data: serializedUsers }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const getUsersByBranch = secureAction(async (branchId: string) => {
    const session = await getSession();
    const canViewSalary = session?.user?.role === 'ADMIN' || session?.user?.permissions?.includes('HR_VIEW_COMPENSATION');

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
        managedHQIds: typeof user.managedHQIds === 'string' ? JSON.parse(user.managedHQIds) : user.managedHQIds
    }))

    return { data: serializedUsers }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const createUser = secureAction(async (data: z.infer<typeof userSchema>) => {
    const startTime = Date.now();
    const { name, username, password, roleId, branchId, managedHQIds, isGlobalAdmin, phone } = data;

    // Global Phone Uniqueness Check
    if (phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(phone, 'USER');
        if (!phoneCheck.unique) {
            const { getTranslations } = await import('@/lib/i18n-mock');
            const t = await getTranslations('SystemMessages.Errors');
            throw new Error(t('phoneInUse', { usedBy: phoneCheck.usedBy || 'Unknown' }));
        }
    }

    if (!password) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Validation');
        throw new Error(t('required'));
    }

    // Check existing
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('usernameExists') || "Username already exists"); // Fallback if key missing
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    // Fetch Role Name for legacy support
    let roleName = "STAFF";
    if (roleId) {
        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (role) roleName = role.name;
    }

    // Auto-assign to main branch if no branch specified (single-branch mode)
    const effectiveBranchId = branchId || await ensureMainBranch();

    await prisma.user.create({
        data: {
            name,
            username,
            password: hashedPassword,
            roleId: roleId || undefined,
            roleStr: roleName,
            branchId: effectiveBranchId,
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

    revalidatePath('/settings/users')
    return { success: true }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const updateUser = secureAction(async (id: string, data: z.infer<typeof userSchema>) => {
    // Note: password is optional in update
    const { name, username, password, roleId, branchId, managedHQIds, isGlobalAdmin, phone } = data;

    // Global Phone Uniqueness Check (Exclude self)
    if (phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(phone, 'USER', id);
        if (!phoneCheck.unique) {
            const { getTranslations } = await import('@/lib/i18n-mock');
            const t = await getTranslations('SystemMessages.Errors');
            throw new Error(t('phoneInUse', { usedBy: phoneCheck.usedBy || 'Unknown' }));
        }
    }

    const updateData: Prisma.UserUpdateInput = {
        name,
        username,
        role: roleId ? { connect: { id: roleId } } : { disconnect: true },
        branch: branchId ? { connect: { id: branchId } } : { disconnect: true },
        managedHQIds: managedHQIds ? JSON.stringify(managedHQIds) : undefined,
        isGlobalAdmin: isGlobalAdmin ?? undefined,
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

    revalidatePath('/settings/users')
    return { success: true }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const deleteUser = secureAction(async (data: { id: string }) => {
    const startTime = Date.now();
    const { id } = data;

    try {
        const user = await prisma.user.findUnique({
            where: { id },
        });

        if (!user) {
            logger.warn('Delete attempt on non-existent user', { userId: id });
            const { getTranslations } = await import('@/lib/i18n-mock');
            const t = await getTranslations('SystemMessages.Errors');
            return { success: false, error: t('notFound') };
        }

        // Invalidate sessions before deletion
        await invalidateUserSessions(id);

        // Delete user
        await prisma.user.delete({
            where: { id }
        });

        logger.warn('User deleted', {
            userId: id,
            username: user.username,
            duration: Date.now() - startTime,
        });

        revalidatePath('/settings/users');
        return { success: true };
    } catch (error: any) {
        logger.error('Failed to delete user', {
            userId: id,
            error: error.message,
            duration: Date.now() - startTime,
        });
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        return {
            success: false,
            error: error.message || t('generic')
        };
    }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export async function getUsersForPage() {
    const session = await getSession();
    if (!session?.user) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('unauthorized'));
    }

    const user = session.user;
    const hasPermission = user.role === 'ADMIN' || user.permissions?.includes('MANAGE_USERS');

    if (!hasPermission) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('forbidden'));
    }

    const canViewSalary = user.role === 'ADMIN' || user.permissions?.includes('HR_VIEW_COMPENSATION');

    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    return users.map((u: any) => ({
        ...u,
        managedHQIds: typeof u.managedHQIds === 'string' ? JSON.parse(u.managedHQIds) : u.managedHQIds
    }));
}
