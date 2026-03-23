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
  /** Dashboard */
  DASHBOARD: {
    /** View main dashboard */
    VIEW: 'DASHBOARD_VIEW',
  },

  /** Activity Logs */
  LOGS: {
    /** View system activity logs */
    VIEW: 'LOGS_VIEW',
  },

  /** Point of Sale */
  POS: {
    /** Access POS interface */
    ACCESS: 'POS_ACCESS',
    /** Apply custom discounts */
    DISCOUNT: 'POS_DISCOUNT',
    /** Process refunds */
    REFUND: 'POS_REFUND',
    /** Process payments & checkout */
    CHECKOUT: 'POS_CHECKOUT',
    /** Hold and resume carts */
    HOLD_CART: 'POS_HOLD_CART',
    /** Manage dine-in tables */
    DINE_IN: 'POS_DINE_IN',
    /** Print and speed print receipts */
    PRINT_RECEIPT: 'POS_PRINT_RECEIPT',
    /** Override default product prices */
    CHANGE_PRICE: 'POS_CHANGE_PRICE',
    /** Select between different price tiers (Wholesale/Retail) */
    SELECT_PRICE_TIER: 'POS_SELECT_PRICE_TIER',
  },

  /** Inventory Management */
  INVENTORY: {
    /** View inventory and products */
    VIEW: 'INVENTORY_VIEW',
    /** Create and edit products */
    MANAGE: 'INVENTORY_MANAGE',
    /** Delete products */
    DELETE: 'INVENTORY_DELETE',
    /** Create and edit categories */
    MANAGE_CATEGORIES: 'INVENTORY_MANAGE_CATEGORIES',
    /** Manual stock adjustments */
    ADJUST: 'INVENTORY_ADJUST',
    /** Bulk import and export operations */
    IMPORT_EXPORT: 'INVENTORY_IMPORT_EXPORT',
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
    /** Approve purchase operations */
    APPROVE: 'PURCHASING_APPROVE',
  },

  /** Warehouse Operations */
  WAREHOUSE: {
    /** View warehouse inventory */
    VIEW: 'WAREHOUSE_VIEW',
    /** Manage transfers and operations */
    MANAGE: 'WAREHOUSE_MANAGE',
    /** Move stock between different locations */
    TRANSFER: 'WAREHOUSE_TRANSFER',
  },

  /** Accounting & Finance */
  ACCOUNTING: {
    /** View accounting records and reports */
    VIEW: 'ACCOUNTING_VIEW',
    /** Edit journal entries and GL accounts */
    MANAGE: 'ACCOUNTING_MANAGE',
    /** Perform bank and cash reconciliation */
    RECONCILE: 'ACCOUNTING_RECONCILE',
  },

  /** Treasury & Cash Management */
  TREASURY: {
    /** View treasury transactions */
    VIEW: 'TREASURY_VIEW',
    /** Add and edit treasury transactions */
    MANAGE: 'TREASURY_MANAGE',
    /** Delete treasury records */
    DELETE: 'TREASURY_DELETE',
    /** Allow disbursing into negative balance */
    ALLOW_NEGATIVE_BALANCE: 'TREASURY_ALLOW_NEGATIVE_BALANCE',
  },

  /** Expense Management */
  EXPENSES: {
    /** View expense records */
    VIEW: 'EXPENSES_VIEW',
    /** Manage expense records */
    MANAGE: 'EXPENSES_MANAGE',
    /** Delete expense records */
    DELETE: 'EXPENSES_DELETE',
  },

  /** Branch Management */
  BRANCH: {
    /** View branch information */
    VIEW: 'BRANCH_VIEW',
    /** Create and edit branches */
    MANAGE: 'BRANCH_MANAGE',
  },

  /** Reports & Analytics */
  REPORTS: {
    /** Access reports and analytics (Basic) */
    VIEW: 'REPORTS_VIEW',
    /** View all branch reports (Admin/Manager) */
    VIEW_ALL: 'REPORTS_VIEW_ALL',
    /** Export reports to PDF/Excel */
    EXPORT: 'REPORTS_EXPORT',
  },

  /** Logistics */
  LOGISTICS: {
    /** Create logistics requests */
    CREATE: 'LOGISTICS_CREATE',
    /** Receive and process logistics */
    RECEIVE: 'LOGISTICS_RECEIVE',
    /** Manage vehicles and logistics resources */
    MANAGE: 'LOGISTICS_MANAGE',
  },

  /** Suppliers */
  SUPPLIER: {
    /** View suppliers list */
    VIEW: 'SUPPLIER_VIEW',
    /** Add, edit, and delete suppliers */
    MANAGE: 'SUPPLIER_MANAGE',
    /** View supplier financial ledger */
    VIEW_LEDGER: 'SUPPLIER_VIEW_LEDGER',
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
    /** Manage workflow and view performance reports */
    WORKFLOW: 'TICKET_WORKFLOW',
    /** Override restricted actions */
    OVERRIDE: 'TICKET_OVERRIDE',
  },

  /** Customer Management */
  CUSTOMER: {
    /** View customer data */
    VIEW: 'CUSTOMER_VIEW',
    /** View all customers (if scoped) */
    VIEW_ALL: 'CUSTOMER_VIEW_ALL',
    /** Create and edit customers */
    MANAGE: 'CUSTOMER_MANAGE',
    /** Delete customer records */
    DELETE: 'CUSTOMER_DELETE',
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
    /** Manage employee files and profiles */
    MANAGE_EMPLOYEES: 'HR_MANAGE_EMPLOYEES',
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
    /** Manage system settings (General) */
    MANAGE_SETTINGS: 'MANAGE_SETTINGS',
    /** Manage printer settings */
    MANAGE_PRINTERS: 'MANAGE_PRINTERS',
    /** Manage backup settings */
    MANAGE_BACKUPS: 'MANAGE_BACKUPS',
    /** Manage warehouse settings */
    MANAGE_WAREHOUSES: 'MANAGE_WAREHOUSES',
    /** Manage table and floor settings */
    MANAGE_TABLES: 'MANAGE_TABLES',
    /** Manage module toggles */
    MANAGE_MODULES: 'MANAGE_MODULES',
    /** Manage accounting setup/wizard */
    MANAGE_ACCOUNTING_SETUP: 'MANAGE_ACCOUNTING_SETUP',
  },
} as const;

