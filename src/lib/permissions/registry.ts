/**
 * Permission Registry - Type-Safe Central Source of Truth
 * 
 * This registry provides:
 * 1. Hierarchical organization by feature module
 * 2. Compile-time type safety with const assertions
 * 3. Auto-complete in IDEs
 * 4. Single source of truth for all permissions
 * 5. Easy to maintain and extend
 * 
 * DO NOT modify this file without running:
 * - npm run validate:permissions
 * - npm run test:permissions
 * - npm run migrate:permissions (if needed)
 */

/**
 * Permission Registry Structure
 * Organized by feature module for better maintainability
 */
export const PERMISSION_REGISTRY = {
  /** Point of Sale */
  POS: {
    /** Access POS interface */
    ACCESS: 'POS_ACCESS',
    /** Apply custom discounts */
    DISCOUNT: 'POS_DISCOUNT',
    /** Process refunds */
    REFUND: 'POS_REFUND',
  },

  /** Inventory Management */
  INVENTORY: {
    /** View inventory and products */
    VIEW: 'INVENTORY_VIEW',
    /** Create and edit products */
    MANAGE: 'INVENTORY_MANAGE',
    /** Manual stock adjustments */
    ADJUST: 'INVENTORY_ADJUST',
    /** View Cost Price */
    VIEW_COST: 'INVENTORY_VIEW_COST',
    /** View Sell Price 1 */
    VIEW_PRICE_1: 'INVENTORY_VIEW_PRICE_1',
    /** View Sell Price 2 */
    VIEW_PRICE_2: 'INVENTORY_VIEW_PRICE_2',
    /** View Sell Price 3 */
    VIEW_PRICE_3: 'INVENTORY_VIEW_PRICE_3',
  },

  /** Purchasing */
  PURCHASING: {
    /** View purchase orders and invoices */
    VIEW: 'PURCHASING_VIEW',
    /** Create and manage purchase orders */
    MANAGE: 'PURCHASING_MANAGE',
  },

  /** Warehouse Operations */
  WAREHOUSE: {
    /** View warehouse inventory */
    VIEW: 'WAREHOUSE_VIEW',
    /** Manage transfers and operations */
    MANAGE: 'WAREHOUSE_MANAGE',
  },

  /** Accounting & Finance */
  ACCOUNTING: {
    /** View accounting records and reports */
    VIEW: 'ACCOUNTING_VIEW',
  },

  /** Treasury & Cash Management */
  TREASURY: {
    /** View treasury transactions */
    VIEW: 'TREASURY_VIEW',
    /** Add and edit treasury transactions */
    MANAGE: 'TREASURY_MANAGE',
  },

  /** Expense Management */
  EXPENSES: {
    /** Manage expense records */
    MANAGE: 'EXPENSES_MANAGE',
  },

  /** Reports & Analytics */
  REPORTS: {
    /** Access reports and analytics (Basic) */
    VIEW: 'REPORTS_VIEW',
    /** View all branch reports (Admin/Manager) */
    VIEW_ALL: 'REPORTS_VIEW_ALL',
  },

  /** Logistics */
  LOGISTICS: {
    /** Create logistics requests */
    CREATE: 'LOGISTICS_CREATE',
    /** Receive and process logistics */
    RECEIVE: 'LOGISTICS_RECEIVE',
  },

  /** Ticket Management */
  TICKET: {
    /** View assigned repair tickets */
    VIEW: 'TICKET_VIEW',
    /** View all tickets (Admin/Manager) */
    VIEW_ALL: 'TICKET_VIEW_ALL',
    /** Create new tickets */
    CREATE: 'TICKET_CREATE',
    /** Assign tickets to technicians */
    ASSIGN: 'TICKET_ASSIGN',
    /** Edit ticket details */
    EDIT: 'TICKET_EDIT',
    /** Delete tickets */
    DELETE: 'TICKET_DELETE',
    /** Mark tickets as complete */
    COMPLETE: 'TICKET_COMPLETE',
    /** Process ticket payments */
    PAY: 'TICKET_PAY',
  },

  /** Customer Management */
  CUSTOMER: {
    /** View customer data */
    VIEW: 'CUSTOMER_VIEW',
    /** View all customers (if scoped) */
    VIEW_ALL: 'CUSTOMER_VIEW_ALL',
    /** Create and edit customers */
    MANAGE: 'CUSTOMER_MANAGE',
  },

  /** HR & Attendance */
  HR: {
    /** View attendance records */
    VIEW_ATTENDANCE: 'HR_VIEW_ATTENDANCE',
    /** Clock in/out and edit attendance */
    MANAGE_ATTENDANCE: 'HR_MANAGE_ATTENDANCE',
    /** View payroll data */
    VIEW_PAYROLL: 'HR_VIEW_PAYROLL',
    /** Calculate and process payroll */
    MANAGE_PAYROLL: 'HR_MANAGE_PAYROLL',
    /** View salary and compensation */
    VIEW_COMPENSATION: 'HR_VIEW_COMPENSATION',
    /** Approve or reject leave requests */
    APPROVE_LEAVES: 'HR_APPROVE_LEAVES',
    /** Manage leave policies and history */
    MANAGE_LEAVES: 'HR_MANAGE_LEAVES',
    /** Create and assign HR shifts (work schedules) */
    MANAGE_SHIFTS: 'HR_MANAGE_SHIFTS',
    /** Manage schedule templates and assignments */
    MANAGE_SCHEDULE: 'HR_MANAGE_SCHEDULE',
  },

  /** Multi-HQ Management */
  HQ: {
    /** View HQ dashboard and reports */
    VIEW: 'HQ_VIEW',
    /** Full HQ management - branches, treasury, approvals */
    MANAGE: 'HQ_MANAGE',
  },

  /** Engineer Management */
  ENGINEER: {
    /** View engineer list and stats */
    VIEW: 'ENGINEER_VIEW',
    /** Create, edit, delete engineers */
    MANAGE: 'ENGINEER_MANAGE',
  },

  /** Shift Management (POS Operational Shifts) */
  SHIFT: {
    /** View own shift details */
    VIEW: 'SHIFT_VIEW',
    /** View all shifts (Manager) */
    VIEW_ALL: 'SHIFT_VIEW_ALL',
    /** Open and close shifts */
    MANAGE: 'SHIFT_MANAGE',
    /** Force close orphaned shifts, view all shifts */
    ADMIN: 'SHIFT_ADMIN',
    /** Transfer shift ownership between users */
    HANDOFF: 'SHIFT_HANDOFF',
    /** Create adjustment entries for closed shifts */
    ADJUST: 'SHIFT_ADJUST',
  },

  /** Backup & Recovery */
  BACKUP: {
    /** View backup history and status */
    VIEW: 'BACKUP_VIEW',
    /** Create manual backups */
    CREATE: 'BACKUP_CREATE',
    /** Restore from backups (CRITICAL) */
    RESTORE: 'BACKUP_RESTORE',
    /** Manage Google Drive integration */
    MANAGE_DRIVE: 'BACKUP_MANAGE_DRIVE',
  },

  /** System Administration */
  ADMIN: {
    /** Manage users */
    MANAGE_USERS: 'MANAGE_USERS',
    /** Manage roles and permissions */
    MANAGE_ROLES: 'MANAGE_ROLES',
    /** Manage system settings */
    MANAGE_SETTINGS: 'MANAGE_SETTINGS',
  },
} as const;

