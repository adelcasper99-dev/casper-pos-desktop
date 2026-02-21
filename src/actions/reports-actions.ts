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

        // 📊 REVENUE: Sales
        const sales = await prisma.sale.findMany({
            where: {
                createdAt: { gte: startDate, lte: endDate },
                status: { not: 'REFUNDED' },
                warehouse: branchFilter.branchId ? { branchId: branchFilter.branchId } : undefined
            },
            include: {
                warehouse: { include: { branch: true } }
            }
        });

        // 💰 EXPENSES
        const expenses = await prisma.expense.findMany({
            where: {
                date: { gte: startDate, lte: endDate }
            }
        });

        // 📦 PURCHASES
        const purchases = await prisma.purchaseInvoice.findMany({
            where: {
                purchaseDate: { gte: startDate, lte: endDate },
                status: { not: 'VOIDED' },
                warehouse: branchFilter.branchId ? { branchId: branchFilter.branchId } : undefined
            },
            include: {
                warehouse: { include: { branch: true } }
            }
        });

        // Calculate Totals
        const totalSalesRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
        const totalRevenue = totalSalesRevenue;

        const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
        const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);

        const netProfit = totalRevenue - totalExpenses - totalPurchases;

        // 📈 TREND DATA: Daily Revenue
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        const trendData = daysInRange.map(day => {
            const dayStart = startOfDay(day);
            const dayEnd = endOfDay(day);

            const daySales = sales.filter(s => s.createdAt >= dayStart && s.createdAt <= dayEnd);
            const dayRevenue = daySales.reduce((sum, s) => sum + Number(s.totalAmount), 0);

            return {
                date: format(day, 'yyyy-MM-dd'),
                revenue: dayRevenue
            };
        });

        // 📋 DETAILED TRANSACTIONS
        const transactions = [
            ...sales.map(s => ({
                id: s.id,
                date: s.createdAt.toISOString(),
                type: 'SALE',
                amount: Number(s.totalAmount),
                branch: s.warehouse?.branch?.name ?? 'الفرع الرئيسي',
                method: s.paymentMethod
            })),
            ...purchases.map(p => ({
                id: p.id,
                date: p.purchaseDate.toISOString(),
                type: 'PURCHASE',
                amount: -Number(p.totalAmount),
                branch: p.warehouse?.branch?.name ?? 'الفرع الرئيسي',
                method: p.paymentMethod
            })),
            ...expenses.map(e => ({
                id: e.id,
                date: e.date.toISOString(),
                type: 'EXPENSE',
                amount: -Number(e.amount),
                description: e.description,
                category: e.category,
                method: e.paymentMethod
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
            success: true,
            data: {
                kpis: {
                    totalRevenue,
                    totalExpenses,
                    totalPurchases,
                    netProfit,
                    count: sales.length
                },
                trendData,
                transactions
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
