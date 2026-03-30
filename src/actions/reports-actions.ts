'use server';

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { startOfDay, endOfDay, subDays, eachDayOfInterval, format } from 'date-fns';
import { ALL_EXPENSE_CODES } from "@/lib/accounting/constants";


interface ReportFilters {
    startDate?: string;
    endDate?: string;
    branchId?: string;
    categoryId?: string;
    productId?: string;
    sortBy?: string;
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
        const categoryFilter = filters?.categoryId ? { product: { categoryId: filters.categoryId } } : {};
        const productFilter = filters?.productId ? { productId: filters.productId } : {};
        const ticketBranchFilter = filters?.branchId ? { currentBranchId: filters.branchId } : {};

        // ─────────────────────────────────────────────────────────────────────
        // 📦 POS REVENUE: Sales
        // ─────────────────────────────────────────────────────────────────────

        let totalSalesRevenue = new Decimal(0);
        let totalCOGS = new Decimal(0);
        let saleCount = 0;
        let totalExpenses = new Decimal(0);
        let totalPurchases = new Decimal(0);

        const saleWhere: any = {
            createdAt: { gte: startDate, lte: endDate },
            status: { not: 'REFUNDED' },
            warehouse: branchFilter.branchId ? { branchId: branchFilter.branchId } : undefined
        };

        const purchaseWhere: any = {
            purchaseDate: { gte: startDate, lte: endDate },
            status: { not: 'VOIDED' },
            warehouse: branchFilter.branchId ? { branchId: branchFilter.branchId } : undefined
        };

        const expenseWhere = {
            date: { gte: startDate, lte: endDate }
        };

        // ─────────────────────────────────────────────────────────────────────
        // 🔧 MAINTENANCE REVENUE: Tickets (DELIVERED or PAID_DELIVERED)
        // ─────────────────────────────────────────────────────────────────────
        // R-01: Source Service Revenue strictly from GL (4100) to ensure P&L matching
        const { AccountingEngine } = await import("@/lib/accounting/transaction-factory");
        const serviceRevenueCode = '4100';
        
        // Find the account ID for 4100
        const serviceRevenueAcc = await prisma.account.findFirst({
            where: { code: serviceRevenueCode }
        });
        
        let totalTicketRevenue = new Decimal(0);
        if (serviceRevenueAcc) {
            // Sum all credits (revenue) minus debits (refunds/voids) to 4100 within date range
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
            totalTicketRevenue = new Decimal(serviceMvmt._sum.credit?.toString() || '0')
                .minus(serviceMvmt._sum.debit?.toString() || '0');
        }

        const tickets = await prisma.ticket.findMany({
            where: {
                createdAt: { gte: startDate, lte: endDate },
                status: { in: ['DELIVERED', 'PAID_DELIVERED', 'CLOSED'] },
                deletedAt: null,
                ...ticketBranchFilter
            },
            select: {
                id: true,
                repairPrice: true,
                partsCost: true,
                createdAt: true,
                currentBranchId: true,
                currentBranch: { select: { name: true } }
            }
        });

        const totalTicketPartsCost = tickets.reduce((sum, t) => sum.plus(new Decimal(t.partsCost ? String(t.partsCost) : '0')), new Decimal(0));
        const ticketCount = tickets.length;

