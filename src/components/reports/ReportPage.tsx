"use client"

import React, { useState, useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    ShoppingCart,
    FileText,
    Filter,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Calendar as CalendarIcon,
    Printer,
    BarChart2,
    Package,
    Tag,
    Download,
    ChevronUp,
    ChevronDown,
    ArrowUpDown,
    Clock,
    User,
    Wrench,
    Wallet
} from "lucide-react"
import * as XLSX from "xlsx"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from "recharts"
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import { Combobox } from "@/components/ui/combobox"
import { printZReport } from "@/lib/print-zreport"
import { toast } from "sonner"
import { format, formatDistanceToNow } from "date-fns"
import { ar } from "date-fns/locale"
import { cn } from "@/lib/utils"

const translateMethod = (method: string) => {
    if (!method) return "نقداً";
    switch (method.toUpperCase()) {
        case 'CASH': return 'كاش';
        case 'VISA':
        case 'CARD': return 'فيزا';
        case 'WALLET': return 'محفظة';
        case 'INSTAPAY': return 'انستاباي';
        case 'ACCOUNT':
        case 'DEFERRED': return 'آجل';
        default: return method;
    }
};

interface ReportPageProps {
    initialData: any
    branches: any[]
    categories?: any[]
    products?: any[]
    shifts?: any[]
    salesByProduct?: any[]
    salesByCategory?: any[]
    filters: {
        startDate?: string
        endDate?: string
        branchId?: string
        categoryId?: string
        productId?: string
        sortBy?: string
    }
}

