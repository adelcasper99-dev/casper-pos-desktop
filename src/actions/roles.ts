"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PERMISSIONS } from "@/lib/permissions";
import { validatePermissions, resolvePermissionDependencies } from "@/lib/permission-validation";
import { invalidateRoleCache } from "@/lib/permission-cache";
import { invalidateUserSessions, getSession } from "@/lib/auth";

const DEFAULT_ROLES = [
    {
        name: "مدير النظام",
        permissions: Object.values(PERMISSIONS) // All permissions
    },
    {
        name: "المالك",
        permissions: ['*'] // Full ownership
    },
    {
        name: "مدير فرع",
        permissions: [
            // POS
            PERMISSIONS.POS_ACCESS,
            PERMISSIONS.POS_DISCOUNT,
            PERMISSIONS.POS_REFUND,
            // Inventory
            PERMISSIONS.INVENTORY_VIEW,
            PERMISSIONS.INVENTORY_MANAGE,
            PERMISSIONS.INVENTORY_ADJUST,
            PERMISSIONS.INVENTORY_VIEW_COST,
            PERMISSIONS.INVENTORY_VIEW_PRICE_1,
            PERMISSIONS.INVENTORY_VIEW_PRICE_2,
            PERMISSIONS.INVENTORY_VIEW_PRICE_3,
            // Warehouse
            PERMISSIONS.WAREHOUSE_VIEW,
            PERMISSIONS.WAREHOUSE_MANAGE,
            // Purchasing
            PERMISSIONS.PURCHASING_VIEW,
            // Accounting
            PERMISSIONS.ACCOUNTING_VIEW,
            PERMISSIONS.TREASURY_VIEW,
            PERMISSIONS.TREASURY_MANAGE,
            PERMISSIONS.EXPENSES_MANAGE,
            // Reports
            PERMISSIONS.REPORTS_VIEW,
            // Logistics
            PERMISSIONS.LOGISTICS_CREATE,
            PERMISSIONS.LOGISTICS_RECEIVE,
            // Tickets
            PERMISSIONS.TICKET_VIEW,
            PERMISSIONS.TICKET_CREATE,
            PERMISSIONS.TICKET_ASSIGN,
            PERMISSIONS.TICKET_EDIT,
            PERMISSIONS.TICKET_COMPLETE,
            // Customers
            PERMISSIONS.CUSTOMER_VIEW,
            PERMISSIONS.CUSTOMER_MANAGE,
            // HR
            PERMISSIONS.HR_VIEW_ATTENDANCE,
            PERMISSIONS.HR_MANAGE_ATTENDANCE,
            PERMISSIONS.HR_VIEW_PAYROLL,
            PERMISSIONS.HR_APPROVE_LEAVES,
            PERMISSIONS.HR_MANAGE_SHIFTS,
            // Admin
            PERMISSIONS.MANAGE_USERS,
            // Engineer
            PERMISSIONS.ENGINEER_VIEW,
            PERMISSIONS.ENGINEER_MANAGE
        ]
    },
    {
        name: "كاشير",
        permissions: [
            PERMISSIONS.POS_ACCESS,
            PERMISSIONS.POS_DISCOUNT,
            PERMISSIONS.TICKET_VIEW,
            PERMISSIONS.TICKET_CREATE,
            PERMISSIONS.CUSTOMER_VIEW,
            PERMISSIONS.CUSTOMER_MANAGE,
            // Inventory (Restricted)
            PERMISSIONS.INVENTORY_VIEW,
            PERMISSIONS.INVENTORY_VIEW_PRICE_2,
            PERMISSIONS.INVENTORY_VIEW_PRICE_3,
            // Shift Management
            PERMISSIONS.SHIFT_VIEW,
            PERMISSIONS.SHIFT_MANAGE
        ]
    },
    {
        name: "مساعد مبيعات",
        permissions: [
            PERMISSIONS.POS_ACCESS,
            PERMISSIONS.POS_DISCOUNT,
            PERMISSIONS.TICKET_VIEW,
            PERMISSIONS.CUSTOMER_VIEW,
            PERMISSIONS.SHIFT_VIEW
        ]
    },
    {
        name: "فني",
        permissions: [
            PERMISSIONS.INVENTORY_VIEW,
            PERMISSIONS.TICKET_VIEW,
            PERMISSIONS.TICKET_EDIT,
            PERMISSIONS.TICKET_COMPLETE,
            PERMISSIONS.CUSTOMER_VIEW,
            PERMISSIONS.HR_VIEW_ATTENDANCE,
            PERMISSIONS.HR_MANAGE_ATTENDANCE // Clock in/out
        ]
    },
    {
        name: "مسؤول توصيل",
        permissions: [
            PERMISSIONS.INVENTORY_VIEW,
            PERMISSIONS.WAREHOUSE_VIEW,
            PERMISSIONS.LOGISTICS_CREATE,
            PERMISSIONS.LOGISTICS_RECEIVE,
            PERMISSIONS.TICKET_VIEW
        ]
    },
    {
        name: "مدير مخازن",
        permissions: [
            PERMISSIONS.INVENTORY_VIEW,
            PERMISSIONS.INVENTORY_MANAGE,
            PERMISSIONS.INVENTORY_ADJUST,
            PERMISSIONS.INVENTORY_VIEW_COST,
            PERMISSIONS.INVENTORY_VIEW_PRICE_1,
            PERMISSIONS.INVENTORY_VIEW_PRICE_2,
            PERMISSIONS.INVENTORY_VIEW_PRICE_3,
            PERMISSIONS.WAREHOUSE_VIEW,
            PERMISSIONS.WAREHOUSE_MANAGE,
            PERMISSIONS.PURCHASING_VIEW,
            PERMISSIONS.PURCHASING_MANAGE,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.ENGINEER_VIEW,
            PERMISSIONS.ENGINEER_MANAGE
        ]
    },
    {
        name: "عامل مخازن",
        permissions: [
            PERMISSIONS.INVENTORY_VIEW,
            PERMISSIONS.WAREHOUSE_VIEW,
            PERMISSIONS.LOGISTICS_RECEIVE,
            PERMISSIONS.INVENTORY_ADJUST
        ]
    },
    {
        name: "مدير موارد بشرية",
        permissions: [
            PERMISSIONS.HR_VIEW_ATTENDANCE,
            PERMISSIONS.HR_MANAGE_ATTENDANCE,
            PERMISSIONS.HR_VIEW_PAYROLL,
            PERMISSIONS.HR_MANAGE_PAYROLL,
            PERMISSIONS.HR_APPROVE_LEAVES,
            PERMISSIONS.HR_MANAGE_SHIFTS,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.MANAGE_USERS // For HR purposes
        ]
    },
    {
        name: "محاسب",
        permissions: [
            PERMISSIONS.ACCOUNTING_VIEW,
            PERMISSIONS.TREASURY_VIEW,
            PERMISSIONS.TREASURY_MANAGE,
            PERMISSIONS.EXPENSES_MANAGE,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.HR_VIEW_PAYROLL,
            PERMISSIONS.PURCHASING_VIEW,
            PERMISSIONS.INVENTORY_VIEW,
            PERMISSIONS.INVENTORY_VIEW_COST,
            PERMISSIONS.INVENTORY_VIEW_PRICE_1,
            PERMISSIONS.INVENTORY_VIEW_PRICE_2,
            PERMISSIONS.INVENTORY_VIEW_PRICE_3,
            PERMISSIONS.ENGINEER_VIEW
        ]
    }
];

