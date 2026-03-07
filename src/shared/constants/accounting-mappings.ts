/**
 * Dictionary to map human-readable simplified categories to strict GAAP GL accounts.
 * This abstracts the accounting complexity away from the cashier/user.
 */

export const EXPENSE_CATEGORY_MAP: Record<string, { glCode: string; labelAr: string; labelEn: string }> = {
    // ── 5200: General & Administrative Expenses ──
    'RENT': { glCode: '5200', labelAr: 'إيجار', labelEn: 'Rent' },
    'UTILITIES': { glCode: '5200', labelAr: 'مرافق (كهرباء/مياه)', labelEn: 'Utilities' },
    'INTERNET': { glCode: '5200', labelAr: 'إنترنت واتصالات', labelEn: 'Internet & Comms' },
    'OFFICE_SUPPLIES': { glCode: '5200', labelAr: 'أدوات مكتبية', labelEn: 'Office Supplies' },
    'MAINTENANCE': { glCode: '5200', labelAr: 'صيانة وإصلاح', labelEn: 'Maintenance' },
    'CLEANING': { glCode: '5200', labelAr: 'نظافة وضيافة', labelEn: 'Cleaning' },
    'MISC_GENERAL': { glCode: '5200', labelAr: 'مصروفات عامة أخرى', labelEn: 'Misc. General' },

    // ── 5300: Marketing & Advertising Expenses ──
    'ADS': { glCode: '5300', labelAr: 'إعلانات ممولة', labelEn: 'Paid Ads' },
    'PROMOTIONS': { glCode: '5300', labelAr: 'عروض وهدايا', labelEn: 'Promotions / Gifts' },
    'PACKAGING': { glCode: '5300', labelAr: 'تعبئة وتغليف', labelEn: 'Packaging' },

    // ── 5100: Salaries & Wages ──
    'SALARIES': { glCode: '5100', labelAr: 'رواتب وأجور', labelEn: 'Salaries' },
    'BONUSES': { glCode: '5100', labelAr: 'مكافآت وحوافز', labelEn: 'Bonuses / Incentives' },
    'WAGES_DAILY': { glCode: '5100', labelAr: 'يوميات (عمالة مؤقتة)', labelEn: 'Daily Wages' },

    // ── 1300: Fixed Assets (Capital Expenditures) ──
    'EQUIPMENT': { glCode: '1300', labelAr: 'شراء معدات/آلات', labelEn: 'Equipment Purchase' },
    'FURNITURE': { glCode: '1300', labelAr: 'شراء أثاث/ديكور', labelEn: 'Furniture Purchase' },

    // ── 3100: Owner\'s Drawings (Personal) ──
    'OWNER_DRAWING': { glCode: '3100', labelAr: 'مسحوبات شخصية', labelEn: 'Owner Drawings' },
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
    { id: "other_income", uiLabel: "إيرادات أخرى (خلاف المبيعات)", creditAccountId: "4100", actionType: "IN" }
];