        if (filters?.categoryId || filters?.productId) {
            // -------------------------------------------------------------
            // ITEM AGGREGATION FALLBACK (if Category or Product Filtered)
            // -------------------------------------------------------------
            const filteredItems = await prisma.saleItem.findMany({
                where: {
                    sale: saleWhere,
                    ...categoryFilter,
                    ...productFilter
                },
                select: { unitPrice: true, unitCost: true, quantity: true, saleId: true }
            });

            totalSalesRevenue = filteredItems.reduce((sum, item) => sum.plus(new Decimal(String(item.unitPrice)).times(item.quantity)), new Decimal(0));
            totalCOGS = filteredItems.reduce((sum, item) => sum.plus(new Decimal(String(item.unitCost)).times(item.quantity)), new Decimal(0));
            saleCount = new Set(filteredItems.map(i => i.saleId)).size;

            const expensesAgg = await prisma.expense.aggregate({
                where: { date: { gte: startDate, lte: endDate } },
                _sum: { amount: true }
            });
            totalExpenses = new Decimal(expensesAgg._sum.amount?.toString() || '0');

            const filteredPurchaseItems = await prisma.purchaseItem.findMany({
                where: {
                    invoice: purchaseWhere,
                    product: filters?.categoryId ? { categoryId: filters.categoryId } : undefined,
                    productId: filters?.productId || undefined
                },
                select: { unitCost: true, quantity: true }
            });
            totalPurchases = filteredPurchaseItems.reduce((sum, item) => sum.plus(new Decimal(String(item.unitCost)).times(item.quantity)), new Decimal(0));

        } else {
            // -------------------------------------------------------------
            // LEDGER AGGREGATION (Default - No Item Filters)
            // -------------------------------------------------------------
            const baseJournalEntryWhere = {
                date: { gte: startDate, lte: endDate },
                ...(branchFilter.branchId ? {
                    OR: [
                        { sale: { warehouse: { branchId: branchFilter.branchId } } },
                        { purchase: { warehouse: { branchId: branchFilter.branchId } } },
                    ]
                } : {})
            };

            // Sales (4000)
            const salesAgg = await prisma.journalLine.aggregate({
                where: { account: { code: '4000' }, journalEntry: baseJournalEntryWhere },
                _sum: { credit: true }
            });
            totalSalesRevenue = new Decimal(salesAgg._sum.credit?.toString() || '0');

            const saleCountAgg = await prisma.sale.aggregate({
                where: saleWhere,
                _count: { id: true }
            });
            saleCount = Number(saleCountAgg._count.id || 0);

            // COGS (5000) — POS only
            const cogsSum = await prisma.journalLine.aggregate({
                where: { account: { code: '5000' }, journalEntry: baseJournalEntryWhere },
                _sum: { debit: true }
            });
            totalCOGS = new Decimal(cogsSum._sum.debit?.toString() || '0');

            // Expenses (All sub-accounts)
            const expensesAgg = await prisma.journalLine.aggregate({
                where: { account: { code: { in: ALL_EXPENSE_CODES } }, journalEntry: baseJournalEntryWhere },
                _sum: { debit: true }
            });
            totalExpenses = new Decimal(expensesAgg._sum.debit?.toString() || '0');

            // Purchases (1200)
            const purchasesAgg = await prisma.journalLine.aggregate({
                where: {
                    account: { code: '1200' },
                    journalEntry: { ...baseJournalEntryWhere, purchaseId: { not: null } }
                },
                _sum: { debit: true }
            });
            totalPurchases = new Decimal(purchasesAgg._sum.debit?.toString() || '0');
        }

        // ─────────────────────────────────────────────────────────────────────
        // 🎯 COMBINED KPIs (Using Decimal for precision)
        // ─────────────────────────────────────────────────────────────────────
        const totalRevenueDec = totalSalesRevenue.plus(totalTicketRevenue);
        let netProfitDec = totalRevenueDec
            .minus(totalExpenses)
            .minus(totalCOGS);

        // R-01: Only subtract parts cost separately if it's NOT already in totalCOGS
        // (Leger aggregation for Account 5000 already includes Maintenance COGS)
        if (filters?.categoryId || filters?.productId) {
            netProfitDec = netProfitDec.minus(totalTicketPartsCost);
        }

