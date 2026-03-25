'use client';

import { useState, useEffect, useTransition } from "react";
import { getInventoryReport, getWarehousesForFilter, getCategoriesForInventory } from "@/actions/reports/inventory";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Search, Package, AlertTriangle, TrendingDown, Warehouse, Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CasperLoader } from "@/components/ui/CasperLoader";
import * as XLSX from "xlsx";
import { format } from "date-fns";

export default function InventoryReportPage() {
    const [isPending, startTransition] = useTransition();
    const [reportData, setReportData] = useState<any>(null);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    // Filters State
    const [filters, setFilters] = useState({
        warehouseId: "all",
        categoryId: "all",
        lowStock: false,
        showZeroStock: true
    });

    // Fetch Filters Data on Mount
    useEffect(() => {
        Promise.all([
            getWarehousesForFilter(),
            getCategoriesForInventory()
        ]).then(([whRes, catRes]) => {
            if (whRes.success) setWarehouses(whRes.warehouses);
            if (catRes.success) setCategories(catRes.categories);
        });
    }, []);

    // Fetch Report Data when filters change
    useEffect(() => {
        fetchReport();
    }, [filters.warehouseId, filters.categoryId, filters.lowStock, filters.showZeroStock]);

    const fetchReport = () => {
        startTransition(async () => {
            const res = await getInventoryReport({
                warehouseId: filters.warehouseId === "all" ? undefined : filters.warehouseId,
                categoryId: filters.categoryId === "all" ? undefined : filters.categoryId,
                lowStock: filters.lowStock,
                showZeroStock: filters.showZeroStock
            });
            if (res.success) {
                setReportData(res.data);
            }
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount);
    };

    const filteredProducts = reportData?.products?.filter((p: any) =>
        searchTerm === "" ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const exportToExcel = () => {
        if (!reportData) return;

        const data = filteredProducts.map((p: any) => ({
            "SKU": p.sku,
            "اسم المنتج": p.name,
            "الفئة": p.category,
            "الكمية": p.quantity,
            "تكلفة الوحدة": p.unitCost,
            "سعر البيع": p.unitPrice,
            "القيمة الإجمالية": p.totalValue,
            "نقطة إعادة الطلب": p.reorderPoint,
            "حالة المخزون": p.isOutOfStock ? "نفد المخزون" : p.isLowStock ? "مخزون منخفض" : "متوفر"
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "تقرير المخزون");
        XLSX.writeFile(wb, `inventory_report_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    return (
        <div className="p-6 space-y-8 bg-zinc-950 min-h-screen text-zinc-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
                        تقرير المخزون
                    </h1>
                    <p className="text-zinc-400 text-sm font-medium">
                        تقرير شامل بمستويات المخزون وقيمته
                    </p>
                </div>
                <Button
                    onClick={exportToExcel}
                    disabled={!reportData}
                    className="bg-emerald-600 hover:bg-emerald-500"
                >
                    <Download className="w-4 h-4 ml-2" />
                    تصدير Excel
                </Button>
            </div>

            {/* Filter Bar */}
            <div className="p-5 bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-2xl shadow-2xl ring-1 ring-white/5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="space-y-2.5">
                        <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pr-1">المستودع</Label>
                        <Select
                            value={filters.warehouseId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, warehouseId: val }))}
                        >
                            <SelectTrigger className="bg-zinc-900/80 border-white/5 text-zinc-200 h-11 rounded-xl focus:ring-cyan-500/20">
                                <SelectValue placeholder="كل المستودعات" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                                <SelectItem value="all">كل المستودعات</SelectItem>
                                {warehouses.map(wh => (
                                    <SelectItem key={wh.id} value={wh.id}>
                                        {wh.name} {wh.branch && typeof wh.branch === 'object' ? `(${wh.branch?.name})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2.5">
                        <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pr-1">الفئة</Label>
                        <Select
                            value={filters.categoryId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, categoryId: val }))}
                        >
                            <SelectTrigger className="bg-zinc-900/80 border-white/5 text-zinc-200 h-11 rounded-xl focus:ring-cyan-500/20">
                                <SelectValue placeholder="كل الفئات" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                                <SelectItem value="all">كل الفئات</SelectItem>
                                {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2.5">
                        <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pr-1">بحث</Label>
                        <div className="relative">
                            <Input
                                className="pr-10 bg-zinc-900/80 border-white/5 text-zinc-200 h-11 rounded-xl"
                                placeholder="ابحث بالاسم أو SKU..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Search className="absolute right-3 top-3.5 w-5 h-5 text-zinc-500" />
                        </div>
                    </div>

                    <div className="flex gap-3 items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filters.lowStock}
                                onChange={(e) => setFilters(prev => ({ ...prev, lowStock: e.target.checked }))}
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-cyan-500"
                            />
                            <span className="text-sm text-zinc-400">المخزون المنخفض فقط</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filters.showZeroStock}
                                onChange={(e) => setFilters(prev => ({ ...prev, showZeroStock: e.target.checked }))}
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-cyan-500"
                            />
                            <span className="text-sm text-zinc-400">عرض صفر</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            {isPending && !reportData ? (
                <div className="flex items-center justify-center p-20">
                    <CasperLoader />
                </div>
            ) : reportData ? (
                <div className={isPending ? "opacity-50 transition-opacity" : ""}>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">إجمالي الأصناف</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-white">
                                    {reportData.summary.totalItems}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">إجمالي الكمية</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-cyan-400">
                                    {reportData.summary.totalQuantity.toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">القيمة الإجمالية</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-emerald-400">
                                    {formatCurrency(reportData.summary.totalValue)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">مخزون منخفض</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-amber-400">
                                    {reportData.summary.lowStockCount}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">نفد المخزون</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-rose-400">
                                    {reportData.summary.outOfStockCount}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Products Table */}
                    <Card className="bg-zinc-900/50 border-white/5 mt-6">
                        <CardHeader>
                            <CardTitle className="text-lg font-medium">
                                تفاصيل المخزون ({filteredProducts.length} صنف)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-white/10">
                                            <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase">SKU</th>
                                            <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase">المنتج</th>
                                            <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase">الفئة</th>
                                            <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase">الكمية</th>
                                            <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase">التكلفة</th>
                                            <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase">القيمة</th>
                                            <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProducts.slice(0, 100).map((product: any) => (
                                            <tr key={product.id} className="border-b border-white/5 hover:bg-white/5">
                                                <td className="py-3 px-4 text-sm font-mono text-zinc-400">{product.sku}</td>
                                                <td className="py-3 px-4 text-sm font-medium text-white">{product.name}</td>
                                                <td className="py-3 px-4 text-sm text-zinc-400">{product.category}</td>
                                                <td className="py-3 px-4 text-sm text-cyan-400 font-bold">{product.quantity}</td>
                                                <td className="py-3 px-4 text-sm text-zinc-400">{formatCurrency(product.unitCost)}</td>
                                                <td className="py-3 px-4 text-sm text-emerald-400 font-bold">{formatCurrency(product.totalValue)}</td>
                                                <td className="py-3 px-4">
                                                    {product.isOutOfStock ? (
                                                        <span className="px-2 py-1 rounded text-xs font-bold bg-rose-500/20 text-rose-400">نفد</span>
                                                    ) : product.isLowStock ? (
                                                        <span className="px-2 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-400">منخفض</span>
                                                    ) : (
                                                        <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400">متوفر</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {filteredProducts.length > 100 && (
                                <div className="text-center py-4 text-zinc-500">
                                    عرض أول 100 صنف من أصل {filteredProducts.length}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
