"use client";

import { useState } from "react";
import { 
    Search, Box, Edit, Loader2, Save, Wand2, Trash2, 
    ChevronLeft, ChevronRight, Lock, Printer, Infinity as InfinityIcon, 
    Plus, Filter, ChevronDown, Clock, Calendar, Activity as ActivityIcon, 
    ArrowUpDown, ChevronUp 
} from "lucide-react";
import { BarcodePrintDialog } from "./BarcodePrintDialog";
import { WastageDialog } from "./WastageDialog";
import { ThermalPrintLabel } from "./ThermalPrintLabel";
import AddProductModal from "./AddProductModal";
import { updateProduct, generateNextSku, deleteProduct, getProducts, getWarehouses } from "@/actions/inventory";
import GlassModal from "../ui/GlassModal";
import clsx from "clsx";
import BarcodeListener from "./BarcodeListener";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useTranslations } from "@/lib/i18n-mock";
import { formatCurrency, cn } from "@/lib/utils";
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

interface Product {
    id: string;
    sku: string;
    name: string;
    stock: number;
    costPrice: number;
    sellPrice: number;
    sellPrice2: number;
    sellPrice3: number;
    categoryId: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    archived: boolean;
    minStock: number;
    trackStock: boolean;
    version: number;
}

interface Category {
    id: string;
    name: string;
}