/**
 * Utility: Flatten nested registry into flat permission list
 * Converts: { POS: { ACCESS: 'POS_ACCESS' } } 
 * To: { POS_ACCESS: 'POS_ACCESS' }
 */
function flattenRegistry() {
  return {
    // POS
    POS_ACCESS: PERMISSION_REGISTRY.POS.ACCESS,
    POS_DISCOUNT: PERMISSION_REGISTRY.POS.DISCOUNT,
    POS_REFUND: PERMISSION_REGISTRY.POS.REFUND,

    // INVENTORY
    INVENTORY_VIEW: PERMISSION_REGISTRY.INVENTORY.VIEW,
    INVENTORY_MANAGE: PERMISSION_REGISTRY.INVENTORY.MANAGE,
    INVENTORY_ADJUST: PERMISSION_REGISTRY.INVENTORY.ADJUST,
    INVENTORY_VIEW_COST: PERMISSION_REGISTRY.INVENTORY.VIEW_COST,
    INVENTORY_VIEW_PRICE_1: PERMISSION_REGISTRY.INVENTORY.VIEW_PRICE_1,
    INVENTORY_VIEW_PRICE_2: PERMISSION_REGISTRY.INVENTORY.VIEW_PRICE_2,
    INVENTORY_VIEW_PRICE_3: PERMISSION_REGISTRY.INVENTORY.VIEW_PRICE_3,

    // PURCHASING
    PURCHASING_VIEW: PERMISSION_REGISTRY.PURCHASING.VIEW,
    PURCHASING_MANAGE: PERMISSION_REGISTRY.PURCHASING.MANAGE,

    // WAREHOUSE
    WAREHOUSE_VIEW: PERMISSION_REGISTRY.WAREHOUSE.VIEW,
    WAREHOUSE_MANAGE: PERMISSION_REGISTRY.WAREHOUSE.MANAGE,

    // ACCOUNTING
    ACCOUNTING_VIEW: PERMISSION_REGISTRY.ACCOUNTING.VIEW,

    // TREASURY
    TREASURY_VIEW: PERMISSION_REGISTRY.TREASURY.VIEW,
    TREASURY_MANAGE: PERMISSION_REGISTRY.TREASURY.MANAGE,

    // EXPENSES
    EXPENSES_MANAGE: PERMISSION_REGISTRY.EXPENSES.MANAGE,

    // REPORTS
    REPORTS_VIEW: PERMISSION_REGISTRY.REPORTS.VIEW,
    REPORTS_VIEW_ALL: PERMISSION_REGISTRY.REPORTS.VIEW_ALL,

    // LOGISTICS
    LOGISTICS_CREATE: PERMISSION_REGISTRY.LOGISTICS.CREATE,
    LOGISTICS_RECEIVE: PERMISSION_REGISTRY.LOGISTICS.RECEIVE,

    // TICKET
    TICKET_VIEW: PERMISSION_REGISTRY.TICKET.VIEW,
    TICKET_VIEW_ALL: PERMISSION_REGISTRY.TICKET.VIEW_ALL,
    TICKET_CREATE: PERMISSION_REGISTRY.TICKET.CREATE,
    TICKET_ASSIGN: PERMISSION_REGISTRY.TICKET.ASSIGN,
    TICKET_EDIT: PERMISSION_REGISTRY.TICKET.EDIT,
    TICKET_DELETE: PERMISSION_REGISTRY.TICKET.DELETE,
    TICKET_COMPLETE: PERMISSION_REGISTRY.TICKET.COMPLETE,
    TICKET_PAY: PERMISSION_REGISTRY.TICKET.PAY,

    // CUSTOMER
    CUSTOMER_VIEW: PERMISSION_REGISTRY.CUSTOMER.VIEW,
    CUSTOMER_VIEW_ALL: PERMISSION_REGISTRY.CUSTOMER.VIEW_ALL,
    CUSTOMER_MANAGE: PERMISSION_REGISTRY.CUSTOMER.MANAGE,

    // HR
    HR_VIEW_ATTENDANCE: PERMISSION_REGISTRY.HR.VIEW_ATTENDANCE,
    HR_MANAGE_ATTENDANCE: PERMISSION_REGISTRY.HR.MANAGE_ATTENDANCE,
    HR_VIEW_PAYROLL: PERMISSION_REGISTRY.HR.VIEW_PAYROLL,
    HR_MANAGE_PAYROLL: PERMISSION_REGISTRY.HR.MANAGE_PAYROLL,
    HR_VIEW_COMPENSATION: PERMISSION_REGISTRY.HR.VIEW_COMPENSATION,
    HR_APPROVE_LEAVES: PERMISSION_REGISTRY.HR.APPROVE_LEAVES,
    HR_MANAGE_LEAVES: PERMISSION_REGISTRY.HR.MANAGE_LEAVES,
    HR_MANAGE_SHIFTS: PERMISSION_REGISTRY.HR.MANAGE_SHIFTS,
    HR_MANAGE_SCHEDULE: PERMISSION_REGISTRY.HR.MANAGE_SCHEDULE,

    // HQ
    HQ_VIEW: PERMISSION_REGISTRY.HQ.VIEW,
    HQ_MANAGE: PERMISSION_REGISTRY.HQ.MANAGE,

    // ENGINEER
    ENGINEER_VIEW: PERMISSION_REGISTRY.ENGINEER.VIEW,
    ENGINEER_MANAGE: PERMISSION_REGISTRY.ENGINEER.MANAGE,

    // SHIFT
    SHIFT_VIEW: PERMISSION_REGISTRY.SHIFT.VIEW,
    SHIFT_VIEW_ALL: PERMISSION_REGISTRY.SHIFT.VIEW_ALL,
    SHIFT_MANAGE: PERMISSION_REGISTRY.SHIFT.MANAGE,
    SHIFT_ADMIN: PERMISSION_REGISTRY.SHIFT.ADMIN,
    SHIFT_HANDOFF: PERMISSION_REGISTRY.SHIFT.HANDOFF,
    SHIFT_ADJUST: PERMISSION_REGISTRY.SHIFT.ADJUST,

    // BACKUP
    BACKUP_VIEW: PERMISSION_REGISTRY.BACKUP.VIEW,
    BACKUP_CREATE: PERMISSION_REGISTRY.BACKUP.CREATE,
    BACKUP_RESTORE: PERMISSION_REGISTRY.BACKUP.RESTORE,
    BACKUP_MANAGE_DRIVE: PERMISSION_REGISTRY.BACKUP.MANAGE_DRIVE,

    // ADMIN
    MANAGE_USERS: PERMISSION_REGISTRY.ADMIN.MANAGE_USERS,
    MANAGE_ROLES: PERMISSION_REGISTRY.ADMIN.MANAGE_ROLES,
    MANAGE_SETTINGS: PERMISSION_REGISTRY.ADMIN.MANAGE_SETTINGS,
  } as const;
}

