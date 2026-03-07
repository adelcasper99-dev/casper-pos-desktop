import { prisma } from "@/lib/prisma";
import { TransactionReportFilters, ReportKPIs, ReportData, CategoryGroup } from "../types";
import { startOfDay, endOfDay } from "date-fns";

const CATEGORY_MAP: Record<CategoryGroup, string[]> = {
    ALL: [],
    SALES: ['4000'],
    PURCHASES: ['2000'], // Per instruction: Mapping 'PURCHASES' to [2000]
    EXPENSES: ['5100', '5200', '5300', '5400'],
    DRAWINGS: ['3100'],
};

const CASH_ACCOUNTS = ['1000', '1010', '1020'];

/**
 * Reporting Engine Service
 * Implements logic for Cash Flow and Profit calculations.
 */
export async function getCashFlowReport(filters: TransactionReportFilters): Promise<ReportData> {
    const startDate = filters.startDate ? startOfDay(new Date(filters.startDate)) : undefined;
    const endDate = filters.endDate ? endOfDay(new Date(filters.endDate)) : undefined;

    // 1. Build Filter for Journal Lines
    const whereLine: any = {};
    const whereEntry: any = {};

    if (startDate || endDate) {
        whereEntry.date = {};
        if (startDate) whereEntry.date.gte = startDate;
        if (endDate) whereEntry.date.lte = endDate;
    }

    if (filters.categoryGroup && filters.categoryGroup !== 'ALL') {
        const targetCodes = CATEGORY_MAP[filters.categoryGroup];
        whereLine.account = { code: { in: targetCodes } };
    }

    // 2. Fetch Transactions
    const lines = await prisma.journalLine.findMany({
        where: {
            ...whereLine,
            journalEntry: whereEntry
        },
        include: {
            account: true,
            journalEntry: true,
        },
        orderBy: {
            journalEntry: { date: 'desc' }
        }
    });

    // 3. Calculate KPIs (Over the selected date range)
    const kpis = await calculateKPIs(startDate, endDate);

    return {
        kpis,
        transactions: lines.map(line => ({
            id: line.id,
            date: line.journalEntry.date.toISOString(),
            description: line.description || line.journalEntry.description,
            accountName: line.account.name,
            accountCode: line.account.code,
            debit: Number(line.debit),
            credit: Number(line.credit),
            reference: line.journalEntry.reference,
        }))
    };
}

/**
 * Calculates the 4 main KPIs for the dashboard.
 * Total Cash In: Sum of debits to Cash/Bank/Wallet accounts
 * Total Cash Out: Sum of credits to Cash/Bank/Wallet accounts
 * Approximate Profit: Sales [4000] (Cr) - COGS [5000] (Dr) - Expenses [5100-5400] (Dr)
 */
export async function calculateKPIs(startDate?: Date, endDate?: Date): Promise<ReportKPIs> {
    const whereEntry: any = {};
    if (startDate || endDate) {
        whereEntry.date = {};
        if (startDate) whereEntry.date.gte = startDate;
        if (endDate) whereEntry.date.lte = endDate;
    }

    // Fetch relevant lines for the period
    const allLines = await prisma.journalLine.findMany({
        where: {
            journalEntry: whereEntry
        },
        include: {
            account: true
        }
    });

    let totalCashIn = 0;
    let totalCashOut = 0;
    let revenue = 0;
    let cogs = 0;
    let expenses = 0;

    for (const line of allLines) {
        const code = line.account.code;
        const dr = Number(line.debit);
        const cr = Number(line.credit);

        // Cash Flow Logic (1000, 1010, 1020)
        if (CASH_ACCOUNTS.includes(code)) {
            totalCashIn += dr;
            totalCashOut += cr;
        }

        // Profit Logic
        if (code === '4000') {
            revenue += (cr - dr); // Credit normal
        } else if (code === '5000') {
            cogs += (dr - cr); // Debit normal
        } else if (['5100', '5200', '5300', '5400'].includes(code)) {
            expenses += (dr - cr); // Debit normal
        }
    }

    return {
        totalCashIn,
        totalCashOut,
        netCash: totalCashIn - totalCashOut,
        approximateProfit: revenue - cogs - expenses,
    };
}