export default function ProductsTab({
    products: initialProducts,
    categories,
    csrfToken,
    user,
    warehouseId,
    currency = "EGP"
}: {
    products: any[];
    categories: Category[];
    csrfToken?: string;
    user?: any;
    warehouseId?: string;
    currency?: string;
}) {
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
    const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'stock'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Fetch Warehouses for filter
    const { data: warehousesData } = useQuery({
        queryKey: ['warehouses'],
        queryFn: async () => {
            const res = await getWarehouses();
            return res.data || [];
        }
    });
    const warehouses = warehousesData || [];

    // Permission Checks
    const canManage = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_MANAGE);
    const canViewCost = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_VIEW_COST);
    const canViewPrice1 = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_VIEW_PRICE_1);
    const canViewPrice2 = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_VIEW_PRICE_2);
    const canViewPrice3 = hasPermission(user?.permissions, PERMISSIONS.INVENTORY_VIEW_PRICE_3);

    // Wastage Dialog State
    const [wastageProduct, setWastageProduct] = useState<Product | null>(null);
    const [quickPrintProduct, setQuickPrintProduct] = useState<Product | null>(null);
    const [addProductOpen, setAddProductOpen] = useState(false);

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

    const products = queryData?.data || [];
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
            minStock: 5,
            trackStock: editingProduct.trackStock,
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
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 group-focus-within/search:text-cyan-400 transition-all pointer-events-none" />
                        <input
                            type="text"
                            placeholder={t('searchPlaceholder')}
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className="w-full glass-input ps-12 py-3 bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500/50 transition-all font-medium rounded-xl"
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
                    <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-white/10 flex-wrap overflow-hidden">
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
                                    "h-8 text-[11px] font-bold px-3 rounded-lg transition-all",
                                    dateFilter === f.id 
                                        ? "bg-cyan-500 text-black hover:bg-cyan-400 shadow-md shadow-cyan-500/20" 
                                        : "text-zinc-400 hover:text-white hover:bg-white/5"
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

                        <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />

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
                            className="w-48 bg-transparent border-0 text-xs h-8 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-0"
                            placeholder="تاريخ مخصص..."
                        />
                    </div>

                    {/* Warehouse Filter */}
                    <div className="flex gap-2 flex-wrap">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="border-white/10 gap-2 h-10 px-4 bg-zinc-900/50 rounded-xl hover:bg-zinc-800 transition-all">
                                    <Box className="w-4 h-4 text-zinc-400" />
                                    <span className="text-zinc-300">
                                        {filterWarehouseId 
                                            ? warehouses.find(w => w.id === filterWarehouseId)?.name 
                                            : "كل المستودعات"}
                                    </span>
                                    <ChevronDown className="w-3 h-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56 bg-zinc-950 border-white/10 text-white rounded-xl shadow-2xl backdrop-blur-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-500 p-3">تصفية حسب المستودع</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => { setFilterWarehouseId(""); setPage(1); }} className={cn("rounded-lg m-1", !filterWarehouseId && "bg-white/10")}>
                                    كل المستودعات
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-white/5" />
                                {warehouses.map(wh => (
                                    <DropdownMenuItem key={wh.id} onClick={() => { setFilterWarehouseId(wh.id); setPage(1); }} className={cn("rounded-lg m-1", filterWarehouseId === wh.id && "bg-white/10 text-cyan-400 font-bold")}>
                                        {wh.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Category Filter Group */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="border-white/10 gap-2 h-10 px-4 bg-zinc-900/50 rounded-xl hover:bg-zinc-800 transition-all">
                                    <Filter className="w-4 h-4 text-zinc-400" />
                                    <span className="text-zinc-300">
                                        {categoryId 
                                            ? categories.find(c => c.id === categoryId)?.name 
                                            : (tCommon('allCategories') || "كل الأقسام")}
                                    </span>
                                    <ChevronDown className="w-3 h-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56 bg-zinc-950 border-white/10 text-white rounded-xl shadow-2xl backdrop-blur-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-500 p-3">الأقسام</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => { setCategoryId(""); setPage(1); }} className="rounded-lg m-1">
                                    {tCommon('allCategories') || "كل الأقسام"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-white/5" />
                                {categories.map(cat => (
                                    <DropdownMenuItem key={cat.id} onClick={() => { setCategoryId(cat.id); setPage(1); }} className={cn("rounded-lg m-1", categoryId === cat.id && "bg-white/10 text-cyan-400 font-bold")}>
                                        {cat.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Status Filter */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="border-white/10 gap-2 h-10 px-4 bg-zinc-900/50 rounded-xl hover:bg-zinc-800 transition-all">
                                    <ActivityIcon className="w-4 h-4 text-zinc-400" />
                                    <span className="text-zinc-300">
                                        {stockStatus === "in_stock" ? "متوفر" :
                                         stockStatus === "low_stock" ? "منخفض" :
                                         stockStatus === "out_of_stock" ? "نفذ" :
                                         stockStatus === "services" ? "خدمات" : "كل الحالات"}
                                    </span>
                                    <ChevronDown className="w-3 h-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border-white/10 text-white rounded-xl shadow-2xl backdrop-blur-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-500 p-3">حالة المخزون</DropdownMenuLabel>
                                {[
                                    { id: "", label: "كل الحالات" },
                                    { id: "in_stock", label: "متوفر" },
                                    { id: "low_stock", label: "أوشك على النفاذ" },
                                    { id: "out_of_stock", label: "نفذت الكمية" },
                                    { id: "services", label: "خدمات" }
                                ].map(st => (
                                    <DropdownMenuItem key={st.id} onClick={() => { setStockStatus(st.id); setPage(1); }} className={cn("rounded-lg m-1", stockStatus === st.id && "bg-white/10 text-cyan-400 font-bold")}>
                                        {st.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Sort Logic */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="border-white/10 gap-2 h-10 px-4 bg-zinc-900/50 rounded-xl hover:bg-zinc-800 transition-all">
                                    <ArrowUpDown className="w-4 h-4 text-zinc-400" />
                                    <span className="text-zinc-300">
                                        {sortBy === 'name' ? 'الاسم' : (sortBy === 'createdAt' ? 'التاريخ' : 'الكمية')}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border-white/10 text-white rounded-xl shadow-2xl backdrop-blur-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-500 p-3">ترتيب حسب</DropdownMenuLabel>
                                {[
                                    { id: 'name', label: 'الاسم' },
                                    { id: 'createdAt', label: 'تاريخ الإضافة' },
                                    { id: 'stock', label: 'الكمية' }
                                ].map(s => (
                                    <DropdownMenuItem key={s.id} onClick={() => { 
                                        if (sortBy === s.id) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                                        else { setSortBy(s.id as any); setSortOrder('asc'); }
                                        setPage(1);
                                    }} className={cn("rounded-lg m-1 flex justify-between", sortBy === s.id && "bg-white/10 text-cyan-400 font-bold")}>
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
                csrfToken={csrfToken}
                onSuccess={() => { refetch(); }}
            />

            {/* Old search bar removed - integrated above */}
            <div className="hidden">
            </div>

            {/* Products Grid */}
            <div className="glass-card overflow-hidden border border-border bg-card shadow-sm rounded-xl flex flex-col min-h-[500px]">
                <div className="flex-1">
                    <table className="w-full text-start">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                            <tr>
                                <th className="p-4 w-12">
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
                                        className="w-4 h-4 cursor-pointer"
                                    />
                                </th>
                                <th className="p-4 text-start font-medium">{t('sku')}</th>
                                <th className="p-4 text-start font-medium">{t('name')}</th>
                                <th className="p-4 text-start font-medium">{t('category')}</th>
                                <th className="p-4 text-center font-medium">{t('stock')}</th>
                                {canViewPrice1 && <th className="p-4 text-end font-medium">{t('price1')}</th>}
                                {canViewPrice2 && <th className="p-4 text-end font-medium">{t('price2')}</th>}
                                {canViewPrice3 && <th className="p-4 text-end font-medium">{t('price3')}</th>}
                                {canManage && <th className="p-4 w-10"></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-sm">
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={7 + (canViewPrice1 ? 1 : 0) + (canViewPrice2 ? 1 : 0) + (canViewPrice3 ? 1 : 0)} className="p-10 text-center text-muted-foreground">
                                        <Box className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                        {t('noProducts')}
                                    </td>
                                </tr>
                            ) : (
                                products.map((p: any) => (
                                    <tr key={p.id} className="hover:bg-muted/50 transition-colors group">
                                        <td className="p-4">
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
                                                className="w-4 h-4 cursor-pointer"
                                            />
                                        </td>
                                        <td className="p-4 font-mono text-primary/80 font-medium">{p.sku}</td>
                                        <td className="p-4 font-medium text-foreground">{p.name}</td>
                                        <td className="p-4 text-muted-foreground">
                                            {categories.find(c => c.id === p.categoryId)?.name || '-'}
                                        </td>
                                        <td className="p-4 text-center">
                                            {p.trackStock === false ? (
                                                <span className="px-2 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-500 flex items-center justify-center gap-1">
                                                    <InfinityIcon className="w-3 h-3" />
                                                    {t('serviceLabel')}
                                                </span>
                                            ) : (
                                                <span className={clsx("px-2 py-1 rounded-full text-xs font-bold", p.stock < 5 ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600')}>
                                                    {p.stock}
                                                </span>
                                            )}
                                        </td>
                                        {canViewPrice1 && <td className="p-4 text-end font-bold text-foreground">{formatCurrency(p.sellPrice, currency)}</td>}
                                        {canViewPrice2 && <td className="p-4 text-end font-mono text-muted-foreground">{formatCurrency(p.sellPrice2 || 0, currency)}</td>}
                                        {canViewPrice3 && <td className="p-4 text-end font-mono text-muted-foreground">{formatCurrency(p.sellPrice3 || 0, currency)}</td>}
                                        {canManage && (
                                            <td className="p-4 text-center flex gap-2 justify-end">
                                                <button
                                                    onClick={() => setQuickPrintProduct(p)}
                                                    className="p-2 hover:bg-cyan-500/10 rounded-lg text-muted-foreground hover:text-cyan-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title={t('quickPrint')}
                                                >
                                                    <Printer className="w-4 h-4" />
                                                </button>

                                                <button
                                                    onClick={() => setEditingProduct(p)}
                                                    className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title={tCommon('edit')}
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>

                                                {warehouseId && csrfToken && hasPermission(user?.permissions, PERMISSIONS.INVENTORY_MANAGE) && (
                                                    <button
                                                        onClick={() => setWastageProduct(p)}
                                                        className="px-3 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-md text-xs font-medium flex items-center gap-1 transition-colors"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                        {t('wastage')}
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleDelete(p.id)}
                                                    disabled={deletingId === p.id}
                                                    className="p-2 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title={tCommon('delete')}
                                                >
                                                    {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="border-t border-border p-4 flex items-center justify-between bg-muted/20">
                    <div className="text-sm text-muted-foreground">
                        {t('pageInfo', { page: pagination.page, total: pagination.totalPages || 1 })}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || isQueryLoading}
                            className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-50 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= (pagination.totalPages || 1) || isQueryLoading}
                            className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-50 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
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
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 flex justify-between">
                                    {t('sku')}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const res = await generateNextSku();
                                            if (res.success && res.sku && editingProduct) {
                                                setEditingProduct({ ...editingProduct, sku: res.sku });
                                            }
                                        }}
                                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                                    >
                                        <Wand2 className="w-3 h-3" /> {t('auto')}
                                    </button>
                                </label>
                                <input
                                    className="glass-input w-full"
                                    value={editingProduct.sku}
                                    onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('category')}</label>
                                <select
                                    className="glass-input w-full [&>option]:text-black"
                                    value={editingProduct.categoryId || ""}
                                    onChange={e => setEditingProduct({ ...editingProduct, categoryId: e.target.value })}
                                >
                                    <option value="">No Category</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('name')}</label>
                            <input
                                className="glass-input w-full"
                                value={editingProduct.name}
                                onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {/* Cost - Protected */}
                            {canViewCost ? (
                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('cost')}</label>
                                    <input
                                        type="number"
                                        className="glass-input w-full"
                                        value={editingProduct.costPrice}
                                        onChange={e => setEditingProduct({ ...editingProduct, costPrice: parseFloat(e.target.value) })}
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('cost')}</label>
                                    <div className="glass-input w-full flex items-center justify-center text-muted-foreground bg-muted/20">
                                        <Lock className="w-3 h-3" />
                                    </div>
                                </div>
                            )}

                            {/* Price 1 - Protected */}
                            {canViewPrice1 ? (
                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('price1')}</label>
                                    <input
                                        type="number"
                                        className="glass-input w-full"
                                        value={editingProduct.sellPrice}
                                        onChange={e => setEditingProduct({ ...editingProduct, sellPrice: parseFloat(e.target.value) })}
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('price1')}</label>
                                    <div className="glass-input w-full flex items-center justify-center text-muted-foreground bg-muted/20">
                                        <Lock className="w-3 h-3" />
                                    </div>
                                </div>
                            )}

                            {/* Price 2 - Protected */}
                            {canViewPrice2 ? (
                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('price2')}</label>
                                    <input
                                        type="number"
                                        className="glass-input w-full"
                                        value={editingProduct.sellPrice2 || 0}
                                        onChange={e => setEditingProduct({ ...editingProduct, sellPrice2: parseFloat(e.target.value) })}
                                    />
                                </div>
                            ) : null}

                            {/* Price 3 - Protected */}
                            {canViewPrice3 ? (
                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('price3')}</label>
                                    <input
                                        type="number"
                                        className="glass-input w-full"
                                        value={editingProduct.sellPrice3 || 0}
                                        onChange={e => setEditingProduct({ ...editingProduct, sellPrice3: parseFloat(e.target.value) })}
                                    />
                                </div>
                            ) : null}
                        </div>

                        <div className="flex items-center gap-2 p-3 bg-muted/20 rounded-xl border border-border">
                            <input
                                type="checkbox"
                                id="trackStock"
                                checked={editingProduct.trackStock}
                                onChange={e => setEditingProduct({ ...editingProduct, trackStock: e.target.checked })}
                                className="w-4 h-4 rounded text-cyan-500"
                            />
                            <label htmlFor="trackStock" className="text-sm font-bold flex items-center gap-2 cursor-pointer">
                                {editingProduct.trackStock ? <Box className="w-4 h-4 text-zinc-400" /> : <InfinityIcon className="w-4 h-4 text-cyan-400" />}
                                {editingProduct.trackStock ? t('products.trackStockOn') : t('products.trackStockOff')}
                            </label>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <button
                                type="button"
                                onClick={() => setEditingProduct(null)}
                                className="px-4 py-2 rounded-xl hover:bg-muted text-muted-foreground"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-6 py-2 rounded-xl flex items-center gap-2"
                            >
                                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
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
