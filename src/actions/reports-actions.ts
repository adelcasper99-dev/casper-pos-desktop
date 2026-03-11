'use server';

import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays, eachDayOfInterval, format } from 'date-fns';


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
        let totalSalesRevenue = 0;
        let totalCOGS = 0;
        let saleCount = 0;
        let totalExpenses = 0;
        let totalPurchases = 0;

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

        const totalTicketRevenue = tickets.reduce((sum, t) => sum + Number(t.repairPrice), 0);
        const totalTicketPartsCost = tickets.reduce((sum, t) => sum + Number(t.partsCost || 0), 0);
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

            totalSalesRevenue = filteredItems.reduce((sum, item) => sum + (Number(item.unitPrice) * item.quantity), 0);
            totalCOGS = filteredItems.reduce((sum, item) => sum + (Number(item.unitCost) * item.quantity), 0);
            saleCount = new Set(filteredItems.map(i => i.saleId)).size;

            const expensesAgg = await prisma.expense.aggregate({
                where: { date: { gte: startDate, lte: endDate } },
                _sum: { amount: true }
            });
            totalExpenses = Number(expensesAgg._sum.amount || 0);

            const filteredPurchaseItems = await prisma.purchaseItem.findMany({
                where: {
                    invoice: purchaseWhere,
                    product: filters?.categoryId ? { categoryId: filters.categoryId } : undefined,
                    productId: filters?.productId || undefined
                },
                select: { unitCost: true, quantity: true }
            });
            totalPurchases = filteredPurchaseItems.reduce((sum, item) => sum + (Number(item.unitCost) * item.quantity), 0);

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
            totalSalesRevenue = Number(salesAgg._sum.credit || 0);

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
            totalCOGS = Number(cogsSum._sum.debit || 0);

            // Expenses (5100, 5200, 5300, 5400)
            const expensesAgg = await prisma.journalLine.aggregate({
                where: { account: { code: { in: ['5100', '5200', '5300', '5400'] } }, journalEntry: baseJournalEntryWhere },
                _sum: { debit: true }
            });
            totalExpenses = Number(expensesAgg._sum.debit || 0);

            // Purchases (1200)
            const purchasesAgg = await prisma.journalLine.aggregate({
                where: {
                    account: { code: '1200' },
                    journalEntry: { ...baseJournalEntryWhere, purchaseId: { not: null } }
                },
                _sum: { debit: true }
            });
            totalPurchases = Number(purchasesAgg._sum.debit || 0);
        }

        // ─────────────────────────────────────────────────────────────────────
        // 🎯 COMBINED KPIs
        // ─────────────────────────────────────────────────────────────────────
        const totalRevenue = totalSalesRevenue + totalTicketRevenue;
        const netProfit = totalRevenue - totalExpenses - totalCOGS - totalTicketPartsCost;

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
                    .reduce((sum, item) => sum + (Number(item.unitPrice) * item.quantity), 0);
                const dayMaint = tickets
                    .filter(t => t.createdAt >= dayStart && t.createdAt <= dayEnd)
                    .reduce((sum, t) => sum + Number(t.repairPrice), 0);
                return { date: format(day, 'yyyy-MM-dd'), revenue: dayPOS + dayMaint, posRevenue: dayPOS, maintenanceRevenue: dayMaint };
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
                    .reduce((sum, line) => sum + Number(line.credit || 0), 0);
                const dayMaint = tickets
                    .filter(t => t.createdAt >= dayStart && t.createdAt <= dayEnd)
                    .reduce((sum, t) => sum + Number(t.repairPrice), 0);
                return { date: format(day, 'yyyy-MM-dd'), revenue: dayPOS + dayMaint, posRevenue: dayPOS, maintenanceRevenue: dayMaint };
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
                include: { warehouse: { include: { branch: true } } },
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
                include: { warehouse: { include: { branch: true } } },
                orderBy: { purchaseDate: 'desc' }
            });
            const recentExpenses = await prisma.expense.findMany({ where: expenseWhere, orderBy: { date: 'desc' }, take: TAKE_LIMIT });

            transactions = [
                ...recentSales.map(s => ({ id: s.id, date: s.createdAt.toISOString(), type: 'SALE', amount: Number(s.totalAmount), branch: s.warehouse?.branch?.name ?? 'الفرع الرئيسي', method: s.paymentMethod })),
                ...recentPurchases.map(p => ({ id: p.id, date: p.purchaseDate.toISOString(), type: 'PURCHASE', amount: -Number(p.totalAmount), branch: p.warehouse?.branch?.name ?? 'الفرع الرئيسي', method: p.paymentMethod })),
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
                    sale: { include: { warehouse: { include: { branch: true } } } },
                    purchase: { include: { warehouse: { include: { branch: true } } } },
                    lines: true
                },
                orderBy: { date: 'desc' },
                take: TAKE_LIMIT
            });

            const ledgerTx = recentEntries.map(entry => {
                let type = 'JOURNAL', amount = 0, branch = 'الفرع الرئيسي', method = 'دفتر القيود', description = entry.description;
                if (entry.sale) {
                    type = 'SALE'; branch = entry.sale.warehouse?.branch?.name ?? branch; method = entry.sale.paymentMethod;
                    amount = Number(entry.lines.find(l => l.accountId === '4000')?.credit || entry.sale.totalAmount);
                } else if (entry.purchase) {
                    type = 'PURCHASE'; branch = entry.purchase.warehouse?.branch?.name ?? branch; method = entry.purchase.paymentMethod;
                    amount = -Number(entry.lines.find(l => l.accountId === '1200')?.debit || entry.purchase.totalAmount);
                } else {
                    if (entry.lines.some(l => ['5100', '5200', '5300', '5400'].includes(l.accountId) && l.debit.greaterThan(0))) {
                        type = 'EXPENSE'; amount = -Number(entry.lines.find(l => ['5100', '5200', '5300', '5400'].includes(l.accountId))?.debit || 0);
                    } else {
                        amount = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
                    }
                }
                return { id: entry.id, date: entry.date.toISOString(), type, amount, branch, method, description, reference: entry.reference };
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
                    totalRevenue,
                    netProfit,
                    totalExpenses,
                    totalPurchases,
                    count: saleCount + ticketCount,
                    // Separated
                    posRevenue: totalSalesRevenue,
                    maintenanceRevenue: totalTicketRevenue,
                    maintenancePartsCost: totalTicketPartsCost,
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
