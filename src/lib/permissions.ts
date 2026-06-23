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
    "Dashboard": Object.values(PERMISSION_REGISTRY.DASHBOARD),
    "Point of Sale": Object.values(PERMISSION_REGISTRY.POS),
    "Inventory": Object.values(PERMISSION_REGISTRY.INVENTORY),
    "Suppliers": Object.values(PERMISSION_REGISTRY.SUPPLIER),
    "Purchasing": Object.values(PERMISSION_REGISTRY.PURCHASING),
    "Warehouse": Object.values(PERMISSION_REGISTRY.WAREHOUSE),
    "Accounting": Object.values(PERMISSION_REGISTRY.ACCOUNTING),
    "Partners & Equity": Object.values(PERMISSION_REGISTRY.PARTNERS),
    "Treasury": Object.values(PERMISSION_REGISTRY.TREASURY),
    "Expenses": Object.values(PERMISSION_REGISTRY.EXPENSES),
    "Reports": Object.values(PERMISSION_REGISTRY.REPORTS),
    "System Logs": Object.values(PERMISSION_REGISTRY.LOGS),
    "Logistics": Object.values(PERMISSION_REGISTRY.LOGISTICS),
    "Tickets": Object.values(PERMISSION_REGISTRY.TICKET),
    "Customers": Object.values(PERMISSION_REGISTRY.CUSTOMER),
    "HR & Payroll": Object.values(PERMISSION_REGISTRY.HR),
    "Shift Management": Object.values(PERMISSION_REGISTRY.SHIFT),
    "Multi-HQ Mgmt": Object.values(PERMISSION_REGISTRY.HQ),
    "Branch Management": Object.values(PERMISSION_REGISTRY.BRANCH),
    "Engineers": Object.values(PERMISSION_REGISTRY.ENGINEER),
    "Administration": Object.values(PERMISSION_REGISTRY.ADMIN),
    "Backups": Object.values(PERMISSION_REGISTRY.BACKUP),
};

// System/Default roles that should be protected from deletion
export const SYSTEM_ROLES = [
    "مدير النظام",
    "مدير فرع",
    "كاشير",
    "فني",
    "مسؤول توصيل",
    "مدير مخازن",
    "مدير موارد بشرية",
    "محاسب",
    "المالك",
    "مساعد مبيعات",
    "عامل مخازن"
] as const;

