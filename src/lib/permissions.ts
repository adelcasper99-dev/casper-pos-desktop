/**
 * Permission System - Backwards Compatible Export
 * 
 * This file maintains backwards compatibility while using the new
 * type-safe registry as the source of truth.
 * 
 * NEW CODE: Use registry directly from '@/lib/permissions/registry'
 * LEGACY CODE: Can continue using exports from this file
 */

// Export everything from new registry
export {
    PERMISSION_REGISTRY,
    PERMISSIONS,
    type Permission,
    type PermissionModule,
    getModulePermissions,
    getPermissionDisplayName,
    getPermissionModule,
    isValidPermission,
    getAllPermissions,
    getPermissionsByModule,
} from './permissions/registry';

// Re-export PERMISSIONS for backwards compatibility
import { PERMISSIONS, PERMISSION_REGISTRY } from './permissions/registry';

/**
 * Permission Groups for UI Display
 * Organized by feature module
 */
export const PERMISSION_GROUPS = {
    "Point of Sale": Object.values(PERMISSION_REGISTRY.POS),
    "Inventory": Object.values(PERMISSION_REGISTRY.INVENTORY),
    "Purchasing": Object.values(PERMISSION_REGISTRY.PURCHASING),
    "Warehouse": Object.values(PERMISSION_REGISTRY.WAREHOUSE),
    "Accounting": [PERMISSIONS.ACCOUNTING_VIEW],
    "Treasury": Object.values(PERMISSION_REGISTRY.TREASURY),
    "Expenses": [PERMISSIONS.EXPENSES_MANAGE],
    "Reports": Object.values(PERMISSION_REGISTRY.REPORTS),
    "Logistics": Object.values(PERMISSION_REGISTRY.LOGISTICS),
    "Tickets": Object.values(PERMISSION_REGISTRY.TICKET),
    "Customers": Object.values(PERMISSION_REGISTRY.CUSTOMER),
    "HR & Payroll": Object.values(PERMISSION_REGISTRY.HR),
    "Shift Management": Object.values(PERMISSION_REGISTRY.SHIFT),
    "Multi-HQ Mgmt": Object.values(PERMISSION_REGISTRY.HQ),
    "Administration": Object.values(PERMISSION_REGISTRY.ADMIN),
};

// System/Default roles that should be protected from deletion
export const SYSTEM_ROLES = [
    "Admin",
    "Branch Manager",
    "Cashier",
    "Technician",
    "Logistics",
    "Inventory Manager",
    "HR Manager",
    "Accountant"
] as const;

// Permission dependencies - permissions that require other permissions
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
    // Edit/Manage requires View
    [PERMISSIONS.TICKET_EDIT]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.TICKET_DELETE]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.TICKET_COMPLETE]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.TICKET_ASSIGN]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.CUSTOMER_MANAGE]: [PERMISSIONS.CUSTOMER_VIEW],
    [PERMISSIONS.INVENTORY_MANAGE]: [PERMISSIONS.INVENTORY_VIEW],
    [PERMISSIONS.INVENTORY_ADJUST]: [PERMISSIONS.INVENTORY_VIEW],
    [PERMISSIONS.WAREHOUSE_MANAGE]: [PERMISSIONS.WAREHOUSE_VIEW],
    [PERMISSIONS.PURCHASING_MANAGE]: [PERMISSIONS.PURCHASING_VIEW],
    [PERMISSIONS.TREASURY_MANAGE]: [PERMISSIONS.TREASURY_VIEW],
    [PERMISSIONS.HR_MANAGE_ATTENDANCE]: [PERMISSIONS.HR_VIEW_ATTENDANCE],
    [PERMISSIONS.HR_MANAGE_PAYROLL]: [PERMISSIONS.HR_VIEW_PAYROLL],

    // Shift Management
    [PERMISSIONS.SHIFT_MANAGE]: [PERMISSIONS.SHIFT_VIEW],
    [PERMISSIONS.SHIFT_ADMIN]: [PERMISSIONS.SHIFT_VIEW],
    [PERMISSIONS.SHIFT_HANDOFF]: [PERMISSIONS.SHIFT_VIEW],
    [PERMISSIONS.SHIFT_ADJUST]: [PERMISSIONS.SHIFT_VIEW],

    // POS features require POS access
    [PERMISSIONS.POS_DISCOUNT]: [PERMISSIONS.POS_ACCESS],
    [PERMISSIONS.POS_REFUND]: [PERMISSIONS.POS_ACCESS],

    // HQ
    [PERMISSIONS.HQ_MANAGE]: [PERMISSIONS.HQ_VIEW],
};

// Types
export type PermissionKey = keyof typeof PERMISSIONS;

// Helper to check permission
// permissionsJSON is the string stored in DB
export function hasPermission(userPermissions: string[] | string | undefined | null, required: string): boolean {
    if (!userPermissions) return false;

    let perms: string[] = [];

    if (Array.isArray(userPermissions)) {
        perms = userPermissions;
    } else if (typeof userPermissions === 'string') {
        try {
            perms = JSON.parse(userPermissions);
        } catch (e) {
            return false;
        }
    }

    if (perms.includes('*')) return true;
    return perms.includes(required);
}
