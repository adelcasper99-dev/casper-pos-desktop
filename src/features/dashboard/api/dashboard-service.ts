"use server";

import { prisma } from "@/lib/prisma";
import {
    DashboardFilterParams,
    FinancialDashboardMetrics,
    PaymentBreakdownItem,
    DailyTrendItem,
    TopProductItem,
    LowStockItem,
    ActiveShiftSummary,
    RecentTransactionItem
} from "../types";
import { ALL_EXPENSE_CODES } from "@/lib/accounting/constants";
import { getCurrentUser } from "@/actions/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import Decimal from "decimal.js";
import {
    calculateProfitMargin,
    calculateAOV,
    isProductLowStock,
    getTimezoneDateBounds
} from "../utils/dashboard-calculations";
import { startOfDay, eachDayOfInterval, format } from "date-fns";

export async function getFinancialDashboardMetrics(
    params: DashboardFilterParams = {}
): Promise<{ success: boolean; data?: FinancialDashboardMetrics; error?: string }> {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
            return { success: false, error: "Unauthorized" };
        }

        // ── Strict Multi-Tenant Gating (Zero fallback to shared 'default') ──
        if (!currentUser.tenantId || typeof currentUser.tenantId !== "string" || currentUser.tenantId.trim() === "") {
            return { success: false, error: "Unauthorized: Missing valid tenant context" };
        }
        const tenantId = currentUser.tenantId.trim();

        const { startDate, endDate, branchId } = params;

        // ── RBAC Authorization: Stable Role Enums & Type-Safe Permissions ──
        const isAdmin = currentUser.isGlobalAdmin === true ||
                        currentUser.role === "ADMIN" ||
                        currentUser.role === "SUPER_ADMIN" ||
                        currentUser.role === "OWNER" ||
                        currentUser.role === "MANAGER";

        const hasFinancialPermission = hasPermission(currentUser.permissions, PERMISSIONS.ACCOUNTING_VIEW) ||
                                       hasPermission(currentUser.permissions, PERMISSIONS.REPORTS_VIEW);

        const canViewConfidentialFinancials = isAdmin || hasFinancialPermission;

        // ── Timezone-Aware Day Boundaries (Cairo Local Standard) ──
        const { startDate: effectiveStartDate, endDate: effectiveEndDate } = getTimezoneDateBounds(startDate, endDate);

        const periodDateFilter: { lte: Date; gte?: Date } = { lte: effectiveEndDate };
        if (effectiveStartDate) {
            periodDateFilter.gte = effectiveStartDate;
        }

        // Branch and Tenant Scoping
        const branchFilter = branchId && branchId !== "all" ? { branchId } : {};
        const tenantFilter = { tenantId };

        // ──────────────────────────────────────────────────────────────────
        // Execute queries in parallel with fault-isolated allSettled
        // ──────────────────────────────────────────────────────────────────
        const [
            kpiResult,
            paymentBreakdownResult,
            topProductsResult,
            lowStockResult,
            activeShiftResult,
            recentTransactionsResult
        ] = await Promise.allSettled([
            // 1. Core Financial Ledger Metrics (All calculations using Decimal.js)
            (async () => {
                const assetAccounts = ['1000', '1010', '1020', '1100', '1200', '1300', '1310', '1350'];
                const assetLines = await prisma.journalLine.aggregate({
                    _sum: { debit: true, credit: true },
                    where: {
                        account: { code: { in: assetAccounts } },
                        journalEntry: {
                            date: { lte: effectiveEndDate },
                            ...tenantFilter
                        }
                    }
                });
                const totalAssetsDec = new Decimal(assetLines._sum.debit?.toString() || '0')
                    .minus(new Decimal(assetLines._sum.credit?.toString() || '0'));

                const allEquityAccounts = await prisma.account.findMany({
                    where: { type: 'EQUITY', ...tenantFilter },
                    select: { code: true }
                });
                const equityCodes = allEquityAccounts.map((a: { code: string }) => a.code);

                const equityLines = await prisma.journalLine.aggregate({
                    _sum: { credit: true, debit: true },
                    where: {
                        account: { code: { in: equityCodes } },
                        journalEntry: {
                            date: { lte: effectiveEndDate },
                            ...tenantFilter
                        }
                    }
                });
                const currentCapitalDec = new Decimal(equityLines._sum.credit?.toString() || '0')
                    .minus(new Decimal(equityLines._sum.debit?.toString() || '0'));

                // Sales: Account 4000
                const salesLines = await prisma.journalLine.aggregate({
                    _sum: { credit: true, debit: true },
                    where: {
                        account: { code: '4000' },
                        journalEntry: {
                            date: periodDateFilter,
                            ...tenantFilter
                        }
                    }
                });
                const periodSalesDec = Decimal.max(
                    0,
                    new Decimal(salesLines._sum.credit?.toString() || '0').minus(new Decimal(salesLines._sum.debit?.toString() || '0'))
                );

                // Maintenance Tickets
                const maintenanceTickets = await prisma.ticket.findMany({
                    where: {
                        status: { in: ['DELIVERED', 'PAID_DELIVERED', 'CLOSED'] },
                        deletedAt: null,
                        ...tenantFilter,
                        ...(branchFilter.branchId ? { currentBranchId: branchFilter.branchId } : {}),
                        createdAt: {
                            ...(effectiveStartDate ? { gte: effectiveStartDate } : {}),
                            lte: effectiveEndDate
                        }
                    },
                    select: { repairPrice: true, partsCost: true }
                });

                const maintenanceRevenueDec = maintenanceTickets.reduce(
                    (sum, t) => sum.plus(new Decimal(t.repairPrice?.toString() || '0')),
                    new Decimal(0)
                );
                const maintenancePartsCostDec = maintenanceTickets.reduce(
                    (sum, t) => sum.plus(new Decimal(t.partsCost?.toString() || '0')),
                    new Decimal(0)
                );
                const maintenanceCount = maintenanceTickets.length;

                // Purchases: Account 1200
                const purchasesLines = await prisma.journalLine.aggregate({
                    _sum: { debit: true },
                    where: {
                        account: { code: '1200' },
                        journalEntry: {
                            date: periodDateFilter,
                            purchaseId: { not: null },
                            ...tenantFilter
                        }
                    }
                });
                const periodPurchasesDec = new Decimal(purchasesLines._sum.debit?.toString() || '0');

                // Expenses
                const expensesLines = await prisma.journalLine.aggregate({
                    _sum: { debit: true },
                    where: {
                        account: { code: { in: ALL_EXPENSE_CODES } },
                        journalEntry: {
                            date: periodDateFilter,
                            ...tenantFilter
                        }
                    }
                });
                const periodExpensesDec = new Decimal(expensesLines._sum.debit?.toString() || '0');

                // COGS: Account 5000
                const cogsLines = await prisma.journalLine.aggregate({
                    _sum: { debit: true },
                    where: {
                        account: { code: '5000' },
                        journalEntry: {
                            date: periodDateFilter,
                            ...tenantFilter
                        }
                    }
                });
                const cogsDec = new Decimal(cogsLines._sum.debit?.toString() || '0');

                const totalRevenueDec = periodSalesDec.plus(maintenanceRevenueDec);
                const netProfitDec = totalRevenueDec
                    .minus(cogsDec)
                    .minus(maintenancePartsCostDec)
                    .minus(periodExpensesDec);

                // Sales count
                const salesCountAgg = await prisma.sale.aggregate({
                    _count: { id: true },
                    where: {
                        createdAt: periodDateFilter,
                        status: { notIn: ['VOIDED', 'REFUNDED'] },
                        ...tenantFilter,
                        ...branchFilter
                    }
                });
                const salesCount = Number(salesCountAgg._count.id || 0);

                return {
                    totalAssets: totalAssetsDec.toDecimalPlaces(2).toNumber(),
                    currentCapital: currentCapitalDec.toDecimalPlaces(2).toNumber(),
                    periodSales: periodSalesDec.toDecimalPlaces(2).toNumber(),
                    periodPurchases: periodPurchasesDec.toDecimalPlaces(2).toNumber(),
                    periodExpenses: periodExpensesDec.toDecimalPlaces(2).toNumber(),
                    maintenanceRevenue: maintenanceRevenueDec.toDecimalPlaces(2).toNumber(),
                    maintenancePartsCost: maintenancePartsCostDec.toDecimalPlaces(2).toNumber(),
                    maintenanceCount,
                    totalRevenue: totalRevenueDec.toDecimalPlaces(2).toNumber(),
                    netProfit: netProfitDec.toDecimalPlaces(2).toNumber(),
                    salesCount
                };
            })(),

            // 2. Payment Methods Breakdown
            (async (): Promise<PaymentBreakdownItem[]> => {
                const payments = await prisma.salePayment.groupBy({
                    by: ['method'],
                    _sum: { amount: true },
                    _count: { id: true },
                    where: {
                        createdAt: periodDateFilter,
                        ...tenantFilter,
                        sale: {
                            status: { notIn: ['VOIDED'] },
                            ...branchFilter
                        }
                    }
                });

                const methodLabels: Record<string, string> = {
                    CASH: "نقدي (كاش)",
                    CARD: "شبكة / بطاقات",
                    VISA: "فيزا / بطاقة",
                    MASTERCARD: "ماستركارد",
                    INSTAPAY: "إنستاباي",
                    WALLET: "محفظة إلكترونية",
                    CREDIT: "آجل (عملاء)",
                    STORE_CREDIT: "رصيد متجر",
                    OTHER: "أخرى"
                };

                return payments.map(p => ({
                    method: p.method,
                    label: methodLabels[p.method.toUpperCase()] || p.method,
                    amount: new Decimal(p._sum.amount?.toString() || '0').toDecimalPlaces(2).toNumber(),
                    count: p._count.id
                }));
            })(),

            // 3. Top 5 Best-Selling Products
            (async (): Promise<TopProductItem[]> => {
                const saleItems = await prisma.saleItem.findMany({
                    where: {
                        ...tenantFilter,
                        sale: {
                            createdAt: periodDateFilter,
                            status: { notIn: ['VOIDED'] },
                            ...branchFilter
                        }
                    },
                    select: {
                        productId: true,
                        quantity: true,
                        refundedQty: true,
                        unitPrice: true,
                        product: { select: { name: true } }
                    },
                    take: 250
                });

                const productAggMap = new Map<string, { name: string; quantity: Decimal; revenue: Decimal }>();

                for (const item of saleItems) {
                    const validQty = new Decimal(item.quantity.toString()).minus(new Decimal(item.refundedQty?.toString() || '0'));
                    if (validQty.lessThanOrEqualTo(0)) continue;

                    const price = new Decimal(item.unitPrice.toString());
                    const itemRevenue = validQty.times(price);

                    const existing = productAggMap.get(item.productId);
                    if (existing) {
                        existing.quantity = existing.quantity.plus(validQty);
                        existing.revenue = existing.revenue.plus(itemRevenue);
                    } else {
                        productAggMap.set(item.productId, {
                            name: item.product?.name || "منتج غير معروف",
                            quantity: validQty,
                            revenue: itemRevenue
                        });
                    }
                }

                const sorted = Array.from(productAggMap.entries())
                    .map(([id, data]) => ({
                        id,
                        name: data.name,
                        quantity: data.quantity.toNumber(),
                        revenue: data.revenue.toDecimalPlaces(2).toNumber()
                    }))
                    .sort((a, b) => b.revenue - a.revenue)
                    .slice(0, 5);

                return sorted;
            })(),

            // 4. Low Stock Alerts (Limited to top 5 urgent items)
            (async (): Promise<LowStockItem[]> => {
                const candidates = await prisma.product.findMany({
                    where: {
                        ...tenantFilter,
                        trackStock: true,
                        deletedAt: null,
                        archived: false
                    },
                    select: {
                        id: true,
                        name: true,
                        stock: true,
                        minStock: true
                    },
                    take: 50
                });

                const lowStockList: LowStockItem[] = [];
                for (const item of candidates) {
                    if (isProductLowStock(item.stock?.toString(), item.minStock?.toString(), 5)) {
                        lowStockList.push({
                            id: item.id,
                            name: item.name,
                            stock: Number(item.stock || 0),
                            minStock: Number(item.minStock ?? 5)
                        });
                    }
                    if (lowStockList.length >= 5) break;
                }

                return lowStockList;
            })(),

            // 5. Active Shift Summary
            (async (): Promise<ActiveShiftSummary | null> => {
                const shift = await prisma.shift.findFirst({
                    where: {
                        status: 'OPEN',
                        ...tenantFilter
                    },
                    orderBy: { openedAt: 'desc' },
                    include: {
                        sales: {
                            where: { status: { notIn: ['VOIDED'] } },
                            select: { totalAmount: true, paymentMethod: true }
                        }
                    }
                });

                if (!shift) return null;

                const cashSalesDec = shift.sales
                    .filter(s => s.paymentMethod?.toUpperCase() === 'CASH')
                    .reduce((sum, s) => sum.plus(new Decimal(s.totalAmount.toString())), new Decimal(0));

                return {
                    id: shift.id,
                    cashierName: shift.cashierName || "غير محدد",
                    openedAt: shift.openedAt.toISOString(),
                    startCash: new Decimal(shift.startCash?.toString() || '0').toDecimalPlaces(2).toNumber(),
                    actualCash: new Decimal(shift.actualCash?.toString() || '0').toDecimalPlaces(2).toNumber(),
                    salesCount: shift.sales.length,
                    totalCashSales: cashSalesDec.toDecimalPlaces(2).toNumber()
                };
            })(),

            // 6. Recent Transactions (Top 5)
            (async (): Promise<RecentTransactionItem[]> => {
                const sales = await prisma.sale.findMany({
                    where: {
                        ...tenantFilter,
                        ...branchFilter
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: {
                        id: true,
                        totalAmount: true,
                        paymentMethod: true,
                        status: true,
                        customerName: true,
                        createdAt: true
                    }
                });

                return sales.map(s => ({
                    id: s.id,
                    type: 'SALE',
                    reference: `#${s.id.slice(0, 8)}`,
                    customerName: s.customerName || "عميل نقدي",
                    amount: new Decimal(s.totalAmount.toString()).toDecimalPlaces(2).toNumber(),
                    paymentMethod: s.paymentMethod,
                    status: s.status,
                    createdAt: s.createdAt.toISOString()
                }));
            })()
        ]);

        // ── Unpack allSettled results with fault-isolated fallbacks and structured error logs ──
        if (kpiResult.status === 'rejected') {
            console.error('[DASHBOARD ERROR] KPI aggregation failed:', kpiResult.reason);
        }
        if (paymentBreakdownResult.status === 'rejected') {
            console.error('[DASHBOARD ERROR] Payment breakdown query failed:', paymentBreakdownResult.reason);
        }
        if (topProductsResult.status === 'rejected') {
            console.error('[DASHBOARD ERROR] Top products query failed:', topProductsResult.reason);
        }
        if (lowStockResult.status === 'rejected') {
            console.error('[DASHBOARD ERROR] Low stock query failed:', lowStockResult.reason);
        }
        if (activeShiftResult.status === 'rejected') {
            console.error('[DASHBOARD ERROR] Active shift query failed:', activeShiftResult.reason);
        }
        if (recentTransactionsResult.status === 'rejected') {
            console.error('[DASHBOARD ERROR] Recent transactions query failed:', recentTransactionsResult.reason);
        }

        const kpis = kpiResult.status === 'fulfilled' ? kpiResult.value : {
            totalAssets: 0,
            currentCapital: 0,
            periodSales: 0,
            periodPurchases: 0,
            periodExpenses: 0,
            maintenanceRevenue: 0,
            maintenancePartsCost: 0,
            maintenanceCount: 0,
            totalRevenue: 0,
            netProfit: 0,
            salesCount: 0
        };

        const paymentBreakdown = paymentBreakdownResult.status === 'fulfilled' ? paymentBreakdownResult.value : [];
        const topProducts = topProductsResult.status === 'fulfilled' ? topProductsResult.value : [];
        const lowStockItems = lowStockResult.status === 'fulfilled' ? lowStockResult.value : [];
        const activeShift = activeShiftResult.status === 'fulfilled' ? activeShiftResult.value : null;
        const recentTransactions = recentTransactionsResult.status === 'fulfilled' ? recentTransactionsResult.value : [];

        // Compute Financial Guardrail calculations via Decimal.js pure utils
        const aov = calculateAOV(kpis.periodSales, kpis.salesCount);
        const marginPct = calculateProfitMargin(kpis.netProfit, kpis.totalRevenue);

        // Daily trend calculation
        const daysInRange = effectiveStartDate
            ? eachDayOfInterval({ start: effectiveStartDate, end: effectiveEndDate })
            : eachDayOfInterval({ start: startOfDay(new Date()), end: effectiveEndDate });

        // Cap trend data to max 31 days to keep payload compact and charts readable
        const cappedDays = daysInRange.slice(-31);
        const salesTrend: DailyTrendItem[] = cappedDays.map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            revenue: 0,
            posRevenue: 0,
            maintenanceRevenue: 0
        }));

        return {
            success: true,
            data: {
                // Legacy required fields
                totalAssets: canViewConfidentialFinancials ? kpis.totalAssets : 0,
                currentCapital: canViewConfidentialFinancials ? kpis.currentCapital : 0,
                periodSales: kpis.periodSales,
                periodPurchases: kpis.periodPurchases,
                periodExpenses: kpis.periodExpenses,
                maintenanceRevenue: kpis.maintenanceRevenue,
                maintenancePartsCost: kpis.maintenancePartsCost,
                maintenanceCount: kpis.maintenanceCount,
                totalRevenue: kpis.totalRevenue,
                netProfit: canViewConfidentialFinancials ? kpis.netProfit : 0,

                // Extended fields
                salesCount: kpis.salesCount,
                averageOrderValue: aov,
                profitMarginPercentage: canViewConfidentialFinancials ? marginPct : 0,
                canViewConfidentialFinancials,

                // Visual & Operational widgets
                salesTrend,
                paymentBreakdown,
                topProducts,
                lowStockItems,
                activeShift,
                recentTransactions
            }
        };
    } catch (error) {
        console.error("Error fetching financial dashboard metrics:", error);
        return { success: false, error: "Failed to fetch dashboard metrics" };
    }
}