/**
 * Utility: Flatten nested registry into flat permission list
 * Converts: { POS: { ACCESS: 'POS_ACCESS' } } 
 * To: { POS_ACCESS: 'POS_ACCESS' }
 */
function flattenRegistry() {
  return {
    // DASHBOARD
    DASHBOARD_VIEW: PERMISSION_REGISTRY.DASHBOARD.VIEW,

    // LOGS
    LOGS_VIEW: PERMISSION_REGISTRY.LOGS.VIEW,

    // POS
    POS_ACCESS: PERMISSION_REGISTRY.POS.ACCESS,
    POS_DISCOUNT: PERMISSION_REGISTRY.POS.DISCOUNT,
    POS_REFUND: PERMISSION_REGISTRY.POS.REFUND,
    POS_CHECKOUT: PERMISSION_REGISTRY.POS.CHECKOUT,
    POS_HOLD_CART: PERMISSION_REGISTRY.POS.HOLD_CART,
    POS_DINE_IN: PERMISSION_REGISTRY.POS.DINE_IN,
    POS_PRINT_RECEIPT: PERMISSION_REGISTRY.POS.PRINT_RECEIPT,
    POS_CHANGE_PRICE: PERMISSION_REGISTRY.POS.CHANGE_PRICE,
    POS_SELECT_PRICE_TIER: PERMISSION_REGISTRY.POS.SELECT_PRICE_TIER,

    // INVENTORY
    INVENTORY_VIEW: PERMISSION_REGISTRY.INVENTORY.VIEW,
    INVENTORY_MANAGE: PERMISSION_REGISTRY.INVENTORY.MANAGE,
    INVENTORY_DELETE: PERMISSION_REGISTRY.INVENTORY.DELETE,
    INVENTORY_MANAGE_CATEGORIES: PERMISSION_REGISTRY.INVENTORY.MANAGE_CATEGORIES,
    INVENTORY_ADJUST: PERMISSION_REGISTRY.INVENTORY.ADJUST,
    INVENTORY_IMPORT_EXPORT: PERMISSION_REGISTRY.INVENTORY.IMPORT_EXPORT,
    INVENTORY_VIEW_COST: PERMISSION_REGISTRY.INVENTORY.VIEW_COST,
    INVENTORY_VIEW_PRICE_1: PERMISSION_REGISTRY.INVENTORY.VIEW_PRICE_1,
    INVENTORY_VIEW_PRICE_2: PERMISSION_REGISTRY.INVENTORY.VIEW_PRICE_2,
    INVENTORY_VIEW_PRICE_3: PERMISSION_REGISTRY.INVENTORY.VIEW_PRICE_3,

    // PURCHASING
    PURCHASING_VIEW: PERMISSION_REGISTRY.PURCHASING.VIEW,
    PURCHASING_MANAGE: PERMISSION_REGISTRY.PURCHASING.MANAGE,
    PURCHASING_APPROVE: PERMISSION_REGISTRY.PURCHASING.APPROVE,

    // WAREHOUSE
    WAREHOUSE_VIEW: PERMISSION_REGISTRY.WAREHOUSE.VIEW,
    WAREHOUSE_MANAGE: PERMISSION_REGISTRY.WAREHOUSE.MANAGE,
    WAREHOUSE_TRANSFER: PERMISSION_REGISTRY.WAREHOUSE.TRANSFER,

    // ACCOUNTING
    ACCOUNTING_VIEW: PERMISSION_REGISTRY.ACCOUNTING.VIEW,
    ACCOUNTING_MANAGE: PERMISSION_REGISTRY.ACCOUNTING.MANAGE,
    ACCOUNTING_RECONCILE: PERMISSION_REGISTRY.ACCOUNTING.RECONCILE,

    // TREASURY
    TREASURY_VIEW: PERMISSION_REGISTRY.TREASURY.VIEW,
    TREASURY_MANAGE: PERMISSION_REGISTRY.TREASURY.MANAGE,
    TREASURY_DELETE: PERMISSION_REGISTRY.TREASURY.DELETE,
    TREASURY_ALLOW_NEGATIVE_BALANCE: PERMISSION_REGISTRY.TREASURY.ALLOW_NEGATIVE_BALANCE,

    // EXPENSES
    EXPENSES_VIEW: PERMISSION_REGISTRY.EXPENSES.VIEW,
    EXPENSES_MANAGE: PERMISSION_REGISTRY.EXPENSES.MANAGE,
    EXPENSES_DELETE: PERMISSION_REGISTRY.EXPENSES.DELETE,

    // BRANCH
    BRANCH_VIEW: PERMISSION_REGISTRY.BRANCH.VIEW,
    BRANCH_MANAGE: PERMISSION_REGISTRY.BRANCH.MANAGE,

    // REPORTS
    REPORTS_VIEW: PERMISSION_REGISTRY.REPORTS.VIEW,
    REPORTS_VIEW_ALL: PERMISSION_REGISTRY.REPORTS.VIEW_ALL,
    REPORTS_EXPORT: PERMISSION_REGISTRY.REPORTS.EXPORT,

    // LOGISTICS
    LOGISTICS_CREATE: PERMISSION_REGISTRY.LOGISTICS.CREATE,
    LOGISTICS_RECEIVE: PERMISSION_REGISTRY.LOGISTICS.RECEIVE,
    LOGISTICS_MANAGE: PERMISSION_REGISTRY.LOGISTICS.MANAGE,

    // SUPPLIER
    SUPPLIER_VIEW: PERMISSION_REGISTRY.SUPPLIER.VIEW,
    SUPPLIER_MANAGE: PERMISSION_REGISTRY.SUPPLIER.MANAGE,
    SUPPLIER_VIEW_LEDGER: PERMISSION_REGISTRY.SUPPLIER.VIEW_LEDGER,

    // TICKET
    TICKET_VIEW: PERMISSION_REGISTRY.TICKET.VIEW,
    TICKET_VIEW_ALL: PERMISSION_REGISTRY.TICKET.VIEW_ALL,
    TICKET_CREATE: PERMISSION_REGISTRY.TICKET.CREATE,
    TICKET_ASSIGN: PERMISSION_REGISTRY.TICKET.ASSIGN,
    TICKET_EDIT: PERMISSION_REGISTRY.TICKET.EDIT,
    TICKET_DELETE: PERMISSION_REGISTRY.TICKET.DELETE,
    TICKET_COMPLETE: PERMISSION_REGISTRY.TICKET.COMPLETE,
    TICKET_PAY: PERMISSION_REGISTRY.TICKET.PAY,
    TICKET_WORKFLOW: PERMISSION_REGISTRY.TICKET.WORKFLOW,
    TICKET_OVERRIDE: PERMISSION_REGISTRY.TICKET.OVERRIDE,

    // CUSTOMER
    CUSTOMER_VIEW: PERMISSION_REGISTRY.CUSTOMER.VIEW,
    CUSTOMER_VIEW_ALL: PERMISSION_REGISTRY.CUSTOMER.VIEW_ALL,
    CUSTOMER_MANAGE: PERMISSION_REGISTRY.CUSTOMER.MANAGE,
    CUSTOMER_DELETE: PERMISSION_REGISTRY.CUSTOMER.DELETE,

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
    HR_MANAGE_EMPLOYEES: PERMISSION_REGISTRY.HR.MANAGE_EMPLOYEES,

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
    MANAGE_PRINTERS: PERMISSION_REGISTRY.ADMIN.MANAGE_PRINTERS,
    MANAGE_BACKUPS: PERMISSION_REGISTRY.ADMIN.MANAGE_BACKUPS,
    MANAGE_WAREHOUSES: PERMISSION_REGISTRY.ADMIN.MANAGE_WAREHOUSES,
    MANAGE_TABLES: PERMISSION_REGISTRY.ADMIN.MANAGE_TABLES,
    MANAGE_MODULES: PERMISSION_REGISTRY.ADMIN.MANAGE_MODULES,
    MANAGE_ACCOUNTING_SETUP: PERMISSION_REGISTRY.ADMIN.MANAGE_ACCOUNTING_SETUP,
  } as const;
}