/**
 * Validates that the active user has sufficient privileges to create/modify/delete
 * a target role.
 */
async function checkRolePrivilegeEscalation(
    sessionUser: any,
    roleId?: string,
    newPermissions?: string[]
) {
    // 1. Admins and super-admins bypass all checks
    if (sessionUser.role === 'ADMIN' || sessionUser.permissions?.includes('*')) {
        return;
    }

    const forbiddenPerms = ['MANAGE_SETTINGS', 'MANAGE_ROLES'];

    // 2. Protect existing roles with sensitive permissions
    if (roleId) {
        const targetRole = await prisma.role.findUnique({ where: { id: roleId } });
        if (targetRole) {
            const targetRoleName = targetRole.name.toUpperCase();
            if (targetRoleName === 'ADMIN' || targetRoleName === 'ADMINISTRATOR' || targetRoleName === 'مدير النظام' || targetRoleName === 'المالك') {
                throw new Error("Forbidden: You cannot modify or delete system administrator roles.");
            }

            let existingPerms: string[] = [];
            try {
                existingPerms = JSON.parse(targetRole.permissions || '[]');
            } catch (e) {
                existingPerms = [];
            }

            if (forbiddenPerms.some(p => existingPerms.includes(p))) {
                throw new Error("Forbidden: You cannot modify roles that contain system configuration permissions.");
            }

            // Subset Check: Cannot modify roles with more or different privileges than your own
            const userPerms = sessionUser.permissions || [];
            if (!existingPerms.every(p => userPerms.includes(p))) {
                throw new Error("Forbidden: You cannot modify a role that has privileges that you do not possess.");
            }
        }
    }

    // 3. Prevent privilege escalation via new permissions
    if (newPermissions) {
        if (forbiddenPerms.some(p => newPermissions.includes(p))) {
            throw new Error("Forbidden: You cannot assign system configuration permissions (Settings/Roles) to roles.");
        }

        const userPerms = sessionUser.permissions || [];
        const missingPerms = newPermissions.filter(p => !userPerms.includes(p));

        if (missingPerms.length > 0) {
            throw new Error("Forbidden: You cannot create or update a role with more privileges than your own.");
        }
    }
}

