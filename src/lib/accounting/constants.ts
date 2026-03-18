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
    { code: '1300', name: 'Fixed Assets', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1310', name: 'Accumulated Depreciation', type: ACCOUNT_TYPES.ASSET, isSystem: true }, // Contra-asset, but still Asset type

    // Liabilities (2000-2999)
    { code: '2000', name: 'Accounts Payable', type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2100', name: 'Sales Tax Payable',       type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2150', name: 'Store Credit Liability',  type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2200', name: 'Accrued Salaries & Wages', type: ACCOUNT_TYPES.LIABILITY, isSystem: true },

    // Equity (3000-3999)
    { code: '3000', name: 'Owner\'s Equity / Capital', type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    { code: '3100', name: 'Retained Earnings', type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    { code: '3200', name: 'Owner\'s Drawings', type: ACCOUNT_TYPES.EQUITY, isSystem: true },

    // Revenue (4000-4999)
    { code: '4000', name: 'Sales Revenue',    type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4100', name: 'Service Revenue',  type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4200', name: 'Sales Returns',    type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Contra-revenue
    { code: '4300', name: 'Sales Discounts',  type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Contra-revenue
    { code: '4400', name: 'Other Income',     type: ACCOUNT_TYPES.REVENUE, isSystem: true }, // Misc income, tips, scrap

    // Expenses (5000-5999)
    { code: '5000', name: 'Cost of Goods Sold',            type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5100', name: 'Salaries & Wages Expense',      type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5200', name: 'General & Admin Expenses',      type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5300', name: 'Marketing & Advertising',       type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5400', name: 'Depreciation Expense',          type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5500', name: 'Cash Over/Short', type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5600', name: 'Inventory Spoilage', type: ACCOUNT_TYPES.EXPENSE, isSystem: true }
];
