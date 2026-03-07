"use server";

import { getCashFlowReport } from "@/features/reports/api/report-service";
import { TransactionReportFilters, ReportData } from "@/features/reports/types";

export async function fetchCashFlowData(filters: TransactionReportFilters): Promise<{ success: boolean; data?: ReportData; error?: string }> {
    try {
        const data = await getCashFlowReport(filters);
        return { success: true, data };
    } catch (error) {
        console.error("fetchCashFlowData error:", error);
        return { success: false, error: "Failed to fetch report data" };
    }
}
