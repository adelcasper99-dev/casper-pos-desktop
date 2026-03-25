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
import { Calendar, TrendingUp, TrendingDown, DollarSign, FileText, Activity, Printer } from "lucide-react";
import { startOfMonth, endOfMonth, format, subMonths, startOfDay, endOfDay } from "date-fns";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { Button } from "@/components/ui/button";
import { CasperLoader } from "@/components/ui/CasperLoader";

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
        return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount);
    };

    return (
        <div className="p-6 space-y-8 bg-zinc-950 min-h-screen text-zinc-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
                        تقرير الأرباح والخسائر
                    </h1>
                    <p className="text-zinc-400 text-sm font-medium">
                        تقرير شامل للإيرادات والمصروفات وصافي الربح
                    </p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="p-5 bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-2xl shadow-2xl ring-1 ring-white/5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between px-1">
                            <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">الفترة الزمنية</Label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => applyPreset('thisMonth')}
                                    className="text-[9px] font-bold text-zinc-400 hover:text-cyan-400 transition-colors uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded-md border border-white/5 hover:border-cyan-500/30"
                                >
                                    هذا الشهر
                                </button>
                                <button
                                    onClick={() => applyPreset('lastMonth')}
                                    className="text-[9px] font-bold text-zinc-400 hover:text-cyan-400 transition-colors uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded-md border border-white/5 hover:border-cyan-500/30"
                                >
                                    الشهر الماضي
                                </button>
                                <button
                                    onClick={() => applyPreset('thisYear')}
                                    className="text-[9px] font-bold text-zinc-400 hover:text-cyan-400 transition-colors uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded-md border border-white/5 hover:border-cyan-500/30"
                                >
                                    العام
                                </button>
                            </div>
                        </div>
                        <FlatpickrRangePicker
                            initialDates={[new Date(filters.startDate), new Date(filters.endDate)]}
                            onRangeChange={handleDateRangeChange}
                            onClear={() => {
                                setFilters(prev => ({
                                    ...prev,
                                    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
                                    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
                                }));
                            }}
                            placeholder="اختر الفترة"
                            className="bg-zinc-900/80 border-white/5"
                        />
                    </div>

                    <div className="space-y-2.5">
                        <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pr-1">الفرع</Label>
                        <Select
                            value={filters.branchId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, branchId: val }))}
                        >
                            <SelectTrigger className="bg-zinc-900/80 border-white/5 text-zinc-200 h-11 rounded-xl focus:ring-cyan-500/20">
                                <SelectValue placeholder="كل الفروع" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                                <SelectItem value="all">كل الفروع</SelectItem>
                                {branches.map(branch => (
                                    <SelectItem key={branch.id} value={branch.id}>
                                        {branch.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2.5">
                        <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pr-1">نوع العرض</Label>
                        <Select
                            value={filters.viewType}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, viewType: val }))}
                        >
                            <SelectTrigger className="bg-zinc-900/80 border-white/5 text-zinc-200 h-11 rounded-xl focus:ring-cyan-500/20">
                                <SelectValue placeholder="يومي" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                                <SelectItem value="daily">يومي</SelectItem>
                                <SelectItem value="monthly">شهري</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center">
                        <button
                            onClick={fetchReport}
                            disabled={isPending}
                            className="w-full h-11 px-6 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isPending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                            {isPending ? 'جاري التحميل...' : 'تحديث البيانات'}
                        </button>
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
                    {/* Revenue Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">إجمالي الإيرادات</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-cyan-400">
                                    {formatCurrency(reportData.income.totalRevenue)}
                                </div>
                                <div className="text-xs text-zinc-500 mt-1">
                                    {reportData.counts.sales} عملية بيع + {reportData.counts.tickets} طلب صيانة
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">تكلفة البضاعة المباعة</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-rose-400">
                                    {formatCurrency(reportData.costs.totalCOGS)}
                                </div>
                                <div className="text-xs text-zinc-500 mt-1">
                                    {formatCurrency(reportData.costs.cogs)} مخزون + {formatCurrency(reportData.costs.maintenancePartsCost)} قطع غيار
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">المصروفات التشغيلية</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-amber-400">
                                    {formatCurrency(reportData.expenses.operatingExpenses)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-400">صافي الربح</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${reportData.profit.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatCurrency(reportData.profit.netProfit)}
                                </div>
                                <div className="text-xs text-zinc-500 mt-1">
                                    هامش الربح: {reportData.profit.profitMargin.toFixed(1)}%
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Revenue Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                        {/* Income Sources */}
                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader>
                                <CardTitle className="text-lg font-medium flex items-center gap-2">
                                    <DollarSign className="w-5 h-5 text-cyan-400" />
                                    مصادر الإيرادات
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between items-center p-3 bg-zinc-950/50 rounded-lg">
                                    <span className="text-zinc-400">مبيعات POS</span>
                                    <span className="font-bold text-cyan-400">{formatCurrency(reportData.income.posRevenue)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-zinc-950/50 rounded-lg">
                                    <span className="text-zinc-400">صيانة وخدمة</span>
                                    <span className="font-bold text-cyan-400">{formatCurrency(reportData.income.maintenanceRevenue)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-zinc-950/50 rounded-lg">
                                    <span className="text-zinc-400">إيرادات أخرى</span>
                                    <span className="font-bold text-cyan-400">{formatCurrency(reportData.income.otherIncome)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-zinc-900 rounded-lg border border-cyan-500/30">
                                    <span className="font-bold text-white">الإجمالي</span>
                                    <span className="font-bold text-cyan-400">{formatCurrency(reportData.income.totalRevenue)}</span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Expenses Breakdown */}
                        <Card className="bg-zinc-900/50 border-white/5">
                            <CardHeader>
                                <CardTitle className="text-lg font-medium flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-amber-400" />
                                    تفاصيل المصروفات
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {reportData.expenses.breakdown && reportData.expenses.breakdown.length > 0 ? (
                                    reportData.expenses.breakdown.map((exp: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center p-3 bg-zinc-950/50 rounded-lg">
                                            <span className="text-zinc-400">{exp.name}</span>
                                            <span className="font-bold text-amber-400">{formatCurrency(exp.amount)}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-zinc-500 text-center py-4">لا توجد مصروفات في هذه الفترة</div>
                                )}
                                <div className="flex justify-between items-center p-3 bg-zinc-900 rounded-lg border border-amber-500/30">
                                    <span className="font-bold text-white">الإجمالي</span>
                                    <span className="font-bold text-amber-400">{formatCurrency(reportData.expenses.operatingExpenses)}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Profit Summary */}
                    <Card className="bg-zinc-900/50 border-white/5 mt-6">
                        <CardHeader>
                            <CardTitle className="text-lg font-medium flex items-center gap-2">
                                <Activity className="w-5 h-5 text-emerald-400" />
                                ملخص الأرباح
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="p-4 bg-zinc-950/50 rounded-lg border border-white/5">
                                    <div className="text-sm text-zinc-400 mb-2">إجمالي الإيرادات</div>
                                    <div className="text-xl font-bold text-cyan-400">{formatCurrency(reportData.income.totalRevenue)}</div>
                                </div>
                                <div className="p-4 bg-zinc-950/50 rounded-lg border border-white/5">
                                    <div className="text-sm text-zinc-400 mb-2">(-) تكلفة البضاعة</div>
                                    <div className="text-xl font-bold text-rose-400">{formatCurrency(reportData.costs.totalCOGS)}</div>
                                </div>
                                <div className="p-4 bg-zinc-950/50 rounded-lg border border-emerald-500/30">
                                    <div className="text-sm text-emerald-400 mb-2">= إجمالي الربح</div>
                                    <div className="text-xl font-bold text-emerald-400">{formatCurrency(reportData.profit.grossProfit)}</div>
                                </div>
                            </div>
                            <div className="mt-4 p-4 bg-zinc-900 rounded-lg border border-white/10">
                                <div className="flex justify-between items-center">
                                    <span className="text-zinc-300">(-) المصروفات التشغيلية</span>
                                    <span className="font-bold text-amber-400">{formatCurrency(reportData.expenses.operatingExpenses)}</span>
                                </div>
                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
                                    <span className="text-lg font-bold text-white">صافي الربح</span>
                                    <span className={`text-2xl font-bold ${reportData.profit.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {formatCurrency(reportData.profit.netProfit)}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