        // ─────────────────────────────────────────────────────────────────────
        // 📈 TREND DATA: Daily Revenue (POS + Maintenance)
        // ─────────────────────────────────────────────────────────────────────
        let trendData: any[] = [];
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });

        if (filters?.categoryId || filters?.productId) {
            const filteredItemsForTrend = await prisma.saleItem.findMany({
                where: {
                    sale: saleWhere,
                    ...categoryFilter,
                    ...productFilter
                },
                include: { sale: { select: { createdAt: true } } }
            });

            trendData = daysInRange.map(day => {
                const dayStart = startOfDay(day);
                const dayEnd = endOfDay(day);
                const dayPOS = filteredItemsForTrend
                    .filter(item => item.sale.createdAt >= dayStart && item.sale.createdAt <= dayEnd)
                    .reduce((sum: Decimal, item) => sum.plus(new Decimal(String(item.unitPrice)).times(item.quantity)), new Decimal(0));
                const dayMaint = tickets
                    .filter(t => t.createdAt >= dayStart && t.createdAt <= dayEnd)
                    .reduce((sum: Decimal, t) => sum.plus(new Decimal(String(t.repairPrice || 0))), new Decimal(0));
                return { date: format(day, 'yyyy-MM-dd'), revenue: dayPOS.plus(dayMaint).toNumber(), posRevenue: dayPOS.toNumber(), maintenanceRevenue: dayMaint.toNumber() };
            });
        } else {
            const baseJournalEntryWhereForTrend = {
                date: { gte: startDate, lte: endDate },
                ...(branchFilter.branchId ? {
                    OR: [
                        { sale: { warehouse: { branchId: branchFilter.branchId } } },
                        { purchase: { warehouse: { branchId: branchFilter.branchId } } }
                    ]
                } : {})
            };

            const journalLinesForTrend = await prisma.journalLine.findMany({
                where: {
                    account: { code: '4000' },
                    journalEntry: baseJournalEntryWhereForTrend
                },
                select: { credit: true, journalEntry: { select: { date: true } } }
            });

            trendData = daysInRange.map(day => {
                const dayStart = startOfDay(day);
                const dayEnd = endOfDay(day);
                const dayPOS = journalLinesForTrend
                    .filter(line => line.journalEntry.date >= dayStart && line.journalEntry.date <= dayEnd)
                    .reduce((sum: Decimal, line) => sum.plus(new Decimal(String(line.credit || 0))), new Decimal(0));
                const dayMaint = tickets
                    .filter(t => t.createdAt >= dayStart && t.createdAt <= dayEnd)
                    .reduce((sum: Decimal, t) => sum.plus(new Decimal(String(t.repairPrice || 0))), new Decimal(0));
                return { date: format(day, 'yyyy-MM-dd'), revenue: dayPOS.plus(dayMaint).toNumber(), posRevenue: dayPOS.toNumber(), maintenanceRevenue: dayMaint.toNumber() };
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // 📋 DETAILED TRANSACTIONS (POS + Maintenance)
        // ─────────────────────────────────────────────────────────────────────
        const TAKE_LIMIT = 50;
        let transactions: any[] = [];

        if (filters?.categoryId || filters?.productId) {
            const saleIdsWithItems = await prisma.saleItem.findMany({
                where: { sale: saleWhere, ...categoryFilter, ...productFilter },
                select: { saleId: true },
                distinct: ['saleId'],
                take: TAKE_LIMIT
            });
            const recentSales = await prisma.sale.findMany({
                where: { id: { in: saleIdsWithItems.map(i => i.saleId) } },
                select: { id: true, createdAt: true, isReturn: true, totalAmount: true, paymentMethod: true, warehouse: { include: { branch: true } } },
                orderBy: { createdAt: 'desc' }
            });

            const purchaseIdsWithItems = await prisma.purchaseItem.findMany({
                where: {
                    invoice: purchaseWhere,
                    product: filters?.categoryId ? { categoryId: filters.categoryId } : undefined,
                    productId: filters?.productId || undefined
                },
                select: { purchaseInvoiceId: true },
                distinct: ['purchaseInvoiceId'],
                take: TAKE_LIMIT
            });
            const recentPurchases = await prisma.purchaseInvoice.findMany({
                where: { id: { in: purchaseIdsWithItems.map(i => i.purchaseInvoiceId) } },
                select: { id: true, purchaseDate: true, isReturn: true, totalAmount: true, paymentMethod: true, warehouse: { include: { branch: true } } },
                orderBy: { purchaseDate: 'desc' }
            });
            const recentExpenses = await prisma.expense.findMany({ where: expenseWhere, orderBy: { date: 'desc' }, take: TAKE_LIMIT });

            transactions = [
                ...recentSales.map(s => ({ id: s.id, date: s.createdAt.toISOString(), type: 'SALE', isReturn: (s as any).isReturn, amount: Number(s.totalAmount), branch: s.warehouse?.branch?.name ?? 'الفرع الرئيسي', method: s.paymentMethod })),
                ...recentPurchases.map(p => ({ id: p.id, date: p.purchaseDate.toISOString(), type: 'PURCHASE', isReturn: (p as any).isReturn, amount: -Number(p.totalAmount), branch: p.warehouse?.branch?.name ?? 'الفرع الرئيسي', method: p.paymentMethod })),
                ...recentExpenses.map(e => ({ id: e.id, date: e.date.toISOString(), type: 'EXPENSE', amount: -Number(e.amount), description: e.description, category: e.category, method: e.paymentMethod })),
                ...tickets.slice(0, TAKE_LIMIT).map(t => ({ id: t.id, date: t.createdAt.toISOString(), type: 'MAINTENANCE', amount: Number(t.repairPrice), branch: t.currentBranch?.name ?? 'الفرع الرئيسي', method: 'صيانة' }))
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, TAKE_LIMIT);

        } else {
            const baseJournalEntryWhereForList = {
                date: { gte: startDate, lte: endDate },
                ...(branchFilter.branchId ? {
                    OR: [
                        { sale: { warehouse: { branchId: branchFilter.branchId } } },
                        { purchase: { warehouse: { branchId: branchFilter.branchId } } }
                    ]
                } : {})
            };

            const recentEntries = await prisma.journalEntry.findMany({
                where: baseJournalEntryWhereForList,
                include: {
                    sale: { select: { isReturn: true, warehouse: { include: { branch: true } }, paymentMethod: true, totalAmount: true } },
                    purchase: { select: { isReturn: true, warehouse: { include: { branch: true } }, paymentMethod: true, totalAmount: true } },
                    lines: { include: { account: true } }
                },
                orderBy: { date: 'desc' },
                take: TAKE_LIMIT
            });

            const ledgerTx = recentEntries.map(entry => {
                let type = 'JOURNAL', amount = 0, branch = 'الفرع الرئيسي', method = 'دفتر القيود', description = entry.description;
                if (entry.sale) {
                    type = 'SALE'; branch = entry.sale.warehouse?.branch?.name ?? branch; method = entry.sale.paymentMethod;
                    amount = Number(entry.lines.find(l => l.account?.code === '4000')?.credit || entry.sale.totalAmount);
                } else if (entry.purchase) {
                    type = 'PURCHASE'; branch = entry.purchase.warehouse?.branch?.name ?? branch; method = entry.purchase.paymentMethod;
                    amount = -Number(entry.lines.find(l => l.account?.code === '1200')?.debit || entry.purchase.totalAmount);
                } else {
                    if (entry.lines.some(l => ALL_EXPENSE_CODES.includes(l.account?.code || '') && l.debit.greaterThan(0))) {
                        type = 'EXPENSE'; amount = -Number(entry.lines.find(l => ALL_EXPENSE_CODES.includes(l.account?.code || ''))?.debit || 0);
                    } else if (entry.lines.some(l => l.account?.code === '4400' && l.credit.greaterThan(0))) {
                        type = 'INCOME'; amount = Number(entry.lines.find(l => l.account?.code === '4400')?.credit || 0);
                    } else {
                        amount = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
                    }
                }
                return { id: entry.id, date: entry.date.toISOString(), type, isReturn: entry.sale?.isReturn || entry.purchase?.isReturn || false, amount, branch, method, description, reference: entry.reference };
            });

            const maintenanceTx = tickets.slice(0, TAKE_LIMIT).map(t => ({
                id: t.id,
                date: t.createdAt.toISOString(),
                type: 'MAINTENANCE',
                amount: Number(t.repairPrice),
                branch: t.currentBranch?.name ?? 'الفرع الرئيسي',
                method: 'صيانة',
                description: `تذكرة صيانة`
            }));

            transactions = [...ledgerTx, ...maintenanceTx]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, TAKE_LIMIT);
        }

        const recentAuditLogs = await prisma.auditLog.findMany({
            where: { createdAt: { gte: startDate, lte: endDate } },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        return {
            success: true,
            data: {
                kpis: {
                    // Combined
                    totalRevenue: totalRevenueDec.toNumber(),
                    netProfit: netProfitDec.toNumber(),
                    totalExpenses: totalExpenses.toNumber(),
                    totalCOGS: totalCOGS.toNumber(),
                    totalPurchases: totalPurchases.toNumber(),
                    count: saleCount + ticketCount,
                    // Separated
                    posRevenue: totalSalesRevenue.toNumber(),
                    maintenanceRevenue: totalTicketRevenue.toNumber(),
                    maintenancePartsCost: totalTicketPartsCost.toNumber(),
                    posCount: saleCount,
                    maintenanceCount: ticketCount,
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

export async function getSalesByProductAndCategory(
    filters?: ReportFilters
): Promise<{ success: boolean; byProduct?: any[]; byCategory?: any[]; error?: string }> {
    try {
        const now = new Date();
        const defaultStart = subDays(now, 30);

        const startDate = filters?.startDate
            ? startOfDay(new Date(filters.startDate))
            : startOfDay(defaultStart);
        const endDate = filters?.endDate
            ? endOfDay(new Date(filters.endDate))
            : endOfDay(now);

        const branchFilter = filters?.branchId ? { branchId: filters.branchId } : {};

        // Fetch all SaleItems in range (non-refunded sales only)
        const saleItems = await prisma.saleItem.findMany({
            where: {
                sale: {
                    createdAt: { gte: startDate, lte: endDate },
                    status: { not: 'REFUNDED' },
                    ...branchFilter
                },
                ...(filters?.productId ? { productId: filters.productId } : {}),
                ...(filters?.categoryId ? { product: { categoryId: filters.categoryId } } : {})
            },
            include: {
                product: {
                    include: {
                        category: { select: { id: true, name: true, color: true } }
                    }
                }
            }
        });

        // Aggregate by Product
        const productMap = new Map<string, {
            productId: string; name: string; sku: string;
            categoryName: string; categoryColor: string;
            totalQty: number; totalRevenue: number; totalCost: number;
        }>();

        for (const item of saleItems) {
            const key = item.productId;
            const existing = productMap.get(key);
            const rev = Number(item.unitPrice) * item.quantity;
            const cost = Number(item.unitCost) * item.quantity;
            if (existing) {
                existing.totalQty += item.quantity;
                existing.totalRevenue += rev;
                existing.totalCost += cost;
            } else {
                productMap.set(key, {
                    productId: item.productId,
                    name: item.product.name,
                    sku: item.product.sku,
                    categoryName: item.product.category?.name ?? 'بدون فئة',
                    categoryColor: item.product.category?.color ?? '#555',
                    totalQty: item.quantity,
                    totalRevenue: rev,
                    totalCost: cost,
                });
            }
        }

        const sortBy = filters?.sortBy || 'revenue';

        const sortFn = (a: any, b: any) => {
            if (sortBy === 'qty') return b.totalQty - a.totalQty;
            if (sortBy === 'profit') {
                const profitA = a.totalRevenue - a.totalCost;
                const profitB = b.totalRevenue - b.totalCost;
                return profitB - profitA;
            }
            if (sortBy === 'name') return (a.name || a.categoryName).localeCompare(b.name || b.categoryName);
            return b.totalRevenue - a.totalRevenue; // Default: revenue
        };

        const byProduct = Array.from(productMap.values()).sort(sortFn);

        // Aggregate by Category
        const categoryMap = new Map<string, {
            categoryName: string; categoryColor: string;
            totalQty: number; totalRevenue: number; totalCost: number; productCount: number;
        }>();

        for (const row of byProduct) {
            const key = row.categoryName;
            const existing = categoryMap.get(key);
            if (existing) {
                existing.totalQty += row.totalQty;
                existing.totalRevenue += row.totalRevenue;
                existing.totalCost += row.totalCost;
                existing.productCount += 1;
            } else {
                categoryMap.set(key, {
                    categoryName: row.categoryName,
                    categoryColor: row.categoryColor,
                    totalQty: row.totalQty,
                    totalRevenue: row.totalRevenue,
                    totalCost: row.totalCost,
                    productCount: 1,
                });
            }
        }

        const byCategory = Array.from(categoryMap.values()).sort(sortFn);

        return { success: true, byProduct, byCategory };
    } catch (error: any) {
        console.error('[getSalesByProductAndCategory] Error:', error);
        return { success: false, error: error.message };
    }
}

export async function getCategoriesForFilter(): Promise<{ success: boolean; categories: any[] }> {
    try {
        const categories = await prisma.category.findMany({
            select: { id: true, name: true },
            orderBy: { name: 'asc' }
        });
        return { success: true, categories };
    } catch (error: any) {
        console.error('[getCategoriesForFilter] Error:', error);
        return { success: false, categories: [] };
    }
}

export async function getProductsForFilter(): Promise<{ success: boolean; products: any[] }> {
    try {
        const products = await prisma.product.findMany({
            select: { id: true, name: true, sku: true },
            orderBy: { name: 'asc' }
        });
        return { success: true, products };
    } catch (error: any) {
        console.error('[getProductsForFilter] Error:', error);
        return { success: false, products: [] };
    }
}