// Permission dependencies - permissions that require other permissions
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
    // Edit/Manage requires View
    [PERMISSIONS.TICKET_EDIT]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.TICKET_DELETE]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.TICKET_COMPLETE]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.TICKET_ASSIGN]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.TICKET_WORKFLOW]: [PERMISSIONS.TICKET_VIEW],
    [PERMISSIONS.CUSTOMER_MANAGE]: [PERMISSIONS.CUSTOMER_VIEW],
    [PERMISSIONS.CUSTOMER_DELETE]: [PERMISSIONS.CUSTOMER_VIEW],
    [PERMISSIONS.INVENTORY_MANAGE]: [PERMISSIONS.INVENTORY_VIEW],
    [PERMISSIONS.INVENTORY_DELETE]: [PERMISSIONS.INVENTORY_VIEW],
    [PERMISSIONS.INVENTORY_ADJUST]: [PERMISSIONS.INVENTORY_VIEW],
    [PERMISSIONS.INVENTORY_MANAGE_CATEGORIES]: [PERMISSIONS.INVENTORY_VIEW],
    [PERMISSIONS.SUPPLIER_MANAGE]: [PERMISSIONS.SUPPLIER_VIEW],
    [PERMISSIONS.SUPPLIER_VIEW_LEDGER]: [PERMISSIONS.SUPPLIER_VIEW],
    [PERMISSIONS.WAREHOUSE_MANAGE]: [PERMISSIONS.WAREHOUSE_VIEW],
    [PERMISSIONS.WAREHOUSE_TRANSFER]: [PERMISSIONS.WAREHOUSE_VIEW],
    [PERMISSIONS.PURCHASING_MANAGE]: [PERMISSIONS.PURCHASING_VIEW],
    [PERMISSIONS.PURCHASING_APPROVE]: [PERMISSIONS.PURCHASING_VIEW],
    [PERMISSIONS.TREASURY_MANAGE]: [PERMISSIONS.TREASURY_VIEW],
    [PERMISSIONS.TREASURY_DELETE]: [PERMISSIONS.TREASURY_VIEW],
    [PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE]: [PERMISSIONS.TREASURY_VIEW],
    [PERMISSIONS.ACCOUNTING_MANAGE]: [PERMISSIONS.ACCOUNTING_VIEW],
    [PERMISSIONS.ACCOUNTING_RECONCILE]: [PERMISSIONS.ACCOUNTING_VIEW],

    // Partners
    [PERMISSIONS.PARTNERS_MANAGE]: [PERMISSIONS.PARTNERS_VIEW],
    [PERMISSIONS.PARTNERS_TRANSACTIONS]: [PERMISSIONS.PARTNERS_VIEW],
    [PERMISSIONS.PARTNERS_DISTRIBUTE]: [PERMISSIONS.PARTNERS_MANAGE],
    [PERMISSIONS.EXPENSES_MANAGE]: [PERMISSIONS.EXPENSES_VIEW],
    [PERMISSIONS.EXPENSES_DELETE]: [PERMISSIONS.EXPENSES_VIEW],
    [PERMISSIONS.BRANCH_MANAGE]: [PERMISSIONS.BRANCH_VIEW],
    [PERMISSIONS.HR_MANAGE_ATTENDANCE]: [PERMISSIONS.HR_VIEW_ATTENDANCE],
    [PERMISSIONS.HR_MANAGE_PAYROLL]: [PERMISSIONS.HR_VIEW_PAYROLL],
    [PERMISSIONS.HR_MANAGE_SHIFTS]: [PERMISSIONS.HR_VIEW_ATTENDANCE],
    [PERMISSIONS.HR_MANAGE_EMPLOYEES]: [PERMISSIONS.HR_VIEW_ATTENDANCE],

    // Shift Management
    [PERMISSIONS.SHIFT_MANAGE]: [PERMISSIONS.SHIFT_VIEW],
    [PERMISSIONS.SHIFT_ADMIN]: [PERMISSIONS.SHIFT_VIEW],
    [PERMISSIONS.SHIFT_HANDOFF]: [PERMISSIONS.SHIFT_VIEW],
    [PERMISSIONS.SHIFT_ADJUST]: [PERMISSIONS.SHIFT_VIEW],

    // POS features require POS access
    [PERMISSIONS.POS_DISCOUNT]: [PERMISSIONS.POS_ACCESS],
    [PERMISSIONS.POS_REFUND]: [PERMISSIONS.POS_ACCESS],
    [PERMISSIONS.POS_CHECKOUT]: [PERMISSIONS.POS_ACCESS],
    [PERMISSIONS.POS_HOLD_CART]: [PERMISSIONS.POS_ACCESS],
    [PERMISSIONS.POS_DINE_IN]: [PERMISSIONS.POS_ACCESS],
    [PERMISSIONS.POS_PRINT_RECEIPT]: [PERMISSIONS.POS_ACCESS],
    [PERMISSIONS.POS_CHANGE_PRICE]: [PERMISSIONS.POS_ACCESS],

    // HQ
    [PERMISSIONS.HQ_MANAGE]: [PERMISSIONS.HQ_VIEW],

    // ADMIN
    [PERMISSIONS.MANAGE_USERS]: [PERMISSIONS.MANAGE_SETTINGS],
    [PERMISSIONS.MANAGE_ROLES]: [PERMISSIONS.MANAGE_SETTINGS],
    [PERMISSIONS.MANAGE_PRINTERS]: [PERMISSIONS.MANAGE_SETTINGS],
    [PERMISSIONS.MANAGE_BACKUPS]: [PERMISSIONS.MANAGE_SETTINGS],
    [PERMISSIONS.MANAGE_WAREHOUSES]: [PERMISSIONS.MANAGE_SETTINGS],
    [PERMISSIONS.MANAGE_TABLES]: [PERMISSIONS.MANAGE_SETTINGS],
    [PERMISSIONS.MANAGE_MODULES]: [PERMISSIONS.MANAGE_SETTINGS],
    [PERMISSIONS.MANAGE_ACCOUNTING_SETUP]: [PERMISSIONS.MANAGE_SETTINGS],

    // Backup
    [PERMISSIONS.BACKUP_CREATE]: [PERMISSIONS.BACKUP_VIEW],
    [PERMISSIONS.BACKUP_RESTORE]: [PERMISSIONS.BACKUP_VIEW],
    [PERMISSIONS.BACKUP_MANAGE_DRIVE]: [PERMISSIONS.BACKUP_VIEW],
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
        // Handle plain '*' wildcard string directly
        if (userPermissions === '*') return true;

        try {
            perms = JSON.parse(userPermissions);
        } catch (e) {
            // If not JSON, check if it's the specific required permission string
            return userPermissions === required;
        }
    }

    if (perms.includes('*')) return true;
    return perms.includes(required);
}
