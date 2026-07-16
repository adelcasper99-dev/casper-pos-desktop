"use client";

import { useState } from "react";
import { 
    Search, Box, Edit, Loader2, Save, Wand2, Trash2, 
    ChevronLeft, ChevronRight, Lock, Printer, Infinity as InfinityIcon, 
    Plus, Filter, ChevronDown, Clock, Calendar, Activity as ActivityIcon, 
    ArrowUpDown, ChevronUp, AlertTriangle 
} from "lucide-react";
import { BarcodePrintDialog } from "./BarcodePrintDialog";
import { WastageDialog } from "./WastageDialog";
import { ThermalPrintLabel } from "./ThermalPrintLabel";
import AddProductModal from "./AddProductModal";
import StockAdjustmentModal from "./StockAdjustmentModal";
import { updateProduct, generateNextSku, deleteProduct, getProducts, getWarehouses, getAllUnits } from "@/actions/inventory";
import GlassModal from "../ui/GlassModal";
import clsx from "clsx";
import BarcodeListener from "./BarcodeListener";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useTranslations } from "@/lib/i18n-mock";
import { formatCurrency, cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { toast } from "sonner";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import {
    format, isToday, isYesterday, isThisWeek, isThisMonth,
    startOfDay, endOfDay, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, subDays
} from 'date-fns';
import { DateRange } from "react-day-picker";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import { Product, Category } from "@/types/product";

export default function ProductsTab({
    products: initialProducts,
    categories,
    csrfToken,
    user,
    warehouseId,
    currency = "EGP",
    initialUnits = [],
    models = [],
    attributes = []
}: any) {
    const { settings } = useSettings();
    const features = typeof settings?.features === 'string' ? JSON.parse(settings.features || "{}") : (settings?.features || {});
    const updateDerivedName = (prod: any) => {
        const cat = categories.find((c: Category) => c.id === prod.categoryId);
        const mod = models.find((m: any) => m.id === prod.modelId);
        const attr = attributes.find((a: any) => a.id === prod.attributeId);
        
        let newName = prod.name;
        if (cat || mod || attr || prod.description) {
            const parts = [];
            if (cat) parts.push(cat.name);
            if (mod) parts.push(mod.name);
            if (attr) parts.push(attr.name);
            if (prod.description) parts.push(prod.description);
            newName = parts.join(' - ');
        }
        return newName;
    };
    const t = useTranslations('Inventory.products');
    const tCommon = useTranslations('Common');
    const [search, setSearch] = useState("");
    const [debouncedSearch] = useDebounce(search, 500);
    const [page, setPage] = useState(1);
    const [categoryId, setCategoryId] = useState<string>("");
    const [stockStatus, setStockStatus] = useState<string>("");
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
    const [showPrintDialog, setShowPrintDialog] = useState(false);

    // Advanced Filters State
    const [dateFilter, setDateFilter] = useState<string>("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [filterWarehouseId, setFilterWarehouseId] = useState<string>("");
    const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'stock' | 'sku' | 'sellPrice'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleSort = (key: any) => {
        if (sortBy === key) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('asc');
        }
        setPage(1);
    };

    const getSortIcon = (key: string) => {
        if (sortBy !== key) return <ChevronDown className="w-3.5 h-3.5 opacity-20" />;
        return sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-cyan-400" /> : <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />;
    };

    // Fetch Warehouses for filter
    const { data: warehousesData } = useQuery({
        queryKey: ['warehouses'],
        queryFn: async () => {
            const res = await getWarehouses();
            return res.data || [];
        }
    });
    const warehouses = warehousesData || [];

    // Fetch Units for dropdown
    const { data: unitsData, isLoading: unitsLoading } = useQuery({
        queryKey: ['units'],
        queryFn: async () => {
            const res = await getAllUnits();
            return res.units || [];
        }
    });
    // Map units to ensure abbreviation is not null (TS compatibility)
    const unitsList = (unitsData || []).map((u: any) => ({
        ...u,
        abbreviation: u.abbreviation || undefined
    }));

    const unitsByCategory = unitsList.reduce((acc: any, unit: any) => {
        const cat = unit.category || 'COUNT';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(unit);
        return acc;
    }, {} as Record<string, any[]>);

    // Permission Checks
    const canManage = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_MANAGE);
    const canViewCost = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_VIEW_COST);
    const canViewPrice1 = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_VIEW_PRICE_1);
    const canViewPrice2 = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_VIEW_PRICE_2);
    const canViewPrice3 = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_VIEW_PRICE_3);

    const [wastageProduct, setWastageProduct] = useState<Product | null>(null);
    const [quickPrintProduct, setQuickPrintProduct] = useState<Product | null>(null);
    const [addProductOpen, setAddProductOpen] = useState(false);
    const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null);

    // React Query for Pagination & Search & Filtering
    const { data: queryData, isLoading: isQueryLoading, refetch } = useQuery({
        queryKey: ['products', debouncedSearch, page, categoryId, stockStatus, filterWarehouseId, dateRange, sortBy, sortOrder],
        queryFn: async () => {
            const res = await getProducts({ 
                search: debouncedSearch, 
                page, 
                limit: 50, 
                categoryId: categoryId || undefined, 
                stockStatus: stockStatus || undefined,
                warehouseId: filterWarehouseId || undefined,
                startDate: dateRange?.from ? dateRange.from.toISOString() : undefined,
                endDate: dateRange?.to ? dateRange.to.toISOString() : undefined,
                sortBy,
                sortOrder
            });
            return res.success ? res : { data: [], pagination: { total: 0, totalPages: 0, page: 1, limit: 50 } };
        },
        initialData: (debouncedSearch === "" && page === 1 && !filterWarehouseId && !dateRange) ? {
            success: true,
            data: initialProducts,
            pagination: {
                total: initialProducts.length, 
                page: 1,
                limit: 50,
                totalPages: 1
            }
        } : undefined,
        placeholderData: (previousData) => previousData, 
    });

    // Safe mapping for products to ensure numeric values for stock and prices
    const products = (queryData?.data || []).map((p: any) => ({
        ...p,
        stock: Number(p.stock || 0),
        costPrice: Number(p.costPrice || 0),
        sellPrice: Number(p.sellPrice || 0),
    }));
    const pagination = queryData?.pagination || { page: 1, totalPages: 1, total: 0 };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProduct) return;
        if (!canManage) return;

        const missing = [];
        if (!editingProduct.sku) missing.push("SKU");
        if (!editingProduct.name) missing.push("Name");

        if (missing.length > 0) {
            toast.error(t('validationError', { fields: missing.join(", ") }));
            return;
        }

        // Validation
        const cost = Number(editingProduct.costPrice);
        const sell1 = Number(editingProduct.sellPrice);
        const sell2 = Number(editingProduct.sellPrice2 || 0);
        const sell3 = Number(editingProduct.sellPrice3 || 0);

        if (sell1 < cost) {
            toast.error(t('priceError', { price: 1, val: sell1, cost: cost }));
            return;
        }
        if (sell2 > 0 && sell2 < cost) {
            toast.error(t('priceError', { price: 2, val: sell2, cost: cost }));
            return;
        }
        if (sell3 > 0 && sell3 < cost) {
            toast.error(t('priceError', { price: 3, val: sell3, cost: cost }));
            return;
        }

        setLoading(true);

        const result = await updateProduct({
            id: editingProduct.id,
            name: editingProduct.name,
            sku: editingProduct.sku,
            categoryId: editingProduct.categoryId || undefined,
            sellPrice: Number(editingProduct.sellPrice),
            sellPrice2: Number(editingProduct.sellPrice2),
            sellPrice3: Number(editingProduct.sellPrice3),
            costPrice: Number(editingProduct.costPrice),
            stock: Number(editingProduct.stock),
            minStock: Number(editingProduct.minStock || 0),
            trackStock: editingProduct.trackStock,
            unitOfMeasureId: editingProduct.unitOfMeasureId || undefined,
            modelId: editingProduct.modelId || undefined,
            attributeId: editingProduct.attributeId || undefined,
            description: editingProduct.description || undefined,
            csrfToken
        } as any);

        setLoading(false);
        if (result.success) {
            setEditingProduct(null);
            refetch(); // usage of invalidateQueries is better but refetch works locally
        } else {
            toast.error(result.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!canManage) return;
        if (!confirm(t('deleteConfirm'))) return;

        setDeletingId(id);
        const result = await deleteProduct({ id, csrfToken });
        setDeletingId(null);

        if (!result.success) {
            toast.error(result.message);
        } else {
            refetch();
        }
    };

    return (
        <div className="space-y-6 animate-fly-in">
            <BarcodeListener onScan={(code) => setSearch(code)} />
            {/* Action Bar */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="relative flex-1 min-w-[300px] group/search">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-zinc-500 group-focus-within/search:text-cyan-500 transition-all pointer-events-none" />
                        <input
                            type="text"
                            placeholder={t('searchPlaceholder')}
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className="w-full glass-input ps-12 py-3 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-zinc-600 focus:border-cyan-500/50 transition-all font-black rounded-xl"
                        />
                        {isQueryLoading && <div className="absolute end-4 top-1/2 -translate-y-1/2"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {canManage && (
                            <button
                                onClick={() => setAddProductOpen(true)}
                                className="px-5 py-3 h-11 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-bold rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] shadow-lg shadow-amber-500/20 active:scale-95"
                            >
                                <Plus className="w-4 h-4" />
                                {tCommon('add') || "إضافة منتج"}
                            </button>
                        )}

                        {selectedProducts.size > 0 && (
                            <button
                                onClick={() => setShowPrintDialog(true)}
                                className="px-6 py-3 h-11 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
                            >
                                <Printer className="w-5 h-5" />
                                {t('printLabels')} ({selectedProducts.size})
                            </button>
                        )}
                    </div>
                </div>

                {/* Advanced Filters Toolbar */}
                <div className="flex gap-4 items-center flex-wrap">
                    {/* Date Quick Filters */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900/50 p-1 rounded-xl border border-slate-200 dark:border-white/10 flex-wrap overflow-hidden">
                        {[
                            { id: 'all', label: 'الكل' },
                            { id: 'today', label: 'اليوم', fn: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
                            { id: 'yesterday', label: 'أمس', fn: () => { const y = subDays(new Date(), 1); return { from: startOfDay(y), to: endOfDay(y) }; } },
                            { id: 'week', label: 'الأسبوع', fn: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) }) },
                            { id: 'month', label: 'الشهر', fn: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) }
                        ].map(f => (
                            <Button
                                key={f.id}
                                variant={dateFilter === f.id ? "default" : "ghost"}
                                size="sm"
                                className={cn(
                                    "h-8 text-[11px] font-black px-3 rounded-lg transition-all",
                                    dateFilter === f.id 
                                        ? "bg-cyan-500 text-black hover:bg-cyan-400 shadow-md shadow-cyan-500/20" 
                                        : "text-slate-400 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5"
                                )}
                                onClick={() => {
                                    setDateFilter(f.id);
                                    if (f.id === 'all') setDateRange(undefined);
                                    else if (f.fn) setDateRange(f.fn());
                                    setPage(1);
                                }}
                            >
                                {f.label}
                            </Button>
                        ))}

                        <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1 hidden sm:block" />

                        <FlatpickrRangePicker
                            onRangeChange={(dates) => {
                                if (dates.length === 2) {
                                    setDateRange({ from: dates[0], to: dates[1] });
                                    setDateFilter("custom");
                                } else if (dates.length === 1) {
                                    setDateRange({ from: dates[0], to: undefined });
                                    setDateFilter("custom");
                                } else {
                                    setDateRange(undefined);
                                    setDateFilter("all");
                                }
                                setPage(1);
                            }}
                            onClear={() => {
                                setDateRange(undefined);
                                setDateFilter("all");
                                setPage(1);
                            }}
                            initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                            className="w-48 bg-transparent border-0 text-xs h-8 text-slate-500 dark:text-zinc-300 placeholder:text-slate-300 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-0"
                            placeholder="تاريخ مخصص..."
                        />
                    </div>

                    {/* Warehouse Filter */}
                    <div className="flex gap-2 flex-wrap">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="border-slate-200 dark:border-white/10 gap-2 h-10 px-4 bg-white dark:bg-zinc-900/50 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all shadow-sm">
                                    <Box className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                    <span className="text-slate-700 dark:text-zinc-300 font-bold">
                                        {filterWarehouseId 
                                            ? warehouses.find(w => w.id === filterWarehouseId)?.name 
                                            : "كل المستودعات"}
                                    </span>
                                    <ChevronDown className="w-3 h-3 opacity-50 text-slate-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56 bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-xl shadow-2xl backdrop-blur-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-zinc-500 p-3">تصفية حسب المستودع</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => { setFilterWarehouseId(""); setPage(1); }} className={cn("rounded-lg m-1 font-bold", !filterWarehouseId && "bg-slate-100 dark:bg-white/10")}>
                                    كل المستودعات
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-slate-100 dark:bg-white/5" />
                                {warehouses.map(wh => (
                                    <DropdownMenuItem key={wh.id} onClick={() => { setFilterWarehouseId(wh.id); setPage(1); }} className={cn("rounded-lg m-1 font-bold", filterWarehouseId === wh.id && "bg-slate-100 dark:bg-white/10 text-cyan-600 dark:text-cyan-400")}>
                                        {wh.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Category Filter Group */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="border-slate-200 dark:border-white/10 gap-2 h-10 px-4 bg-white dark:bg-zinc-900/50 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all shadow-sm">
                                    <Filter className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                    <span className="text-slate-700 dark:text-zinc-300 font-bold">
                                        {categoryId 
                                            ? categories.find((c: any) => c.id === categoryId)?.name 
                                            : (tCommon('allCategories') || "كل الأقسام")}
                                    </span>
                                    <ChevronDown className="w-3 h-3 opacity-50 text-slate-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56 bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-xl shadow-2xl backdrop-blur-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-zinc-500 p-3">الأقسام</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => { setCategoryId(""); setPage(1); }} className="rounded-lg m-1 font-bold">
                                    {tCommon('allCategories') || "كل الأقسام"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-slate-100 dark:bg-white/5" />
                                {categories.map((cat: any) => (
                                    <DropdownMenuItem key={cat.id} onClick={() => { setCategoryId(cat.id); setPage(1); }} className={cn("rounded-lg m-1 font-bold", categoryId === cat.id && "bg-slate-100 dark:bg-white/10 text-cyan-600 dark:text-cyan-400")}>
                                        {cat.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Status Filter */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="border-slate-200 dark:border-white/10 gap-2 h-10 px-4 bg-white dark:bg-zinc-900/50 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all shadow-sm">
                                    <ActivityIcon className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                    <span className="text-slate-700 dark:text-zinc-300 font-bold">
                                        {stockStatus === "in_stock" ? "متوفر" :
                                         stockStatus === "low_stock" ? "منخفض" :
                                         stockStatus === "out_of_stock" ? "نفذ" :
                                         stockStatus === "services" ? "خدمات" : "كل الحالات"}
                                    </span>
                                    <ChevronDown className="w-3 h-3 opacity-50 text-slate-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-xl shadow-2xl backdrop-blur-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-zinc-500 p-3">حالة المخزون</DropdownMenuLabel>
                                {[
                                    { id: "", label: "كل الحالات" },
                                    { id: "in_stock", label: "متوفر" },
                                    { id: "low_stock", label: "أوشك على النفاذ" },
                                    { id: "out_of_stock", label: "نفذت الكمية" },
                                    { id: "services", label: "خدمات" }
                                ].map(st => (
                                    <DropdownMenuItem key={st.id} onClick={() => { setStockStatus(st.id); setPage(1); }} className={cn("rounded-lg m-1 font-bold", stockStatus === st.id && "bg-slate-100 dark:bg-white/10 text-cyan-600 dark:text-cyan-400")}>
                                        {st.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Sort Logic */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="border-slate-200 dark:border-white/10 gap-2 h-10 px-4 bg-white dark:bg-zinc-900/50 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all shadow-sm">
                                    <ArrowUpDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                    <span className="text-slate-700 dark:text-zinc-300 font-bold">
                                        {sortBy === 'name' ? 'الاسم' : (sortBy === 'createdAt' ? 'التاريخ' : 'الكمية')}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-xl shadow-2xl backdrop-blur-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-zinc-500 p-3">ترتيب حسب</DropdownMenuLabel>
                                {[
                                    { id: 'name', label: 'الاسم' },
                                    { id: 'createdAt', label: 'تاريخ الإضافة' },
                                    { id: 'stock', label: 'الكمية' }
                                ].map(s => (
                                    <DropdownMenuItem key={s.id} onClick={() => { 
                                        if (sortBy === s.id) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                                        else { setSortBy(s.id as any); setSortOrder('asc'); }
                                        setPage(1);
                                    }} className={cn("rounded-lg m-1 flex justify-between font-bold", sortBy === s.id && "bg-slate-100 dark:bg-white/10 text-cyan-600 dark:text-cyan-400")}>
                                        {s.label}
                                        {sortBy === s.id && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

             {/* Add Product Modal */}
             <AddProductModal
                 isOpen={addProductOpen}
                 onClose={() => setAddProductOpen(false)}
                 categories={categories}
                 allProducts={products}
                  units={unitsList}
                  models={models}
                  attributes={attributes}
                 csrfToken={csrfToken}
                 features={features}
                 onSuccess={() => { refetch(); }}
             />

            {/* Products Grid */}
            <div className="glass-card overflow-hidden border border-slate-200 dark:border-white/5 bg-white dark:bg-black/20 shadow-2xl rounded-xl flex flex-col min-h-[500px]">
                <div className="table-container max-h-[700px] custom-scrollbar overflow-y-auto">
                    <table className="zebra-table sticky-header w-full text-start">
                        <thead className="bg-slate-50 dark:bg-transparent text-slate-500 dark:text-zinc-300 text-[11px] uppercase tracking-wider border-b border-slate-200 dark:border-white/5">
                            <tr>
                                <th className="px-6 py-4 text-center w-[80px]">
                                    <input
                                        type="checkbox"
                                        checked={selectedProducts.size === products.length && products.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedProducts(new Set(products.map((p: any) => p.id)));
                                            } else {
                                                setSelectedProducts(new Set());
                                            }
                                        }}
                                        className="w-4 h-4 cursor-pointer accent-cyan-500"
                                    />
                                </th>
                                <th className="px-6 py-4 text-start font-black w-[150px] cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('sku')}>
                                    <div className="flex items-center gap-2">
                                        {getSortIcon('sku')}
                                        {t('sku')}
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-start font-black cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('name')}>
                                    <div className="flex items-center gap-2">
                                        {getSortIcon('name')}
                                        {t('name')}
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-start font-black w-[150px]">{t('model') || "الموديل"}</th>
                                <th className="px-6 py-4 text-start font-black w-[150px]">{t('category')}</th>
                                <th className="px-6 py-4 text-center font-black w-[120px] cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('stock')}>
                                    <div className="flex items-center justify-center gap-2">
                                        {getSortIcon('stock')}
                                        {t('stock')}
                                    </div>
                                </th>
                                {canViewCost && (
                                    <th className="px-6 py-4 text-end font-black w-[130px] cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('costPrice')}>
                                        <div className="flex items-center justify-end gap-2 text-end">
                                            {getSortIcon('costPrice')}
                                            {t('cost')}
                                        </div>
                                    </th>
                                )}
                                {canViewPrice1 && (
                                    <th className="px-6 py-4 text-end font-black w-[130px] cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('sellPrice')}>
                                        <div className="flex items-center justify-end gap-2 text-end">
                                            {getSortIcon('sellPrice')}
                                            {t('price1')}
                                        </div>
                                    </th>
                                )}
                                {canViewPrice2 && <th className="px-6 py-4 text-end font-black w-[130px]">{t('price2')}</th>}
                                {canViewPrice3 && <th className="px-6 py-4 text-end font-black w-[130px]">{t('price3')}</th>}
                                {canManage && <th className="px-6 py-4 text-end font-black w-[150px]">{tCommon('actions')}</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="p-10 text-center text-slate-400 dark:text-zinc-500 italic font-black">
                                        <div className="flex flex-col items-center gap-2 opacity-20">
                                            <Box className="w-12 h-12" />
                                            <span>{t('noProducts')}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                products.map((p: any) => (
                                    <tr key={p.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors border-slate-100 dark:border-white/5">
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedProducts.has(p.id)}
                                                onChange={(e) => {
                                                    const newSelected = new Set(selectedProducts);
                                                    if (e.target.checked) {
                                                        newSelected.add(p.id);
                                                    } else {
                                                        newSelected.delete(p.id);
                                                    }
                                                    setSelectedProducts(newSelected);
                                                }}
                                                className="w-4 h-4 cursor-pointer accent-cyan-500 bg-white/5 border-slate-200 dark:border-white/10 rounded"
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm font-bold text-cyan-600 dark:text-cyan-400/80">{p.sku}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-black text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                                                {p.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-bold text-slate-600 dark:text-zinc-400">
                                                {p.modelName || '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-black text-slate-500 dark:text-white/40 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded border border-slate-200 dark:border-white/10 uppercase tracking-wider">
                                                {categories.find((c: any) => c.id === p.categoryId)?.name || '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {p.trackStock ? (
                                                <>
                                                    <div className={clsx(
                                                        "font-black text-2xl tracking-tight leading-none",
                                                        p.stock < p.minStock ? "text-rose-500" : "text-slate-900 dark:text-white"
                                                    )}>
                                                        {Number.isInteger(Number(p.stock)) ? Number(p.stock) : Number(p.stock).toFixed(3).replace(/\.?0+$/, '')}
                                                    </div>
                                                    {p.unitAbbreviation && (
                                                        <div className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mt-1">
                                                            {p.unitAbbreviation}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                                                    <InfinityIcon className="w-3 h-3" />
                                                    {t('serviceLabel')}
                                                </span>
                                            )}
                                        </td>
                                        {canViewCost && (
                                            <td className="px-6 py-4 text-end font-mono font-black text-amber-600 dark:text-amber-500/80">
                                                {formatCurrency(p.costPrice, currency)}
                                            </td>
                                        )}
                                        {canViewPrice1 && (
                                            <td className="px-6 py-4 text-end font-mono font-black text-slate-900 dark:text-white/90">
                                                {formatCurrency(p.sellPrice, currency)}
                                            </td>
                                        )}
                                        {canViewPrice2 && (
                                            <td className="px-6 py-4 text-end font-mono font-black text-sm text-slate-400 dark:text-white/40">
                                                {formatCurrency(p.sellPrice2 || 0, currency)}
                                            </td>
                                        )}
                                        {canViewPrice3 && (
                                            <td className="px-6 py-4 text-end font-mono font-black text-sm text-slate-400 dark:text-white/40">
                                                {formatCurrency(p.sellPrice3 || 0, currency)}
                                            </td>
                                        )}
                                        {canManage && (
                                            <td className="px-6 py-4 text-end">
                                                <div className="flex justify-end items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                                    <button
                                                        onClick={() => setQuickPrintProduct(p)}
                                                        className="p-1.5 hover:bg-cyan-500/10 rounded-lg text-white/40 hover:text-cyan-400 transition-colors"
                                                        title={t('quickPrint')}
                                                    >
                                                        <Printer className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingProduct(p)}
                                                        className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                                                        title={tCommon('edit')}
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    {warehouseId && csrfToken && hasPermission(user?.permissions, PERMISSIONS.INVENTORY_MANAGE) && (
                                                        <button
                                                            onClick={() => setWastageProduct(p)}
                                                            className="px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-md text-xs font-bold border border-rose-500/20 transition-all"
                                                        >
                                                            {t('reportWastage')}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(p.id)}
                                                        disabled={deletingId === p.id}
                                                        className="p-1.5 hover:bg-rose-500/10 rounded-lg text-rose-400 hover:text-rose-500 transition-colors"
                                                        title={tCommon('delete')}
                                                    >
                                                        {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="border-t border-slate-200 dark:border-white/5 p-4 flex items-center justify-between bg-slate-50 dark:bg-black/20">
                    <div className="text-sm text-slate-500 dark:text-zinc-500 font-black">
                        {t('pageInfo', { page: pagination.page, total: pagination.totalPages || 1 })}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || isQueryLoading}
                            className="p-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-20 transition-all active:scale-90"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-500 dark:text-zinc-400" />
                        </button>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= (pagination.totalPages || 1) || isQueryLoading}
                            className="p-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-20 transition-all active:scale-90"
                        >
                            <ChevronRight className="w-5 h-5 text-slate-500 dark:text-zinc-400" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            <GlassModal
                isOpen={!!editingProduct}
                onClose={() => setEditingProduct(null)}
                title={t('editTitle')}
            >
                {editingProduct && (
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 flex justify-between tracking-widest">
                                    {t('sku')}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const res = await generateNextSku();
                                            if (res.success && res.sku && editingProduct) {
                                                setEditingProduct({ ...editingProduct, sku: res.sku });
                                            }
                                        }}
                                        className="text-[10px] text-cyan-500 hover:text-cyan-400 flex items-center gap-1 font-black transition-colors"
                                    >
                                        <Wand2 className="w-3 h-3" /> {t('auto')}
                                    </button>
                                </label>
                                <input
                                    className="glass-input w-full font-black text-slate-900 dark:text-white"
                                    value={editingProduct.sku}
                                    onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('category')}</label>
                                <select
                                    className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                                    value={editingProduct.categoryId || ""}
                                    onChange={e => {
                                        const newProd = { ...editingProduct, categoryId: e.target.value, modelId: "" };
                                        newProd.name = updateDerivedName(newProd);
                                        setEditingProduct(newProd);
                                    }}
                                >
                                    <option value="">No Category</option>
                                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('model') || "الموديل"}</label>
                                <select
                                    className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                                    value={editingProduct.modelId || ""}
                                    onChange={e => {
                                        const newProd = { ...editingProduct, modelId: e.target.value };
                                        newProd.name = updateDerivedName(newProd);
                                        setEditingProduct(newProd);
                                    }}
                                >
                                    <option value="">No Model</option>
                                    {models.filter((m: any) => !editingProduct.categoryId || m.categoryId === editingProduct.categoryId).map((m: any) => {
                                        const cat = categories.find((c: any) => c.id === m.categoryId);
                                        return (
                                            <option key={m.id} value={m.id}>
                                                {cat ? `${cat.name} - ` : ''}{m.name}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">الوصف/الصفة</label>
                                <select
                                    className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                                    value={editingProduct.attributeId || ""}
                                    onChange={e => {
                                        const newProd = { ...editingProduct, attributeId: e.target.value };
                                        newProd.name = updateDerivedName(newProd);
                                        setEditingProduct(newProd);
                                    }}
                                >
                                    <option value="">بدون صفة</option>
                                    {attributes.map((a: any) => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">الوصف الإضافي</label>
                                <input
                                    className="glass-input w-full font-black text-slate-900 dark:text-white"
                                    value={editingProduct.description || ""}
                                    onChange={e => {
                                        const newProd = { ...editingProduct, description: e.target.value };
                                        newProd.name = updateDerivedName(newProd);
                                        setEditingProduct(newProd);
                                    }}
                                    placeholder="مثلاً: 128GB، لون أسود..."
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('unit') || "الوحدة"}</label>
                                <select
                                    className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                                    value={editingProduct.unitOfMeasureId || ""}
                                    onChange={e => setEditingProduct({ ...editingProduct, unitOfMeasureId: e.target.value })}
                                >
                                    <option value="">Default Unit</option>
                                    {unitsList.map(u => (
                                        <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                                    ))}
                                </select>
                            </div>
                        </div>


                        <div>
                            <label className="text-xs text-slate-500 dark:text-zinc-400 uppercase font-black mb-1 block tracking-widest">{t('name')}</label>
                            <input
                                className="glass-input w-full font-black text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-white/5 cursor-not-allowed"
                                value={editingProduct.name}
                                readOnly
                            />
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                            {/* Cost - Protected */}
                            {canViewCost ? (
                                <div>
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('cost')}</label>
                                    <input
                                        type="number"
                                        className="glass-input w-full font-black text-slate-900 dark:text-white"
                                        value={editingProduct.costPrice}
                                        onChange={e => setEditingProduct({ ...editingProduct, costPrice: parseFloat(e.target.value) })}
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('cost')}</label>
                                    <div className="glass-input w-full flex items-center justify-center text-slate-400 dark:text-muted-foreground bg-slate-100 dark:bg-muted/20 border-dashed">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                </div>
                            )}

                            {/* Price 1 - Protected */}
                            {canViewPrice1 ? (
                                <div>
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('price1')}</label>
                                    <input
                                        type="number"
                                        className="glass-input w-full font-black text-slate-900 dark:text-white"
                                        value={editingProduct.sellPrice}
                                        onChange={e => setEditingProduct({ ...editingProduct, sellPrice: parseFloat(e.target.value) })}
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('price1')}</label>
                                    <div className="glass-input w-full flex items-center justify-center text-slate-400 dark:text-muted-foreground bg-slate-100 dark:bg-muted/20 border-dashed">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                </div>
                            )}

                            {/* Price 2 - Protected */}
                            {canViewPrice2 ? (
                                <div>
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('price2')}</label>
                                    <input
                                        type="number"
                                        className="glass-input w-full font-black text-slate-900 dark:text-white"
                                        value={editingProduct.sellPrice2 || 0}
                                        onChange={e => setEditingProduct({ ...editingProduct, sellPrice2: parseFloat(e.target.value) })}
                                    />
                                </div>
                            ) : null}

                            {/* Price 3 - Protected */}
                            {canViewPrice3 ? (
                                <div>
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('price3')}</label>
                                    <input
                                        type="number"
                                        className="glass-input w-full font-black text-slate-900 dark:text-white"
                                        value={editingProduct.sellPrice3 || 0}
                                        onChange={e => setEditingProduct({ ...editingProduct, sellPrice3: parseFloat(e.target.value) })}
                                    />
                                </div>
                            ) : null}
                        </div>

                        <div className="space-y-3">
                            <div className={cn(
                                "flex items-center gap-3 p-4 rounded-2xl border transition-all shadow-sm",
                                editingProduct.hasHistory 
                                    ? "bg-slate-50 dark:bg-zinc-900/40 border-slate-200 dark:border-white/5 opacity-80" 
                                    : "bg-slate-100 dark:bg-muted/20 border-slate-200 dark:border-border"
                            )}>
                                <input
                                    type="checkbox"
                                    id="trackStock"
                                    checked={editingProduct.trackStock}
                                    disabled={editingProduct.hasHistory}
                                    onChange={e => setEditingProduct({ ...editingProduct, trackStock: e.target.checked })}
                                    className={cn(
                                        "w-5 h-5 rounded-lg text-cyan-500 cursor-pointer accent-cyan-500",
                                        editingProduct.hasHistory && "cursor-not-allowed opacity-50"
                                    )}
                                />
                                <label htmlFor="trackStock" className={cn(
                                    "text-sm font-black flex items-center gap-3 cursor-pointer text-slate-700 dark:text-white",
                                    editingProduct.hasHistory && "cursor-not-allowed"
                                )}>
                                    {editingProduct.trackStock ? 
                                        <Box className={cn("w-5 h-5", editingProduct.hasHistory ? "text-slate-300" : "text-slate-400 dark:text-zinc-400")} /> : 
                                        <InfinityIcon className={cn("w-5 h-5", editingProduct.hasHistory ? "text-cyan-300" : "text-cyan-500")} />
                                    }
                                    {t('trackStock')}
                                    {editingProduct.hasHistory && <Lock className="w-3.5 h-3.5 text-amber-500 ml-auto" />}
                                </label>
                            </div>
                            
                            {editingProduct.hasHistory && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-1">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <div className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-tight">حماية نزاهة المخزون</div>
                                        <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 leading-relaxed">
                                            لا يمكن تغيير نوع تتبع المخزون لوجود حركات سابقة (مبيعات، مشتريات) أو كمية متوفرة. لتغيير طبيعة العمل، يرجى أرشفة الصنف وإنشاء صنف جديد.
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {editingProduct.trackStock && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 underline font-black uppercase tracking-widest">{t('stock')}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            step="any"
                                            className="glass-input w-full font-black text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-white/5 cursor-not-allowed"
                                            value={editingProduct.stock}
                                            readOnly
                                            disabled
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setAdjustmentProduct(editingProduct)}
                                            className="px-3 bg-cyan-500 hover:bg-cyan-400 text-black text-[10px] font-black rounded-xl shadow-lg shadow-cyan-500/20 active:scale-95 transition-all whitespace-nowrap"
                                        >
                                            إجراء تسوية جردية
                                        </button>
                                    </div>
                                    <div className="text-[10px] text-amber-500/80 font-black pt-1">
                                        تعديل الكمية يتم فقط من خلال التسوية الجردية.
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 underline font-black uppercase tracking-widest">{t('minStock')}</label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="glass-input w-full font-black text-slate-900 dark:text-white"
                                        value={editingProduct.minStock}
                                        onChange={e => setEditingProduct({ ...editingProduct, minStock: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>
                        )}

                        {features?.unitVisibility !== false && (
                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('unitOfMeasure') || 'وحدة القياس'}</label>
                                <select
                                    className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                                    value={editingProduct.unitOfMeasureId || ""}
                                    onChange={e => setEditingProduct({ ...editingProduct, unitOfMeasureId: e.target.value || null })}
                                >
                                    <option value="">{t('noUnit') || 'بدون وحدة'}</option>
                                    {Object.entries(unitsByCategory).map(([category, catUnits]: [string, any]) => (
                                        <optgroup key={category} label={category}>
                                            {catUnits.map((u: any) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name} ({u.code})
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-white/5">
                            <button
                                type="button"
                                onClick={() => setEditingProduct(null)}
                                className="px-6 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-muted text-slate-500 dark:text-muted-foreground font-black transition-all"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-8 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
                            >
                                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                                {t('saveChanges')}
                            </button>
                        </div>
                    </form>
                )}
            </GlassModal>

            {/* Barcode Print Dialog */}
            {showPrintDialog && (
                <BarcodePrintDialog
                    products={products.filter((p: any) => selectedProducts.has(p.id))}
                    onClose={() => {
                        setShowPrintDialog(false);
                        setSelectedProducts(new Set());
                    }}
                />
            )}

            {/* Wastage Dialog (Single Instance) */}
            {warehouseId && csrfToken && (
                <WastageDialog
                    open={!!wastageProduct}
                    onOpenChange={(open) => !open && setWastageProduct(null)}
                    product={wastageProduct}
                    warehouseId={warehouseId}
                    csrfToken={csrfToken}
                />
            )}

            {/* Reconciliation Dialog */}
            {warehouseId && csrfToken && (
                <StockAdjustmentModal
                    isOpen={!!adjustmentProduct}
                    onClose={() => setAdjustmentProduct(null)}
                    product={adjustmentProduct}
                    warehouseId={warehouseId}
                    csrfToken={csrfToken}
                    onSuccess={() => {
                        setEditingProduct(null);
                        setAdjustmentProduct(null);
                        refetch();
                    }}
                />
            )}

            {/* Quick Print Component (Hidden) */}
            <ThermalPrintLabel
                products={quickPrintProduct ? [{ ...quickPrintProduct, quantity: 1 } as any] : []}
                autoPrint={!!quickPrintProduct}
                showButton={false}
                onAfterPrint={() => setQuickPrintProduct(null)}
            />
        </div>
    );
}
