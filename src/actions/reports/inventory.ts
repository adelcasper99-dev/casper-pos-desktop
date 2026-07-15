'use server';

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

interface InventoryReportFilters {
    warehouseId?: string;
    categoryId?: string;
    lowStock?: boolean;
    showZeroStock?: boolean;
}

export async function getInventoryReport(filters: InventoryReportFilters): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const warehouseFilter = filters?.warehouseId ? { id: filters.warehouseId } : {};
        const categoryFilter = filters?.categoryId ? { id: filters.categoryId } : {};

        // Get all warehouses
        const warehouses = await prisma.warehouse.findMany({
            where: warehouseFilter,
            include: { branch: true }
        });

        // Get all categories
        const categories = await prisma.category.findMany({
            where: categoryFilter,
            orderBy: { name: 'asc' }
        });

        // Get products with their stocks and latest sale date
        const products = await prisma.product.findMany({
            where: {
                ...categoryFilter,
                archived: false,
                deletedAt: null
            },
            include: {
                category: true,
                stocks: {
                    include: { warehouse: true }
                },
                saleItems: {
                    take: 1,
                    orderBy: { sale: { createdAt: 'desc' } },
                    select: { sale: { select: { createdAt: true } } }
                }
            },
            orderBy: { name: 'asc' }
        });

        // Calculate stock for each product
        const inventoryData = products.map(product => {
            const stocks = product.stocks || [];
            const totalQty = stocks.reduce((sum: number, s) => sum + Number(s.quantity || 0), 0);

            // Calculate total value (quantity * cost price)
            const totalCost = new Decimal(String(product.costPrice || 0)).times(totalQty);

            // Get stock by warehouse
            const stockByWarehouse = warehouses.map(wh => {
                const whStock = stocks.find((s: any) => s.warehouseId === wh.id);
                return {
                    warehouseId: wh.id,
                    warehouseName: wh.name,
                    quantity: whStock ? Number(whStock.quantity) : 0,
                    value: whStock ? Number(whStock.quantity) * Number(product.costPrice || 0) : 0
                };
            });

            const lastSoldAt = product.saleItems?.[0]?.sale?.createdAt || null;
            
            const daysSinceLastSale = lastSoldAt ? Math.floor((new Date().getTime() - new Date(lastSoldAt).getTime()) / (1000 * 60 * 60 * 24)) : null;
            // Define dead stock as quantity > 0 and no sales for > 60 days
            const isDeadStock = totalQty > 0 && (daysSinceLastSale === null || daysSinceLastSale > 60);

            return {
                id: product.id,
                sku: product.sku,
                name: product.name,
                category: product.category?.name || 'غير مصنف',
                quantity: totalQty,
                unitCost: Number(product.costPrice || 0),
                unitPrice: Number(product.sellPrice || 0),
                totalValue: totalCost.toNumber(),
                reorderPoint: Number(product.minStock || 0),
                isLowStock: totalQty <= Number(product.minStock || 0) && totalQty > 0,
                isOutOfStock: totalQty === 0,
                lastSoldAt,
                daysSinceLastSale,
                isDeadStock,
                stockByWarehouse
            };
        });

        // Filter based on options
        let filteredData = inventoryData;
        if (filters?.lowStock) {
            filteredData = filteredData.filter(p => p.isLowStock && !p.isOutOfStock);
        }
        if (!filters?.showZeroStock) {
            filteredData = filteredData.filter(p => p.quantity > 0);
        }

        // Calculate KPIs
        const totalItems = filteredData.length;
        const totalQuantity = filteredData.reduce((sum, p) => sum + p.quantity, 0);
        const totalValue = filteredData.reduce((sum, p) => sum + p.totalValue, 0);
        const lowStockCount = filteredData.filter(p => p.isLowStock).length;
        const outOfStockCount = filteredData.filter(p => p.isOutOfStock).length;
        const deadStockCount = filteredData.filter(p => p.isDeadStock).length;

        // Group by category
        const byCategory = categories.map(cat => {
            const catProducts = filteredData.filter(p => p.category === cat.name);
            return {
                categoryId: cat.id,
                categoryName: cat.name,
                itemCount: catProducts.length,
                totalQuantity: catProducts.reduce((sum, p) => sum + p.quantity, 0),
                totalValue: catProducts.reduce((sum, p) => sum + p.totalValue, 0)
            };
        }).filter(c => c.itemCount > 0);

        return {
            success: true,
            data: {
                products: filteredData,
                summary: {
                    totalItems,
                    totalQuantity,
                    totalValue,
                    lowStockCount,
                    outOfStockCount,
                    deadStockCount
                },
                byCategory,
                warehouses: warehouses.map(w => ({
                    id: w.id,
                    name: w.name,
                    branch: w.branch?.name
                }))
            }
        };
    } catch (error: any) {
        console.error('[getInventoryReport] Error:', error);
        return { success: false, error: error.message };
    }
}

export async function getWarehousesForFilter(): Promise<{ success: boolean; warehouses: any[] }> {
    try {
        const warehouses = await prisma.warehouse.findMany({
            include: { branch: true },
            orderBy: { name: 'asc' }
        });
        return { success: true, warehouses };
    } catch (error: any) {
        console.error('[getWarehousesForFilter] Error:', error);
        return { success: false, warehouses: [] };
    }
}

export async function getCategoriesForInventory(): Promise<{ success: boolean; categories: any[] }> {
    try {
        const categories = await prisma.category.findMany({
            orderBy: { name: 'asc' }
        });
        return { success: true, categories };
    } catch (error: any) {
        console.error('[getCategoriesForInventory] Error:', error);
        return { success: false, categories: [] };
    }
}
