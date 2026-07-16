"use server";

import { getBalanceSheet } from "@/lib/accounting/balance-sheet";
import { getNetProfit } from "@/lib/accounting/net-profit";

import { revalidatePath } from "next/cache";

export async function fetchBalanceSheetData(asOfDate: Date) {
    try {
        const result = await getBalanceSheet(asOfDate);
        revalidatePath('/accounting/balance-sheet');
        return { success: true, data: result };
    } catch (error: any) {
        console.error("fetchBalanceSheetData error:", error);
        return { success: false, error: error.message || "Failed to calculate balance sheet" };
    }
}

export async function fetchNetProfitData(from: Date, to: Date) {
    try {
        const result = await getNetProfit(from, to);
        return {
            success: true,
            data: {
                totalRevenue: result.totalRevenue.toNumber(),
                totalExpenses: result.totalExpenses.toNumber(),
                netProfit: result.netProfit.toNumber(),
                isLoss: result.isLoss,
                period: result.period
            }
        };
    } catch (error: any) {
        console.error("fetchNetProfitData error:", error);
        return { success: false, error: error.message || "Failed to calculate net profit" };
    }
}
