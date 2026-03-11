export interface DashboardFilterParams {
    startDate?: string;
    endDate?: string;
}

export interface FinancialDashboardMetrics {
    totalAssets: number;
    currentCapital: number;
    // POS
    periodSales: number;
    periodPurchases: number;
    periodExpenses: number;
    // Maintenance
    maintenanceRevenue: number;
    maintenancePartsCost: number;
    maintenanceCount: number;
    // Combined
    totalRevenue: number;
    netProfit: number;
}