export default function ReportPage({ initialData, branches, categories = [], products = [], shifts = [], salesByProduct = [], salesByCategory = [], filters }: ReportPageProps) {
    const router = useRouter()
    const pathname = usePathname()
    const rawSearchParams = useSearchParams()
    const searchParams = rawSearchParams || new URLSearchParams()

    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '')
    const [swipeState, setSwipeState] = useState<{ id: string, startX: number }>({ id: '', startX: 0 })
    const [isExporting, setIsExporting] = useState(false)

    // Sorting States
    const [txSort, setTxSort] = useState<{ key: string, order: 'asc' | 'desc' }>({ key: 'date', order: 'desc' })
    const [auditSort, setAuditSort] = useState<{ key: string, order: 'asc' | 'desc' }>({ key: 'date', order: 'desc' })
    const [catSort, setCatSort] = useState<{ key: string, order: 'asc' | 'desc' }>({ key: 'totalRevenue', order: 'desc' })
    const [prodSort, setProdSort] = useState<{ key: string, order: 'asc' | 'desc' }>({ key: 'totalRevenue', order: 'desc' })
    const [shiftSort, setShiftSort] = useState<{ key: string, order: 'asc' | 'desc' }>({ key: 'openedAt', order: 'desc' })

    const SortIcon = ({ current, target, order }: { current: string, target: string, order: 'asc' | 'desc' }) => {
        if (current !== target) return <ChevronDown className="w-3 h-3 opacity-20" />;
        return order === 'asc' ? <ChevronUp className="w-3 h-3 text-cyan-400" /> : <ChevronDown className="w-3 h-3 text-cyan-400" />;
    };

    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh()
        }, 60000)
        return () => clearInterval(interval)
    }, [router])

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (searchTerm !== (searchParams.get('q') || '')) {
                updateFilters({ q: searchTerm })
            }
        }, 300)

        return () => clearTimeout(delayDebounceFn)
    }, [searchTerm, searchParams])

    const getQuickDate = (type: 'today' | 'week' | 'month') => {
        const today = new Date();
        if (type === 'today') return { startDate: format(today, 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') }
        if (type === 'week') {
            const start = new Date(today);
            start.setDate(today.getDate() - 7);
            return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') }
        }
        if (type === 'month') {
            const start = new Date(today);
            start.setDate(today.getDate() - 30);
            return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') }
        }
        return {}
    }

    const handleTouchStart = (e: React.TouchEvent, id: string) => {
        setSwipeState({ id, startX: e.touches[0].clientX })
    }

    const handleTouchEnd = (e: React.TouchEvent, id: string) => {
        const endX = e.changedTouches[0].clientX
        const diff = endX - swipeState.startX
        if (swipeState.id === id) {
            if (diff > 50) {
                toast.info("🖨️ طباعة سريعة للعملية: " + id)
            } else if (diff < -50) {
                toast.info("📄 عرض تفاصيل العملية: " + id)
            }
        }
        setSwipeState({ id: '', startX: 0 })
    }

    const exportToExcel = () => {
        setIsExporting(true);
        setTimeout(() => {
            const data = transactions.map((t: any) => {
                const typeStr =
                    t.type === 'SALE' ? (t.isReturn ? 'مرتجع مبيعات' : 'فاتورة بيع') :
                        t.type === 'PURCHASE' ? (t.isReturn ? 'مرتجع مشتريات' : 'فاتورة شراء') :
                            t.type === 'MAINTENANCE' ? 'صيانة' :
                                t.type === 'INCOME' ? 'إيرادات أخرى' : 'صرف مصروف';
                return {
                    "التاريخ": format(new Date(t.date), 'yyyy-MM-dd HH:mm'),
                    "النوع": typeStr,
                    "الفرع": t.branch || '',
                    "طريقة الدفع": translateMethod(t.method),
                    "المبلغ": t.amount,
                    "الحالة": "مكتمل"
                };
            });
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "المعاملات المالية");
            XLSX.writeFile(wb, `casper_financial_report_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
            setIsExporting(false);
        }, 500);
    }

    const exportShiftsToExcel = () => {
        setIsExporting(true);
        setTimeout(() => {
            const data = shifts.map((s: any) => ({
                "معرف الوردية": s.id,
                "تاريخ الفتح": format(new Date(s.openedAt), 'yyyy-MM-dd HH:mm'),
                "تاريخ الإغلاق": s.closedAt ? format(new Date(s.closedAt), 'yyyy-MM-dd HH:mm') : '-',
                "الكاشير": s.cashierName || s.user?.name || s.user?.username || 'غير معروف',
                "حالة الوردية": s.status === 'CLOSED' ? 'مغلقة' : s.status === 'FORCE_CLOSED' ? 'إغلاق إجباري' : 'مفتوحة',
                "مبلغ العهدة": s.startCash,
                "إجمالي المبيعات": s.totalCashSales,
                "المبلغ الفعلي": s.actualCash,
                "العجز/الزيادة": s.cashVariance
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "الورديات");
            XLSX.writeFile(wb, `casper_shifts_report_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
            setIsExporting(false);
        }, 500);
    }

    const exportSalesByCategoryToExcel = () => {
        setIsExporting(true);
        setTimeout(() => {
            const data = salesByCategory.map((c: any) => {
                const profit = c.totalRevenue - c.totalCost;
                const margin = c.totalRevenue > 0 ? ((profit / c.totalRevenue) * 100).toFixed(1) : '0';
                return {
                    "الفئة": c.categoryName,
                    "عدد الأصناف": c.productCount,
                    "الكمية المباعة": c.totalQty,
                    "الإيرادات": c.totalRevenue,
                    "التكلفة": c.totalCost,
                    "الربح": profit,
                    "هامش الربح %": margin
                };
            });
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "المبيعات حسب الفئة");
            XLSX.writeFile(wb, `casper_sales_by_category_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
            setIsExporting(false);
        }, 500);
    }

    const exportSalesByProductToExcel = () => {
        setIsExporting(true);
        setTimeout(() => {
            const data = salesByProduct.map((p: any) => ({
                "الصنف": p.name,
                "SKU": p.sku,
                "الفئة": p.categoryName,
                "الكمية": p.totalQty,
                "الإيرادات": p.totalRevenue,
                "التكلفة": p.totalCost,
                "الربح": p.totalRevenue - p.totalCost
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "المبيعات حسب الصنف");
            XLSX.writeFile(wb, `casper_sales_by_product_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
            setIsExporting(false);
        }, 500);
    }

    const updateFilters = (newFilters: any) => {
        const params = new URLSearchParams(searchParams.toString())

        // Ensure the current tab is preserved when updating filters
        if (activeTab && !newFilters.tab) {
            params.set('tab', activeTab)
        }

        Object.entries(newFilters).forEach(([key, value]) => {
            if (value) {
                params.set(key, value as string)
            } else {
                params.delete(key)
            }
        })
        router.push(`${pathname}?${params.toString()}`)
    }

    const activeTab = searchParams.get('tab') || "financial";
    const onTabChange = (val: string) => {
        updateFilters({ tab: val })
    }

    if (!initialData) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="bg-zinc-900 p-4 rounded-full border border-white/5 shadow-2xl">
                    <Search className="w-10 h-10 text-zinc-700" />
                </div>
                <div className="text-zinc-500 text-lg">لم يتم العثور على بيانات في هذه الفترة</div>
                <Button
                    variant="outline"
                    className="mt-2 border-white/10 hover:bg-zinc-900"
                    onClick={() => updateFilters({ startDate: "", endDate: "", branchId: "", categoryId: "", productId: "" })}
                >
                    إعادة تعيين الفلاتر
                </Button>
            </div>
        )
    }

    const { kpis, trendData, transactions: rawTransactions, auditLogs = [] } = initialData

    // Local filter override for instant table responsiveness
    const activeSearchQuery = searchParams.get('q')?.toLowerCase() || "";
    const activeTypeFilter = searchParams.get('type') || "all";
    const activeMethodFilter = searchParams.get('method') || "all";

    const transactions = [...rawTransactions]
        .filter((t: any) => {
            let match = true;
            if (activeSearchQuery) {
                match = match && (
                    t.id.toLowerCase().includes(activeSearchQuery) ||
                    (t.description && t.description.toLowerCase().includes(activeSearchQuery)) ||
                    (t.method && translateMethod(t.method).toLowerCase().includes(activeSearchQuery))
                );
            }
            if (activeTypeFilter !== 'all') {
                match = match && t.type === activeTypeFilter;
            }
            if (activeMethodFilter !== 'all') {
                match = match && translateMethod(t.method) === activeMethodFilter;
            }
            return match;
        })
        .sort((a, b) => {
            const aValue = a[txSort.key];
            const bValue = b[txSort.key];
            if (aValue < bValue) return txSort.order === 'asc' ? -1 : 1;
            if (aValue > bValue) return txSort.order === 'asc' ? 1 : -1;
            return 0;
        });

    const sortedAuditLogs = [...(auditLogs || [])].sort((a, b) => {
        const aValue = a[auditSort.key];
        const bValue = b[auditSort.key];
        if (aValue < bValue) return auditSort.order === 'asc' ? -1 : 1;
        if (aValue > bValue) return auditSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    const sortedSalesByCategory = [...(salesByCategory || [])].sort((a, b) => {
        let aValue = a[catSort.key];
        let bValue = b[catSort.key];
        if (catSort.key === 'profit') {
            aValue = a.totalRevenue - a.totalCost;
            bValue = b.totalRevenue - b.totalCost;
        }
        if (aValue < bValue) return catSort.order === 'asc' ? -1 : 1;
        if (aValue > bValue) return catSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    const sortedSalesByProduct = [...(salesByProduct || [])].sort((a, b) => {
        let aValue = a[prodSort.key];
        let bValue = b[prodSort.key];
        if (prodSort.key === 'profit') {
            aValue = a.totalRevenue - a.totalCost;
            bValue = b.totalRevenue - b.totalCost;
        }
        if (aValue < bValue) return prodSort.order === 'asc' ? -1 : 1;
        if (aValue > bValue) return prodSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    const sortedShifts = [...(shifts || [])].sort((a, b) => {
        const aValue = a[shiftSort.key];
        const bValue = b[shiftSort.key];
        if (aValue < bValue) return shiftSort.order === 'asc' ? -1 : 1;
        if (aValue > bValue) return shiftSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    return (
        <div className="p-6 space-y-6 bg-black min-h-screen text-zinc-100">
            {/* Header & Filters */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent print:text-black print:bg-none">
                        التقارير والتحليلات
                    </h1>
                    <div className="flex items-center gap-2 text-zinc-500 mt-2 text-sm">
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/5 text-zinc-400 print:bg-transparent print:border-none print:text-black">نظرة عامة</span>
                        <span className="print:hidden">•</span>
                        <span className="print:text-black">أداء المبيعات والمشتريات والمصاريف</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 print:hidden">
                    <div className="flex items-center gap-2 bg-zinc-900/50 p-1 rounded-lg border border-white/5">
                        <Select
                            value={filters.branchId || "all"}
                            onValueChange={(val) => updateFilters({ branchId: val === "all" ? "" : val })}
                        >
                            <SelectTrigger className="w-[140px] bg-transparent border-none text-zinc-300 focus:ring-0">
                                <SelectValue placeholder="كل الفروع" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10 text-zinc-300">
                                <SelectItem value="all">كل الفروع</SelectItem>
                                {branches.map((b: any) => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="w-px h-5 bg-white/10 mx-1" />

                        <Combobox
                            options={[
                                { label: "كل الفئات", value: "all" },
                                ...categories.map(c => ({ label: c.name, value: c.id }))
                            ]}
                            value={filters.categoryId || "all"}
                            onChange={(val) => updateFilters({ categoryId: val === "all" ? "" : val })}
                            placeholder="كل الفئات"
                            className="w-[160px] bg-transparent border-none text-zinc-300 ring-0 focus:ring-0"
                        />

                        <div className="w-px h-5 bg-white/10 mx-1" />

                        <Combobox
                            options={[
                                { label: "كل الأصناف", value: "all" },
                                ...products.map(p => ({ label: `${p.name} (${p.sku})`, value: p.id }))
                            ]}
                            value={filters.productId || "all"}
                            onChange={(val) => updateFilters({ productId: val === "all" ? "" : val })}
                            placeholder="كل الأصناف"
                            className="w-[180px] bg-transparent border-none text-zinc-300 ring-0 focus:ring-0"
                        />

                        <div className="w-px h-5 bg-white/10 mx-1" />

                        <Select
                            value={filters.sortBy || "revenue"}
                            onValueChange={(val) => updateFilters({ sortBy: val })}
                        >
                            <SelectTrigger className="w-[130px] bg-transparent border-none text-cyan-400 focus:ring-0 font-medium">
                                <SelectValue placeholder="ترتيب حسب" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10 text-zinc-300">
                                <SelectItem value="revenue">أعلى إيراد</SelectItem>
                                <SelectItem value="qty">أكثر كمية</SelectItem>
                                <SelectItem value="profit">أعلى ربح</SelectItem>
                                <SelectItem value="name">الاسم</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="h-10 border-r border-white/10 mx-1 hidden md:block" />

                    <div className="flex bg-zinc-900 border border-white/5 rounded-lg overflow-hidden shrink-0">
                        <button onClick={() => updateFilters(getQuickDate('today'))} className="px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white transition-colors border-l border-white/5">اليوم</button>
                        <button onClick={() => updateFilters(getQuickDate('week'))} className="px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white transition-colors border-l border-white/5">أسبوع</button>
                        <button onClick={() => updateFilters(getQuickDate('month'))} className="px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">شهر</button>
                    </div>

                    <FlatpickrRangePicker
                        className="min-w-[280px]"
                        onRangeChange={(dates) => {
                            if (dates.length === 2) {
                                updateFilters({
                                    startDate: format(dates[0], 'yyyy-MM-dd'),
                                    endDate: format(dates[1], 'yyyy-MM-dd')
                                })
                            }
                        }}
                        onClear={() => updateFilters({ startDate: "", endDate: "" })}
                        initialDates={filters.startDate && filters.endDate ? [new Date(filters.startDate), new Date(filters.endDate)] : undefined}
                    />
                </div>
            </div>

            {/* Active Filter Chips */}
            {(filters.startDate || filters.branchId || filters.categoryId || filters.productId || searchParams.get('q')) && (
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-white/10">
                    <span className="text-xs text-zinc-500 flex items-center gap-1"><Filter className="w-3 h-3" /> الفلاتر النشطة:</span>
                    {filters.startDate && (
                        <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 text-xs px-2 py-0.5 rounded cursor-pointer transition-colors border border-cyan-500/20"
                            onClick={() => updateFilters({ startDate: "", endDate: "" })}>
                            {filters.startDate} - {filters.endDate} <span className="ml-2 font-bold text-cyan-500 hover:text-white">✕</span>
                        </Badge>
                    )}
                    {filters.branchId && (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs px-2 py-0.5 rounded cursor-pointer transition-colors border border-amber-500/20"
                            onClick={() => updateFilters({ branchId: "" })}>
                            {branches.find((b: any) => b.id === filters.branchId)?.name || 'فرع'} <span className="ml-2 font-bold text-amber-500 hover:text-white">✕</span>
                        </Badge>
                    )}
                    {filters.categoryId && (
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs px-2 py-0.5 rounded cursor-pointer transition-colors border border-emerald-500/20"
                            onClick={() => updateFilters({ categoryId: "" })}>
                            {categories.find((c: any) => c.id === filters.categoryId)?.name || 'فئة'} <span className="ml-2 font-bold text-emerald-500 hover:text-white">✕</span>
                        </Badge>
                    )}
                    {filters.productId && (
                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs px-2 py-0.5 rounded cursor-pointer transition-colors border border-blue-500/20"
                            onClick={() => updateFilters({ productId: "" })}>
                            {products.find((p: any) => p.id === filters.productId)?.name || 'صنف'} <span className="ml-2 font-bold text-blue-500 hover:text-white">✕</span>
                        </Badge>
                    )}
                    {searchParams.get('q') && (
                        <Badge variant="secondary" className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 text-xs px-2 py-0.5 rounded cursor-pointer transition-colors border border-purple-500/20"
                            onClick={() => { setSearchTerm(''); updateFilters({ q: "" }) }}>
                            بحث: {searchParams.get('q')} <span className="ml-2 font-bold text-purple-500 hover:text-white">✕</span>
                        </Badge>
                    )}
                </div>
            )}

            <Tabs defaultValue="financial" value={activeTab} onValueChange={onTabChange} className="w-full space-y-6">
                <TabsList className="bg-zinc-900 border border-white/10 w-full md:w-auto inline-flex p-1 rounded-xl print:hidden">
                    <TabsTrigger value="financial" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black text-zinc-400 font-bold tracking-wide w-full md:w-48 rounded-lg transition-all duration-300">
                        المالية والمبيعات
                    </TabsTrigger>
                    <TabsTrigger value="salesbyitem" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white text-zinc-400 font-bold tracking-wide w-full md:w-48 rounded-lg transition-all duration-300">
                        <BarChart2 className="w-4 h-4 ml-2" />
                        بالصنف والفئة
                    </TabsTrigger>
                    <TabsTrigger value="shifts" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-zinc-400 font-bold tracking-wide w-full md:w-48 rounded-lg transition-all duration-300">
                        سجل الورديات
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="financial" className="space-y-6 mt-0 border-none p-0 outline-none">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KPICard
                            title="إجمالي الإيرادات"
                            value={kpis.totalRevenue}
                            icon={<DollarSign className="w-5 h-5 text-cyan-400" />}
                            trend="+12.5%"
                            color="cyan"
                            accentColor="#06b6d4"
                            data={trendData.map((d: any) => ({ value: d.revenue }))}
                        />
                        <KPICard
                            title="إجمالي المصاريف"
                            value={kpis.totalExpenses}
                            icon={<FileText className="w-5 h-5 text-rose-400" />}
                            trend="+4.2%"
                            color="rose"
                            negative
                            accentColor="#f43f5e"
                        />
                        <KPICard
                            title="إجمالي المشتريات"
                            value={kpis.totalPurchases}
                            icon={<ShoppingCart className="w-5 h-5 text-amber-400" />}
                            trend="-2.1%"
                            color="amber"
                            negative
                            accentColor="#fbbf24"
                        />
                        <KPICard
                            title="صافي الربح"
                            value={kpis.netProfit}
                            icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
                            trend="+18.3%"
                            color="emerald"
                            accentColor="#10b981"
                        />
                    </div>

                    {/* Main Dashboard Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Trend Chart */}
                        <Card className="lg:col-span-2 bg-zinc-900/30 border-white/5 shadow-2xl backdrop-blur-xl group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-[80px] -mr-16 -mt-16 rounded-full group-hover:bg-cyan-500/10 transition-colors" />
                            <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                                        <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                                            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                                        </div>
                                        اتجاه نمو الإيرادات
                                    </CardTitle>
                                    <Badge variant="outline" className="border-white/10 text-zinc-400 text-[10px] font-normal">يومي</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 sm:p-6">
                                <div className="h-[260px] sm:h-[290px] lg:h-[320px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                stroke="#52525b"
                                                fontSize={10}
                                                tickLine={false}
                                                axisLine={false}
                                                dy={10}
                                                tickFormatter={(val) => {
                                                    const d = new Date(val);
                                                    return format(d, 'dd/MM');
                                                }}
                                            />
                                            <YAxis
                                                stroke="#52525b"
                                                fontSize={10}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                            />
                                            <Tooltip
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        return (
                                                            <div className="bg-zinc-950 border border-white/10 p-3 rounded-lg shadow-2xl backdrop-blur-md">
                                                                <p className="text-[10px] text-zinc-500 mb-1">{payload[0].payload.date}</p>
                                                                <p className="text-sm font-bold text-cyan-400">${payload[0].value?.toLocaleString()}</p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="revenue"
                                                stroke="#06b6d4"
                                                strokeWidth={2.5}
                                                fillOpacity={1}
                                                fill="url(#colorRev)"
                                                animationDuration={1500}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Performance Breakdown */}
                        <Card className="bg-zinc-900/30 border-white/5 shadow-2xl backdrop-blur-xl overflow-hidden group">
                            <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                                <CardTitle className="text-lg font-medium flex items-center gap-2">
                                    <div className="p-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                                        <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
                                    </div>
                                    توزيع العمليات
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-8">
                                {/* Transaction Volume */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <h4 className="text-sm font-medium text-zinc-300">حجم المبيعات</h4>
                                            <p className="text-xs text-zinc-500">إجمالي الطلبات الناجحة</p>
                                        </div>
                                        <span className="text-xl font-bold text-zinc-200">{kpis.count} <span className="text-[10px] font-normal text-zinc-500">عملية</span></span>
                                    </div>
                                    <div className="w-full bg-zinc-950/50 h-2 rounded-full border border-white/5 overflow-hidden">
                                        <div className="bg-cyan-500 h-full w-[85%] shadow-[0_0_10px_rgba(6,182,212,0.3)]" />
                                    </div>
                                </div>

                                {/* Payment Methods */}
                                <div className="space-y-4 pt-4 border-t border-white/5">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">طرق التحصيل</h4>
                                    <div className="space-y-5">
                                        <PaymentMethodRow
                                            label="نقدي (Cash)"
                                            amount={kpis.totalRevenue * 0.55}
                                            percentage={55}
                                            color="bg-emerald-500"
                                        />
                                        <PaymentMethodRow
                                            label="بطاقة (Visa/Master)"
                                            amount={kpis.totalRevenue * 0.30}
                                            percentage={30}
                                            color="bg-blue-500"
                                        />
                                        <PaymentMethodRow
                                            label="محفظة الكترونية"
                                            amount={kpis.totalRevenue * 0.10}
                                            percentage={10}
                                            color="bg-purple-500"
                                        />
                                        <PaymentMethodRow
                                            label="آجل/دين"
                                            amount={kpis.totalRevenue * 0.05}
                                            percentage={5}
                                            color="bg-zinc-600"
                                        />
                                    </div>
                                </div>

                                {/* Conversion Rate Placeholder */}
                                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-medium text-emerald-400">معدل التحويل مرتفع</span>
                                    </div>
                                    <span className="text-xs font-bold text-emerald-500">94.2%</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Global Transactions Grid */}
                    <Card className="bg-zinc-900/30 border-white/5 shadow-2xl backdrop-blur-xl overflow-hidden">
                        <CardHeader className="border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-6">
                            <div>
                                <CardTitle className="text-lg font-medium">سجل الحركات المالية</CardTitle>
                                <p className="text-xs text-zinc-500 mt-1">آخر 50 عملية مسجلة خلال هذه الفترة</p>
                            </div>
                            <div className="flex items-center gap-3 print:hidden">
                                <div className="relative group">
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                                    <input
                                        placeholder="بحث..."
                                        className="h-9 bg-zinc-950/50 border border-white/10 rounded-lg pr-10 pl-3 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 group-hover:bg-zinc-900/50 transition-all border-dashed"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center gap-2 bg-zinc-950/50 h-9 rounded-lg border border-white/10 px-1">
                                    <Select
                                        value={activeTypeFilter}
                                        onValueChange={(val) => updateFilters({ type: val })}
                                    >
                                        <SelectTrigger className="w-[110px] h-7 text-xs bg-transparent border-none text-zinc-300 focus:ring-0">
                                            <SelectValue placeholder="النوع" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-white/10 text-zinc-300 text-xs">
                                            <SelectItem value="all">كل الأنواع</SelectItem>
                                            <SelectItem value="SALE">بيعات ومرتجعات</SelectItem>
                                            <SelectItem value="PURCHASE">مشتريات</SelectItem>
                                            <SelectItem value="INCOME">إيرادات أخرى</SelectItem>
                                            <SelectItem value="EXPENSE">مصروف</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2 bg-zinc-950/50 h-9 rounded-lg border border-white/10 px-1">
                                    <Select
                                        value={activeMethodFilter}
                                        onValueChange={(val) => updateFilters({ method: val })}
                                    >
                                        <SelectTrigger className="w-[110px] h-7 text-xs bg-transparent border-none text-zinc-300 focus:ring-0">
                                            <SelectValue placeholder="وسيلة الدفع" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-white/10 text-zinc-300 text-xs">
                                            <SelectItem value="all">كل الوسائل</SelectItem>
                                            <SelectItem value="كاش">كاش</SelectItem>
                                            <SelectItem value="فيزا">فيزا</SelectItem>
                                            <SelectItem value="محفظة">محفظة</SelectItem>
                                            <SelectItem value="آجل">آجل</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button variant="outline" size="sm" className="h-9 border-white/10 bg-zinc-950/30 text-xs" onClick={() => window.print()}>
                                    <Printer className="w-4 h-4 mr-2" />
                                    طباعة
                                </Button>
                                <Button variant="outline" size="sm" className="h-9 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs transition-all" onClick={exportToExcel} disabled={isExporting}>
                                    <Download className="w-4 h-4 mr-2" />
                                    {isExporting ? 'جاري التصدير...' : 'تصدير Excel'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-transparent h-12">
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head whitespace-nowrap" onClick={() => {
                                                const order = txSort.key === 'date' && txSort.order === 'asc' ? 'desc' : 'asc';
                                                setTxSort({ key: 'date', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">
                                                    <SortIcon current={txSort.key} target="date" order={txSort.order} />
                                                    التاريخ والوقت
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head whitespace-nowrap" onClick={() => {
                                                const order = txSort.key === 'type' && txSort.order === 'asc' ? 'desc' : 'asc';
                                                setTxSort({ key: 'type', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">
                                                    <SortIcon current={txSort.key} target="type" order={txSort.order} />
                                                    نوع الحركة
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right whitespace-nowrap">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">الفرع / المستودع</div>
                                            </TableHead>
                                            <TableHead className="text-right whitespace-nowrap">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">طريقة الدفع</div>
                                            </TableHead>
                                            <TableHead className="text-left cursor-pointer hover:bg-white/5 transition-colors group/head whitespace-nowrap" onClick={() => {
                                                const order = txSort.key === 'amount' && txSort.order === 'asc' ? 'desc' : 'asc';
                                                setTxSort({ key: 'amount', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">
                                                    <SortIcon current={txSort.key} target="amount" order={txSort.order} />
                                                    المبلغ الإجمالي
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right whitespace-nowrap">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">الحالة</div>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="divide-y divide-white/5 bg-[#0a0a0a]/40">
                                        {transactions.length > 0 ? (
                                            transactions.map((t: any) => (
                                                <TableRow
                                                    key={t.id}
                                                    className="border-white/5 hover:bg-white/[0.05] even:bg-white/[0.02] transition-all group h-[55px] cursor-pointer"
                                                    onTouchStart={(e) => handleTouchStart(e, t.id)}
                                                    onTouchEnd={(e) => handleTouchEnd(e, t.id)}
                                                >
                                                    <TableCell className="text-right py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2 text-zinc-400 font-mono text-[11px]">
                                                            <CalendarIcon className="w-3 h-3 opacity-30" />
                                                            {format(new Date(t.date), 'yyyy/MM/dd | HH:mm')}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn(
                                                                "p-1.5 rounded-lg bg-zinc-900 border border-white/5 group-hover:border-zinc-700 transition-colors",
                                                                t.type === 'SALE' ? "text-cyan-400" :
                                                                    t.type === 'PURCHASE' ? "text-amber-400" :
                                                                        t.type === 'INCOME' ? "text-emerald-400" : "text-rose-400"
                                                            )}>
                                                                {t.type === 'SALE' ? <TrendingUp className="w-3.5 h-3.5" /> :
                                                                    t.type === 'PURCHASE' ? <ShoppingCart className="w-3.5 h-3.5" /> :
                                                                        t.type === 'INCOME' ? <DollarSign className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                                                            </div>
                                                            <span className="text-xs font-black text-zinc-200 group-hover:text-cyan-400 transition-colors uppercase tracking-tight">
                                                                {t.type === 'SALE' ? (t.isReturn ? 'مرتجع مبيعات' : 'فاتورة بيع') :
                                                                    t.type === 'PURCHASE' ? (t.isReturn ? 'مرتجع مشتريات' : 'فاتورة شراء') :
                                                                        t.type === 'MAINTENANCE' ? 'صيانة' :
                                                                            t.type === 'INCOME' ? 'إيرادات أخرى' : 'صرف مصروف'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-2 text-xs text-zinc-500 font-bold">
                                                            <Package className="w-3 h-3 opacity-20" />
                                                            {t.branch || 'المخزن الافتراضي'}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="outline" className="text-[10px] font-black border-white/5 bg-zinc-900/50 text-zinc-500 px-2 py-0.5 tracking-tighter uppercase">
                                                            {translateMethod(t.method)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className={cn(
                                                        "text-left font-mono font-black text-sm",
                                                        t.amount > 0 ? "text-emerald-400" : "text-rose-400"
                                                    )}>
                                                        <div className="flex items-center gap-1.5">
                                                            {t.amount > 0 ? <TrendingUp className="w-3 h-3 opacity-50" /> : <TrendingDown className="w-3 h-3 opacity-50" />}
                                                            {t.amount > 0 ? '+' : ''}{Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            <span className="text-[10px] opacity-30 font-sans font-normal tracking-widest mr-1">EGP</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
                                                            <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">مكتمل</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center text-zinc-600 text-sm italic font-bold">
                                                    لم يتم العثور على حركات مالية مسجلة...
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Audit Logs Table */}
                    <Card className="bg-zinc-900/30 border-white/5 shadow-2xl backdrop-blur-xl overflow-hidden mt-6">
                        <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                            <CardTitle className="text-lg font-medium text-rose-400">سجل العمليات الحساسة (Audit Log)</CardTitle>
                            <p className="text-xs text-zinc-500 mt-1">المحذوفات والمرتجعات والتبعيات الاستثنائية</p>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-transparent h-12">
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head whitespace-nowrap px-4" onClick={() => {
                                                const order = auditSort.key === 'date' && auditSort.order === 'asc' ? 'desc' : 'asc';
                                                setAuditSort({ key: 'date', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={auditSort.key} target="date" order={auditSort.order} />
                                                    التاريخ والوقت
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head whitespace-nowrap px-4" onClick={() => {
                                                const order = auditSort.key === 'action' && auditSort.order === 'asc' ? 'desc' : 'asc';
                                                setAuditSort({ key: 'action', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={auditSort.key} target="action" order={auditSort.order} />
                                                    العملية
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head whitespace-nowrap px-4" onClick={() => {
                                                const order = auditSort.key === 'entity' && auditSort.order === 'asc' ? 'desc' : 'asc';
                                                setAuditSort({ key: 'entity', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={auditSort.key} target="entity" order={auditSort.order} />
                                                    الكيان (Entity)
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right whitespace-nowrap px-4">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">السبب / التفاصيل</div>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="divide-y divide-white/5 bg-[#0a0a0a]/40">
                                        {sortedAuditLogs.length > 0 ? (
                                            sortedAuditLogs.map((log: any) => (
                                                <TableRow key={log.id} className="border-white/5 hover:bg-white/[0.04] even:bg-white/[0.02] transition-all group h-[55px]">
                                                    <TableCell className="text-right py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2 text-zinc-500 font-mono text-[10px]">
                                                            <Clock className="w-3 h-3 opacity-30" />
                                                            {format(new Date(log.date), 'yyyy/MM/dd | HH:mm')}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="outline" className="text-[10px] font-black border-rose-500/10 bg-rose-500/10 text-rose-400 px-2 py-0.5 tracking-tighter uppercase">
                                                            {log.action}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono font-bold">
                                                            <Filter className="w-3 h-3 opacity-20" />
                                                            {log.entity}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right text-zinc-300 text-xs max-w-md truncate font-medium">
                                                        {log.reason || '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-zinc-600 text-sm italic font-bold">
                                                    لا توجد عمليات حساسة مسجلة في هذه الفترة...
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* === TAB: Sales by Product & Category === */}
                <TabsContent value="salesbyitem" className="space-y-6 mt-0 border-none p-0 outline-none">

                    {/* By Category */}
                    <Card className="bg-zinc-900/30 border-white/5 shadow-2xl backdrop-blur-xl overflow-hidden">
                        <CardHeader className="border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-6">
                            <div>
                                <CardTitle className="text-lg font-medium text-emerald-400 flex items-center gap-2">
                                    <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                        <Tag className="w-3.5 h-3.5 text-emerald-400" />
                                    </div>
                                    المبيعات حسب الفئة
                                </CardTitle>
                                <p className="text-xs text-zinc-500 mt-1">إجمالي المبيعات والأرباح مجمعة لكل فئة منتجات</p>
                            </div>
                            <Button variant="outline" size="sm" className="h-9 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs print:hidden" onClick={exportSalesByCategoryToExcel} disabled={isExporting}>
                                <Download className="w-4 h-4 mr-2" />
                                {isExporting ? 'جاري التصدير...' : 'تصدير Excel للفئات'}
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-transparent h-12">
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = catSort.key === 'categoryName' && catSort.order === 'asc' ? 'desc' : 'asc';
                                                setCatSort({ key: 'categoryName', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={catSort.key} target="categoryName" order={catSort.order} />
                                                    الفئة
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = catSort.key === 'productCount' && catSort.order === 'asc' ? 'desc' : 'asc';
                                                setCatSort({ key: 'productCount', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={catSort.key} target="productCount" order={catSort.order} />
                                                    الأصناف
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = catSort.key === 'totalQty' && catSort.order === 'asc' ? 'desc' : 'asc';
                                                setCatSort({ key: 'totalQty', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={catSort.key} target="totalQty" order={catSort.order} />
                                                    الكمية
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = catSort.key === 'totalRevenue' && catSort.order === 'asc' ? 'desc' : 'asc';
                                                setCatSort({ key: 'totalRevenue', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={catSort.key} target="totalRevenue" order={catSort.order} />
                                                    الإيرادات
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = catSort.key === 'totalCost' && catSort.order === 'asc' ? 'desc' : 'asc';
                                                setCatSort({ key: 'totalCost', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={catSort.key} target="totalCost" order={catSort.order} />
                                                    التكلفة
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = catSort.key === 'profit' && catSort.order === 'asc' ? 'desc' : 'asc';
                                                setCatSort({ key: 'profit', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-cyan-500">
                                                    <SortIcon current={catSort.key} target="profit" order={catSort.order} />
                                                    الربح
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right whitespace-nowrap px-4">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">الهامش</div>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="divide-y divide-white/5 bg-[#0a0a0a]/40">
                                        {sortedSalesByCategory.length > 0 ? sortedSalesByCategory.map((cat: any) => {
                                            const profit = cat.totalRevenue - cat.totalCost;
                                            const margin = cat.totalRevenue > 0 ? ((profit / cat.totalRevenue) * 100).toFixed(1) : '0';
                                            return (
                                                <TableRow key={cat.categoryName} className="border-white/5 hover:bg-white/[0.03] transition-colors h-14 group/row">
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ backgroundColor: cat.categoryColor ?? '#555' }} />
                                                            <span className="font-black text-zinc-200 text-sm group-hover/row:text-emerald-400 transition-colors">{cat.categoryName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right text-zinc-500 text-xs font-bold">{cat.productCount}</TableCell>
                                                    <TableCell className="text-right text-zinc-300 font-black font-mono">{cat.totalQty.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right text-emerald-400 font-mono font-black">{cat.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right text-rose-400/70 font-mono text-[11px]">-{cat.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right font-mono font-black text-sm" style={{ color: profit >= 0 ? '#34d399' : '#f87171' }}>
                                                        <div className="flex items-center gap-1 justifying-end">
                                                            <Wallet className="w-3 h-3 opacity-30" />
                                                            {profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="outline" className={cn("text-[10px] px-2.5 py-0.5 font-black border-none tracking-tighter", Number(margin) >= 20 ? "bg-emerald-500/10 text-emerald-400" : Number(margin) >= 10 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400")}>
                                                            {margin}%
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        }) : (
                                            <TableRow><TableCell colSpan={7} className="h-24 text-center text-zinc-600 italic text-sm font-bold">لا توجد بيانات مبيعات في هذه الفترة</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* By Product */}
                    <Card className="bg-zinc-900/30 border-white/5 shadow-2xl backdrop-blur-xl overflow-hidden">
                        <CardHeader className="border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-6">
                            <div>
                                <CardTitle className="text-lg font-medium text-cyan-400 flex items-center gap-2">
                                    <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                                        <Package className="w-3.5 h-3.5 text-cyan-400" />
                                    </div>
                                    المبيعات حسب الصنف
                                </CardTitle>
                                <p className="text-xs text-zinc-500 mt-1">تفصيلي لكل منتج — الكمية والإيرادات والربح مرتبة تنازلياً</p>
                            </div>
                            <Button variant="outline" size="sm" className="h-9 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs print:hidden" onClick={exportSalesByProductToExcel} disabled={isExporting}>
                                <Download className="w-4 h-4 mr-2" />
                                {isExporting ? 'جاري التصدير...' : 'تصدير Excel للأصناف'}
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-transparent h-12">
                                            <TableHead className="text-right text-zinc-500 font-black text-[10px] w-10 uppercase tracking-widest px-4">#</TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = prodSort.key === 'name' && prodSort.order === 'asc' ? 'desc' : 'asc';
                                                setProdSort({ key: 'name', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={prodSort.key} target="name" order={prodSort.order} />
                                                    الصنف
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = prodSort.key === 'categoryName' && prodSort.order === 'asc' ? 'desc' : 'asc';
                                                setProdSort({ key: 'categoryName', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={prodSort.key} target="categoryName" order={prodSort.order} />
                                                    الفئة
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = prodSort.key === 'totalQty' && prodSort.order === 'asc' ? 'desc' : 'asc';
                                                setProdSort({ key: 'totalQty', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={prodSort.key} target="totalQty" order={prodSort.order} />
                                                    الكمية
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = prodSort.key === 'totalRevenue' && prodSort.order === 'asc' ? 'desc' : 'asc';
                                                setProdSort({ key: 'totalRevenue', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={prodSort.key} target="totalRevenue" order={prodSort.order} />
                                                    الإيرادات
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = prodSort.key === 'totalCost' && prodSort.order === 'asc' ? 'desc' : 'asc';
                                                setProdSort({ key: 'totalCost', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={prodSort.key} target="totalCost" order={prodSort.order} />
                                                    التكلفة
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4" onClick={() => {
                                                const order = prodSort.key === 'profit' && prodSort.order === 'asc' ? 'desc' : 'asc';
                                                setProdSort({ key: 'profit', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-cyan-500 uppercase tracking-widest">
                                                    <SortIcon current={prodSort.key} target="profit" order={prodSort.order} />
                                                    الربح
                                                </div>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="divide-y divide-white/5 bg-[#0a0a0a]/40">
                                        {sortedSalesByProduct.length > 0 ? sortedSalesByProduct.map((p: any, idx: number) => {
                                            const profit = p.totalRevenue - p.totalCost;
                                            return (
                                                <TableRow key={p.productId} className="border-white/5 hover:bg-white/[0.04] transition-all h-14 group/row">
                                                    <TableCell className="text-center text-zinc-600 text-[10px] font-mono font-bold">{idx + 1}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex flex-col">
                                                            <div className="font-black text-zinc-200 text-sm group-hover/row:text-cyan-400 transition-colors uppercase tracking-tight">{p.name}</div>
                                                            <div className="text-[10px] text-zinc-600 font-mono tracking-tighter">{p.sku}</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.categoryColor ?? '#555' }} />
                                                            <span className="text-[11px] text-zinc-400 font-bold">{p.categoryName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-black text-zinc-200 font-mono text-sm">{p.totalQty.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right text-emerald-400 font-mono font-black">{p.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right text-rose-400/70 font-mono text-[11px]">-{p.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right font-mono font-black text-sm" style={{ color: profit >= 0 ? '#34d399' : '#f87171' }}>
                                                        {profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        }) : (
                                            <TableRow><TableCell colSpan={7} className="h-24 text-center text-zinc-600 italic text-sm font-bold">لا توجد بيانات مبيعات في هذه الفترة</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                </TabsContent>

                <TabsContent value="shifts" className="space-y-6 mt-0 border-none p-0 outline-none">
                    <Card className="bg-zinc-900/30 border-white/5 shadow-2xl backdrop-blur-xl overflow-hidden mt-2">
                        <CardHeader className="border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-6">
                            <div>
                                <CardTitle className="text-lg font-medium text-purple-400 flex items-center gap-2">
                                    <FileText className="w-5 h-5" />
                                    سجل الورديات
                                </CardTitle>
                                <p className="text-xs text-zinc-500 mt-1 print:hidden">عرض ومراجعة الورديات السابقة وإعادة طباعة تقرير نهاية الوردية (Z-Report)</p>
                            </div>
                            <div className="flex items-center gap-2 print:hidden">
                                <Button variant="outline" size="sm" className="h-9 border-white/10 bg-zinc-950/30 text-xs text-zinc-300 hover:bg-purple-500/10 hover:text-purple-400 hover:border-purple-500/30 transition-all" onClick={() => window.print()}>
                                    <Printer className="w-4 h-4 mr-2" />
                                    طباعة القائمة
                                </Button>
                                <Button variant="outline" size="sm" className="h-9 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs transition-all" onClick={exportShiftsToExcel} disabled={isExporting}>
                                    <Download className="w-4 h-4 mr-2" />
                                    {isExporting ? 'جاري التصدير...' : 'تصدير Excel'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-transparent h-12">
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4 whitespace-nowrap" onClick={() => {
                                                const order = shiftSort.key === 'id' && shiftSort.order === 'asc' ? 'desc' : 'asc';
                                                setShiftSort({ key: 'id', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={shiftSort.key} target="id" order={shiftSort.order} />
                                                    رقم / تاريخ الفتح
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4 whitespace-nowrap" onClick={() => {
                                                const order = shiftSort.key === 'cashierName' && shiftSort.order === 'asc' ? 'desc' : 'asc';
                                                setShiftSort({ key: 'cashierName', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={shiftSort.key} target="cashierName" order={shiftSort.order} />
                                                    الكاشير
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4 whitespace-nowrap" onClick={() => {
                                                const order = shiftSort.key === 'status' && shiftSort.order === 'asc' ? 'desc' : 'asc';
                                                setShiftSort({ key: 'status', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={shiftSort.key} target="status" order={shiftSort.order} />
                                                    الحالة / الإغلاق
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head px-4 whitespace-nowrap" onClick={() => {
                                                const order = shiftSort.key === 'totalSales' && shiftSort.order === 'asc' ? 'desc' : 'asc';
                                                setShiftSort({ key: 'totalSales', order });
                                            }}>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <SortIcon current={shiftSort.key} target="totalSales" order={shiftSort.order} />
                                                    العهدة / المبيعات
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right whitespace-nowrap px-4">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">المبلغ الفعلي (بالدرج)</div>
                                            </TableHead>
                                            <TableHead className="text-right whitespace-nowrap px-4">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-rose-500">العجز / الزيادة</div>
                                            </TableHead>
                                            <TableHead className="text-center text-zinc-500 font-black text-[10px] w-[120px] uppercase tracking-widest px-4">إجراءات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="divide-y divide-white/5 bg-[#0a0a0a]/40">
                                        {sortedShifts && sortedShifts.length > 0 ? (
                                            sortedShifts.map((s: any) => (
                                                <TableRow key={s.id} className="border-white/5 hover:bg-white/[0.04] even:bg-white/[0.03] transition-all group/row h-16">
                                                    <TableCell className="text-right py-3 px-4">
                                                        <div className="font-mono text-[9px] text-zinc-600 mb-1 leading-none tracking-tighter uppercase">{s.id.substring(0, 8)}</div>
                                                        <div className="whitespace-nowrap font-black text-zinc-200 text-xs">
                                                            {format(new Date(s.openedAt), 'yyyy/MM/dd | HH:mm')}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right px-4">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 group-hover/row:border-purple-500/50 transition-colors overflow-hidden relative">
                                                                {s.user?.image ? (
                                                                    <img src={s.user.image} alt={s.cashierName} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <span className="text-xs font-black text-zinc-500">
                                                                        {(s.cashierName || s.user?.name || 'U')[0].toUpperCase()}
                                                                    </span>
                                                                )}
                                                                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                                            </div>
                                                            <span className="text-xs font-black text-zinc-200 group-hover/row:text-purple-400 transition-colors">
                                                                {s.cashierName || s.user?.name || 'غير معروف'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right px-4">
                                                        {s.status === 'OPEN' ? (
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">نشط الآن</span>
                                                                </div>
                                                                <span className="text-[10px] text-zinc-600 font-mono">بدأت منذ {formatDistanceToNow(new Date(s.openedAt), { locale: ar, addSuffix: true })}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-0.5">
                                                                <div className="flex items-center gap-1.5 opacity-60">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                                                                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">مغلقة</span>
                                                                </div>
                                                                <span className="text-[10px] text-zinc-500 font-mono">
                                                                    {s.closedAt ? format(new Date(s.closedAt), 'yyyy/MM/dd | HH:mm') : '-'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right px-4">
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="text-sm font-black text-zinc-200 font-mono">
                                                                {(Number(s.totalCashSales || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                <span className="text-[9px] text-zinc-600 mr-1">EGP</span>
                                                            </div>
                                                            <div className="text-[10px] text-zinc-500 font-bold">عهدة: {Number(s.startCash || 0).toLocaleString()}</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right px-4 font-black">
                                                        <span className={cn(
                                                            "text-sm font-mono",
                                                            s.status === 'OPEN' ? "text-zinc-600 italic text-[11px]" : "text-zinc-300"
                                                        )}>
                                                            {s.status !== 'OPEN' ? (Number(s.actualCash || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 }) : 'قيد العمل...'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right px-4">
                                                        {s.status !== 'OPEN' && s.cashVariance !== undefined ? (
                                                            <div className={cn(
                                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black font-mono min-w-[70px] justify-center tracking-tighter",
                                                                Number(s.cashVariance) > 0 ? "bg-emerald-500/10 text-emerald-400" :
                                                                    Number(s.cashVariance) < 0 ? "bg-rose-500/10 text-rose-400" :
                                                                        "bg-zinc-800/50 text-zinc-500 border border-white/5"
                                                            )}>
                                                                {Number(s.cashVariance) > 0 ? '+' : ''}{Number(s.cashVariance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </div>
                                                        ) : (
                                                            <span className="text-zinc-700 font-black">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center px-4">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="w-8 h-8 rounded-lg text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 transition-all"
                                                            onClick={async () => {
                                                                try {
                                                                    await printZReport(s);
                                                                    toast.success("تم إرسال التقرير للطابعة", { icon: "🖨️" });
                                                                } catch (err: any) {
                                                                    toast.error(err.message || "فشلت الطباعة");
                                                                }
                                                            }}
                                                            title="طباعة تقرير الإغلاق"
                                                        >
                                                            <Printer className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-32 text-center text-zinc-600 text-sm italic font-bold">
                                                    لا توجد ورديات مسجلة...
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

function KPICard({ title, value, icon, trend, color, negative = false, accentColor, data }: any) {
    return (
        <Card className="bg-zinc-900/30 border-white/5 hover:border-white/10 transition-all shadow-xl group relative overflow-hidden">
            <div
                className="absolute bottom-0 left-0 w-full h-[2px] opacity-20 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }}
            />
            <CardContent className="p-5 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl bg-zinc-950 border border-white/5 shadow-inner">
                            {icon}
                        </div>
                        <Badge variant="outline" className={cn(
                            "text-[10px] px-2 py-0 border-none",
                            negative ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                            {negative ? <ArrowDownRight className="w-2.5 h-2.5 ml-1 inline" /> : <ArrowUpRight className="w-2.5 h-2.5 ml-1 inline" />}
                            {trend}
                        </Badge>
                    </div>
                    <p className="text-xs font-medium text-zinc-500 group-hover:text-zinc-400 transition-colors uppercase tracking-wider mt-2">{title}</p>
                    <h3 className="text-2xl font-bold text-zinc-100 mt-1 whitespace-nowrap">
                        {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        <span className="text-xs ml-2 text-zinc-600 font-normal">EGP</span>
                    </h3>
                </div>
                {data && data.length > 0 && (
                    <div className="w-24 h-12 mt-4 opacity-50 group-hover:opacity-100 transition-opacity hidden sm:block">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="value" stroke={accentColor} fill={`url(#gradient-${color})`} strokeWidth={2} isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function PaymentMethodRow({ label, amount, percentage, color }: any) {
    return (
        <div className="space-y-2 group/row">
            <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 group-hover/row:text-zinc-200 transition-colors">{label}</span>
                <span className="text-zinc-500 font-mono">
                    <span className="text-zinc-300 font-bold">${(amount / 1000).toFixed(1)}k</span>
                    <span className="mx-1.5 opacity-30">|</span>
                    {percentage}%
                </span>
            </div>
            <div className="w-full bg-zinc-950/50 h-1 rounded-full border border-white/5 overflow-hidden">
                <div className={cn("h-full transition-all duration-1000", color)} style={{ width: `${percentage}%` }} />
            </div>
        </div>
    )
}
