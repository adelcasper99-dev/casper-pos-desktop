'use client';

import { useState, useEffect, useTransition } from "react";
import { getInventoryReport, getWarehousesForFilter, getCategoriesForInventory } from "@/actions/reports/inventory";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Search, Package, AlertTriangle, Warehouse, Download, Box, ShieldCheck, XCircle, Info, Ghost } from "lucide-react";
import { CasperLoader } from "@/components/ui/CasperLoader";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function InventoryReportDetail({ isTab = false }: { isTab?: boolean }) {
    const [isPending, startTransition] = useTransition();
    const [reportData, setReportData] = useState<any>(null);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [customThreshold, setCustomThreshold] = useState("");

    // Filters State
    const [filters, setFilters] = useState({
        warehouseId: "all",
        categoryId: "all",
        lowStock: false,
        showZeroStock: true,
        deadStock: false
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
    }, [filters.warehouseId, filters.categoryId, filters.lowStock, filters.showZeroStock, filters.deadStock]);

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

    const filteredProducts = reportData?.products?.filter((p: any) => {
        const matchesSearch = searchTerm === "" ||
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku.toLowerCase().includes(searchTerm.toLowerCase());
            
        const thresholdNum = customThreshold !== "" ? Number(customThreshold) : null;
        const matchesThreshold = thresholdNum === null || p.quantity <= thresholdNum;
        
        const matchesDeadStock = !filters.deadStock || p.isDeadStock;
        
        return matchesSearch && matchesThreshold && matchesDeadStock;
    }) || [];

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
            "آخر مبيعات": p.lastSoldAt ? format(new Date(p.lastSoldAt), 'yyyy/MM/dd') : 'لم يتم البيع',
            "حالة المخزون": p.isDeadStock ? "مخزون راكد" : p.isOutOfStock ? "نفد المخزون" : p.isLowStock ? "مخزون منخفض" : "متوفر"
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "تقرير المخزون");
        XLSX.writeFile(wb, `inventory_report_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    return (
        <div className={cn(
            "space-y-2.5 text-foreground transition-colors duration-500 max-w-[2400px] mx-auto",
            isTab ? "" : "p-3 min-h-screen"
        )}>
            {/* Header Area */}
            {!isTab && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div>
                        <h1 className="text-sm font-black tracking-tight text-foreground flex items-center gap-2">
                            <div className="w-1.5 h-6 bg-cyan-500 rounded-full shadow-xs" />
                            تقرير المخزون
                        </h1>
                        <p className="text-muted-foreground text-xs mt-0.5 font-medium">تقرير شامل بمستويات المخزون، قيمته المالية الجارية، وحالات النقص</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={exportToExcel}
                            disabled={!reportData}
                            className="h-8 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5"
                        >
                            <Download className="w-3.5 h-3.5 ml-1" />
                            تصدير Excel
                        </button>
                    </div>
                </div>
            )}

            {/* Filter Dashboard */}
            <div className="glass-card bg-card/60 backdrop-blur-xl border border-border rounded-2xl p-2.5 px-3.5 shadow-xs relative overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2.5 items-end">
                    <div className="space-y-1">
                        <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider pr-1 flex items-center gap-1.5">
                           <Warehouse className="w-3 h-3 text-cyan-500" />
                           المستودع
                        </Label>
                        <Select
                            value={filters.warehouseId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, warehouseId: val }))}
                        >
                            <SelectTrigger className="bg-background/50 border-border h-8 text-xs rounded-xl focus:ring-1 focus:ring-cyan-500/20 transition-all font-bold">
                                <SelectValue placeholder="كل المستودعات" />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-xl border-border rounded-xl shadow-xl">
                                <SelectItem value="all" className="font-bold text-xs">كل المستودعات</SelectItem>
                                {warehouses.map(wh => (
                                    <SelectItem key={wh.id} value={wh.id} className="font-bold text-xs">
                                        {wh.name} {wh.branch && typeof wh.branch === 'object' ? `(${wh.branch?.name})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider pr-1 flex items-center gap-1.5">
                           <Package className="w-3 h-3 text-cyan-500" />
                           الفئة
                        </Label>
                        <Select
                            value={filters.categoryId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, categoryId: val }))}
                        >
                            <SelectTrigger className="bg-background/50 border-border h-8 text-xs rounded-xl focus:ring-1 focus:ring-cyan-500/20 transition-all font-bold">
                                <SelectValue placeholder="كل الفئات" />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-xl border-border rounded-xl shadow-xl">
                                <SelectItem value="all" className="font-bold text-xs">كل الفئات</SelectItem>
                                {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id} className="font-bold text-xs">
                                        {cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider pr-1 flex items-center gap-1.5">
                           <Search className="w-3 h-3 text-cyan-500" />
                           بحث سريع
                        </Label>
                        <div className="relative">
                            <Input
                                className="pr-8 bg-background/50 border-border h-8 text-xs rounded-xl focus:ring-1 focus:ring-cyan-500/20 transition-all font-medium"
                                placeholder="ابحث بالاسم أو SKU..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Search className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider pr-1 flex items-center gap-1.5">
                           <AlertTriangle className="w-3 h-3 text-amber-500" />
                           الكمية أقل من أو تساوي
                        </Label>
                        <Input
                            type="number"
                            className="bg-background/50 border-border h-8 text-xs rounded-xl focus:ring-1 focus:ring-cyan-500/20 transition-all font-bold placeholder:text-muted-foreground/30"
                            placeholder="مثال: 5"
                            value={customThreshold}
                            onChange={(e) => setCustomThreshold(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-3 lg:col-span-2 pb-1">
                        <label className="flex items-center gap-1.5 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={filters.lowStock}
                                onChange={(e) => setFilters(prev => ({ ...prev, lowStock: e.target.checked }))}
                                className="h-4 w-4 rounded border-border bg-background/40 checked:bg-cyan-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-muted-foreground group-hover:text-cyan-500">نقص المخزون</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={filters.showZeroStock}
                                onChange={(e) => setFilters(prev => ({ ...prev, showZeroStock: e.target.checked }))}
                                className="h-4 w-4 rounded border-border bg-background/40 checked:bg-rose-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-muted-foreground group-hover:text-rose-500">العناصر الصفرية</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={filters.deadStock}
                                onChange={(e) => setFilters(prev => ({ ...prev, deadStock: e.target.checked }))}
                                className="h-4 w-4 rounded border-border bg-background/40 checked:bg-purple-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-muted-foreground group-hover:text-purple-500">راكد</span>
                        </label>
                    </div>

                    <div className="flex gap-1.5">
                        <button
                            onClick={fetchReport}
                            disabled={isPending}
                            className="flex-1 h-8 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            {isPending ? 'جاري...' : 'تحديث'}
                        </button>
                        <button
                            onClick={exportToExcel}
                            disabled={!reportData}
                            className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1"
                            title="تصدير Excel"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Excel</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            {isPending && !reportData ? (
                <div className="flex items-center justify-center p-16">
                    <CasperLoader />
                </div>
            ) : reportData ? (
                <div className={cn("space-y-2.5 animate-in fade-in duration-300", isPending && "opacity-50")}>
                    {/* KPI Cards Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {[
                            { label: 'إجمالي الأصناف', value: reportData.summary.totalItems, color: 'text-white', glow: 'shadow-white/5' },
                            { label: 'إجمالي الكمية', value: reportData.summary.totalQuantity.toLocaleString(), color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                            { label: 'القيمة الإجمالية', value: formatCurrency(reportData.summary.totalValue), color: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
                            { label: 'مخزون راكد', value: reportData.summary.deadStockCount || 0, color: 'text-purple-400', glow: 'shadow-purple-500/10' },
                            { label: 'نفد المخزون', value: reportData.summary.outOfStockCount, color: 'text-rose-400', glow: 'shadow-rose-500/10' }
                        ].map((item, idx) => (
                            <div key={idx} className={cn(
                                "glass-card bg-card/50 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-xs transition-all",
                                item.glow
                            )}>
                                <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">{item.label}</h3>
                                <div className={cn("text-base font-black tracking-tight font-mono", item.color)}>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Stock Detail Table */}
                    <div className="glass-card bg-card/40 backdrop-blur-md border border-border rounded-xl overflow-hidden shadow-xs">
                        <div className="p-2.5 px-3 border-b border-border/40 flex items-center justify-between">
                            <h3 className="text-xs font-black text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                                <Box className="w-3.5 h-3.5 text-cyan-500" />
                                تفاصيل أصناف المخزون المتاحة
                            </h3>
                            <span className="text-[10px] font-bold text-muted-foreground bg-muted/40 border border-border/40 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                {filteredProducts.length} صنف معروض
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/50 border-b border-border/40">
                                    <tr>
                                        <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">SKU</th>
                                        <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">اسم المنتج</th>
                                        <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الفئة</th>
                                        <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الكمية المتاحة</th>
                                        <th className="text-left py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">تكلفة الوحدة</th>
                                        <th className="text-left py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">سعر البيع</th>
                                        <th className="text-left py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">القيمة الإجمالية</th>
                                        <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">آخر بيع</th>
                                        <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">حالة المخزون</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {filteredProducts.length > 0 ? (
                                        filteredProducts.map((p: any) => (
                                            <tr key={p.id} className="transition-all hover:bg-primary/10 even:bg-muted/40 group">
                                                <td className="py-1.5 px-3 font-mono text-[10px] text-muted-foreground">{p.sku}</td>
                                                <td className="py-1.5 px-3 font-bold text-foreground">{p.name}</td>
                                                <td className="py-1.5 px-3 text-muted-foreground text-[11px] font-medium">{p.category}</td>
                                                <td className="py-1.5 px-3 text-center text-cyan-500 font-black font-mono">{p.quantity}</td>
                                                <td className="py-1.5 px-3 text-left text-muted-foreground font-mono">{formatCurrency(p.unitCost)}</td>
                                                <td className="py-1.5 px-3 text-left text-foreground font-mono">{formatCurrency(p.unitPrice)}</td>
                                                <td className="py-1.5 px-3 text-left text-emerald-500 font-black font-mono">{formatCurrency(p.totalValue)}</td>
                                                <td className="py-1.5 px-3 text-center text-muted-foreground font-bold text-[10px]">
                                                    {p.lastSoldAt ? format(new Date(p.lastSoldAt), 'yyyy/MM/dd') : 'لم يُباع'}
                                                    {p.daysSinceLastSale !== null && (
                                                        <span className={cn("block text-[9px]", p.isDeadStock ? "text-purple-400" : "text-muted-foreground")}>
                                                            (منذ {p.daysSinceLastSale} يوم)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-3 text-center">
                                                    {p.isDeadStock ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-purple-500/10 text-purple-500 border border-purple-500/20">راكد</span>
                                                    ) : p.isOutOfStock ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-500/10 text-rose-500 border border-rose-500/20">نفد</span>
                                                    ) : p.isLowStock ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-flex items-center gap-1">
                                                            <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                                                            منخفض
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">متوفر</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={9} className="py-8 text-center text-muted-foreground font-bold uppercase tracking-wider text-xs">
                                                <div className="flex flex-col items-center justify-center gap-1">
                                                    <Info className="w-5 h-5 text-muted-foreground" />
                                                    لا توجد أصناف تطابق فلاتر البحث الحالية
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
