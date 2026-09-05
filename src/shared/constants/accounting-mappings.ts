/**
 * Dictionary to map human-readable simplified categories to strict GAAP GL accounts.
 * Each expense category maps to its dedicated granular GL sub-account.
 * This enables per-category P&L breakdown (Rent vs Electricity vs Internet, etc.)
 */

export const EXPENSE_CATEGORY_MAP: Record<string, { glCode: string; labelAr: string; labelEn: string }> = {
    // ── 521x: Occupancy & Utilities ──────────────────────────────────────────
    'RENT':          { glCode: '5210', labelAr: 'إيجار',                         labelEn: 'Rent' },
    'UTILITIES':     { glCode: '5220', labelAr: 'كهرباء ومياه',                  labelEn: 'Utilities (Elec. & Water)' },
    'INTERNET':      { glCode: '5230', labelAr: 'إنترنت واتصالات',               labelEn: 'Internet & Comms' },

    // ── 524x–526x: Operational G&A ───────────────────────────────────────────
    'MAINTENANCE':   { glCode: '5240', labelAr: 'صيانة وإصلاح',                  labelEn: 'Maintenance & Repairs' },
    'CLEANING':      { glCode: '5250', labelAr: 'نظافة وضيافة',                  labelEn: 'Cleaning & Hospitality' },
    'OFFICE_SUPPLIES':{ glCode: '5260', labelAr: 'أدوات مكتبية',                 labelEn: 'Office Supplies' },
    'MISC_GENERAL':  { glCode: '5270', labelAr: 'مصروفات عامة أخرى',             labelEn: 'Misc. General Expenses' },

    // ── 531x–533x: Marketing & Advertising ──────────────────────────────────
    'ADS':           { glCode: '5310', labelAr: 'إعلانات ممولة',                  labelEn: 'Paid Ads' },
    'PROMOTIONS':    { glCode: '5320', labelAr: 'عروض وهدايا',                    labelEn: 'Promotions / Gifts' },
    'PACKAGING':     { glCode: '5330', labelAr: 'تعبئة وتغليف',                   labelEn: 'Packaging' },

    // ── 510x: Payroll ────────────────────────────────────────────────────────
    'SALARIES':      { glCode: '5100', labelAr: 'رواتب وأجور',                    labelEn: 'Salaries & Wages' },
    'BONUSES':       { glCode: '5110', labelAr: 'مكافآت وحوافز',                  labelEn: 'Bonuses / Incentives' },
    'WAGES_DAILY':   { glCode: '5120', labelAr: 'يوميات (عمالة مؤقتة)',            labelEn: 'Daily Wages' },

    // ── 1300: Fixed Assets (Capital Expenditures — NOT an expense on P&L) ───
    'EQUIPMENT':     { glCode: '1300', labelAr: 'شراء معدات / آلات',              labelEn: 'Equipment Purchase' },
    'FURNITURE':     { glCode: '1300', labelAr: 'شراء أثاث / ديكور',              labelEn: 'Furniture Purchase' },

    // ── 3200: Owner's Drawings ───────────────────────────────────────────────
    'OWNER_DRAWING': { glCode: '3200', labelAr: 'مسحوبات شخصية',                  labelEn: 'Owner Drawings' },
};

export const INCOME_CATEGORY_MAP: Record<string, { glCode: string; labelAr: string; labelEn: string }> = {
    // ── 4000: Sales Revenue (Automated usually, but could be manual injections) ──
    'SALES_MANUAL': { glCode: '4000', labelAr: 'مبيعات نقدية (يدوي)', labelEn: 'Manual Cash Sales' },

    // ── 4400: Other Income ──
    'TIPS_INCOME': { glCode: '4400', labelAr: 'بقشيش/خدمة', labelEn: 'Tips / Service' },
    'SCRAP_SALE': { glCode: '4400', labelAr: 'بيع خردة/هالك', labelEn: 'Sale of Scrap' },
    'MISC_INCOME': { glCode: '4400', labelAr: 'إيرادات أخرى', labelEn: 'Other Income' },
    'WALLET_COMMISSION': { glCode: '4500', labelAr: 'إيرادات المحافظ الإلكترونية', labelEn: 'E-Wallet Commission' },
};



/**
 * Global General Ledger Account Registry
 * Single Source of Truth for all hardcoded account logic.
 */
export const GL = {
    ASSETS: {
        CASH: '1000',
        BANK: '1010',
        WALLET: '1020',
        RECEIVABLES: '1100', // Customer Accounts
        INVENTORY: '1200',
        VAT_INPUT: '1210',
        FIXED_ASSETS: '1300',         // Equipment & Furniture (Opening Balance + CapEx)
        ACCUM_DEPRECIATION: '1310',   // Accumulated Depreciation (contra-asset)
        TECH_CUSTODY: '1350',         // Engineer Custody / AR — separated from Fixed Assets
    },
    LIABILITIES: {
        PAYABLES: '2000', // Supplier Accounts
        VAT_OUTPUT: '2100',
        STORE_CREDIT: '2150',
        CUSTOMER_DEPOSITS: '2150',
        ACCRUED_SALARIES: '2200',
    },
    EQUITY: {
        CAPITAL: '3000',
        RETAINED_EARNINGS: '3300',
        OPENING_BALANCE: '3999',
    },
    REVENUE: {
        SALES: '4000',
        SERVICE: '4100',
        SUSPENDED_PROFIT: '4200',
        DISCOUNTS: '4300',
        OTHER_INCOME: '4400',
        WALLET_REVENUE: '4500',
    },
    EXPENSES: {
        COGS: '5000',
        SALARIES: '5100',
        OPERATION_EXPENSES: '5200',
        SHIPPING_LOSS: '5340',
        SPOILAGE: '5600',
    }
} as const;

export const INCOMING_CATEGORIES = [
    { id: "owner_funding", uiLabel: "إيداع من المالك (زيادة رأس مال)", creditAccountId: "3000", actionType: "CAPITAL" },
    { id: "customer_payment", uiLabel: "تحصيل دفعة من عميل (سداد آجل)", creditAccountId: "1100", actionType: "CUSTOMER_PAYMENT" },
    { id: "other_income", uiLabel: "إيرادات أخرى (خلاف المبيعات)", creditAccountId: "4400", actionType: "IN" }
];

/**
 * Centralized GL account code map for all payment methods.
 * Used for both physical treasury updates and double-entry accounting.
 * 1000 = Cash on Hand
 * 1010 = Bank / Card Settlements
 * 1020 = Mobile Wallet / Instapay / Digital
 * 1100 = Accounts Receivable (Deferred)
 */
export const PAYMENT_METHOD_GL_MAP: Record<string, string> = {
    CASH: GL.ASSETS.CASH,
    VISA: GL.ASSETS.BANK,
    MASTERCARD: GL.ASSETS.BANK,
    CARD: GL.ASSETS.BANK,
    BANK: GL.ASSETS.BANK,
    TRANSFER: GL.ASSETS.BANK,
    VODAFONE_CASH: GL.ASSETS.WALLET,
    INSTAPAY: GL.ASSETS.WALLET,
    WALLET: GL.ASSETS.WALLET,
    DEFERRED: GL.ASSETS.RECEIVABLES,
    ACCOUNT: GL.ASSETS.RECEIVABLES,
    SUPPLIER_OFFSET: GL.LIABILITIES.PAYABLES,
    STORE_CREDIT: GL.LIABILITIES.STORE_CREDIT,
};
