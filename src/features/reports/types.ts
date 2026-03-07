export type CategoryGroup = 'ALL' | 'SALES' | 'PURCHASES' | 'EXPENSES' | 'DRAWINGS';

export interface TransactionReportFilters {
    startDate?: string;
    endDate?: string;
    categoryGroup?: CategoryGroup;
    paymentMethod?: string;
}

export interface ReportKPIs {
    totalCashIn: number;
    totalCashOut: number;
    netCash: number;
    approximateProfit: number;
}

export interface ReportTransaction {
    id: string;
    date: string;
    description: string;
    accountName: string;
    accountCode: string;
    debit: number;
    credit: number;
    reference?: string | null;
}

export interface ReportData {
    kpis: ReportKPIs;
    transactions: ReportTransaction[];
}
