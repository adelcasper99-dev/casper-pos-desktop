'use server';

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { startOfDay, endOfDay, subDays, eachDayOfInterval, format } from 'date-fns';

interface ReportFilters {
    startDate?: string;
    endDate?: string;
    branchId?: string;
}

export async function getReportData(filters?: ReportFilters): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const now = new Date();
        const defaultStart = subDays(now, 30);
        const defaultEnd = now;

        const startDate = filters?.startDate
            ? startOfDay(new Date(filters.startDate))
            : startOfDay(defaultStart);
        const endDate = filters?.endDate
            ? endOfDay(new Date(filters.endDate))
            : endOfDay(defaultEnd);

        const branchFilter = filters?.branchId ? { branchId: filters.branchId } : {};

        // 📊 REVENUE: Sales Aggregation
        const saleWhere = {
            createdAt: { gte: startDate, lte: endDate },
            status: { not: 'REFUNDED' },
            warehouse: branchFilter.branchId ? { branchId: branchFilter.branchId } : undefined
        };

        const salesAgg = await prisma.sale.aggregate({
            where: saleWhere,
            _sum: { totalAmount: true },
            _count: { id: true }
        });

        // 💰 EXPENSES Aggregation
        const expenseWhere = {
            date: { gte: startDate, lte: endDate }
        };

        const expensesAgg = await prisma.expense.aggregate({
            where: expenseWhere,
            _sum: { amount: true }
        });

        // 📦 PURCHASES Aggregation
        const purchaseWhere = {
            purchaseDate: { gte: startDate, lte: endDate },
            status: { not: 'VOIDED' },
            warehouse: branchFilter.branchId ? { branchId: branchFilter.branchId } : undefined
        };

        const purchasesAgg = await prisma.purchaseInvoice.aggregate({
            where: purchaseWhere,
            _sum: { totalAmount: true }
        });

        // Calculate Totals exactly at DB level
        const totalSalesRevenue = Number(salesAgg._sum.totalAmount || 0);
        const totalRevenue = totalSalesRevenue;
        const totalExpenses = Number(expensesAgg._sum.amount || 0);
        const totalPurchases = Number(purchasesAgg._sum.totalAmount || 0);
        const netProfit = totalRevenue - totalExpenses - totalPurchases;

        // 📈 TREND DATA: Daily Revenue (Lightweight fetch)
        const salesForTrend = await prisma.sale.findMany({
            where: saleWhere,
            select: { createdAt: true, totalAmount: true }
        });

        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        const trendData = daysInRange.map(day => {
            const dayStart = startOfDay(day);
            const dayEnd = endOfDay(day);

            const daySales = salesForTrend.filter(s => s.createdAt >= dayStart && s.createdAt <= dayEnd);
            const dayRevenue = daySales.reduce((sum, s) => sum + Number(s.totalAmount), 0);

            return {
                date: format(day, 'yyyy-MM-dd'),
                revenue: dayRevenue
            };
        });

        // 📋 DETAILED TRANSACTIONS (Paginated & Lightweight)
        const TAKE_LIMIT = 50;

        const recentSales = await prisma.sale.findMany({
            where: saleWhere,
            include: { warehouse: { include: { branch: true } } },
            orderBy: { createdAt: 'desc' },
            take: TAKE_LIMIT
        });

        const recentPurchases = await prisma.purchaseInvoice.findMany({
            where: purchaseWhere,
            include: { warehouse: { include: { branch: true } } },
            orderBy: { purchaseDate: 'desc' },
            take: TAKE_LIMIT
        });

        const recentExpenses = await prisma.expense.findMany({
            where: expenseWhere,
            orderBy: { date: 'desc' },
            take: TAKE_LIMIT
        });

        const transactions = [
            ...recentSales.map(s => ({
                id: s.id,
                date: s.createdAt.toISOString(),
                type: 'SALE',
                amount: Number(s.totalAmount),
                branch: s.warehouse?.branch?.name ?? 'الفرع الرئيسي',
                method: s.paymentMethod
            })),
            ...recentPurchases.map(p => ({
                id: p.id,
                date: p.purchaseDate.toISOString(),
                type: 'PURCHASE',
                amount: -Number(p.totalAmount),
                branch: p.warehouse?.branch?.name ?? 'الفرع الرئيسي',
                method: p.paymentMethod
            })),
            ...recentExpenses.map(e => ({
                id: e.id,
                date: e.date.toISOString(),
                type: 'EXPENSE',
                amount: -Number(e.amount),
                description: e.description,
                category: e.category,
                method: e.paymentMethod
            }))
        ]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, TAKE_LIMIT);

        const recentAuditLogs = await prisma.auditLog.findMany({
            where: { createdAt: { gte: startDate, lte: endDate } },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        return {
            success: true,
            data: {
                kpis: {
                    totalRevenue,
                    totalExpenses,
                    totalPurchases,
                    netProfit,
                    count: Number(salesAgg._count.id || 0)
                },
                trendData,
                transactions,
                auditLogs: recentAuditLogs.map(l => ({
                    id: l.id,
                    action: l.action,
                    entity: l.entityType,
                    reason: l.reason,
                    date: l.createdAt.toISOString()
                }))
            }
        };
    } catch (error: any) {
        console.error('[getReportData] Error:', error);
        return { success: false, error: error.message };
    }
}

export async function getBranchesForFilter(): Promise<{ success: boolean; branches: any[] }> {
    try {
        const branches = await prisma.branch.findMany({
            select: { id: true, name: true },
            orderBy: { name: 'asc' }
        });

        return { success: true, branches };
    } catch (error: any) {
        console.error('[getBranchesForFilter] Error:', error);
        return { success: false, branches: [] };
    }
}
