'use client';

import { useState, useEffect, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getReportData, getBranchesForFilter, getSalesByProductAndCategory, getCategoriesForFilter, getProductsForFilter } from "@/actions/reports-actions";
import { getShiftHistory } from "@/actions/shift-management-actions";
import { cn } from "@/lib/utils";
import { getProfitLossReport, getBranchesForReports } from "@/actions/reports/profit-loss";
import { getInventoryReport, getWarehousesForFilter, getCategoriesForInventory } from "@/actions/reports/inventory";
import { getHRReport, getBranchesForHR } from "@/actions/reports/hr";
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
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { TrendingUp, TrendingDown, Package, Users, DollarSign, FileText, Activity, Calendar, BarChart3, Landmark } from "lucide-react";
import * as XLSX from "xlsx";
import CashFlowDashboard from "@/features/reports/ui/CashFlowDashboard";
import { InventoryReportDetail } from "@/components/reports/InventoryReportDetail";
import { AgedReceivablesReport } from "@/components/reports/AgedReceivablesReport";
import { ZReport } from "@/components/reports/ZReport";
import { SalesAnalysisReport } from "@/components/reports/SalesAnalysisReport";

// ─────────────────────────────────────────────────────────────────────
// Financial Report Component
// ─────────────────────────────────────────────────────────────────────
function FinancialReport({ reportData, isLoading }: { reportData: any, isLoading: boolean }) {
    const formatCurrency = (amount: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

    if (!reportData) return <div className="flex justify-center p-12"><CasperLoader /></div>;

    const { kpis, trendData } = reportData;

    return (
        <div className="space-y-2.5 animate-in fade-in duration-300">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                    { label: 'إجمالي الإيرادات', value: kpis?.totalRevenue, color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                    { label: 'تكلفة البضاعة', value: kpis?.totalCOGS, color: 'text-rose-400', glow: 'shadow-rose-500/10' },
                    { label: 'المصروفات', value: kpis?.totalExpenses, color: 'text-amber-400', glow: 'shadow-amber-500/10' },
                    { label: 'المشتريات', value: kpis?.totalPurchases, color: 'text-blue-400', glow: 'shadow-blue-500/10' },
                    { label: 'صافي الربح', value: kpis?.netProfit, color: kpis?.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400', glow: kpis?.netProfit >= 0 ? 'shadow-emerald-500/10' : 'shadow-rose-500/10' }
                ].map((item, idx) => (
                    <div key={idx} className={cn(
                        "glass-card bg-card/50 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-xs transition-all",
                        item.glow
                    )}>
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">{item.label}</h3>
                        <div className={cn("text-base font-black tracking-tight font-mono", item.color)}>
                            {formatCurrency(item.value)}
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                    { label: 'مبيعات POS', value: kpis?.posCount || 0, icon: <DollarSign className="w-3.5 h-3.5" /> },
                    { label: 'تذاكر صيانة', value: kpis?.maintenanceCount || 0, icon: <Activity className="w-3.5 h-3.5" /> },
                    { label: 'إيرادات POS', value: formatCurrency(kpis?.posRevenue), icon: <BarChart3 className="w-3.5 h-3.5" /> },
                    { label: 'إيرادات صيانة', value: formatCurrency(kpis?.maintenanceRevenue), icon: <Activity className="w-3.5 h-3.5" /> }
                ].map((stat, idx) => (
                    <div key={idx} className="glass-card bg-card/30 backdrop-blur-md border border-border rounded-xl p-2 flex items-center justify-between group">
                        <div className="space-y-0.5">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                            <p className="text-sm font-black text-foreground tracking-tight font-mono">{stat.value}</p>
                        </div>
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            {stat.icon}
                        </div>
                    </div>
                ))}
            </div>

            {/* Returns Section */}
            {(kpis?.salesReturnsCount > 0 || kpis?.purchaseReturnsCount > 0) && (
                <div className="glass-card bg-rose-500/5 border border-rose-500/20 rounded-xl p-2.5">
                    <h3 className="text-xs font-black text-rose-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5" />
                        المرتجعات
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">مرتجعات مبيعات ({kpis?.salesReturnsCount} فاتورة)</span>
                                <span className="font-mono font-black text-rose-400">-{formatCurrency(kpis?.salesReturnsAmount)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">مرتجعات مشتريات ({kpis?.purchaseReturnsCount} فاتورة)</span>
                                <span className="font-mono font-black text-amber-400">+{formatCurrency(kpis?.purchaseReturnsAmount)}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-t sm:border-t-0 sm:border-r border-rose-500/20 sm:pr-3 pt-1 sm:pt-0">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">صافي تأثير المرتجعات:</span>
                            <span className={cn("text-sm font-black font-mono",
                                (kpis?.purchaseReturnsAmount - kpis?.salesReturnsAmount) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            )}>
                                {formatCurrency(kpis?.purchaseReturnsAmount - kpis?.salesReturnsAmount)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Profit & Loss Component
// ─────────────────────────────────────────────────────────────────────
function ProfitLossReport({ data, isLoading }: { data: any, isLoading: boolean }) {
    const formatCurrency = (amount: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

    if (!data) return <div className="flex justify-center p-12"><CasperLoader /></div>;

    const { income, costs, expenses, profit, returns } = data;

    return (
        <div className="space-y-2.5 animate-in fade-in duration-300">
            {/* Main KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                    { label: 'إجمالي الإيرادات', value: income?.totalRevenue, color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                    { label: 'تكلفة البضاعة', value: costs?.totalCOGS, color: 'text-rose-400', glow: 'shadow-rose-500/10' },
                    { label: 'المصروفات', value: expenses?.operatingExpenses, color: 'text-amber-400', glow: 'shadow-amber-500/10' },
                    { label: 'صافي الربح', value: profit?.netProfit, color: profit?.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400', glow: profit?.netProfit >= 0 ? 'shadow-emerald-500/10' : 'shadow-rose-500/10', sub: `هامش: ${profit?.profitMargin?.toFixed(1)}%` }
                ].map((item, idx) => (
                    <div key={idx} className={cn(
                        "glass-card bg-card/50 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-xs transition-all",
                        item.glow
                    )}>
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">{item.label}</h3>
                        <div className={cn("text-base font-black tracking-tight font-mono", item.color)}>
                            {formatCurrency(item.value)}
                        </div>
                        {(item as any).sub && <div className="text-[9.5px] font-bold text-muted-foreground mt-0.5 uppercase tracking-tight">{(item as any).sub}</div>}
                    </div>
                ))}
            </div>

            {/* Revenue Breakdown + Profit Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                <div className="glass-card bg-card/40 backdrop-blur-md border border-border rounded-xl p-3 overflow-hidden relative group">
                    <h3 className="text-xs font-black text-foreground/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-cyan-500" />
                        مصادر الإيرادات
                    </h3>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center"><span className="font-bold text-muted-foreground">مبيعات POS</span><span className="font-black text-cyan-400 font-mono">{formatCurrency(income?.posRevenue)}</span></div>
                        <div className="flex justify-between items-center"><span className="font-bold text-muted-foreground">صيانة</span><span className="font-black text-cyan-400 font-mono">{formatCurrency(income?.maintenanceRevenue)}</span></div>
                        <div className="flex justify-between items-center"><span className="font-bold text-muted-foreground">أخرى</span><span className="font-black text-cyan-400 font-mono">{formatCurrency(income?.otherIncome)}</span></div>
                        <div className="flex justify-between items-center pt-2 border-t border-border/50"><span className="font-black text-foreground">الإجمالي</span><span className="text-sm font-black text-cyan-500 font-mono">{formatCurrency(income?.totalRevenue)}</span></div>
                    </div>
                </div>

                <div className="glass-card bg-card/40 backdrop-blur-md border border-border rounded-xl p-3 overflow-hidden relative group">
                    <h3 className="text-xs font-black text-foreground/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                        ملخص الأرباح
                    </h3>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center"><span className="font-bold text-muted-foreground">إجمالي الإيرادات</span><span className="font-black text-cyan-400 font-mono">{formatCurrency(income?.totalRevenue)}</span></div>
                        <div className="flex justify-between items-center"><span className="font-bold text-muted-foreground">تكلفة البضاعة</span><span className="font-black text-rose-400 font-mono">-{formatCurrency(costs?.totalCOGS)}</span></div>
                        <div className="flex justify-between items-center pt-1.5 border-t border-border/30"><span className="font-bold text-emerald-400">إجمالي الربح</span><span className="font-black text-emerald-400 font-mono">{formatCurrency(profit?.grossProfit)}</span></div>
                        <div className="flex justify-between items-center"><span className="font-bold text-muted-foreground">المصروفات</span><span className="font-black text-amber-400 font-mono">-{formatCurrency(expenses?.operatingExpenses)}</span></div>
                        <div className="flex justify-between items-center pt-2 border-t border-border/50"><span className="font-black text-foreground">صافي الربح</span><span className={cn("text-sm font-black font-mono", profit?.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500')}>{formatCurrency(profit?.netProfit)}</span></div>
                    </div>
                </div>
            </div>

            {/* Returns Section */}
            {returns && (returns.salesReturnsCount > 0 || returns.purchaseReturnsCount > 0) && (
                <div className="glass-card bg-rose-500/5 border border-rose-500/20 rounded-xl p-2.5">
                    <h3 className="text-xs font-black text-rose-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5" />
                        المرتجعات
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="space-y-0.5">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">مرتجعات مبيعات</p>
                            <p className="text-sm font-black text-rose-400 font-mono">-{formatCurrency(returns.salesReturnsAmount)}</p>
                            <p className="text-[10px] text-muted-foreground">{returns.salesReturnsCount} فاتورة مرتجعة</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">مرتجعات مشتريات</p>
                            <p className="text-sm font-black text-amber-400 font-mono">+{formatCurrency(returns.purchaseReturnsAmount)}</p>
                            <p className="text-[10px] text-muted-foreground">{returns.purchaseReturnsCount} فاتورة مرتجعة</p>
                        </div>
                        <div className="border-r border-rose-500/20 pr-2 space-y-0.5">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">صافي تأثير المرتجعات</p>
                            <p className={cn("text-sm font-black font-mono",
                                (returns.purchaseReturnsAmount - returns.salesReturnsAmount) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            )}>
                                {formatCurrency(returns.purchaseReturnsAmount - returns.salesReturnsAmount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">مشتريات - مبيعات</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}



// ─────────────────────────────────────────────────────────────────────
// HR Report Component
// ─────────────────────────────────────────────────────────────────────
function HRReport({ data, isLoading }: { data: any, isLoading: boolean }) {
    const formatCurrency = (amount: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

    if (!data) return <div className="flex justify-center p-20"><CasperLoader /></div>;

    const { summary, employees } = data;

    return (
        <div className="space-y-2.5 animate-in fade-in duration-300">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                    { label: 'عدد الموظفين', value: summary?.totalEmployees, color: 'text-white', glow: 'shadow-white/5' },
                    { label: 'أيام الحضور', value: summary?.totalPresent, color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                    { label: 'نسبة الحضور', value: `${summary?.attendanceRate}%`, color: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
                    { label: 'إجمالي الرواتب', value: formatCurrency(summary?.totalSalaries), color: 'text-amber-400', glow: 'shadow-amber-500/10' }
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

            {/* Employee List Table */}
            <div className="glass-card bg-card/40 backdrop-blur-md border border-border rounded-xl overflow-hidden shadow-xs">
                <div className="p-2.5 px-3 border-b border-border/40 flex items-center justify-between">
                    <h3 className="text-xs font-black text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-amber-500" />
                        تفاصيل الموظفين ({employees?.length || 0})
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الاسم</th>
                                <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الفرع</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الحضور</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الغياب</th>
                                <th className="text-left py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الراتب المتوقع</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {(employees || []).slice(0, 50).map((emp: any) => (
                                <tr key={emp.id} className="transition-all hover:bg-primary/10 even:bg-muted/40 group">
                                    <td className="py-1.5 px-3 font-bold text-foreground text-xs">{emp.name}</td>
                                    <td className="py-1.5 px-3 text-muted-foreground text-[11px] font-medium">{emp.branch}</td>
                                    <td className="py-1.5 px-3 text-center text-emerald-500 font-black font-mono">{emp.presentDays}</td>
                                    <td className="py-1.5 px-3 text-center text-rose-500 font-black font-mono">{emp.absentDays}</td>
                                    <td className="py-1.5 px-3 text-left text-cyan-500 font-black font-mono">{formatCurrency(emp.netSalary)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Main Reports Page
// ─────────────────────────────────────────────────────────────────────
export default function UnifiedReportsPage() {
    const [isPending, startTransition] = useTransition();
    const searchParams = useSearchParams();
    const router = useRouter();

    // Filter State
    const [filters, setFilters] = useState({
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        branchId: 'all'
    });

    // Data State
    const [financialData, setFinancialData] = useState<any>(null);
    const [profitLossData, setProfitLossData] = useState<any>(null);
    const [inventoryData, setInventoryData] = useState<any>(null);
    const [hrData, setHRData] = useState<any>(null);
    const [branches, setBranches] = useState<any[]>([]);

    const activeTab = searchParams?.get('tab') || 'financial';

    // Fetch branches on mount
    useEffect(() => {
        getBranchesForReports().then(res => {
            if (res.success) setBranches(res.branches || []);
        });
    }, []);

    // Fetch all report data when filters change
    useEffect(() => {
        fetchAllReports();
    }, [filters.startDate, filters.endDate, filters.branchId]);

    const fetchAllReports = () => {
        startTransition(async () => {
            const branchId = filters.branchId === 'all' ? undefined : filters.branchId;

            // Financial Report
            const financialRes = await getReportData({
                startDate: filters.startDate,
                endDate: filters.endDate,
                branchId
            });
            if (financialRes.success) setFinancialData(financialRes.data);

            // Profit & Loss
            const plRes = await getProfitLossReport({
                startDate: filters.startDate,
                endDate: filters.endDate,
                branchId
            });
            if (plRes.success) setProfitLossData(plRes.data);

            // Inventory
            const invRes = await getInventoryReport({
                warehouseId: branchId
            });
            if (invRes.success) setInventoryData(invRes.data);

            // HR
            const hrRes = await getHRReport({
                startDate: filters.startDate,
                endDate: filters.endDate,
                branchId
            });
            if (hrRes.success) setHRData(hrRes.data);
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

    const handleTabChange = (tab: string) => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('tab', tab);
        router.push(`/reports?${params.toString()}`);
    };

    return (
        <div className="p-2.5 sm:p-3.5 space-y-2.5 min-h-screen text-foreground transition-colors duration-500 max-w-[2400px] mx-auto font-cairo">
            {/* Compact Header & Integrated Filter Bar */}
            <div className="glass-card bg-card/60 backdrop-blur-xl border border-border rounded-2xl p-2.5 px-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* 1-Line Header Badge */}
                <div className="flex items-center gap-2.5 shrink-0">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                        <BarChart3 className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-black tracking-tight text-foreground">التقارير الشاملة</h1>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-muted text-muted-foreground border border-border/50">
                                Casper ERP
                            </span>
                        </div>
                        <p className="text-muted-foreground text-[10.5px] font-medium leading-none">لوحة متابعة جميع التقارير المالية والتشغيلية</p>
                    </div>
                </div>

                {/* Compact Filters Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0">
                           <Calendar className="w-3 h-3 text-primary" />
                           الفترة:
                        </Label>
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
                            className="bg-background/50 border-border h-8 text-xs rounded-xl focus:ring-1 focus:ring-primary/20 transition-all font-mono w-48"
                        />
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0">
                           <Activity className="w-3 h-3 text-primary" />
                           الفرع:
                        </Label>
                        <Select
                            value={filters.branchId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, branchId: val }))}
                        >
                            <SelectTrigger className="bg-background/50 border-border h-8 text-xs rounded-xl focus:ring-1 focus:ring-primary/20 transition-all font-bold w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-xl border-border rounded-xl shadow-xl">
                                <SelectItem value="all" className="font-bold text-xs">كل الفروع</SelectItem>
                                {branches.map(b => (
                                    <SelectItem key={b.id} value={b.id} className="font-bold text-xs">{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <button
                        onClick={fetchAllReports}
                        disabled={isPending}
                        className="h-8 px-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold text-xs shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5 shrink-0"
                    >
                        {isPending ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                <span>جاري...</span>
                            </>
                        ) : (
                            <span>تحديث البيانات</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Main Tabs Container */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-2.5">
                <TabsList className="bg-card/40 backdrop-blur-md border border-border w-full flex-wrap h-auto p-1 rounded-xl shadow-xs gap-1">
                    <TabsTrigger value="financial" className="flex-1 py-1.5 px-2 rounded-lg font-bold text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                        <BarChart3 className="w-3.5 h-3.5 ml-1.5" />
                        المالية
                    </TabsTrigger>
                    <TabsTrigger value="profit_loss" className="flex-1 py-1.5 px-2 rounded-lg font-bold text-xs data-[state=active]:bg-emerald-500 data-[state=active]:text-white transition-all">
                        <TrendingUp className="w-3.5 h-3.5 ml-1.5" />
                        الأرباح والخسائر
                    </TabsTrigger>
                    <TabsTrigger value="inventory" className="flex-1 py-1.5 px-2 rounded-lg font-bold text-xs data-[state=active]:bg-cyan-500 data-[state=active]:text-white transition-all">
                        <Package className="w-3.5 h-3.5 ml-1.5" />
                        المخزون
                    </TabsTrigger>
                    <TabsTrigger value="cash_flow" className="flex-1 py-1.5 px-2 rounded-lg font-bold text-xs data-[state=active]:bg-teal-500 data-[state=active]:text-white transition-all">
                        <Landmark className="w-3.5 h-3.5 ml-1.5" />
                        حركة النقدية
                    </TabsTrigger>
                    <TabsTrigger value="aged_receivables" className="flex-1 py-1.5 px-2 rounded-lg font-bold text-xs data-[state=active]:bg-rose-500 data-[state=active]:text-white transition-all">
                        <DollarSign className="w-3.5 h-3.5 ml-1.5" />
                        أعمار الديون
                    </TabsTrigger>
                    <TabsTrigger value="hr" className="flex-1 py-1.5 px-2 rounded-lg font-bold text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-white transition-all">
                        <Users className="w-3.5 h-3.5 ml-1.5" />
                        الموظفين
                    </TabsTrigger>
                    <TabsTrigger value="z_report" className="flex-1 py-1.5 px-2 rounded-lg font-bold text-xs data-[state=active]:bg-indigo-500 data-[state=active]:text-white transition-all">
                        <FileText className="w-3.5 h-3.5 ml-1.5" />
                        الورديات
                    </TabsTrigger>
                    <TabsTrigger value="sales_analysis" className="flex-1 py-1.5 px-2 rounded-lg font-bold text-xs data-[state=active]:bg-rose-500 data-[state=active]:text-white transition-all">
                        <BarChart3 className="w-3.5 h-3.5 ml-1.5" />
                        تحليل المبيعات
                    </TabsTrigger>
                </TabsList>

                <div className="relative min-h-[400px]">
                    {isPending && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/20 backdrop-blur-[2px] rounded-3xl">
                            <CasperLoader />
                        </div>
                    )}
                    
                    <TabsContent value="financial" className="focus-visible:outline-none data-[state=inactive]:hidden">
                        <FinancialReport reportData={financialData} isLoading={isPending} />
                    </TabsContent>
                    <TabsContent value="profit_loss" className="focus-visible:outline-none data-[state=inactive]:hidden">
                        <ProfitLossReport data={profitLossData} isLoading={isPending} />
                    </TabsContent>
                    <TabsContent value="inventory" className="focus-visible:outline-none data-[state=inactive]:hidden">
                        <InventoryReportDetail isTab={true} />
                    </TabsContent>
                    <TabsContent value="cash_flow" className="focus-visible:outline-none data-[state=inactive]:hidden">
                        <div className="glass-card bg-card/10 backdrop-blur-md border border-border/20 rounded-3xl p-6">
                            <CashFlowDashboard isTab={true} />
                        </div>
                    </TabsContent>
                    <TabsContent value="aged_receivables" className="focus-visible:outline-none data-[state=inactive]:hidden">
                        <AgedReceivablesReport />
                    </TabsContent>
                    <TabsContent value="hr" className="focus-visible:outline-none data-[state=inactive]:hidden">
                        <HRReport data={hrData} isLoading={isPending} />
                    </TabsContent>
                    <TabsContent value="z_report" className="focus-visible:outline-none data-[state=inactive]:hidden">
                        <ZReport />
                    </TabsContent>
                    <TabsContent value="sales_analysis" className="focus-visible:outline-none data-[state=inactive]:hidden">
                        <SalesAnalysisReport />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
