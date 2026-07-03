export const ACCOUNT_TYPES = {
    ASSET: 'ASSET',
    LIABILITY: 'LIABILITY',
    EQUITY: 'EQUITY',
    REVENUE: 'REVENUE',
    EXPENSE: 'EXPENSE',
} as const;

export const DEFAULT_ACCOUNTS = [
    // Assets (1000-1999)
    { code: '1000', name: 'نقدية بالصندوق', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1010', name: 'تسويات البنوك / البطاقات', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1015', name: 'صندوق المصروفات النثرية', type: ACCOUNT_TYPES.ASSET, isSystem: false },
    { code: '1020', name: 'نقدية بالخزينة / المحفظة', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1100', name: 'العملاء / الذمم المدينة', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1200', name: 'المخزون', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1300', name: 'الأصول الثابتة (معدات وأثاث)',  type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1310', name: 'مجمع الإهلاك',           type: ACCOUNT_TYPES.ASSET, isSystem: true }, // Contra-asset
    { code: '1350', name: 'عهدة الفنيين / ذمم مدينة',         type: ACCOUNT_TYPES.ASSET, isSystem: true }, // Separated from Fixed Assets

    // Liabilities (2000-2999)
    { code: '2000', name: 'الموردين / الذمم الدائنة', type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2100', name: 'ضريبة المبيعات المستحقة',       type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2150', name: 'أرصدة دائنة للعملاء',  type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2200', name: 'الرواتب والأجور المستحقة', type: ACCOUNT_TYPES.LIABILITY, isSystem: true },

    // Equity (3000-3999)
    { code: '3000', name: 'حقوق الملكية / رأس المال',                  type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    // ⚠️  3100 kept as legacy alias — canonical code is 3300 (matches GL.EQUITY.RETAINED_EARNINGS)
    { code: '3100', name: 'الأرباح المحتجزة (قديم)',            type: ACCOUNT_TYPES.EQUITY, isSystem: false },
    { code: '3200', name: 'مسحوبات الشركاء',                          type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    // ✅ 3300 = canonical Retained Earnings used by AccountingEngine.distributeProfit
    { code: '3300', name: 'الأرباح المحتجزة / الأرباح المتراكمة',      type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    { code: '3999', name: 'الأرصدة الافتتاحية لحقوق الملكية',                      type: ACCOUNT_TYPES.EQUITY, isSystem: true },

    // Revenue (4000-4999)
    { code: '4000', name: 'إيرادات المبيعات',    type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4100', name: 'إيرادات الخدمات',  type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4200', name: 'مردودات المبيعات',    type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Contra-revenue
    { code: '4300', name: 'خصومات المبيعات',  type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Contra-revenue
    { code: '4400', name: 'إيرادات أخرى',     type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Misc income, tips, scrap
    { code: '4500', name: 'إيرادات عمولات المحافظ الإلكترونية', type: ACCOUNT_TYPES.REVENUE, isSystem: true },

    // Expenses (5000-5999)
    { code: '5000', name: 'تكلفة البضاعة المباعة',            type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5100', name: 'مصروفات الرواتب والأجور',      type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5110', name: 'مكافآت وحوافز',          type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5120', name: 'يوميات وعمالة',                   type: ACCOUNT_TYPES.EXPENSE, isSystem: false },

    // ── 52xx: General & Administrative (Detailed) ──────────────────────────
    { code: '5200', name: 'مصروفات عمومية وإدارية',      type: ACCOUNT_TYPES.EXPENSE, isSystem: true },  // Catch-all / legacy
    { code: '5210', name: 'مصروف الإيجار',                  type: ACCOUNT_TYPES.EXPENSE, isSystem: true },  // إيجار
    { code: '5220', name: 'مرافق (كهرباء ومياه)', type: ACCOUNT_TYPES.EXPENSE, isSystem: true }, // كهرباء ومياه
    { code: '5230', name: 'إنترنت واتصالات',     type: ACCOUNT_TYPES.EXPENSE, isSystem: true },  // إنترنت واتصالات
    { code: '5240', name: 'صيانة وإصلاح',         type: ACCOUNT_TYPES.EXPENSE, isSystem: true },  // صيانة وإصلاح
    { code: '5250', name: 'نظافة وضيافة',        type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // نظافة وضيافة
    { code: '5260', name: 'أدوات مكتبية',               type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // أدوات مكتبية
    { code: '5270', name: 'مصروفات نثرية متنوعة', type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // متفرقات

    // ── 53xx: Marketing & Advertising (Detailed) ───────────────────────────
    { code: '5300', name: 'تسويق ودعاية',       type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5310', name: 'إعلانات ممولة',                      type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // إعلانات ممولة
    { code: '5320', name: 'عروض وهدايا',            type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // عروض وهدايا
    { code: '5330', name: 'تعبئة وتغليف',                     type: ACCOUNT_TYPES.EXPENSE, isSystem: false }, // تعبئة وتغليف
    { code: '5340', name: 'خسائر ومصروفات شحن غير مستردة', type: ACCOUNT_TYPES.EXPENSE, isSystem: true }, // شحن ومرتجعات

    { code: '5400', name: 'مصروف الإهلاك',          type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5500', name: 'عجز/زيادة الصندوق',               type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5600', name: 'تالف المخزون',            type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
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
    // Marketing & Shipping
    '5300', '5310', '5320', '5330', '5340',
    // Other & Variances
    '5400', '5500', '5600'
];
