"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PERMISSIONS } from "@/lib/permissions";
import { validatePermissions, resolvePermissionDependencies } from "@/lib/permission-validation";
import { invalidateRoleCache } from "@/lib/permission-cache";
import { invalidateUserSessions } from "@/lib/auth";

const DEFAULT_ROLES = [
    {
        name: "Admin",
        permissions: Object.values(PERMISSIONS) // All permissions
    },
    {
        name: "Branch Manager",
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
        name: "Cashier",
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
        name: "Technician",
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
        name: "Logistics",
        permissions: [
            PERMISSIONS.INVENTORY_VIEW,
            PERMISSIONS.WAREHOUSE_VIEW,
            PERMISSIONS.LOGISTICS_CREATE,
            PERMISSIONS.LOGISTICS_RECEIVE,
            PERMISSIONS.TICKET_VIEW
        ]
    },
    {
        name: "Inventory Manager",
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
        name: "HR Manager",
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
        name: "Accountant",
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

async function ensureDefaultRoles() {
    for (const roleDef of DEFAULT_ROLES) {
        const existing = await prisma.role.findUnique({ where: { name: roleDef.name } });

        if (!existing) {
            // Only CREATE if role doesn't exist - never update existing roles
            console.log(`🆕 Creating default role: ${roleDef.name}`);
            await prisma.role.create({
                data: {
                    name: roleDef.name,
                    permissions: JSON.stringify(roleDef.permissions)
                }
            });
        } else {
            // Role exists - DO NOT update to preserve manual customizations
            // If you need to update default roles, do it via the UI or a migration script
            console.log(`✓ Role already exists: ${roleDef.name} (not updating to preserve customizations)`);
        }
    }
}

export async function getRoles() {
    try {
        await ensureDefaultRoles(); // Lazy seed
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
    } catch (e) {
        console.error(e);
        return { success: false, message: "Failed to create role (Name must be unique)" };
    }
}



export async function updateRole(id: string, name: string, permissions: string[]) {
    try {
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
        
        // Invalidate permission cache for all users with this role
        invalidateRoleCache(id);

        // Invalidate active sessions for all users with this role
        // This ensures they re-login and get fresh permissions immediately
        const usersWithRole = await prisma.user.findMany({
            where: { roleId: id },
            select: { id: true }
        });

        // Process invalidations in parallel but don't block response too long if many users
        // Use Promise.all with a map
        await Promise.all(usersWithRole.map(user => invalidateUserSessions(user.id)));
        
        revalidatePath("/settings");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { success: false, message: "Failed to update role" };
    }
}

export async function deleteRole(id: string) {
    try {
        // Prevent deleting if users assigned?
        // Check first
        const count = await prisma.user.count({ where: { roleId: id } });
        if (count > 0) {
            return { success: false, message: `Cannot delete role: Assigned to ${count} users.` };
        }

        await prisma.role.delete({ where: { id } });
        revalidatePath("/settings");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { success: false, message: "Failed to delete role" };
    }
}
