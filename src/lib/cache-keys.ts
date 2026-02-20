/**
 * Centralized cache keys and tags for SWR caching
 * 
 * Usage:
 * - Keys: Unique identifiers for cached data
 * - Tags: Groups for bulk invalidation
 */

export const CACHE_KEYS = {
  // ===== INVENTORY / PRODUCTS =====
  PRODUCTS_ALL: 'products-all',
  PRODUCTS_LOW_STOCK: 'products-low-stock',
  PRODUCTS_BY_CATEGORY: (categoryId: string) => `products-category-${categoryId}`,
  PRODUCT_BY_ID: (id: string) => `product-${id}`,
  PRODUCT_BY_SKU: (sku: string) => `product-sku-${sku}`,
  
  // Stock levels
  STOCK_ALL: 'stock-all',
  STOCK_BY_WAREHOUSE: (warehouseId: string) => `stock-warehouse-${warehouseId}`,
  
  // Categories
  CATEGORIES_ALL: 'categories-all',
  
  // ===== SALES / POS =====
  RECENT_SALES: 'recent-sales',
  SALES_TODAY: () => `sales-${new Date().toISOString().split('T')[0]}`,
  DAILY_REVENUE: (date: string) => `revenue-${date}`,
  SALES_BY_WAREHOUSE: (warehouseId: string) => `sales-warehouse-${warehouseId}`,
  
  // ===== TICKETS / REPAIR =====
  TICKETS_ACTIVE: 'tickets-active',
  TICKETS_BY_STATUS: (status: string) => `tickets-status-${status}`,
  TICKETS_BY_TECHNICIAN: (technicianId: string) => `tickets-tech-${technicianId}`,
  TICKET_BY_ID: (id: string) => `ticket-${id}`,
  TICKET_BY_BARCODE: (barcode: string) => `ticket-barcode-${barcode}`,
  
  // ===== DASHBOARD / ANALYTICS =====
  DASHBOARD_STATS: 'dashboard-stats',
  DASHBOARD_STATS_DATE: (date: string) => `dashboard-stats-${date}`,
  
  // ===== HR / PAYROLL =====
  EMPLOYEES_ALL: 'employees-all',
  EMPLOYEE_BY_ID: (id: string) => `employee-${id}`,
  ATTENDANCE_TODAY: () => `attendance-${new Date().toISOString().split('T')[0]}`,
  
  // ===== SETTINGS =====
  STORE_SETTINGS: 'store-settings',
  
  // ===== REPORTS =====
  REPORT_DATA: (model: string, dateRange: string) => `report-${model}-${dateRange}`,
};

export const CACHE_TAGS = {
  // Domain tags for bulk invalidation
  PRODUCTS: 'products',
  INVENTORY: 'inventory',
  STOCK: 'stock',
  CATEGORIES: 'categories',
  
  SALES: 'sales',
  POS: 'pos',
  REVENUE: 'revenue',
  
  TICKETS: 'tickets',
  REPAIRS: 'repairs',
  
  EMPLOYEES: 'employees',
  ATTENDANCE: 'attendance',
  PAYROLL: 'payroll',
  
  DASHBOARD: 'dashboard',
  ANALYTICS: 'analytics',
  
  SETTINGS: 'settings',
  REPORTS: 'reports',
};

/**
 * Cache duration presets (in seconds)
 */
export const CACHE_DURATION = {
  VERY_SHORT: 60,        // 1 minute - highly volatile data
  SHORT: 300,            // 5 minutes - frequently changing
  MEDIUM: 900,           // 15 minutes - moderate changes
  LONG: 3600,            // 1 hour - rarely changing
  VERY_LONG: 86400,      // 24 hours - nearly static
};

/**
 * Common cache configurations
 */
export const CACHE_CONFIG = {
  // Products change moderately
  PRODUCTS: {
    revalidate: CACHE_DURATION.MEDIUM,
    tags: [CACHE_TAGS.PRODUCTS, CACHE_TAGS.INVENTORY],
  },
  
  // Stock changes frequently
  STOCK: {
    revalidate: CACHE_DURATION.SHORT,
    tags: [CACHE_TAGS.STOCK, CACHE_TAGS.INVENTORY],
  },
  
  // Sales data updates rapidly
  SALES: {
    revalidate: CACHE_DURATION.VERY_SHORT,
    tags: [CACHE_TAGS.SALES, CACHE_TAGS.REVENUE],
  },
  
  // Tickets moderate frequency
  TICKETS: {
    revalidate: CACHE_DURATION.SHORT,
    tags: [CACHE_TAGS.TICKETS, CACHE_TAGS.REPAIRS],
  },
  
  // Dashboard aggregated less frequently
  DASHBOARD: {
    revalidate: CACHE_DURATION.MEDIUM,
    tags: [CACHE_TAGS.DASHBOARD, CACHE_TAGS.ANALYTICS],
  },
  
  // Settings rarely change
  SETTINGS: {
    revalidate: CACHE_DURATION.VERY_LONG,
    tags: [CACHE_TAGS.SETTINGS],
  },
};
