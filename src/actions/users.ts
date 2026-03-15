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

/**
 * Validates that the active user has sufficient privileges to create/modify/delete
 * a target user or assign a target role.
 */
async function checkPrivilegeEscalation(
    sessionUser: UserSession,
    targetRoleId?: string,
    existingUserId?: string
) {
    // 1. Admins and super-admins bypass all checks
    if (sessionUser.role === 'ADMIN' || sessionUser.role === 'مدير النظام' || sessionUser.role === 'المالك' || sessionUser.permissions?.includes('*')) {
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
            // Protect Admin role
            if (targetUser.roleStr === 'ADMIN' || targetUser.role?.name === 'Admin' || targetUser.role?.name === 'مدير النظام' || targetUser.role?.name === 'المالك' || targetUser.isGlobalAdmin) {
                throw new Error("Forbidden: You cannot modify or delete a system administrator.");
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

        const targetRoleName = targetRole.name.toUpperCase();

        // Non-admins cannot assign Admin roles
        if (targetRoleName === 'ADMIN' || targetRoleName === 'ADMINISTRATOR' || targetRoleName === 'مدير النظام' || targetRoleName === 'المالك') {
            throw new Error("Forbidden: Only system admins can assign the Administrator role.");
        }

        // Validate that target role doesn't contain forbidden permissions
        let targetPerms: string[] = [];
        try {
            targetPerms = JSON.parse(targetRole.permissions || '[]');
        } catch (e) {
            targetPerms = [];
        }

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
    // In desktop project, simplified permissions might mean session.user.permissions is undefined or empty
    const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'مدير النظام' || session?.user?.role === 'المالك' || session?.user?.permissions?.includes('*');
    const canViewSalary = isAdmin || session?.user?.permissions?.includes('HR_VIEW_COMPENSATION');

    const users = await prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true, permissions: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    const serializedUsers = users.map((user: UserWithRelations) => {
        const u = user as any;
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
    const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'مدير النظام' || session?.user?.role === 'المالك' || session?.user?.permissions?.includes('*');
    const canViewSalary = isAdmin || session?.user?.permissions?.includes('HR_VIEW_COMPENSATION');

    const users = await prisma.user.findMany({
        where: { branchId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true, permissions: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    const serializedUsers = users.map((user: UserWithRelations) => {
        const u = user as any;
        return {
            ...user,
            maxDiscount: u.maxDiscount ? Number(u.maxDiscount) : 0,
            maxDiscountAmount: u.maxDiscountAmount ? Number(u.maxDiscountAmount) : 0,
            salary: u.salary ? Number(u.salary) : 0,
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
    const confirmLink = (data as any).confirmLink === true || (data as any).confirmLink === 'true';

    // Privilege Escalation Check
    await checkPrivilegeEscalation(session.user, roleId);

    const isAdmin = (role: string) => role === 'ADMIN' || role === 'مدير النظام' || role === 'المالك';
    if (isGlobalAdmin && !isAdmin(session.user.role)) {
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
                throw new Error(t('phoneInUse', { usedBy: phoneCheck.usedBy || 'Unknown' }));
            }
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
    let role = null;
    let roleName = "STAFF";
    if (roleId) {
        role = await prisma.role.findUnique({ where: { id: roleId } });
        if (role) roleName = role.name;
    }

    // Auto-assign to main branch if no branch specified (single-branch mode)
    const effectiveBranchId = branchId || await ensureMainBranch();

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
    // Note: password is optional in update
    const { name, username, password, roleId, branchId, managedHQIds, isGlobalAdmin, phone, maxDiscount, maxDiscountAmount, salary } = validatedData;
    const confirmLink = (data as any).confirmLink === true || (data as any).confirmLink === 'true';

    // Privilege Escalation Check
    await checkPrivilegeEscalation(session.user, roleId, id);

    const isSystemAdmin = (role: string) => role === 'ADMIN' || role === 'مدير النظام' || role === 'المالك';
    if (isGlobalAdmin && !isSystemAdmin(session.user.role)) {
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
                throw new Error(t('phoneInUse', { usedBy: phoneCheck.usedBy || 'Unknown' }));
            }
        }
    }

    const updateData: Prisma.UserUpdateInput = {
        name,
        username,
        role: roleId ? { connect: { id: roleId } } : { disconnect: true },
        branch: branchId ? { connect: { id: branchId } } : { disconnect: true },
        managedHQIds: managedHQIds ? JSON.stringify(managedHQIds) : undefined,
        isGlobalAdmin: isGlobalAdmin ?? undefined,
        phone: phone || null,
        maxDiscount: maxDiscount ?? 0.00,
        maxDiscountAmount: maxDiscountAmount ?? 0.00,
        salary: salary ?? 0.00
    }

    if (password && password.trim() !== '') {
        updateData.password = await bcrypt.hash(password, 10)
    }

    if (validatedData.hireDate) {
        updateData.hireDate = new Date(validatedData.hireDate);
    }

    // Sync roleStr
    let roleName = null;
    if (roleId) {
        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (role) {
            updateData.roleStr = role.name;
            roleName = role.name;
        }
    }

    await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
            where: { id },
            data: updateData
        })

        // --- Technician Automation on Update ---
        if (roleName) {
            const isTechnicianRole = roleName.toLowerCase().includes('technician') || roleName === 'فني';
            if (isTechnicianRole) {
                // Check if technician profile already exists
                const existingTech = await tx.technician.findUnique({ where: { userId: id } });
                if (!existingTech) {
                    // Create warehouse and technician profile
                    const effectiveBranchId = branchId || updatedUser.branchId || await ensureMainBranch();
                    const warehouse = await tx.warehouse.create({
                        data: {
                            name: `${name || updatedUser.name || updatedUser.username} Warehouse`,
                            branchId: effectiveBranchId,
                            isDefault: false,
                        }
                    });

                    await tx.technician.create({
                        data: {
                            userId: id,
                            name: name || updatedUser.name || updatedUser.username,
                            warehouseId: warehouse.id,
                            phone: phone || updatedUser.phone || null,
                        }
                    });
                } else if (name || phone || branchId) {
                    // Update existing technician name/phone if changed
                    await tx.technician.update({
                        where: { userId: id },
                        data: {
                            name: name || undefined,
                            phone: phone || undefined,
                        }
                    });
                }
            }
        }

        // --- Customer Linking (Explicit) ---
        if (phone && confirmLink) {
            // 1. Unlink anyone else from this customer phone first (sanity check)
            await tx.customer.updateMany({
                where: { phone },
                data: { linkedEmployeeId: id }
            });
        }
    });

    // Invalidate user sessions to force fresh login with new permissions/details
    await invalidateUserSessions(id);

    revalidatePath('/settings/users')
    return { success: true }
}, { permission: 'MANAGE_USERS', requireCSRF: false });

export const deleteUser = secureAction(async (data: { id: string }) => {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");

    const startTime = Date.now();
    const { id } = data;

    // Privilege Escalation Check
    await checkPrivilegeEscalation(session.user, undefined, id);

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
    const hasPermission = user.role === 'ADMIN' || user.role === 'مدير النظام' || user.role === 'المالك' || user.permissions?.includes('MANAGE_USERS') || user.permissions?.includes('*');

    if (!hasPermission) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('forbidden'));
    }

    const canViewSalary = user.role === 'ADMIN' || user.permissions?.includes('HR_VIEW_COMPENSATION');

    const users = await prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
            role: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
        }
    })

    return users.map((u: any) => ({
        ...u,
        maxDiscount: u.maxDiscount ? Number(u.maxDiscount) : 0,
        maxDiscountAmount: u.maxDiscountAmount ? Number(u.maxDiscountAmount) : 0,
        salary: u.salary ? Number(u.salary) : 0,
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