/**
 * Flat permissions object for backwards compatibility
 * This is auto-generated from PERMISSION_REGISTRY
 */
export const PERMISSIONS = flattenRegistry();

/**
 * TypeScript type for all valid permissions
 * Provides compile-time validation
 */
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * TypeScript type for permission modules
 */
export type PermissionModule = keyof typeof PERMISSION_REGISTRY;

/**
 * Helper: Get all permissions for a module
 * @example getModulePermissions('POS') // ['POS_ACCESS', 'POS_DISCOUNT', 'POS_REFUND']
 */
export function getModulePermissions(module: PermissionModule): Permission[] {
  return Object.values(PERMISSION_REGISTRY[module]) as Permission[];
}

/**
 * Helper: Get permission display name
 * @example getPermissionDisplayName('POS_ACCESS') // 'Access POS interface'
 */
export function getPermissionDisplayName(permission: Permission): string {
  // Find the permission in registry and extract its JSDoc comment
  for (const [moduleName, module] of Object.entries(PERMISSION_REGISTRY)) {
    for (const [key, value] of Object.entries(module)) {
      if (value === permission) {
        // In production, this would parse JSDoc comments
        // For now, convert from SNAKE_CASE to readable format
        return key.split('_').map(word =>
          word.charAt(0) + word.slice(1).toLowerCase()
        ).join(' ');
      }
    }
  }
  return permission;
}

/**
 * Helper: Get permission module
 * @example getPermissionModule('POS_ACCESS') // 'POS'
 */
export function getPermissionModule(permission: Permission): PermissionModule | null {
  for (const [moduleName, module] of Object.entries(PERMISSION_REGISTRY)) {
    if (Object.values(module).includes(permission)) {
      return moduleName as PermissionModule;
    }
  }
  return null;
}

/**
 * Helper: Validate if a string is a valid permission
 * Useful for runtime validation of user input
 */
export function isValidPermission(value: string): value is Permission {
  return Object.values(PERMISSIONS).includes(value as Permission);
}

/**
 * Helper: Get all permissions as array
 */
export function getAllPermissions(): Permission[] {
  return Object.values(PERMISSIONS);
}

/**
 * Helper: Get permissions by module as object
 * @example getPermissionsByModule() // { POS: ['POS_ACCESS', ...], INVENTORY: [...] }
 */
export function getPermissionsByModule(): Record<PermissionModule, Permission[]> {
  const result = {} as Record<PermissionModule, Permission[]>;

  for (const moduleName of Object.keys(PERMISSION_REGISTRY)) {
    result[moduleName as PermissionModule] = getModulePermissions(moduleName as PermissionModule);
  }

  return result;
}
