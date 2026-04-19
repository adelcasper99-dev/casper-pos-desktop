'use server';

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { startOfDay, endOfDay, eachDayOfInterval, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ALL_EXPENSE_CODES } from "@/lib/accounting/constants";
import { getCurrentUser } from "@/actions/auth";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";

interface ProfitLossFilters {
    startDate?: string;
    endDate?: string;
    branchId?: string;
    viewType?: 'daily' | 'monthly' | 'yearly';
}

export const getProfitLossReport = secureAction(async (filters: ProfitLossFilters): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
        const now = new Date();
        const defaultStart = subMonths(now, 1);
        const defaultEnd = now;

        const startDate = filters?.startDate
            ? startOfDay(new Date(filters.startDate))
            : startOfDay(defaultStart);
        const endDate = filters?.endDate
            ? endOfDay(new Date(filters.endDate))
            : endOfDay(defaultEnd);

        const branchFilter = filters?.branchId ? { branchId: filters.branchId } : {};
        const ticketBranchFilter = filters?.branchId ? { currentBranchId: filters.branchId } : {};

        // ─────────────────────────────────────────────────────────────────────
        // 📊 REVENUE SOURCES
        // ─────────────────────────────────────────────────────────────────────

        // 1. POS Sales Revenue (4000)
        const salesRevenueAgg = await prisma.journalLine.aggregate({
            where: {
                account: { code: '4000' },
                journalEntry: {
                    date: { gte: startDate, lte: endDate },
                    ...(filters?.branchId ? {
                        OR: [
                            { sale: { warehouse: { branchId: filters.branchId } } },
                            { purchase: { warehouse: { branchId: filters.branchId } } }
                        ]
                    } : {})
                }
            },
            _sum: { credit: true }
        });
        const posRevenue = new Decimal(salesRevenueAgg._sum.credit?.toString() || '0');

        // 2. Maintenance Service Revenue (4100)
        const serviceRevenueAcc = await prisma.account.findFirst({
            where: { code: '4100' }
        });
        let maintenanceRevenue = new Decimal(0);
        if (serviceRevenueAcc) {
            const serviceMvmt = await prisma.journalLine.aggregate({
                where: {
                    accountId: serviceRevenueAcc.id,
                    journalEntry: {
                        date: { gte: startDate, lte: endDate },
                        ...ticketBranchFilter
                    }
                },
                _sum: { credit: true, debit: true }
            });
            maintenanceRevenue = new Decimal(serviceMvmt._sum.credit?.toString() || '0')
                .minus(serviceMvmt._sum.debit?.toString() || '0');
        }

        // 3. Other Income (4400)
        const otherIncomeAgg = await prisma.journalLine.aggregate({
            where: {
                account: { code: '4400' },
                journalEntry: { date: { gte: startDate, lte: endDate } }
            },
            _sum: { credit: true }
        });
        const otherIncome = new Decimal(otherIncomeAgg._sum.credit?.toString() || '0');

        // 4. E-Wallet Commissions (4500)
        const walletRevenueAgg = await prisma.journalLine.aggregate({
            where: {
                account: { code: '4500' },
                journalEntry: { date: { gte: startDate, lte: endDate } }
            },
            _sum: { credit: true }
        });
        const walletRevenue = new Decimal(walletRevenueAgg._sum.credit?.toString() || '0');

        // Total Revenue
        const totalRevenue = posRevenue.plus(maintenanceRevenue).plus(otherIncome).plus(walletRevenue);

        // ─────────────────────────────────────────────────────────────────────
        // 📉 COST OF GOODS SOLD (COGS)
        // ─────────────────────────────────────────────────────────────────────
        const cogsAgg = await prisma.journalLine.aggregate({
            where: {
                account: { code: '5000' },
                journalEntry: {
                    date: { gte: startDate, lte: endDate },
                    ...(filters?.branchId ? {
                        OR: [
                            { sale: { warehouse: { branchId: filters.branchId } } }
                        ]
                    } : {})
                }
            },
            _sum: { debit: true }
        });
        const cogs = new Decimal(cogsAgg._sum.debit?.toString() || '0');

        // Maintenance Parts Cost
        const tickets = await prisma.ticket.findMany({
            where: {
                createdAt: { gte: startDate, lte: endDate },
                status: { in: ['DELIVERED', 'PAID_DELIVERED', 'CLOSED'] },
                deletedAt: null,
                ...ticketBranchFilter
            },
            select: { partsCost: true }
        });
        const maintenancePartsCost = tickets.reduce(
            (sum, t) => sum.plus(new Decimal(t.partsCost ? String(t.partsCost) : '0')),
            new Decimal(0)
        );

        // Total COGS
        const totalCOGS = cogs.plus(maintenancePartsCost);

        // ─────────────────────────────────────────────────────────────────────
        // 💰 OPERATING EXPENSES (Granular per sub-account)
        // ─────────────────────────────────────────────────────────────────────

        const expensesAgg = await prisma.journalLine.aggregate({
            where: {
                account: { code: { in: ALL_EXPENSE_CODES } },
                journalEntry: { date: { gte: startDate, lte: endDate } }
            },
            _sum: { debit: true }
        });
        const operatingExpenses = new Decimal(expensesAgg._sum.debit?.toString() || '0');

        // Fetch all expense accounts in one query for breakdown
        const expenseAccountRows = await prisma.account.findMany({
            where: { code: { in: ALL_EXPENSE_CODES } }
        });

        // Aggregate journal lines for all expense accounts in one query
        const expenseLines = await prisma.journalLine.groupBy({
            by: ['accountId'],
            where: {
                accountId: { in: expenseAccountRows.map((a: { id: string }) => a.id) },
                journalEntry: { date: { gte: startDate, lte: endDate } }
            },
            _sum: { debit: true }
        });

        const expenseLineMap = new Map(expenseLines.map((l: any) => [l.accountId, l._sum.debit]));

        const expenseBreakdown = expenseAccountRows
            .map((account: { id: string; code: string; name: string }) => ({
                code: account.code,
                name: account.name,
                amount: new Decimal(expenseLineMap.get(account.id)?.toString() || '0').toNumber()
            }))
            .filter((e: { amount: number }) => e.amount > 0)  // Only show accounts with actual entries
            .sort((a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code));

        // ─────────────────────────────────────────────────────────────────────
        // 🏪 GROSS PROFIT & NET PROFIT
        // ─────────────────────────────────────────────────────────────────────
        const grossProfit = totalRevenue.minus(totalCOGS);
        const netProfit = grossProfit.minus(operatingExpenses);

        // ─────────────────────────────────────────────────────────────────────
        // 📈 TREND DATA
        // ─────────────────────────────────────────────────────────────────────
        const viewType = filters?.viewType || 'daily';
        let trendData: any[] = [];

        if (viewType === 'monthly') {
            // Group by month
            const months: any[] = [];
            let current = new Date(startDate);
            while (current <= endDate) {
                const monthStart = startOfMonth(current);
                const monthEnd = endOfMonth(current);
                months.push({ start: monthStart, end: monthEnd, label: format(current, 'MMMM yyyy') });
                current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
            }

            trendData = months.map(m => ({
                period: m.label,
                revenue: 0,
                expenses: 0,
                profit: 0
            }));
        } else {
            // Daily trend
            const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
            trendData = daysInRange.map(day => ({
                date: format(day, 'yyyy-MM-dd'),
                revenue: 0,
                expenses: 0,
                profit: 0
            }));
        }

        // ─────────────────────────────────────────────────────────────────────
        // 📋 SUMMARY
        // ─────────────────────────────────────────────────────────────────────
        return {
            success: true,
            data: {
                period: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString()
                },
                income: {
                    posRevenue: posRevenue.toNumber(),
                    maintenanceRevenue: maintenanceRevenue.toNumber(),
                    walletRevenue: walletRevenue.toNumber(),
                    otherIncome: otherIncome.toNumber(),
                    totalRevenue: totalRevenue.toNumber()
                },
                costs: {
                    cogs: cogs.toNumber(),
                    maintenancePartsCost: maintenancePartsCost.toNumber(),
                    totalCOGS: totalCOGS.toNumber()
                },
                expenses: {
                    operatingExpenses: operatingExpenses.toNumber(),
                    breakdown: expenseBreakdown
                },
                profit: {
                    grossProfit: grossProfit.toNumber(),
                    netProfit: netProfit.toNumber(),
                    profitMargin: totalRevenue.greaterThan(0)
                        ? grossProfit.dividedBy(totalRevenue).times(100).toNumber()
                        : 0
                },
                trendData,
                counts: {
                    sales: await prisma.sale.count({
                        where: {
                            createdAt: { gte: startDate, lte: endDate },
                            status: { not: 'REFUNDED' },
                            ...branchFilter
                        }
                    }),
                    tickets: tickets.length
                }
            }
        };
    } catch (error: any) {
        console.error('[getProfitLossReport] Error:', error);
        return { success: false, error: error.message };
    }
}, { permission: PERMISSIONS.REPORTS_VIEW, requireCSRF: false });

export const getBranchesForReports = secureAction(async (): Promise<{ success: boolean; branches: any[] }> => {
    try {
        const branches = await prisma.branch.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' }
        });
        return { success: true, branches };
    } catch (error: any) {
        console.error('[getBranchesForReports] Error:', error);
        return { success: false, branches: [] };
    }
}, { permission: PERMISSIONS.REPORTS_VIEW, requireCSRF: false });
