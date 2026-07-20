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

    if (!reportData) return <div className="flex justify-center p-20"><CasperLoader /></div>;

    const { kpis, trendData } = reportData;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {[
                    { label: 'إجمالي الإيرادات', value: kpis?.totalRevenue, color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                    { label: 'تكلفة البضاعة', value: kpis?.totalCOGS, color: 'text-rose-400', glow: 'shadow-rose-500/10' },
                    { label: 'المصروفات', value: kpis?.totalExpenses, color: 'text-amber-400', glow: 'shadow-amber-500/10' },
                    { label: 'المشتريات', value: kpis?.totalPurchases, color: 'text-blue-400', glow: 'shadow-blue-500/10' },
                    { label: 'صافي الربح', value: kpis?.netProfit, color: kpis?.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400', glow: kpis?.netProfit >= 0 ? 'shadow-emerald-500/10' : 'shadow-rose-500/10' }
                ].map((item, idx) => (
                    <div key={idx} className={cn(
                        "glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:bg-card/60",
                        item.glow
                    )}>
                        <h3 className="text-[10px] font-black text-foreground/60 uppercase tracking-widest mb-3">{item.label}</h3>
                        <div className={cn("text-2xl font-black tracking-tight", item.color)}>
                            {formatCurrency(item.value)}
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'مبيعات POS', value: kpis?.posCount || 0, icon: <DollarSign className="w-4 h-4" /> },
                    { label: 'تذاكر صيانة', value: kpis?.maintenanceCount || 0, icon: <Activity className="w-4 h-4" /> },
                    { label: 'إيرادات POS', value: formatCurrency(kpis?.posRevenue), icon: <BarChart3 className="w-4 h-4" /> },
                    { label: 'إيرادات صيانة', value: formatCurrency(kpis?.maintenanceRevenue), icon: <Activity className="w-4 h-4" /> }
                ].map((stat, idx) => (
                    <div key={idx} className="glass-card bg-card/20 backdrop-blur-md border border-border/40 rounded-xl p-4 flex items-center justify-between group hover:bg-card/30 transition-all">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-wide">{stat.label}</p>
                            <p className="text-lg font-black text-foreground tracking-tight">{stat.value}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            {stat.icon}
                        </div>
                    </div>
                ))}
            </div>

            {/* Returns Section */}
            {(kpis?.salesReturnsCount > 0 || kpis?.purchaseReturnsCount > 0) && (
                <div className="glass-card bg-rose-500/5 border border-rose-500/20 rounded-2xl p-6">
                    <h3 className="text-sm font-black text-rose-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4" />
                        المرتجعات
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-foreground/60">مرتجعات مبيعات</span>
                                <div className="text-left">
                                    <span className="font-black text-rose-400">-{formatCurrency(kpis?.salesReturnsAmount)}</span>
                                    <span className="text-[10px] text-foreground/40 mr-2">({kpis?.salesReturnsCount} فاتورة)</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-foreground/60">مرتجعات مشتريات</span>
                                <div className="text-left">
                                    <span className="font-black text-amber-400">+{formatCurrency(kpis?.purchaseReturnsAmount)}</span>
                                    <span className="text-[10px] text-foreground/40 mr-2">({kpis?.purchaseReturnsCount} فاتورة)</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col justify-center border-r border-rose-500/20 pr-6">
                            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">صافي تأثير المرتجعات</p>
                            <p className={cn("text-2xl font-black",
                                (kpis?.purchaseReturnsAmount - kpis?.salesReturnsAmount) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            )}>
                                {formatCurrency(kpis?.purchaseReturnsAmount - kpis?.salesReturnsAmount)}
                            </p>
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

    if (!data) return <div className="flex justify-center p-20"><CasperLoader /></div>;

    const { income, costs, expenses, profit, returns } = data;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Main KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'إجمالي الإيرادات', value: income?.totalRevenue, color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                    { label: 'تكلفة البضاعة', value: costs?.totalCOGS, color: 'text-rose-400', glow: 'shadow-rose-500/10' },
                    { label: 'المصروفات', value: expenses?.operatingExpenses, color: 'text-amber-400', glow: 'shadow-amber-500/10' },
                    { label: 'صافي الربح', value: profit?.netProfit, color: profit?.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400', glow: profit?.netProfit >= 0 ? 'shadow-emerald-500/10' : 'shadow-rose-500/10', sub: `هامش: ${profit?.profitMargin?.toFixed(1)}%` }
                ].map((item, idx) => (
                    <div key={idx} className={cn(
                        "glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:bg-card/60",
                        item.glow
                    )}>
                        <h3 className="text-[10px] font-black text-foreground/60 uppercase tracking-widest mb-3">{item.label}</h3>
                        <div className={cn("text-2xl font-black tracking-tight", item.color)}>
                            {formatCurrency(item.value)}
                        </div>
                        {(item as any).sub && <div className="text-[10px] font-bold text-foreground/40 mt-1 uppercase tracking-tight">{(item as any).sub}</div>}
                    </div>
                ))}
            </div>

            {/* Revenue Breakdown + Profit Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-card bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-6 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-cyan-500/10 transition-colors" />
                    <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-cyan-500" />
                        مصادر الإيرادات
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-foreground/60">مبيعات POS</span><span className="font-black text-cyan-400">{formatCurrency(income?.posRevenue)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-foreground/60">صيانة</span><span className="font-black text-cyan-400">{formatCurrency(income?.maintenanceRevenue)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-foreground/60">أخرى</span><span className="font-black text-cyan-400">{formatCurrency(income?.otherIncome)}</span></div>
                        <div className="flex justify-between items-center pt-4 border-t border-border/40"><span className="text-sm font-black text-foreground">الإجمالي</span><span className="text-lg font-black text-cyan-500">{formatCurrency(income?.totalRevenue)}</span></div>
                    </div>
                </div>

                <div className="glass-card bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-6 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors" />
                    <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                        ملخص الأرباح
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-foreground/60">إجمالي الإيرادات</span><span className="font-black text-cyan-400">{formatCurrency(income?.totalRevenue)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-foreground/60">تكلفة البضاعة</span><span className="font-black text-rose-400">-{formatCurrency(costs?.totalCOGS)}</span></div>
                        <div className="flex justify-between items-center pt-2 border-t border-border/20"><span className="text-sm font-bold text-emerald-400">إجمالي الربح</span><span className="font-black text-emerald-400">{formatCurrency(profit?.grossProfit)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-foreground/60">المصروفات</span><span className="font-black text-amber-400">-{formatCurrency(expenses?.operatingExpenses)}</span></div>
                        <div className="flex justify-between items-center pt-4 border-t border-border/40"><span className="text-sm font-black text-foreground">صافي الربح</span><span className={cn("text-xl font-black", profit?.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500')}>{formatCurrency(profit?.netProfit)}</span></div>
                    </div>
                </div>
            </div>

            {/* Returns Section */}
            {returns && (returns.salesReturnsCount > 0 || returns.purchaseReturnsCount > 0) && (
                <div className="glass-card bg-rose-500/5 border border-rose-500/20 rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-sm font-black text-rose-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4" />
                        المرتجعات
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {/* Sales Returns */}
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">مرتجعات مبيعات</p>
                            <p className="text-2xl font-black text-rose-400">-{formatCurrency(returns.salesReturnsAmount)}</p>
                            <p className="text-xs text-foreground/50">{returns.salesReturnsCount} فاتورة مرتجعة</p>
                        </div>
                        {/* Purchase Returns */}
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">مرتجعات مشتريات</p>
                            <p className="text-2xl font-black text-amber-400">+{formatCurrency(returns.purchaseReturnsAmount)}</p>
                            <p className="text-xs text-foreground/50">{returns.purchaseReturnsCount} فاتورة مرتجعة</p>
                        </div>
                        {/* Net Impact */}
                        <div className="border-r border-rose-500/20 pr-6 space-y-2">
                            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">صافي تأثير المرتجعات</p>
                            <p className={cn("text-2xl font-black",
                                (returns.purchaseReturnsAmount - returns.salesReturnsAmount) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            )}>
                                {formatCurrency(returns.purchaseReturnsAmount - returns.salesReturnsAmount)}
                            </p>
                            <p className="text-xs text-foreground/50">مرتجعات مشتريات - مرتجعات مبيعات</p>
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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'عدد الموظفين', value: summary?.totalEmployees, color: 'text-white', glow: 'shadow-white/5' },
                    { label: 'أيام الحضور', value: summary?.totalPresent, color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                    { label: 'نسبة الحضور', value: `${summary?.attendanceRate}%`, color: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
                    { label: 'إجمالي الرواتب', value: formatCurrency(summary?.totalSalaries), color: 'text-amber-400', glow: 'shadow-amber-500/10' }
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

            {/* Employee List Table */}
            <div className="glass-card bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-border/40">
                    <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-500" />
                        تفاصيل الموظفين ({employees?.length || 0})
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الاسم</th>
                                <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الفرع</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الحضور</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الغياب</th>
                                <th className="text-left py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الراتب المتوقع</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {(employees || []).slice(0, 50).map((emp: any) => (
                                <tr key={emp.id} className="transition-all hover:bg-primary/10 even:bg-muted/70 group h-14">
                                    <td className="py-2 px-6 font-black text-foreground text-sm">{emp.name}</td>
                                    <td className="py-2 px-6 text-foreground/40 text-xs font-bold uppercase tracking-tight">{emp.branch}</td>
                                    <td className="py-2 px-6 text-center text-emerald-500 font-black">{emp.presentDays}</td>
                                    <td className="py-2 px-6 text-center text-rose-500 font-black">{emp.absentDays}</td>
                                    <td className="py-2 px-6 text-left text-cyan-500 font-black">{formatCurrency(emp.netSalary)}</td>
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
        <div className="p-8 space-y-8 min-h-screen text-foreground transition-colors duration-500 max-w-[2400px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <div className="w-2 h-10 bg-primary rounded-full" />
                        التقارير الشاملة
                    </h1>
                    <p className="text-muted-foreground text-sm mt-2 font-medium">لوحة متابعة جميع التقارير المالية والتشغيلية بنظام Casper ERP</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end relative z-10">
                    <div className="space-y-3">
                        <Label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest pr-1 flex items-center gap-2">
                           <Calendar className="w-3 h-3 text-primary" />
                           الفترة الزمنية
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
                            className="bg-background/40 border-border/40 h-12 rounded-2xl focus:ring-primary/20 transition-all font-mono"
                        />
                    </div>
                    <div className="space-y-3">
                        <Label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest pr-1 flex items-center gap-2">
                           <Activity className="w-3 h-3 text-primary" />
                           تصفية حسب الفرع
                        </Label>
                        <Select
                            value={filters.branchId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, branchId: val }))}
                        >
                            <SelectTrigger className="bg-background/40 border-border/40 h-12 rounded-2xl focus:ring-primary/20 transition-all font-bold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-xl border-border/40 rounded-2xl shadow-2xl">
                                <SelectItem value="all" className="font-bold">كل الفروع</SelectItem>
                                {branches.map(b => (
                                    <SelectItem key={b.id} value={b.id} className="font-bold">{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <button
                            onClick={fetchAllReports}
                            disabled={isPending}
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {isPending ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                    جاري التحديث
                                </div>
                            ) : 'تحديث البيانات'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Tabs Container */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-8">
                <TabsList className="bg-card/20 backdrop-blur-md border border-border/40 w-full flex-wrap h-auto p-1.5 rounded-2xl shadow-xl">
                    <TabsTrigger value="financial" className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300">
                        <BarChart3 className="w-4 h-4 ml-2" />
                        المالية
                    </TabsTrigger>
                    <TabsTrigger value="profit_loss" className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-emerald-500 data-[state=active]:text-white transition-all duration-300">
                        <TrendingUp className="w-4 h-4 ml-2" />
                        الأرباح والخسائر
                    </TabsTrigger>
                    <TabsTrigger value="inventory" className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-cyan-500 data-[state=active]:text-white transition-all duration-300">
                        <Package className="w-4 h-4 ml-2" />
                        المخزون
                    </TabsTrigger>
                    <TabsTrigger value="cash_flow" className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-teal-500 data-[state=active]:text-white transition-all duration-300">
                        <Landmark className="w-4 h-4 ml-2" />
                        حركة النقدية
                    </TabsTrigger>
                    <TabsTrigger value="aged_receivables" className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-rose-500 data-[state=active]:text-white transition-all duration-300">
                        <DollarSign className="w-4 h-4 ml-2" />
                        أعمار الديون
                    </TabsTrigger>
                    <TabsTrigger value="hr" className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-amber-500 data-[state=active]:text-white transition-all duration-300">
                        <Users className="w-4 h-4 ml-2" />
                        الموظفين
                    </TabsTrigger>
                    <TabsTrigger value="z_report" className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-indigo-500 data-[state=active]:text-white transition-all duration-300">
                        <FileText className="w-4 h-4 ml-2" />
                        الورديات
                    </TabsTrigger>
                    <TabsTrigger value="sales_analysis" className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-rose-500 data-[state=active]:text-white transition-all duration-300">
                        <BarChart3 className="w-4 h-4 ml-2" />
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
