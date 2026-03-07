export interface DashboardFilterParams {
    startDate?: string;
    endDate?: string;
}

export interface FinancialDashboardMetrics {
    totalAssets: number;
    currentCapital: number;
    periodSales: number;
    periodPurchases: number;
    periodExpenses: number;
    netProfit: number;
}
