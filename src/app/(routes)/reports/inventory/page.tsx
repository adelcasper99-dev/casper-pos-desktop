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
import { Search, Package, AlertTriangle, TrendingDown, Warehouse, Printer, Download, BarChart3, Box, ShieldCheck, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CasperLoader } from "@/components/ui/CasperLoader";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
        return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount || 0);
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
        <div className="p-8 space-y-8 min-h-screen text-foreground transition-colors duration-500 max-w-[2400px] mx-auto">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <div className="w-2 h-10 bg-cyan-500 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
                        تقرير المخزون
                    </h1>
                    <p className="text-muted-foreground text-sm mt-2 font-medium">تقرير شامل بمستويات المخزون، قيمته المالية الجارية، وحالات النقص</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={exportToExcel}
                        disabled={!reportData}
                        className="h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                    >
                        <Download className="w-4 h-4 ml-1" />
                        تصدير Excel
                    </button>
                </div>
            </div>

            {/* Premium Filter Dashboard */}
            <div className="glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-8 items-end relative z-10">
                    <div className="space-y-3">
                        <Label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest pr-1 flex items-center gap-2">
                           <Warehouse className="w-3 h-3 text-cyan-500" />
                           المستودع
                        </Label>
                        <Select
                            value={filters.warehouseId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, warehouseId: val }))}
                        >
                            <SelectTrigger className="bg-background/40 border-border/40 h-12 rounded-2xl focus:ring-cyan-500/20 transition-all font-bold">
                                <SelectValue placeholder="كل المستودعات" />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-xl border-border/40 rounded-2xl shadow-2xl">
                                <SelectItem value="all" className="font-bold">كل المستودعات</SelectItem>
                                {warehouses.map(wh => (
                                    <SelectItem key={wh.id} value={wh.id} className="font-bold">
                                        {wh.name} {wh.branch && typeof wh.branch === 'object' ? `(${wh.branch?.name})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest pr-1 flex items-center gap-2">
                           <Package className="w-3 h-3 text-cyan-500" />
                           الفئة
                        </Label>
                        <Select
                            value={filters.categoryId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, categoryId: val }))}
                        >
                            <SelectTrigger className="bg-background/40 border-border/40 h-12 rounded-2xl focus:ring-cyan-500/20 transition-all font-bold">
                                <SelectValue placeholder="كل الفئات" />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-xl border-border/40 rounded-2xl shadow-2xl">
                                <SelectItem value="all" className="font-bold">كل الفئات</SelectItem>
                                {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id} className="font-bold">
                                        {cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3 lg:col-span-1">
                        <Label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest pr-1 flex items-center gap-2">
                           <Search className="w-3 h-3 text-cyan-500" />
                           بحث سريع
                        </Label>
                        <div className="relative">
                            <Input
                                className="pr-10 bg-background/40 border-border/40 h-12 rounded-2xl focus:ring-cyan-500/20 transition-all font-medium"
                                placeholder="ابحث بالاسم أو SKU..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Search className="absolute right-3 top-3.5 w-5 h-5 text-foreground/30" />
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 mb-2">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={filters.lowStock}
                                    onChange={(e) => setFilters(prev => ({ ...prev, lowStock: e.target.checked }))}
                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-border/60 bg-background/40 transition-all checked:bg-cyan-500 checked:border-cyan-500"
                                />
                                <ShieldCheck className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5 transition-opacity" />
                            </div>
                            <span className="text-xs font-bold text-foreground/60 transition-colors group-hover:text-cyan-500">نقص المخزون فقط</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={filters.showZeroStock}
                                    onChange={(e) => setFilters(prev => ({ ...prev, showZeroStock: e.target.checked }))}
                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-border/60 bg-background/40 transition-all checked:bg-rose-500 checked:border-rose-500"
                                />
                                <XCircle className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5 transition-opacity" />
                            </div>
                            <span className="text-xs font-bold text-foreground/60 transition-colors group-hover:text-rose-500">عرض العناصر الصفرية</span>
                        </label>
                    </div>

                    <div>
                        <button
                            onClick={fetchReport}
                            disabled={isPending}
                            className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            {isPending ? 'جاري التحميل...' : 'تحديث القائمة'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            {isPending && !reportData ? (
                <div className="flex items-center justify-center p-32">
                    <CasperLoader />
                </div>
            ) : reportData ? (
                <div className={cn("space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700", isPending && "opacity-50")}>
                    {/* KPI Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                        {[
                            { label: 'إجمالي الأصناف', value: reportData.summary.totalItems, color: 'text-white', glow: 'shadow-white/5' },
                            { label: 'إجمالي الكمية', value: reportData.summary.totalQuantity.toLocaleString(), color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                            { label: 'القيمة الإجمالية', value: formatCurrency(reportData.summary.totalValue), color: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
                            { label: 'مخزون منخفض', value: reportData.summary.lowStockCount, color: 'text-amber-400', glow: 'shadow-amber-500/10' },
                            { label: 'نفد المخزون', value: reportData.summary.outOfStockCount, color: 'text-rose-400', glow: 'shadow-rose-500/10' }
                        ].map((item, idx) => (
                            <div key={idx} className={cn(
                                "glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:bg-card/60",
                                item.glow
                            )}>
                                <h3 className="text-[10px] font-black text-foreground/60 uppercase tracking-widest mb-3">{item.label}</h3>
                                <div className={cn("text-2xl font-black tracking-tight", item.color)}>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Detailed Data Table */}
                    <div className="glass-card bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-border/40 flex items-center justify-between">
                            <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest flex items-center gap-2">
                                <Box className="w-4 h-4 text-cyan-500" />
                                تفاصيل ومستويات المخزون ({filteredProducts.length} صنف)
                            </h3>
                            {filteredProducts.length > 100 && (
                                <div className="text-[10px] bg-primary/10 text-primary px-3 py-1 rounded-full font-black uppercase tracking-widest border border-primary/20">
                                   يتم عرض أول 100 صنف فقط
                                </div>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">SKU</th>
                                        <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">اسم المنتج</th>
                                        <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الفئة</th>
                                        <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الكمية</th>
                                        <th className="text-left py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">التكلفة</th>
                                        <th className="text-left py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">إجمالي القيمة</th>
                                        <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">حالة التوفر</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {filteredProducts.slice(0, 100).map((product: any) => (
                                        <tr key={product.id} className="transition-all hover:bg-primary/10 even:bg-muted/70 group h-14">
                                            <td className="py-2 px-6 font-mono text-[10px] text-foreground/40">{product.sku}</td>
                                            <td className="py-2 px-6 font-black text-foreground">{product.name}</td>
                                            <td className="py-2 px-6 text-foreground/40 text-xs font-bold uppercase tracking-tight">{product.category}</td>
                                            <td className="py-2 px-6 text-center">
                                                <span className={cn(
                                                    "px-3 py-1 rounded-lg font-black",
                                                    product.quantity > 0 ? "text-cyan-500 bg-cyan-500/5" : "text-rose-500 bg-rose-500/5"
                                                )}>
                                                    {product.quantity}
                                                </span>
                                            </td>
                                            <td className="py-2 px-6 text-left text-foreground/60 font-medium">{formatCurrency(product.unitCost)}</td>
                                            <td className="py-2 px-6 text-left text-emerald-500 font-black">{formatCurrency(product.totalValue)}</td>
                                            <td className="py-2 px-6 text-center">
                                                {product.isOutOfStock ? (
                                                    <span className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]">نفد</span>
                                                ) : product.isLowStock ? (
                                                    <span className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]">منخفض</span>
                                                ) : (
                                                    <span className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">متوفر</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
