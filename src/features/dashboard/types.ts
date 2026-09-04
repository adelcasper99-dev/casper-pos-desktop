export interface DashboardFilterParams {
    startDate?: string;
    endDate?: string;
    branchId?: string;
}

export interface PaymentBreakdownItem {
    method: string;
    label: string;
    amount: number;
    count: number;
}

export interface DailyTrendItem {
    date: string;
    revenue: number;
    profit?: number;
    posRevenue: number;
    maintenanceRevenue: number;
}

export interface TopProductItem {
    id: string;
    name: string;
    quantity: number;
    revenue: number;
}

export interface LowStockItem {
    id: string;
    name: string;
    stock: number;
    minStock: number;
}

export interface ActiveShiftSummary {
    id: string;
    cashierName: string;
    openedAt: string;
    startCash: number;
    actualCash: number;
    salesCount: number;
    totalCashSales: number;
}

export interface RecentTransactionItem {
    id: string;
    type: 'SALE' | 'MAINTENANCE';
    reference: string;
    customerName: string;
    amount: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
}

export interface FinancialDashboardMetrics {
    // ── Legacy contract (Must be preserved 100%) ──
    totalAssets: number;
    currentCapital: number;
    periodSales: number;
    periodPurchases: number;
    periodExpenses: number;
    maintenanceRevenue: number;
    maintenancePartsCost: number;
    maintenanceCount: number;
    totalRevenue: number;
    netProfit: number;

    // ── Extended Executive & Operational Metrics ──
    salesCount?: number;
    averageOrderValue?: number;
    profitMarginPercentage?: number;
    canViewConfidentialFinancials?: boolean;

    // ── Visual Trends & Breakdowns ──
    salesTrend?: DailyTrendItem[];
    paymentBreakdown?: PaymentBreakdownItem[];

    // ── Operational Widgets ──
    topProducts?: TopProductItem[];
    lowStockItems?: LowStockItem[];
    activeShift?: ActiveShiftSummary | null;
    recentTransactions?: RecentTransactionItem[];
}
