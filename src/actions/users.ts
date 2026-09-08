'use server'

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { secureAction } from '@/lib/safe-action';
import { z } from 'zod';
import { userSchema } from '@/lib/validation/users';
import { logger } from '@/lib/logger';
import { getSession, invalidateUserSessions, UserSession } from '@/lib/auth';
import { ensureMainBranch } from '@/lib/ensure-main-branch';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { AppError, ErrorCodes } from '@/lib/errors';

/**
 * Validates that the active user has sufficient privileges to create/modify/delete
 * a target user or assign a target role.
 */
async function checkPrivilegeEscalation(
    sessionUser: UserSession,
    targetRoleId?: string,
    existingUserId?: string
) {
    // 1. Super-admins (wildcard permission) bypass all checks
    if (hasPermission(sessionUser.permissions, '*')) {
        return;
    }

    const forbiddenPerms = ['MANAGE_SETTINGS', 'MANAGE_ROLES'];

    // 2. Protect existing admins and users with sensitive permissions from non-admin actions
    if (existingUserId) {
        const targetUser = await prisma.user.findUnique({
            where: { id: existingUserId },
            include: { role: true }
        });

        if (targetUser) {
            // Protect System Admins (Wildcard or Global flag)
            let targetPerms: string[] = [];
            try {
                targetPerms = JSON.parse(targetUser.role?.permissions || '[]');
            } catch (e) {
                targetPerms = [];
            }

            if (targetPerms.includes('*') || targetUser.isGlobalAdmin) {
                throw new Error("Forbidden: You cannot modify or delete a system administrator (Wildcard permissions).");
            }

            // Protect users with 'settings' or 'roles' permissions
            let existingPerms: string[] = [];
            try {
                existingPerms = JSON.parse(targetUser.role?.permissions || '[]');
            } catch (e) {
                existingPerms = [];
            }

            if (forbiddenPerms.some(p => existingPerms.includes(p))) {
                throw new Error("Forbidden: You cannot modify a user who has system configuration permissions.");
            }

            // Subset Check: Cannot modify users with more or different privileges than your own
            const userPerms = sessionUser.permissions || [];
            if (!existingPerms.every(p => userPerms.includes(p))) {
                throw new Error("Forbidden: You cannot modify a user whose role has privileges that you do not possess.");
            }
        }
    }

    // 3. Prevent privilege escalation via role assignment
    if (targetRoleId) {
        const targetRole = await prisma.role.findUnique({ where: { id: targetRoleId } });
        if (!targetRole) return;

        let targetPerms: string[] = [];
        try {
            targetPerms = JSON.parse(targetRole.permissions || '[]');
        } catch (e) {
            targetPerms = [];
        }

        // Non-globals cannot assign roles with the wildcard permission
        if (targetPerms.includes('*')) {
            throw new Error("Forbidden: Only system admins can assign roles with unrestricted (*) permissions.");
        }

        // Validate that target role doesn't contain forbidden permissions
        if (forbiddenPerms.some(p => targetPerms.includes(p))) {
            throw new Error("Forbidden: You cannot assign a role that contains system configuration permissions (Settings/Roles).");
        }

        // General subset check: Validate that target permissions are a subset of the requester's permissions
        const userPerms = sessionUser.permissions || [];
        const missingPerms = targetPerms.filter(p => !userPerms.includes(p));

        if (missingPerms.length > 0) {
            throw new Error("Forbidden: You cannot assign a role with more privileges than your own.");
        }
    }
}

type UserWithRelations = Prisma.UserGetPayload<{
    include: {
        role: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
    }
}>;

