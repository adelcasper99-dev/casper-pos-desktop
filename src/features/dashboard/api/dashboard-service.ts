"use server";

import { prisma } from "@/lib/prisma";
import { DashboardFilterParams, FinancialDashboardMetrics } from "../types";
import { ALL_EXPENSE_CODES } from "@/lib/accounting/constants";

export async function getFinancialDashboardMetrics(
    params: DashboardFilterParams = {}
): Promise<{ success: boolean; data?: FinancialDashboardMetrics; error?: string }> {
    try {
        const { startDate, endDate } = params;

        // Cumulative date boundary (defaults to now if not provided)
        const effectiveEndDate = endDate ? new Date(endDate) : new Date();
        const effectiveStartDate = startDate ? new Date(startDate) : undefined;

        // 1. CUMULATIVE METRICS (All Time up to endDate)
        // ------------------------------------------------------------------

        // Total Assets: Accounts 1000, 1010, 1020, 1100, 1200, 1300
        // Formula: Debit - Credit
        const assetAccounts = ['1000', '1010', '1020', '1100', '1200', '1300'];
        const assetLines = await prisma.journalLine.aggregate({
            _sum: {
                debit: true,
                credit: true,
            },
            where: {
                account: {
                    code: { in: assetAccounts }
                },
                journalEntry: {
                    date: { lte: effectiveEndDate }
                }
            }
        });
        const totalAssets = Number(assetLines._sum.debit || 0) - Number(assetLines._sum.credit || 0);

        // Current Capital: Accounts 3000, 3100 (Credit - Debit), Account 3200 (Debit - Credit)
        // Formula: Capital - Drawings
        const capitalAccounts = ['3000', '3100'];
        const drawingAccounts = ['3200'];

        const capitalLines = await prisma.journalLine.aggregate({
            _sum: { credit: true, debit: true },
            where: {
                account: { code: { in: capitalAccounts } },
                journalEntry: { date: { lte: effectiveEndDate } }
            }
        });
        const drawingLines = await prisma.journalLine.aggregate({
            _sum: { debit: true, credit: true },
            where: {
                account: { code: { in: drawingAccounts } },
                journalEntry: { date: { lte: effectiveEndDate } }
            }
        });

        const grossCapital = Number(capitalLines._sum.credit || 0) - Number(capitalLines._sum.debit || 0);
        const drawings = Number(drawingLines._sum.debit || 0) - Number(drawingLines._sum.credit || 0);
        const currentCapital = grossCapital - drawings;


        // 2. PERIOD METRICS (Filtered by startDate and endDate)
        // ------------------------------------------------------------------

        // Period Date Filter
        const periodDateFilter: any = { lte: effectiveEndDate };
        if (effectiveStartDate) {
            periodDateFilter.gte = effectiveStartDate;
        }

        // Sales: Account 4000 (Credit sum)
        const salesLines = await prisma.journalLine.aggregate({
            _sum: { credit: true },
            where: {
                account: { code: '4000' },
                journalEntry: { date: periodDateFilter }
            }
        });
        const periodSales = Number(salesLines._sum.credit || 0);

        // Maintenance Revenue: Delivered/Closed Tickets in the period
        const maintenanceTickets = await prisma.ticket.findMany({
            where: {
                status: { in: ['DELIVERED', 'PAID_DELIVERED', 'CLOSED'] },
                deletedAt: null,
                createdAt: {
                    ...(effectiveStartDate ? { gte: effectiveStartDate } : {}),
                    lte: effectiveEndDate
                }
            },
            select: {
                repairPrice: true,
                partsCost: true
            }
        });

        const maintenanceRevenue = maintenanceTickets.reduce((sum, t) => sum + Number(t.repairPrice), 0);
        const maintenancePartsCost = maintenanceTickets.reduce((sum, t) => sum + Number(t.partsCost || 0), 0);
        const maintenanceCount = maintenanceTickets.length;


        const purchasesLines = await prisma.journalLine.aggregate({
            _sum: { debit: true },
            where: {
                account: { code: '1200' },
                journalEntry: {
                    date: periodDateFilter,
                    purchaseId: { not: null }
                }
            }
        });
        const periodPurchases = Number(purchasesLines._sum.debit || 0);

        // Expenses: All Operating & Non-Operating Expenses (Debit sum)
        const expensesLines = await prisma.journalLine.aggregate({
            _sum: { debit: true },
            where: {
                account: { code: { in: ALL_EXPENSE_CODES } },
                journalEntry: { date: periodDateFilter }
            }
        });
        const periodExpenses = Number(expensesLines._sum.debit || 0);

        // COGS: Account 5000 (Debit sum) for Net Profit Calculation
        const cogsLines = await prisma.journalLine.aggregate({
            _sum: { debit: true },
            where: {
                account: { code: '5000' },
                journalEntry: { date: periodDateFilter }
            }
        });
        const cogs = Number(cogsLines._sum.debit || 0);

        // Net Profit = (POS Sales + Maintenance Revenue) - COGS - Maintenance Parts Cost - Expenses
        const netProfit = (periodSales + maintenanceRevenue) - cogs - maintenancePartsCost - periodExpenses;


        return {
            success: true,
            data: {
                totalAssets,
                currentCapital,
                // POS
                periodSales,
                periodPurchases,
                periodExpenses,
                // Maintenance
                maintenanceRevenue,
                maintenancePartsCost,
                maintenanceCount,
                // Combined
                totalRevenue: periodSales + maintenanceRevenue,
                netProfit
            }
        };
    } catch (error) {
        console.error("Error fetching financial dashboard metrics:", error);
        return { success: false, error: "Failed to fetch dashboard metrics" };
    }
}
