"use client"

import React, { useState } from "react"
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
    Calendar as CalendarIcon
} from "lucide-react"
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
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface ReportPageProps {
    initialData: any
    branches: any[]
    filters: {
        startDate?: string
        endDate?: string
        branchId?: string
    }
}

export default function ReportPage({ initialData, branches, filters }: ReportPageProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

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
                    onClick={() => updateFilters({ startDate: "", endDate: "", branchId: "" })}
                >
                    إعادة تعيين الفلاتر
                </Button>
            </div>
        )
    }

    const { kpis, trendData, transactions } = initialData

    return (
        <div className="p-6 space-y-6 bg-black min-h-screen text-zinc-100">
            {/* Header & Filters */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                        التقارير والتحليلات
                    </h1>
                    <div className="flex items-center gap-2 text-zinc-500 mt-2 text-sm">
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/5 text-zinc-400">نظرة عامة</span>
                        <span>•</span>
                        <span>أداء المبيعات والمشتريات والمصاريف</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-zinc-900/50 p-1 rounded-lg border border-white/5">
                        <Select
                            value={filters.branchId || "all"}
                            onValueChange={(val) => updateFilters({ branchId: val === "all" ? "" : val })}
                        >
                            <SelectTrigger className="w-[160px] bg-transparent border-none text-zinc-300 focus:ring-0">
                                <SelectValue placeholder="كل الفروع" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10 text-zinc-300">
                                <SelectItem value="all">كل الفروع</SelectItem>
                                {branches.map((b: any) => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="h-10 border-r border-white/10 mx-1 hidden md:block" />

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

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="إجمالي الإيرادات"
                    value={kpis.totalRevenue}
                    icon={<DollarSign className="w-5 h-5 text-cyan-400" />}
                    trend="+12.5%"
                    color="cyan"
                    accentColor="#06b6d4"
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
                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                            <input
                                placeholder="رقم العملية أو الوصف..."
                                className="h-9 bg-zinc-950/50 border border-white/10 rounded-lg pr-10 pl-3 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 group-hover:bg-zinc-900/50 transition-all border-dashed"
                            />
                        </div>
                        <Button variant="outline" size="sm" className="h-9 border-white/10 bg-zinc-950/30 text-xs">تصدير CSV</Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-zinc-950/50">
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-right text-zinc-500 font-medium">التاريخ والوقت</TableHead>
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
                                        <TableRow key={t.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                                            <TableCell className="text-right text-zinc-400 text-xs py-4">
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
                                                <span className="text-[10px] mr-1 opacity-50 font-sans">SAR</span>
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
        </div>
    )
}

function KPICard({ title, value, icon, trend, color, negative = false, accentColor }: any) {
    return (
        <Card className="bg-zinc-900/30 border-white/5 hover:border-white/10 transition-all shadow-xl group relative overflow-hidden">
            <div
                className="absolute bottom-0 left-0 w-full h-[2px] opacity-20 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }}
            />
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
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
                <p className="text-xs font-medium text-zinc-500 group-hover:text-zinc-400 transition-colors uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-bold text-zinc-100 mt-1 whitespace-nowrap">
                    {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    <span className="text-xs ml-2 text-zinc-600 font-normal">SAR</span>
                </h3>
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
