'use client';

import { useState, useEffect, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getReportData, getBranchesForFilter, getSalesByProductAndCategory, getCategoriesForFilter, getProductsForFilter } from "@/actions/reports-actions";
import { getShiftHistory } from "@/actions/shift-management-actions";
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
import { TrendingUp, TrendingDown, Package, Users, DollarSign, FileText, Activity, Calendar, BarChart3 } from "lucide-react";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────────────
// Financial Report Component
// ─────────────────────────────────────────────────────────────────────
function FinancialReport({ reportData, isLoading }: { reportData: any, isLoading: boolean }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [txSort, setTxSort] = useState({ key: 'date', order: 'desc' as 'asc' | 'desc' });

    const updateFilters = (newFilters: any) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(newFilters).forEach(([key, value]) => {
            if (value) params.set(key, value as string);
            else params.delete(key);
        });
        router.push(`/reports?${params.toString()}`);
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount || 0);

    if (!reportData) return <div className="flex justify-center p-20"><CasperLoader /></div>;

    const { kpis, trendData } = reportData;

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">إجمالي الإيرادات</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-cyan-400">{formatCurrency(kpis?.totalRevenue)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">تكلفة البضاعة</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-rose-400">{formatCurrency(kpis?.totalCOGS)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">المصروفات</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-400">{formatCurrency(kpis?.totalExpenses)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">المشتريات</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-400">{formatCurrency(kpis?.totalPurchases)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">صافي الربح</CardTitle></CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${kpis?.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(kpis?.netProfit)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-zinc-900/30 rounded-lg border border-white/5 text-center">
                    <div className="text-xl font-bold text-white">{kpis?.posCount || 0}</div>
                    <div className="text-xs text-zinc-500">مبيعات POS</div>
                </div>
                <div className="p-4 bg-zinc-900/30 rounded-lg border border-white/5 text-center">
                    <div className="text-xl font-bold text-white">{kpis?.maintenanceCount || 0}</div>
                    <div className="text-xs text-zinc-500">تذاكر صيانة</div>
                </div>
                <div className="p-4 bg-zinc-900/30 rounded-lg border border-white/5 text-center">
                    <div className="text-xl font-bold text-white">{formatCurrency(kpis?.posRevenue)}</div>
                    <div className="text-xs text-zinc-500">إيرادات POS</div>
                </div>
                <div className="p-4 bg-zinc-900/30 rounded-lg border border-white/5 text-center">
                    <div className="text-xl font-bold text-white">{formatCurrency(kpis?.maintenanceRevenue)}</div>
                    <div className="text-xs text-zinc-500">إيرادات صيانة</div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Profit & Loss Component
// ─────────────────────────────────────────────────────────────────────
function ProfitLossReport({ data, isLoading }: { data: any, isLoading: boolean }) {
    const formatCurrency = (amount: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount || 0);

    if (!data) return <div className="flex justify-center p-20"><CasperLoader /></div>;

    const { income, costs, expenses, profit } = data;

    return (
        <div className="space-y-6">
            {/* Main KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">إجمالي الإيرادات</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-cyan-400">{formatCurrency(income?.totalRevenue)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">تكلفة البضاعة</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-rose-400">{formatCurrency(costs?.totalCOGS)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">المصروفات</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-400">{formatCurrency(expenses?.operatingExpenses)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">صافي الربح</CardTitle></CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${profit?.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(profit?.netProfit)}
                        </div>
                        <div className="text-xs text-zinc-500">هامش: {profit?.profitMargin?.toFixed(1)}%</div>
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader><CardTitle className="text-lg">مصادر الإيرادات</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between"><span className="text-zinc-400">مبيعات POS</span><span className="font-bold text-cyan-400">{formatCurrency(income?.posRevenue)}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-400">صيانة</span><span className="font-bold text-cyan-400">{formatCurrency(income?.maintenanceRevenue)}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-400">أخرى</span><span className="font-bold text-cyan-400">{formatCurrency(income?.otherIncome)}</span></div>
                        <div className="flex justify-between pt-3 border-t border-white/10"><span className="font-bold">الإجمالي</span><span className="font-bold text-cyan-400">{formatCurrency(income?.totalRevenue)}</span></div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader><CardTitle className="text-lg">ملخص الأرباح</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between"><span className="text-zinc-400">إجمالي الإيرادات</span><span className="font-bold text-cyan-400">{formatCurrency(income?.totalRevenue)}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-400">تكلفة البضاعة</span><span className="font-bold text-rose-400">-{formatCurrency(costs?.totalCOGS)}</span></div>
                        <div className="flex justify-between pt-2 border-t border-white/10 font-medium"><span className="text-emerald-400">إجمالي الربح</span><span className="text-emerald-400">{formatCurrency(profit?.grossProfit)}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-400">المصروفات</span><span className="font-bold text-amber-400">-{formatCurrency(expenses?.operatingExpenses)}</span></div>
                        <div className="flex justify-between pt-2 border-t border-white/10 text-lg"><span className="font-bold">صافي الربح</span><span className={`font-bold ${profit?.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(profit?.netProfit)}</span></div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Inventory Report Component
// ─────────────────────────────────────────────────────────────────────
function InventoryReport({ data, isLoading }: { data: any, isLoading: boolean }) {
    const formatCurrency = (amount: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount || 0);

    if (!data) return <div className="flex justify-center p-20"><CasperLoader /></div>;

    const { summary, products } = data;

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">إجمالي الأصناف</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-white">{summary?.totalItems}</div></CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">إجمالي الكمية</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-cyan-400">{summary?.totalQuantity?.toLocaleString()}</div></CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">القيمة الإجمالية</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-emerald-400">{formatCurrency(summary?.totalValue)}</div></CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">مخزون منخفض</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-amber-400">{summary?.lowStockCount}</div></CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">نفد المخزون</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-rose-400">{summary?.outOfStockCount}</div></CardContent>
                </Card>
            </div>

            {/* Top Products */}
            <Card className="bg-zinc-900/50 border-white/5">
                <CardHeader><CardTitle className="text-lg">أصناف المخزون ({products?.length || 0})</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-right py-2 px-3">SKU</th>
                                    <th className="text-right py-2 px-3">المنتج</th>
                                    <th className="text-right py-2 px-3">الفئة</th>
                                    <th className="text-right py-2 px-3">الكمية</th>
                                    <th className="text-right py-2 px-3">القيمة</th>
                                    <th className="text-right py-2 px-3">الحالة</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(products || []).slice(0, 20).map((p: any) => (
                                    <tr key={p.id} className="border-b border-white/5">
                                        <td className="py-2 px-3 font-mono text-zinc-400">{p.sku}</td>
                                        <td className="py-2 px-3 font-medium">{p.name}</td>
                                        <td className="py-2 px-3 text-zinc-400">{p.category}</td>
                                        <td className="py-2 px-3 text-cyan-400 font-bold">{p.quantity}</td>
                                        <td className="py-2 px-3 text-emerald-400">{formatCurrency(p.totalValue)}</td>
                                        <td className="py-2 px-3">
                                            {p.isOutOfStock ? <span className="px-2 py-0.5 rounded text-xs bg-rose-500/20 text-rose-400">نفد</span> :
                                                p.isLowStock ? <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">منخفض</span> :
                                                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">متوفر</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// HR Report Component
// ─────────────────────────────────────────────────────────────────────
function HRReport({ data, isLoading }: { data: any, isLoading: boolean }) {
    const formatCurrency = (amount: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount || 0);

    if (!data) return <div className="flex justify-center p-20"><CasperLoader /></div>;

    const { summary, employees } = data;

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">عدد الموظفين</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-white">{summary?.totalEmployees}</div></CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">أيام الحضور</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-cyan-400">{summary?.totalPresent}</div></CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">نسبة الحضور</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-emerald-400">{summary?.attendanceRate}%</div></CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-400">إجمالي الرواتب</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-amber-400">{formatCurrency(summary?.totalSalaries)}</div></CardContent>
                </Card>
            </div>

            {/* Employee List */}
            <Card className="bg-zinc-900/50 border-white/5">
                <CardHeader><CardTitle className="text-lg">تفاصيل الموظفين ({employees?.length || 0})</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-right py-2 px-3">الاسم</th>
                                    <th className="text-right py-2 px-3">الفرع</th>
                                    <th className="text-right py-2 px-3">الحضور</th>
                                    <th className="text-right py-2 px-3">الغياب</th>
                                    <th className="text-right py-2 px-3">الراتب</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(employees || []).slice(0, 20).map((emp: any) => (
                                    <tr key={emp.id} className="border-b border-white/5">
                                        <td className="py-2 px-3 font-medium">{emp.name}</td>
                                        <td className="py-2 px-3 text-zinc-400">{emp.branch}</td>
                                        <td className="py-2 px-3 text-emerald-400 font-bold">{emp.presentDays}</td>
                                        <td className="py-2 px-3 text-rose-400">{emp.absentDays}</td>
                                        <td className="py-2 px-3 text-cyan-400">{formatCurrency(emp.netSalary)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
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

    const activeTab = searchParams.get('tab') || 'financial';

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
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tab);
        router.push(`/reports?${params.toString()}`);
    };

    return (
        <div className="p-6 space-y-6 bg-zinc-950 min-h-screen text-zinc-100">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white">التقارير الشاملة</h1>
                    <p className="text-zinc-400 text-sm mt-1">لوحة متابعة جميع التقارير المالية والتشغيلية</p>
                </div>
            </div>

            {/* Filters */}
            <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <Label className="text-xs text-zinc-500 mb-2 block">الفترة</Label>
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
                            className="bg-zinc-900/80"
                        />
                    </div>
                    <div>
                        <Label className="text-xs text-zinc-500 mb-2 block">الفرع</Label>
                        <Select
                            value={filters.branchId}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, branchId: val }))}
                        >
                            <SelectTrigger className="bg-zinc-900/80 border-white/5">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900">
                                <SelectItem value="all">كل الفروع</SelectItem>
                                {branches.map(b => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <button
                            onClick={fetchAllReports}
                            disabled={isPending}
                            className="w-full h-10 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-white"
                        >
                            {isPending ? 'جاري التحميل...' : 'تحديث البيانات'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="bg-zinc-900 border border-white/10 w-full flex-wrap h-auto p-1">
                    <TabsTrigger value="financial" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black">
                        <BarChart3 className="w-4 h-4 ml-2" />
                        المالية
                    </TabsTrigger>
                    <TabsTrigger value="profit_loss" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                        <TrendingUp className="w-4 h-4 ml-2" />
                        الأرباح والخسائر
                    </TabsTrigger>
                    <TabsTrigger value="inventory" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
                        <Package className="w-4 h-4 ml-2" />
                        المخزون
                    </TabsTrigger>
                    <TabsTrigger value="hr" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                        <Users className="w-4 h-4 ml-2" />
                        الموظفين
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="financial">
                    <FinancialReport reportData={financialData} isLoading={isPending} />
                </TabsContent>
                <TabsContent value="profit_loss">
                    <ProfitLossReport data={profitLossData} isLoading={isPending} />
                </TabsContent>
                <TabsContent value="inventory">
                    <InventoryReport data={inventoryData} isLoading={isPending} />
                </TabsContent>
                <TabsContent value="hr">
                    <HRReport data={hrData} isLoading={isPending} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