async function ensureDefaultRoles() {
    // Migration: Rename old English system roles to the new Arabic ones
    const renameMap: Record<string, string> = {
        "Admin": "مدير النظام",
        "Administrator": "مدير النظام",
        "Branch Manager": "مدير فرع",
        "Cashier": "كاشير",
        "Technician": "فني",
        "Logistics": "مسؤول توصيل",
        "Inventory Manager": "مدير مخازن",
        "HR Manager": "مدير موارد بشرية",
        "Accountant": "محاسب"
    };

    for (const [oldName, newName] of Object.entries(renameMap)) {
        const oldRole = await prisma.role.findUnique({ where: { name: oldName } });
        if (oldRole) {
            console.log(`🔄 Migrating role: ${oldName} -> ${newName}`);
            // Check if new role already exists before renaming to avoid unique constraint error
            const newRoleExists = await prisma.role.findUnique({ where: { name: newName } });
            if (!newRoleExists) {
                await prisma.role.update({
                    where: { id: oldRole.id },
                    data: { name: newName }
                });
            } else {
                // If it already exists, we might want to consolidate users to the new role
                // For simplicity in this run, we'll just log it.
                console.log(`⚠️ Destination role ${newName} already exists. Consider manual user migration if users remain on ${oldName}.`);
            }
        }
    }

    // Now ensure all default roles exist
    for (const roleDef of DEFAULT_ROLES) {
        const existing = await prisma.role.findUnique({ where: { name: roleDef.name } });

        if (!existing) {
            console.log(`🆕 Creating default role: ${roleDef.name}`);
            await prisma.role.create({
                data: {
                    name: roleDef.name,
                    permissions: JSON.stringify(roleDef.permissions)
                }
            });
        }
    }
}

export async function getRoles() {
    try {
        await ensureDefaultRoles();
        const roles = await prisma.role.findMany({
            include: { _count: { select: { users: true } } }
        });
        return { success: true, data: roles };
    } catch (e) {
        console.error(e);
        return { success: false, message: "Failed to fetch roles" };
    }
}

export async function createRole(name: string, permissions: string[]) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        // Privilege Escalation Check
        await checkRolePrivilegeEscalation(session.user, undefined, permissions);

        // Auto-resolve dependencies
        const resolvedPermissions = resolvePermissionDependencies(permissions);

        // Validate permissions
        const validation = validatePermissions(resolvedPermissions);
        if (!validation.valid) {
            return {
                success: false,
                message: "Invalid permissions: " + validation.errors.join(', ')
            };
        }

        await prisma.role.create({
            data: {
                name,
                permissions: JSON.stringify(resolvedPermissions)
            }
        });
        revalidatePath("/settings");
        return { success: true };
    } catch (e: any) {
        console.error(e);
        return { success: false, message: e.message || "Failed to create role (Name must be unique)" };
    }
}

export async function updateRole(id: string, name: string, permissions: string[]) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        // Privilege Escalation Check
        await checkRolePrivilegeEscalation(session.user, id, permissions);

        // Auto-resolve dependencies
        const resolvedPermissions = resolvePermissionDependencies(permissions);

        // Validate permissions
        const validation = validatePermissions(resolvedPermissions);
        if (!validation.valid) {
            return {
                success: false,
                message: "Invalid permissions: " + validation.errors.join(', ')
            };
        }

        await prisma.role.update({
            where: { id },
            data: {
                name,
                permissions: JSON.stringify(resolvedPermissions)
            }
        });

        invalidateRoleCache(id);

        const usersWithRole = await prisma.user.findMany({
            where: { roleId: id },
            select: { id: true }
        });

        await Promise.all(usersWithRole.map(user => invalidateUserSessions(user.id)));

        revalidatePath("/settings");
        return { success: true };
    } catch (e: any) {
        console.error(e);
        return { success: false, message: e.message || "Failed to update role" };
    }
}

export async function deleteRole(id: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        // Privilege Escalation Check
        await checkRolePrivilegeEscalation(session.user, id);

        const count = await prisma.user.count({ where: { roleId: id } });
        if (count > 0) {
            return { success: false, message: `Cannot delete role: Assigned to ${count} users.` };
        }

        await prisma.role.delete({ where: { id } });
        revalidatePath("/settings");
        return { success: true };
    } catch (e: any) {
        console.error(e);
        return { success: false, message: e.message || "Failed to delete role" };
    }
}