export const getUsers = secureAction(async () => {
    const session = await getSession();
    const isSuperAdmin = hasPermission(session?.user?.permissions, '*');
    const canViewSalary = isSuperAdmin || hasPermission(session?.user?.permissions, PERMISSIONS.HR_VIEW_COMPENSATION);

    const users = await prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true, permissions: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    type UserRecord = typeof users[number] & {
        maxDiscount?: Prisma.Decimal | number | null;
        maxDiscountAmount?: Prisma.Decimal | number | null;
        salary?: Prisma.Decimal | number | null;
        managedHQIds?: string | string[] | null;
    };

    const serializedUsers = users.map((user: UserWithRelations) => {
        const u = user as unknown as UserRecord;
        return {
            ...user,
            maxDiscount: u.maxDiscount ? Number(u.maxDiscount) : 0,
            maxDiscountAmount: u.maxDiscountAmount ? Number(u.maxDiscountAmount) : 0,
            // Handle SQLite JSON string for managedHQIds
            managedHQIds: typeof user.managedHQIds === 'string' ? JSON.parse(user.managedHQIds) : user.managedHQIds
        }
    })

    return { data: serializedUsers }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const getUsersByBranch = secureAction(async (branchId: string) => {
    const session = await getSession();
    const isSuperAdmin = hasPermission(session?.user?.permissions, '*');
    const canViewSalary = isSuperAdmin || hasPermission(session?.user?.permissions, PERMISSIONS.HR_VIEW_COMPENSATION);

    const users = await prisma.user.findMany({
        where: { branchId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true, permissions: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    type UserRecord = typeof users[number] & {
        maxDiscount?: Prisma.Decimal | number | null;
        maxDiscountAmount?: Prisma.Decimal | number | null;
        salary?: Prisma.Decimal | number | null;
        managedHQIds?: string | string[] | null;
    };

    const serializedUsers = users.map((user: UserWithRelations) => {
        const u = user as unknown as UserRecord;
        return {
            ...user,
            maxDiscount: u.maxDiscount ? u.maxDiscount.toString() : "0",
            maxDiscountAmount: u.maxDiscountAmount ? u.maxDiscountAmount.toString() : "0",
            salary: u.salary ? u.salary.toString() : "0",
            managedHQIds: typeof user.managedHQIds === 'string' ? JSON.parse(user.managedHQIds) : user.managedHQIds
        }
    })

    return { data: serializedUsers }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const createUser = secureAction(async (data: z.infer<typeof userSchema> & { confirmLink?: boolean }) => {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");

    const validatedData = userSchema.parse(data);
    const { name, username, password, roleId, branchId, managedHQIds, isGlobalAdmin, phone, maxDiscount, maxDiscountAmount, salary } = validatedData;
    const rawData = data as { confirmLink?: boolean | string };
    const confirmLink = rawData.confirmLink === true || rawData.confirmLink === 'true';

    // Privilege Escalation Check
    await checkPrivilegeEscalation(session.user, roleId);

    if (isGlobalAdmin && !hasPermission(session.user.permissions, '*')) {
        throw new Error("Forbidden: Only admins can set global admin status.");
    }

    const startTime = Date.now();

    // Global Phone Uniqueness Check
    if (phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(phone, 'USER');
        
        if (!phoneCheck.unique) {
            // Special Case: If matches a CUSTOMER and admin confirmed linking, WE ALLOW IT
            if (phoneCheck.usedBy === 'CUSTOMER' && confirmLink) {
                // Allow proceeding, we will link later
            } else {
                const { getTranslations } = await import('@/lib/i18n-mock');
                const t = await getTranslations('SystemMessages.Errors');
                throw new AppError(
                    ErrorCodes.VALIDATION_ERROR, 
                    t('phoneInUse', { usedBy: phoneCheck.usedBy || 'Unknown' }),
                    { code: 'PHONE_IN_USE', usedBy: phoneCheck.usedBy, entityId: phoneCheck.entityId }
                );
            }
        }
    }

    if (!password) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Validation');
        throw new Error(t('required'));
    }

    // Check existing in active tenant
    const existing = await prisma.user.findFirst({ 
        where: { 
            username: { equals: username.trim(), mode: 'insensitive' },
            deletedAt: null 
        } 
    });
    if (existing) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('usernameExists') || "Username already exists"); // Fallback if key missing
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    // Fetch Branch & Role with validation to avoid P2003 on stale session data
    let branchInDb: { id: string } | null = null;
    if (branchId) {
        branchInDb = await prisma.branch.findUnique({
            where: { id: branchId }
        });
    }
    const effectiveBranchId = branchInDb?.id || await ensureMainBranch();

    let role: { id: string; name: string } | null = null;
    let roleName = "STAFF";
    if (roleId) {
        role = await prisma.role.findUnique({ where: { id: roleId } });
        if (role) roleName = role.name;
    }


    // Use transaction for atomic creation (User + Warehouse + Technician)
    await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
            data: {
                name,
                username,
                password: hashedPassword,
                roleId: roleId || undefined,
                roleStr: roleName,
                branchId: effectiveBranchId,
                managedHQIds: managedHQIds ? JSON.stringify(managedHQIds) : "[]",
                isGlobalAdmin: isGlobalAdmin || false,
                phone: phone || null,
                maxDiscount: maxDiscount ?? 0.00,
                maxDiscountAmount: maxDiscountAmount ?? 0.00,
                salary: salary ?? 0.00,
                hireDate: validatedData.hireDate ? new Date(validatedData.hireDate) : null,
            }
        })

        // --- Technician Automation ---
        const isTechnicianRole = roleName.toLowerCase().includes('technician') || roleName === 'فني';
        if (isTechnicianRole) {
            // 1. Create a dedicated warehouse for this technician
            const warehouse = await tx.warehouse.create({
                data: {
                    name: `${name || username} Warehouse`,
                    branchId: effectiveBranchId,
                    isDefault: false,
                }
            });

            // 2. Create the Technician profile linked to this user and warehouse
            await tx.technician.create({
                data: {
                    userId: newUser.id,
                    name: name || username,
                    warehouseId: warehouse.id,
                    phone: phone || null,
                }
            });
        }

        // --- Customer Linking (Explicit) ---
        if (phone && confirmLink) {
            await tx.customer.updateMany({
                where: { phone },
                data: { linkedEmployeeId: newUser.id }
            });
        }
    });

    logger.info('User created', {
        userId: username,
        role: roleName,
        automatedWarehouse: roleName.toLowerCase().includes('technician') || roleName === 'فني',
        duration: Date.now() - startTime,
    });

    revalidatePath('/settings/users')
    return { success: true }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const updateUser = secureAction(async (id: string, data: z.infer<typeof userSchema> & { confirmLink?: boolean }) => {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");

    const validatedData = userSchema.parse(data);
    const { name, username, password, roleId, branchId, managedHQIds, isGlobalAdmin, phone, maxDiscount, maxDiscountAmount, salary } = validatedData;
    const rawData = data as { confirmLink?: boolean | string };
    const confirmLink = rawData.confirmLink === true || rawData.confirmLink === 'true';

    // Privilege Escalation Check
    await checkPrivilegeEscalation(session.user, roleId, id);

    if (isGlobalAdmin && !hasPermission(session.user.permissions, '*')) {
        throw new Error("Forbidden: Only admins can set global admin status.");
    }

    // Global Phone Uniqueness Check (Exclude self)
    if (phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(phone, 'USER', id);
        
        if (!phoneCheck.unique) {
             // Special Case: If matches a CUSTOMER and admin confirmed linking, WE ALLOW IT
             if (phoneCheck.usedBy === 'CUSTOMER' && confirmLink) {
                // Allow proceeding
             } else {
                 const { getTranslations } = await import('@/lib/i18n-mock');
                 const t = await getTranslations('SystemMessages.Errors');
                 throw new AppError(
                     ErrorCodes.VALIDATION_ERROR, 
                     t('phoneInUse', { usedBy: phoneCheck.usedBy || 'Unknown' }),
                     { code: 'PHONE_IN_USE', usedBy: phoneCheck.usedBy, entityId: phoneCheck.entityId }
                 );
             }
        }
    }

    const startTime = Date.now();
    const updateData: Prisma.UserUpdateInput = {
        name,
        username,
        role: roleId ? { connect: { id: roleId } } : { disconnect: true },
        branch: branchId ? { connect: { id: branchId } } : undefined,
        managedHQIds: managedHQIds ? JSON.stringify(managedHQIds) : "[]",
        isGlobalAdmin: isGlobalAdmin || false,
        phone: phone || null,
        maxDiscount: maxDiscount ?? 0.00,
        maxDiscountAmount: maxDiscountAmount ?? 0.00,
        salary: salary ?? 0.00,
        hireDate: validatedData.hireDate ? new Date(validatedData.hireDate) : null,
    };

    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    let roleName = "STAFF";
    if (roleId) {
        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (role) {
            roleName = role.name;
            updateData.roleStr = roleName;
        }
    }

    const isTechnicianRole = roleName.toLowerCase().includes('technician') || roleName === 'فني';

    await prisma.$transaction(async (tx) => {
        // Update user
        const updatedUser = await tx.user.update({
            where: { id },
            data: updateData,
            include: { technician: true }
        });

        // Handle Technician profile creation/update
        if (isTechnicianRole) {
            const effectiveBranchId = branchId || updatedUser.branchId || await ensureMainBranch();
            if (!updatedUser.technician) {
                // Create dedicated warehouse if none exists
                const warehouse = await tx.warehouse.create({
                    data: {
                        name: `${name || username} Warehouse`,
                        branchId: effectiveBranchId,
                        isDefault: false,
                    }
                });

                await tx.technician.create({
                    data: {
                        userId: id,
                        name: name || username,
                        warehouseId: warehouse.id,
                        phone: phone || null,
                    }
                });
            } else {
                // Update existing technician profile
                await tx.technician.update({
                    where: { userId: id },
                    data: {
                        name: name || username,
                        phone: phone || null,
                        deletedAt: null // Restore if was deleted
                    }
                });
            }
        }

        // --- Customer Linking (Explicit) ---
        if (phone && confirmLink) {
            await tx.customer.updateMany({
                where: { phone },
                data: { linkedEmployeeId: id }
            });
        }
    });

    logger.info('User updated', {
        userId: id,
        username,
        role: roleName,
        duration: Date.now() - startTime,
    });

    revalidatePath('/settings/users');
    return { success: true };
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const deleteUser = secureAction(async (data: { id: string }) => {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");

    const startTime = Date.now();
    const { id } = data;

    // Privilege Escalation Check
    await checkPrivilegeEscalation(session.user, undefined, id);

    let userAccountInDb: { id: string; name: string | null; role: { permissions: string } | null } | null = null;
    if (id) {
        userAccountInDb = await prisma.user.findUnique({
            where: { id: id },
            select: { id: true, name: true, role: { select: { permissions: true } } }
        });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id },
            include: { technician: true }
        });

        if (!user) {
            logger.warn('Delete attempt on non-existent user', { userId: id });
            const { getTranslations } = await import('@/lib/i18n-mock');
            const t = await getTranslations('SystemMessages.Errors');
            return { success: false, error: t('notFound') };
        }

        // Invalidate sessions before deletion
        await invalidateUserSessions(id);

        await prisma.$transaction(async (tx) => {
            // 1. If this is a technician, we should handle their dedicated warehouse
            if (user.technician) {
                // Soft delete technician profile
                await tx.technician.update({
                    where: { userId: id },
                    data: { deletedAt: new Date() }
                });
            }

            // 2. Unlink from any customers
            await tx.customer.updateMany({
                where: { linkedEmployeeId: id },
                data: { linkedEmployeeId: null }
            });

            // 3. Unlink from any suppliers
            await tx.supplier.updateMany({
                where: { linkedEmployeeId: id },
                data: { linkedEmployeeId: null }
            });

            // 4. Soft Delete the User instead of hard delete to preserve historical data
            const timestamp = Date.now();
            await tx.user.update({
                where: { id },
                data: {
                    deletedAt: new Date(),
                    // Rename unique fields to free them up for reuse
                    username: `${user.username}_del_${timestamp}`,
                    phone: user.phone ? `${user.phone}_del_${timestamp}` : null,
                }
            });
        });

        logger.warn('User deleted', {
            userId: id,
            username: user.username,
            duration: Date.now() - startTime,
        });

        revalidatePath('/settings/users');
        return { success: true };
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to delete user', {
            userId: id,
            error: err.message,
            duration: Date.now() - startTime,
        });
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        return {
            success: false,
            error: err.message || t('generic')
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
    const canManageUsers = hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS);

    if (!canManageUsers) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('forbidden'));
    }

    const users = await prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    type UserRecord = typeof users[number] & {
        maxDiscount?: Prisma.Decimal | number | null;
        maxDiscountAmount?: Prisma.Decimal | number | null;
        salary?: Prisma.Decimal | number | null;
        managedHQIds?: string | string[] | null;
    };

    return users.map((u: UserRecord) => ({
        ...u,
        maxDiscount: u.maxDiscount ? u.maxDiscount.toString() : "0",
        maxDiscountAmount: u.maxDiscountAmount ? u.maxDiscountAmount.toString() : "0",
        salary: u.salary ? u.salary.toString() : "0",
        managedHQIds: typeof u.managedHQIds === 'string' ? JSON.parse(u.managedHQIds) : u.managedHQIds
    }));
}

export const checkPhoneLink = secureAction(async (phone: string) => {
    if (!phone) return { exists: false };

    const customer = await prisma.customer.findUnique({
        where: { phone },
        select: { id: true, name: true, balance: true }
    });

    if (customer) {
        return {
            exists: true,
            customer: {
                id: customer.id,
                name: customer.name,
                balance: Number(customer.balance)
            }
        };
    }

    return { exists: false };
}, { permission: 'MANAGE_USERS', requireCSRF: false });
