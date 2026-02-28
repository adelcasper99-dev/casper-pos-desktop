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
    Download
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
import { printZReport } from "@/lib/print-zreport"
import { toast } from "sonner"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

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
    }
}

export default function ReportPage({ initialData, branches, categories = [], products = [], shifts = [], salesByProduct = [], salesByCategory = [], filters }: ReportPageProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '')
    const [swipeState, setSwipeState] = useState<{ id: string, startX: number }>({ id: '', startX: 0 })
    const [isExporting, setIsExporting] = useState(false)

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
                alert("🖨️ طباعة سريعة للعملية: " + id)
            } else if (diff < -50) {
                alert("📄 عرض تفاصيل العملية: " + id)
            }
        }
        setSwipeState({ id: '', startX: 0 })
    }

    const exportToExcel = () => {
        setIsExporting(true);
        setTimeout(() => {
            const data = transactions.map((t: any) => ({
                "التاريخ": format(new Date(t.date), 'yyyy-MM-dd HH:mm'),
                "النوع": t.type === 'SALE' ? 'بيع' : t.type === 'PURCHASE' ? 'شراء' : 'مصروف',
                "الفرع": t.branch || '',
                "طريقة الدفع": t.method || '',
                "المبلغ": t.amount,
                "الحالة": "مكتمل"
            }));
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
        Object.entries(newFilters).forEach(([key, value]) => {
            if (value) {
                params.set(key, value as string)
            } else {
                params.delete(key)
            }
        })
        router.push(`${pathname}?${params.toString()}`)
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

    const transactions = rawTransactions.filter((t: any) => {
        let match = true;
        if (activeSearchQuery) {
            match = match && (
                t.id.toLowerCase().includes(activeSearchQuery) ||
                (t.description && t.description.toLowerCase().includes(activeSearchQuery)) ||
                (t.method && t.method.toLowerCase().includes(activeSearchQuery))
            );
        }
        if (activeTypeFilter !== 'all') {
            match = match && t.type === activeTypeFilter;
        }
        if (activeMethodFilter !== 'all') {
            match = match && t.method === activeMethodFilter;
        }
        return match;
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
                        
                        <Select
                            value={filters.categoryId || "all"}
                            onValueChange={(val) => updateFilters({ categoryId: val === "all" ? "" : val })}
                        >
                            <SelectTrigger className="w-[140px] bg-transparent border-none text-zinc-300 focus:ring-0">
                                <SelectValue placeholder="كل الفئات" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10 text-zinc-300">
                                <SelectItem value="all">كل الفئات</SelectItem>
                                {categories.map((c: any) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="w-px h-5 bg-white/10 mx-1" />

                        <Select
                            value={filters.productId || "all"}
                            onValueChange={(val) => updateFilters({ productId: val === "all" ? "" : val })}
                        >
                            <SelectTrigger className="w-[140px] bg-transparent border-none text-zinc-300 focus:ring-0">
                                <SelectValue placeholder="كل الأصناف" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10 text-zinc-300 max-h-[300px]">
                                <SelectItem value="all">كل الأصناف</SelectItem>
                                {products.map((p: any) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name} <span className="text-zinc-500 text-[10px] ml-1">({p.sku})</span></SelectItem>
                                ))}
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

            <Tabs defaultValue="financial" className="w-full space-y-6">
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
                            <CardContent className="p-6">
                                <div className="h-[320px] w-full">
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
                                            <SelectItem value="SALE">بيع</SelectItem>
                                            <SelectItem value="PURCHASE">شراء</SelectItem>
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
                                    <TableHeader className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-md shadow-md">
                                        <TableRow className="border-white/5 hover:bg-transparent h-[50px]">
                                            <TableHead className="text-right text-zinc-500 font-medium whitespace-nowrap">التاريخ والوقت</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">نوع الحركة</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الفرع / المستودع</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">طريقة الدفع</TableHead>
                                            <TableHead className="text-left text-zinc-500 font-medium">المبلغ الإجمالي</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الحالة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.length > 0 ? (
                                            transactions.map((t: any) => (
                                                <TableRow
                                                    key={t.id}
                                                    className="border-white/5 hover:bg-white/[0.05] transition-colors group h-[55px] cursor-pointer touch-pan-y"
                                                    onTouchStart={(e) => handleTouchStart(e, t.id)}
                                                    onTouchEnd={(e) => handleTouchEnd(e, t.id)}
                                                >
                                                    <TableCell className="text-right text-zinc-400 text-xs py-4 whitespace-nowrap">
                                                        {format(new Date(t.date), 'yyyy/MM/dd | HH:mm')}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn(
                                                                "p-1.5 rounded bg-zinc-900 border border-white/5",
                                                                t.type === 'SALE' ? "text-cyan-400" :
                                                                    t.type === 'PURCHASE' ? "text-amber-400" : "text-rose-400"
                                                            )}>
                                                                {t.type === 'SALE' ? <TrendingUp className="w-3 h-3" /> :
                                                                    t.type === 'PURCHASE' ? <ShoppingCart className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                                            </div>
                                                            <span className="text-xs font-semibold text-zinc-200">
                                                                {t.type === 'SALE' ? 'فاتورة بيع' : t.type === 'PURCHASE' ? 'فاتورة شراء' : 'صرف مصروف'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right text-zinc-400 text-xs">
                                                        {t.branch || 'المخزن الرئيسي'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="outline" className="text-[10px] border-white/5 bg-zinc-900 text-zinc-500 px-2 py-0">
                                                            {t.method || 'نقداً'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className={cn(
                                                        "text-left font-mono font-bold text-sm",
                                                        t.amount > 0 ? "text-emerald-400" : "text-rose-400"
                                                    )}>
                                                        {t.amount > 0 ? '+' : ''}{Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        <span className="text-[10px] mr-1 opacity-50 font-sans">EGP</span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                                                            <span className="text-xs text-emerald-500 font-medium">مكتمل</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center text-zinc-600 text-sm italic">
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
                                    <TableHeader className="bg-zinc-950/50">
                                        <TableRow className="border-white/5 hover:bg-transparent h-[50px]">
                                            <TableHead className="text-right text-zinc-500 font-medium whitespace-nowrap">التاريخ والوقت</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">العملية</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الكيان (Entity)</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">السبب / التفاصيل</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {auditLogs.length > 0 ? (
                                            auditLogs.map((log: any) => (
                                                <TableRow key={log.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                                                    <TableCell className="text-right text-zinc-400 text-xs py-4 whitespace-nowrap">
                                                        {format(new Date(log.date), 'yyyy/MM/dd | HH:mm')}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="outline" className="text-[10px] border-rose-500/20 bg-rose-500/10 text-rose-400 px-2 py-0">
                                                            {log.action}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-zinc-400 text-xs font-mono">
                                                        {log.entity}
                                                    </TableCell>
                                                    <TableCell className="text-right text-zinc-300 text-xs max-w-md truncate">
                                                        {log.reason || '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-zinc-600 text-sm italic">
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
                                    <TableHeader className="bg-zinc-950/50">
                                        <TableRow className="border-white/5 hover:bg-transparent h-[48px]">
                                            <TableHead className="text-right text-zinc-500 font-medium">الفئة</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">عدد الأصناف</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الكمية المباعة</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الإيرادات</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">التكلفة</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الربح</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">هامش الربح</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {salesByCategory.length > 0 ? salesByCategory.map((cat: any) => {
                                            const profit = cat.totalRevenue - cat.totalCost;
                                            const margin = cat.totalRevenue > 0 ? ((profit / cat.totalRevenue) * 100).toFixed(1) : '0';
                                            return (
                                                <TableRow key={cat.categoryName} className="border-white/5 hover:bg-white/[0.03] transition-colors">
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.categoryColor ?? '#555' }} />
                                                            <span className="font-semibold text-zinc-200 text-sm">{cat.categoryName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right text-zinc-400 text-sm">{cat.productCount}</TableCell>
                                                    <TableCell className="text-right text-zinc-300 font-bold">{cat.totalQty.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right text-emerald-400 font-mono font-bold">{cat.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right text-rose-400 font-mono">{cat.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold" style={{ color: profit >= 0 ? '#34d399' : '#f87171' }}>{profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0", Number(margin) >= 20 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : Number(margin) >= 10 ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-rose-500/30 bg-rose-500/10 text-rose-400")}>
                                                            {margin}%
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        }) : (
                                            <TableRow><TableCell colSpan={7} className="h-24 text-center text-zinc-600 italic text-sm">لا توجد بيانات مبيعات في هذه الفترة</TableCell></TableRow>
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
                                    <TableHeader className="bg-zinc-950/50">
                                        <TableRow className="border-white/5 hover:bg-transparent h-[48px]">
                                            <TableHead className="text-right text-zinc-500 font-medium w-10">#</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الصنف</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الفئة</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الكمية</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الإيرادات</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">التكلفة</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الربح</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {salesByProduct.length > 0 ? salesByProduct.map((p: any, idx: number) => {
                                            const profit = p.totalRevenue - p.totalCost;
                                            return (
                                                <TableRow key={p.productId} className="border-white/5 hover:bg-white/[0.03] transition-colors">
                                                    <TableCell className="text-center text-zinc-600 text-xs font-mono">{idx + 1}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div>
                                                            <div className="font-semibold text-zinc-200 text-sm">{p.name}</div>
                                                            <div className="text-[10px] text-zinc-600 font-mono">{p.sku}</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.categoryColor ?? '#555' }} />
                                                            <span className="text-xs text-zinc-400">{p.categoryName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-zinc-200">{p.totalQty.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right text-emerald-400 font-mono font-bold">{p.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right text-rose-400 font-mono">{p.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold" style={{ color: profit >= 0 ? '#34d399' : '#f87171' }}>{profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                </TableRow>
                                            );
                                        }) : (
                                            <TableRow><TableCell colSpan={7} className="h-24 text-center text-zinc-600 italic text-sm">لا توجد بيانات مبيعات في هذه الفترة</TableCell></TableRow>
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
                                    <TableHeader className="bg-zinc-950/50">
                                        <TableRow className="border-white/5 hover:bg-transparent h-[50px]">
                                            <TableHead className="text-right text-zinc-500 font-medium whitespace-nowrap">رقم / تاريخ الفتح</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الكاشير</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">الحالة / الإغلاق</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">العهدة / المبيعات</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">المبلغ الفعلي (بالدرج)</TableHead>
                                            <TableHead className="text-right text-zinc-500 font-medium">العجز / الزيادة</TableHead>
                                            <TableHead className="text-center text-zinc-500 font-medium w-[120px]">إجراءات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {shifts && shifts.length > 0 ? (
                                            shifts.map((s: any) => (
                                                <TableRow key={s.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                                                    <TableCell className="text-right text-zinc-400 text-xs py-3">
                                                        <div className="font-mono text-[10px] text-zinc-600 mb-1 leading-none">{s.id.substring(0, 8).toUpperCase()}</div>
                                                        <div className="whitespace-nowrap font-medium text-zinc-300">{format(new Date(s.openedAt), 'yyyy/MM/dd | HH:mm')}</div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
                                                                <span className="text-xs font-bold text-zinc-300">
                                                                    {(s.cashierName || s.user?.name || s.user?.username || 'U')[0].toUpperCase()}
                                                                </span>
                                                            </div>
                                                            <span className="text-sm font-medium text-zinc-200 truncate max-w-[120px]">
                                                                {s.cashierName || s.user?.name || s.user?.username || 'غير معروف'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="space-y-1">
                                                            <Badge variant="outline" className={cn("text-[10px] px-2 py-0 h-5 border-none",
                                                                s.status === 'CLOSED' ? "bg-emerald-500/10 text-emerald-400" :
                                                                    s.status === 'FORCE_CLOSED' ? "bg-rose-500/10 text-rose-400" :
                                                                        "bg-amber-500/10 text-amber-400"
                                                            )}>
                                                                {s.status === 'CLOSED' ? 'مغلقة' : s.status === 'FORCE_CLOSED' ? 'إغلاق إجباري' : 'مفتوحة'}
                                                            </Badge>
                                                            {s.closedAt && (
                                                                <div className="text-[10px] text-zinc-500 whitespace-nowrap">
                                                                    {format(new Date(s.closedAt), 'yyyy/MM/dd | HH:mm')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs">
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center justify-between gap-4">
                                                                <span className="text-zinc-500">العهدة:</span>
                                                                <span className="text-zinc-300 font-mono">${Number(s.startCash).toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-4">
                                                                <span className="text-zinc-500">المبيعات:</span>
                                                                <span className="text-zinc-300 font-mono">${Number(s.totalCashSales || 0).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-sm text-zinc-200">
                                                        {s.status !== 'OPEN' ? `$${Number(s.actualCash || 0).toFixed(2)}` : <span className="text-zinc-600 text-xs italic">قيد العمل...</span>}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {s.status !== 'OPEN' && s.cashVariance !== undefined ? (
                                                            <div className={cn(
                                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-bold font-mono min-w-[80px] justify-center",
                                                                Number(s.cashVariance) > 0 ? "bg-emerald-500/10 text-emerald-400" :
                                                                    Number(s.cashVariance) < 0 ? "bg-rose-500/10 text-rose-400" :
                                                                        "bg-zinc-800 text-zinc-400 border border-white/5"
                                                            )}>
                                                                {Number(s.cashVariance) > 0 ? '+' : ''}{Number(s.cashVariance).toFixed(2)}
                                                            </div>
                                                        ) : (
                                                            <span className="text-zinc-600">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={async () => {
                                                                try {
                                                                    await printZReport(s);
                                                                    toast.success("تم إرسال التقرير للطابعة", { icon: "🖨️" });
                                                                } catch (err: any) {
                                                                    toast.error(err.message || "فشلت الطباعة");
                                                                }
                                                            }}
                                                            disabled={s.status === 'OPEN'}
                                                            className="h-8 w-full border border-white/5 hover:bg-zinc-800 group-hover:border-purple-500/30 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-white/5"
                                                        >
                                                            <span className="text-xs">طباعة</span>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-32 text-center text-zinc-600 text-sm italic">
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
