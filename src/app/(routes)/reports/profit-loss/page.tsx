'use client';

import { useState, useEffect, useTransition } from "react";
import { getProfitLossReport, getBranchesForReports } from "@/actions/reports/profit-loss";
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
import { Calendar, TrendingUp, TrendingDown, DollarSign, FileText, Activity, Printer, BarChart3 } from "lucide-react";
import { startOfMonth, endOfMonth, format, subMonths, startOfDay, endOfDay } from "date-fns";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { Button } from "@/components/ui/button";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { cn } from "@/lib/utils";

export default function ProfitLossPage() {
    const [isPending, startTransition] = useTransition();
    const [reportData, setReportData] = useState<any>(null);
    const [branches, setBranches] = useState<any[]>([]);

    // Filters State
    const [filters, setFilters] = useState({
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        branchId: 'all',
        viewType: 'daily'
    });

    // Fetch Branches on Mount
    useEffect(() => {
        getBranchesForReports().then(res => {
            if (res.success) setBranches(res.branches || []);
        });
    }, []);

    // Fetch Report Data when filters change
    useEffect(() => {
        fetchReport();
    }, [filters.startDate, filters.endDate, filters.branchId, filters.viewType]);

    const fetchReport = () => {
        startTransition(async () => {
            const res = await getProfitLossReport({
                startDate: filters.startDate,
                endDate: filters.endDate,
                branchId: filters.branchId === 'all' ? undefined : filters.branchId,
                viewType: filters.viewType as any
            });
            if (res.success) {
                setReportData(res.data);
            }
        });
    };

    const handleDateRangeChange = (range: Date[]) => {
        if (range && range.length === 2) {
            setFilters(prev => ({
                ...prev,
                startDate: format(range[0], 'yyyy-MM-dd'),
                endDate: format(range[1], 'yyyy-MM-dd')
            }));
        }
    };

    const applyPreset = (preset: 'thisMonth' | 'lastMonth' | 'thisYear') => {
        const now = new Date();
        let start = now;
        let end = now;

        switch (preset) {
            case 'thisMonth':
                start = startOfMonth(now);
                end = endOfMonth(now);
                break;
            case 'lastMonth':
                start = startOfMonth(subMonths(now, 1));
                end = endOfMonth(subMonths(now, 1));
                break;
            case 'thisYear':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31);
                break;
        }

        setFilters(prev => ({
            ...prev,
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd')
        }));
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount || 0);
    };

    return (
        <div className="p-8 space-y-8 min-h-screen text-foreground transition-colors duration-500 max-w-[2400px] mx-auto">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <div className="w-2 h-10 bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]" />
                        تقرير الأرباح والخسائر
                    </h1>
                    <p className="text-muted-foreground text-sm mt-2 font-medium">لوحة تحليلية شاملة للإيرادات، المصروفات وصافي الربح التشغيلي</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="rounded-2xl border-border/40 font-bold bg-card/40 backdrop-blur-md hover:bg-card/60">
                        <Printer className="w-4 h-4 ml-2" />
                        طباعة التقرير
                    </Button>
                </div>
            </div>

            {/* Premium Filter Dashboard */}
            <div className="glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-end relative z-10">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <Label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest flex items-center gap-2">
                               <Calendar className="w-3 h-3 text-cyan-500" />
                               الفترة الزمنية
                            </Label>
                            <div className="flex gap-2">
                                {['thisMonth', 'lastMonth', 'thisYear'].map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => applyPreset(p as any)}
                                        className="text-[8px] font-black text-foreground/40 hover:text-cyan-500 transition-all uppercase tracking-tighter bg-primary/5 hover:bg-primary/10 px-2 py-0.5 rounded-lg border border-border/40"
                                    >
                                        {p === 'thisMonth' ? 'هذا الشهر' : p === 'lastMonth' ? 'الماضي' : 'العام'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <FlatpickrRangePicker
                            initialDates={[new Date(filters.startDate), new Date(filters.endDate)]}
                            onRangeChange={handleDateRangeChange}
                            onClear={() => applyPreset('thisMonth')}
                            placeholder="اختر الفترة"
                            className="bg-background/40 border-border/40 h-12 rounded-2xl focus:ring-cyan-500/20 transition-all font-mono"
                        />
                    </div>

                    <div className="space-y-3">
                        <Label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest pr-1 flex items-center gap-2">
                           <Activity className="w-3 h-3 text-cyan-500" />
                           تصفية الفرع
                        </Label>
                        <Select
                            value={filters.branchId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, branchId: val }))}
                        >
                            <SelectTrigger className="bg-background/40 border-border/40 h-12 rounded-2xl focus:ring-cyan-500/20 transition-all font-bold">
                                <SelectValue placeholder="كل الفروع" />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-xl border-border/40 rounded-2xl shadow-2xl">
                                <SelectItem value="all" className="font-bold">كل الفروع</SelectItem>
                                {branches.map(branch => (
                                    <SelectItem key={branch.id} value={branch.id} className="font-bold">
                                        {branch.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest pr-1 flex items-center gap-2">
                           <BarChart3 className="w-3 h-3 text-cyan-500" />
                           نمط العرض
                        </Label>
                        <Select
                            value={filters.viewType}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, viewType: val }))}
                        >
                            <SelectTrigger className="bg-background/40 border-border/40 h-12 rounded-2xl focus:ring-cyan-500/20 transition-all font-bold">
                                <SelectValue placeholder="يومي" />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-xl border-border/40 rounded-2xl shadow-2xl">
                                <SelectItem value="daily" className="font-bold">يومي (Detailed)</SelectItem>
                                <SelectItem value="monthly" className="font-bold">شهري (Summary)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <button
                            onClick={fetchReport}
                            disabled={isPending}
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isPending ? <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : null}
                            {isPending ? 'جاري التحميل' : 'تحديث البيانات'}
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
                    {/* Main KPI Metrical Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { label: 'إجمالي الإيرادات', value: reportData.income.totalRevenue, color: 'text-cyan-400', glow: 'shadow-cyan-500/10', sub: `${reportData.counts.sales} مبيعات | ${reportData.counts.tickets} صيانة` },
                            { label: 'تكلفة البضاعة', value: reportData.costs.totalCOGS, color: 'text-rose-400', glow: 'shadow-rose-500/10', sub: `${formatCurrency(reportData.costs.cogs)} مخزون | ${formatCurrency(reportData.costs.maintenancePartsCost)} قطع` },
                            { label: 'المصروفات', value: reportData.expenses.operatingExpenses, color: 'text-amber-400', glow: 'shadow-amber-500/10', sub: 'إجمالي المصروفات التشغيلية' },
                            { label: 'صافي الربح', value: reportData.profit.netProfit, color: reportData.profit.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400', glow: reportData.profit.netProfit >= 0 ? 'shadow-emerald-500/10' : 'shadow-rose-500/10', sub: `هامش الربح: ${reportData.profit.profitMargin.toFixed(1)}%` }
                        ].map((item, idx) => (
                            <div key={idx} className={cn(
                                "glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:bg-card/60",
                                item.glow
                            )}>
                                <h3 className="text-[10px] font-black text-foreground/60 uppercase tracking-widest mb-3">{item.label}</h3>
                                <div className={cn("text-2xl font-black tracking-tight", item.color)}>
                                    {formatCurrency(item.value)}
                                </div>
                                <div className="text-[10px] font-bold text-foreground/40 mt-1 uppercase tracking-tight">{item.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Revenue & Expense Detailed Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Income Sources with Table & Zebra Striping */}
                        <div className="glass-card bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl p-6 overflow-hidden relative group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-cyan-500/10 transition-colors" />
                            <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-cyan-500" />
                                مصادر الإيرادات التفصيلية
                            </h3>
                            <div className="overflow-hidden rounded-2xl border border-border/40">
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-border/20">
                                        {[
                                            { label: 'مبيعات POS', value: reportData.income.posRevenue },
                                            { label: 'صيانة وخدمة', value: reportData.income.maintenanceRevenue },
                                            { label: 'إيرادات أخرى', value: reportData.income.otherIncome },
                                            { label: 'الإجمالي (Total)', value: reportData.income.totalRevenue, isTotal: true }
                                        ].map((row, idx) => (
                                            <tr key={idx} className={cn(
                                                "transition-all hover:bg-primary/10 even:bg-muted/70 h-14",
                                                row.isTotal && "bg-cyan-500/5 border-t-2 border-cyan-500/30"
                                            )}>
                                                <td className={cn("px-6 font-bold", row.isTotal ? "text-foreground" : "text-foreground/60")}>{row.label}</td>
                                                <td className={cn("px-6 text-left font-black", row.isTotal ? "text-cyan-500 text-lg" : "text-cyan-400")}>{formatCurrency(row.value)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Expenses Breakdown with Table & Zebra Striping */}
                        <div className="glass-card bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl p-6 overflow-hidden relative group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />
                            <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-amber-500" />
                                تفاصيل ومصروفات التشغيل
                            </h3>
                            <div className="overflow-hidden rounded-2xl border border-border/40">
                                <div className="max-h-[350px] overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <tbody className="divide-y divide-border/20">
                                            {reportData.expenses.breakdown && reportData.expenses.breakdown.length > 0 ? (
                                                reportData.expenses.breakdown.map((exp: any, idx: number) => (
                                                    <tr key={idx} className="transition-all hover:bg-primary/10 even:bg-muted/70 h-14">
                                                        <td className="px-6 font-bold text-foreground/60">{exp.name}</td>
                                                        <td className="px-6 text-left font-black text-amber-400">{formatCurrency(exp.amount)}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr><td colSpan={2} className="p-8 text-center text-foreground/30 font-bold uppercase tracking-widest text-[10px]">لا توجد بيانات مصروفات</td></tr>
                                            )}
                                            <tr className="bg-amber-500/5 border-t-2 border-amber-500/30 h-14">
                                                <td className="px-6 font-bold text-foreground">الإجمالي التشغيلي</td>
                                                <td className="px-6 text-left font-black text-amber-500 text-lg">{formatCurrency(reportData.expenses.operatingExpenses)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Integrated Profit Summary Map */}
                    <div className="glass-card bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl p-8 relative overflow-hidden group">
                        <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest mb-8 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-500" />
                            خارطة الربحية (Profitability Map)
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                            <div className="space-y-2 p-6 rounded-2xl bg-zinc-950/40 border border-border/40 transition-hover hover:border-cyan-500/30">
                                <p className="text-[10px] font-black text-foreground/30 uppercase tracking-widest">إجمالي الإيرادات</p>
                                <p className="text-2xl font-black text-cyan-400">{formatCurrency(reportData.income.totalRevenue)}</p>
                            </div>
                            <div className="space-y-2 p-6 rounded-2xl bg-zinc-950/40 border border-border/40 transition-hover hover:border-rose-500/30">
                                <p className="text-[10px] font-black text-foreground/30 uppercase tracking-widest">(-) تكلفة البضاعة</p>
                                <p className="text-2xl font-black text-rose-400">{formatCurrency(reportData.costs.totalCOGS)}</p>
                            </div>
                            <div className="space-y-2 p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 transition-hover">
                                <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest">= إجمالي الربح</p>
                                <p className="text-2xl font-black text-emerald-400">{formatCurrency(reportData.profit.grossProfit)}</p>
                            </div>
                        </div>

                        <div className="p-8 rounded-3xl bg-zinc-950/60 border border-border/40 relative overflow-hidden">
                            <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
                                <div className="space-y-1">
                                    <span className="text-sm font-bold text-foreground/50 uppercase tracking-widest">(-) المصروفات التشغيلية</span>
                                    <p className="text-lg font-black text-amber-400 tracking-tight">{formatCurrency(reportData.expenses.operatingExpenses)}</p>
                                </div>
                                <div className="h-px md:h-12 w-full md:w-px bg-border/40" />
                                <div className="text-center md:text-left">
                                    <span className="text-xs font-black text-foreground/40 uppercase tracking-widest mb-2 block">صافي الربح النهائي</span>
                                    <span className={cn(
                                        "text-5xl font-black tracking-tighter",
                                        reportData.profit.netProfit >= 0 ? "text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                                    )}>
                                        {formatCurrency(reportData.profit.netProfit)}
                                    </span>
                                </div>
                            </div>
                            {/* Decorative background number */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[120px] font-black text-white/[0.02] pointer-events-none select-none">
                                PROFIT
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