/**
 * Arabic Localization for Permissions
 */
const PERMISSION_LABELS_AR: Record<string, string> = {
  // ... (previous entries remain same)
  DASHBOARD_VIEW: 'عرض لوحة القيادة',
  LOGS_VIEW: 'عرض سجلات النظام',
  POS_ACCESS: 'دخول واجهة البيع',
  POS_DISCOUNT: 'تطبيق خصومات إضافية',
  POS_REFUND: 'عمليات المرتجع',
  POS_CHECKOUT: 'إتمام الدفع والمبيعات',
  POS_HOLD_CART: 'تعليق واستعادة السلات',
  POS_DINE_IN: 'إدارة الطاولات (Dine-in)',
  POS_PRINT_RECEIPT: 'طباعة الفواتير',
  POS_CHANGE_PRICE: 'تعديل أسعار المنتجات يدوياً',
  POS_SELECT_PRICE_TIER: 'تغيير مستوى السعر في POS (جملة/قطاعي)',
  INVENTORY_VIEW: 'عرض المخزون والمنتجات',
  INVENTORY_MANAGE: 'إدارة المنتجات (إضافة/تعديل)',
  INVENTORY_DELETE: 'حذف المنتجات',
  INVENTORY_MANAGE_CATEGORIES: 'إدارة أقسام المنتجات',
  INVENTORY_ADJUST: 'تسوية المخزون يدوياً',
  INVENTORY_IMPORT_EXPORT: 'استيراد وتصدير البيانات',
  INVENTORY_VIEW_COST: 'عرض أسعار التكلفة',
  INVENTORY_VIEW_PRICE_1: 'عرض سعر البيع 1',
  INVENTORY_VIEW_PRICE_2: 'عرض سعر البيع 2',
  INVENTORY_VIEW_PRICE_3: 'عرض سعر البيع 3',
  PURCHASING_VIEW: 'عرض فواتير المشتريات',
  PURCHASING_MANAGE: 'إنشاء وإدارة فواتير الشراء',
  PURCHASING_APPROVE: 'اعتماد عمليات الشراء',
  WAREHOUSE_VIEW: 'عرض مخزون المستودعات',
  WAREHOUSE_MANAGE: 'إدارة المستودعات والتحويلات',
  WAREHOUSE_TRANSFER: 'تحويل المخزون بين المواقع',
  ACCOUNTING_VIEW: 'عرض القيود والتقارير المحاسبية',
  ACCOUNTING_MANAGE: 'إدارة القيود والدليل المحاسبي',
  ACCOUNTING_RECONCILE: 'إجراء التسويات البنكية والنقدية',
  TREASURY_VIEW: 'عرض حركات الخزينة',
  TREASURY_MANAGE: 'إضافة وتعديل حركات الخزينة',
  TREASURY_DELETE: 'حذف حركات الخزينة',
  TREASURY_ALLOW_NEGATIVE_BALANCE: 'السماح بالسحب المكشوف (رصيد سالب) من الخزينة',
  EXPENSES_VIEW: 'عرض المصروفات',
  EXPENSES_MANAGE: 'إضافة وإدارة المصروفات',
  EXPENSES_DELETE: 'حذف سجلات المصروفات',
  BRANCH_VIEW: 'عرض بيانات الفروع',
  BRANCH_MANAGE: 'إنشاء وتعديل الفروع',
  REPORTS_VIEW: 'عرض التقارير والتحليلات',
  REPORTS_VIEW_ALL: 'عرض تقارير كافة الفروع',
  REPORTS_EXPORT: 'تصدير التقارير (PDF/Excel)',
  LOGISTICS_CREATE: 'إنشاء طلبات الشحن واللوجستيات',
  LOGISTICS_RECEIVE: 'استلام ومعالجة الشحنات',
  LOGISTICS_MANAGE: 'إدارة الموارد والأسطول اللوجستي',
  SUPPLIER_VIEW: 'عرض قائمة الموردين',
  SUPPLIER_MANAGE: 'إدارة بيانات الموردين',
  SUPPLIER_VIEW_LEDGER: 'عرض كشف حساب المورد',
  TICKET_VIEW: 'عرض تذاكر الصيانة',
  TICKET_VIEW_ALL: 'عرض كافة تذاكر الصيانة للفرع',
  TICKET_CREATE: 'إنشاء تذاكر صيانة جديدة',
  TICKET_ASSIGN: 'إسناد التذاكر للفنيين',
  TICKET_EDIT: 'تعديل بيانات التذاكر',
  TICKET_DELETE: 'حذف تذاكر الصيانة',
  TICKET_COMPLETE: 'إغلاق وإتمام تذاكر الصيانة',
  TICKET_PAY: 'تحصيل مدفوعات الصيانة',
  TICKET_WORKFLOW: 'إدارة سير العمل والتقارير الفنية',
  TICKET_OVERRIDE: 'تجاوز الإجراءات المقيدة بالصيانة',
  CUSTOMER_VIEW: 'عرض بيانات العملاء',
  CUSTOMER_VIEW_ALL: 'عرض كافة العملاء',
  CUSTOMER_MANAGE: 'إضافة وتعديل بيانات العملاء',
  CUSTOMER_DELETE: 'حذف بيانات العملاء',
  HR_VIEW_ATTENDANCE: 'عرض سجلات الحضور والانصراف',
  HR_MANAGE_ATTENDANCE: 'إدارة الحضور والتعديل اليدوي',
  HR_VIEW_PAYROLL: 'عرض بيانات الرواتب',
  HR_MANAGE_PAYROLL: 'احتساب ومعالجة الرواتب',
  HR_VIEW_COMPENSATION: 'عرض التعويضات والمكافآت',
  HR_APPROVE_LEAVES: 'اعتماد أو رفض الإجازات',
  HR_MANAGE_LEAVES: 'إدارة سياسات وسجلات الإجازات',
  HR_MANAGE_SHIFTS: 'إدارة وتعيين مناوبات الموظفين',
  HR_MANAGE_SCHEDULE: 'إدارة فترات العمل والجداول',
  HR_MANAGE_EMPLOYEES: 'إدارة ملفات الموظفين والبيانات الشخصية',
  HQ_VIEW: 'عرض لوحة قيادة المقر الرئيسي',
  HQ_MANAGE: 'إدارة الفروع والاعتمادات بالمركز الرئيسي',
  ENGINEER_VIEW: 'عرض قائمة الفنيين وإحصائياتهم',
  ENGINEER_MANAGE: 'إدارة بيانات الفنيين (إضافة/تعديل/حذف)',
  SHIFT_VIEW: 'عرض تفاصيل الوردية الحالية',
  SHIFT_VIEW_ALL: 'عرض كافة الورديات',
  SHIFT_MANAGE: 'فتح وإغلاق الورديات',
  SHIFT_ADMIN: 'إدارة الورديات المتقدمة (إجبار الإغلاق)',
  SHIFT_HANDOFF: 'تسليم وتسلم العهدة بين الورديات',
  SHIFT_ADJUST: 'إجراء تسويات مادية على الورديات المغلقة',
  BACKUP_VIEW: 'عرض تاريخ وحالة النسخ الاحتياطي',
  BACKUP_CREATE: 'إنشاء نسخة احتياطية يدوية',
  BACKUP_RESTORE: 'استعادة النظام من نسخة احتياطية (حرج)',
  BACKUP_MANAGE_DRIVE: 'إدارة الربط مع Google Drive',
  MANAGE_USERS: 'إدارة المستخدمين',
  MANAGE_ROLES: 'إدارة الصلاحيات والأدوار',
  MANAGE_SETTINGS: 'إدارة الإعدادات العامة',
  MANAGE_PRINTERS: 'إدارة إعدادات الطابعات',
  MANAGE_BACKUPS: 'إدارة النسخ الاحتياطي',
  MANAGE_WAREHOUSES: 'إدارة إعدادات المستودعات',
  MANAGE_TABLES: 'إدارة الطاولات والصالات',
  MANAGE_MODULES: 'إدارة تفعيل الموديولات',
  MANAGE_ACCOUNTING_SETUP: 'إدارة إعدادات الحسابات والأرصدة',
};

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
 * Supports Arabic and English fallback
 */
export function getPermissionDisplayName(permission: Permission, locale: string = 'ar'): string {
  if (locale === 'ar' && PERMISSION_LABELS_AR[permission]) {
    return PERMISSION_LABELS_AR[permission];
  }

  // Find the permission in registry and extract its key as fallback
  for (const [moduleName, module] of Object.entries(PERMISSION_REGISTRY)) {
    for (const [key, value] of Object.entries(module)) {
      if (value === permission) {
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
