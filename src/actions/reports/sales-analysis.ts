'use server';

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { subDays } from "date-fns";

type GroupByOption = 'product' | 'category' | 'salesman' | 'branch';

export async function getSalesAnalysis(groupBy: GroupByOption, dateRange?: { start: Date; end: Date }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const defaultEnd = new Date();
        const defaultStart = subDays(defaultEnd, 30);
        
        const dateFilter = {
            createdAt: {
                gte: dateRange?.start || defaultStart,
                lte: dateRange?.end || defaultEnd
            }
        };

        let results: any[] = [];
        let summary = { totalSales: 0, totalRevenue: 0, totalProfit: 0 };

        if (groupBy === 'product' || groupBy === 'category') {
            // Fetch all sale items with related product and sale info
            // Not grouping at DB level because we need to calculate profit per item using Decimal correctly
            const saleItems = await prisma.saleItem.findMany({
                where: {
                    sale: {
                        status: { notIn: ['VOIDED'] },
                        ...dateFilter
                    }
                },
                include: {
                    product: {
                        include: { category: true }
                    },
                    sale: {
                        select: { createdAt: true }
                    }
                }
            });

            const groupedMap = new Map<string, any>();

            for (const item of saleItems) {
                const qty = Number(item.quantity) - Number(item.refundedQty || 0);
                if (qty <= 0) continue;

                const revenue = qty * Number(item.unitPrice);
                const cost = qty * Number(item.unitCost || item.product?.costPrice || 0);
                const profit = revenue - cost;

                let groupKey = 'unknown';
                let groupName = 'غير معروف';

                if (groupBy === 'product') {
                    groupKey = item.productId;
                    groupName = item.product?.name || 'منتج محذوف';
                } else if (groupBy === 'category') {
                    groupKey = item.product?.categoryId || 'none';
                    groupName = item.product?.category?.name || 'بدون تصنيف';
                }

                const current = groupedMap.get(groupKey) || {
                    id: groupKey,
                    name: groupName,
                    quantity: 0,
                    revenue: 0,
                    profit: 0,
                    transactionCount: 0
                };

                current.quantity += qty;
                current.revenue += revenue;
                current.profit += profit;
                current.transactionCount += 1;

                groupedMap.set(groupKey, current);
                
                summary.totalSales += qty;
                summary.totalRevenue += revenue;
                summary.totalProfit += profit;
            }

            results = Array.from(groupedMap.values());

        } else if (groupBy === 'salesman' || groupBy === 'branch') {
            const sales = await prisma.sale.findMany({
                where: {
                    status: { notIn: ['VOIDED'] },
                    ...dateFilter
                },
                include: {
                    user: true,
                    warehouse: { include: { branch: true } }
                }
            });

            const groupedMap = new Map<string, any>();

            for (const sale of sales) {
                const revenue = Number(sale.totalAmount);
                // Note: Profit is harder to calc perfectly at sale level without items, using estimate or 0 if not needed
                // We'll skip exact profit for these high level groupings or use subTotal. For now just track revenue and count.
                
                let groupKey = 'unknown';
                let groupName = 'غير معروف';

                if (groupBy === 'salesman') {
                    groupKey = sale.userId;
                    groupName = sale.user?.name || 'غير معروف';
                } else if (groupBy === 'branch') {
                    groupKey = sale.warehouseId;
                    groupName = sale.warehouse?.name || 'مستودع محذوف';
                }

                const current = groupedMap.get(groupKey) || {
                    id: groupKey,
                    name: groupName,
                    revenue: 0,
                    transactionCount: 0
                };

                current.revenue += revenue;
                current.transactionCount += 1;

                groupedMap.set(groupKey, current);
                
                summary.totalRevenue += revenue;
                summary.totalSales += 1; // Treating transaction as sale here for high level
            }

            results = Array.from(groupedMap.values());
        }

        // Sort by revenue descending
        results.sort((a, b) => b.revenue - a.revenue);

        return {
            success: true,
            data: {
                results,
                summary,
                groupBy
            }
        };

    } catch (error: any) {
        console.error('[getSalesAnalysis] Error:', error);
        return { success: false, error: error.message };
    }
}
