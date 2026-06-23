export const ACCOUNT_TYPES = {
    ASSET: 'ASSET',
    LIABILITY: 'LIABILITY',
    EQUITY: 'EQUITY',
    REVENUE: 'REVENUE',
    EXPENSE: 'EXPENSE',
} as const;

export const DEFAULT_ACCOUNTS = [
    // Assets (1000-1999)
    { code: '1000', name: 'Cash in Hand', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1010', name: 'Bank / Card Settlements', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1015', name: 'Petty Cash Fund', type: ACCOUNT_TYPES.ASSET, isSystem: false },
    { code: '1020', name: 'Cash in Treasury / Wallet', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1100', name: 'Accounts Receivable', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1200', name: 'Inventory Asset', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1300', name: 'Fixed Assets (Equip. & Furniture)',  type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1310', name: 'Accumulated Depreciation',           type: ACCOUNT_TYPES.ASSET, isSystem: true }, // Contra-asset
    { code: '1350', name: 'Engineer Tech Custody / AR',         type: ACCOUNT_TYPES.ASSET, isSystem: true }, // Separated from Fixed Assets

    // Liabilities (2000-2999)
    { code: '2000', name: 'Accounts Payable', type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2100', name: 'Sales Tax Payable',       type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2150', name: 'Store Credit Liability',  type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2200', name: 'Accrued Salaries & Wages', type: ACCOUNT_TYPES.LIABILITY, isSystem: true },

    // Equity (3000-3999)
    { code: '3000', name: 'Owner\'s Equity / Capital',                  type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    // ⚠️  3100 kept as legacy alias — canonical code is 3300 (matches GL.EQUITY.RETAINED_EARNINGS)
    { code: '3100', name: 'Retained Earnings (Legacy Alias)',            type: ACCOUNT_TYPES.EQUITY, isSystem: false },
    { code: '3200', name: 'Owner\'s Drawings',                          type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    // ✅ 3300 = canonical Retained Earnings used by AccountingEngine.distributeProfit
    { code: '3300', name: 'Retained Earnings / Accumulated Profit',      type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    { code: '3999', name: 'Opening Balance Equity',                      type: ACCOUNT_TYPES.EQUITY, isSystem: true },

    // Revenue (4000-4999)
    { code: '4000', name: 'Sales Revenue',    type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4100', name: 'Service Revenue',  type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4200', name: 'Sales Returns',    type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Contra-revenue
    { code: '4300', name: 'Sales Discounts',  type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Contra-revenue
    { code: '4400', name: 'Other Income',     type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Misc income, tips, scrap
    { code: '4500', name: 'E-Wallet Commission Revenue', type: ACCOUNT_TYPES.REVENUE, isSystem: true },

    // Expenses (5000-5999)
    { code: '5000', name: 'Cost of Goods Sold',            type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5100', name: 'Salaries & Wages Expense',      type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5110', name: 'Bonuses & Incentives',          type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5120', name: 'Daily Wages',                   type: ACCOUNT_TYPES.EXPENSE, isSystem: false },

    // ── 52xx: General & Administrative (Detailed) ──────────────────────────
    { code: '5200', name: 'General & Admin Expenses',      type: ACCOUNT_TYPES.EXPENSE, isSystem: true },  // Catch-all / legacy
    { code: '5210', name: 'Rent Expense',                  type: ACCOUNT_TYPES.EXPENSE, isSystem: true },  // إيجار
    { code: '5220', name: 'Utilities (Electricity & Water)', type: ACCOUNT_TYPES.EXPENSE, isSystem: true }, // كهرباء ومياه
    { code: '5230', name: 'Internet & Communications',     type: ACCOUNT_TYPES.EXPENSE, isSystem: true },  // إنترنت واتصالات
    { code: '5240', name: 'Maintenance & Repairs',         type: ACCOUNT_TYPES.EXPENSE, isSystem: true },  // صيانة وإصلاح
    { code: '5250', name: 'Cleaning & Hospitality',        type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // نظافة وضيافة
    { code: '5260', name: 'Office Supplies',               type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // أدوات مكتبية
    { code: '5270', name: 'Miscellaneous General Expense', type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // متفرقات

    // ── 53xx: Marketing & Advertising (Detailed) ───────────────────────────
    { code: '5300', name: 'Marketing & Advertising',       type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5310', name: 'Paid Ads',                      type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // إعلانات ممولة
    { code: '5320', name: 'Promotions & Gifts',            type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // عروض وهدايا
    { code: '5330', name: 'Packaging',                     type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // تعبئة وتغليف

    { code: '5400', name: 'Depreciation Expense',          type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5500', name: 'Cash Over/Short',               type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5600', name: 'Inventory Spoilage',            type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
];

/**
 * Centrally managed array of all operating and non-operating expense GL codes.
 * Used across dashboard KPIs, P&L reports, and auto-journal filters.
 */
export const ALL_EXPENSE_CODES = [
    // Payroll
    '5100', '5110', '5120',
    // G&A (Occupancy & Operational)
    '5200', '5210', '5220', '5230', '5240', '5250', '5260', '5270',
    // Marketing
    '5300', '5310', '5320', '5330',
    // Other & Variances
    '5400', '5500', '5600'
];
