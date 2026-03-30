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
};

export const INCOMING_CATEGORIES = [
    { id: "owner_funding", uiLabel: "إيداع من المالك (زيادة رأس مال)", creditAccountId: "3000", actionType: "CAPITAL" },
    { id: "customer_payment", uiLabel: "تحصيل دفعة من عميل (سداد آجل)", creditAccountId: "1100", actionType: "CUSTOMER_PAYMENT" },
    { id: "other_income", uiLabel: "إيرادات أخرى (خلاف المبيعات)", creditAccountId: "4400", actionType: "IN" }
];
