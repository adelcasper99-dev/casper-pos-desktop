"use client"

import { useState, useEffect } from "react"
import { getTechniciansPayrollSummary, settleTechnicianPayroll, TechPayrollSummary } from "@/actions/technician-payroll-actions"
import { DollarSign, Search, Calendar, CheckCircle, RefreshCcw, Wallet, TrendingUp, AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import SettlementConfirmationModal from "./SettlementConfirmationModal"

// We should also fetch treasuries, but since this is a client component, 
// we might need an action to get treasuries. We can create a simple one or assume it's passed.
// For now, let's create a quick action or use an existing one if possible. 
// Assuming we have getActiveTreasuries in some action. We will mock it here and then create the real one.
import { getTreasuries } from "@/actions/treasury" // we'll need to check if this exists or just pass from parent.

export default function TechniciansPayrollDashboard({ 
    filterDate,
    currentUserId,
    branchId
}: { 
    filterDate: Date,
    currentUserId: string,
    branchId: string
}) {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<TechPayrollSummary[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Settlement state
    const [settleModalOpen, setSettleModalOpen] = useState(false);
    const [selectedTech, setSelectedTech] = useState<TechPayrollSummary | null>(null);
    const [isSettling, setIsSettling] = useState(false);
    const [settleError, setSettleError] = useState<string | null>(null);
    
    // Treasuries
    const [treasuries, setTreasuries] = useState<{id: string, name: string, balance: number}[]>([]);

    const startDate = new Date(filterDate.getFullYear(), filterDate.getMonth(), 1);
    const endDate = new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 0);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await getTechniciansPayrollSummary({ startDate, endDate });
            if (res.success && res.data) {
                setData(res.data);
            } else {
                setError(res.error || "فشل جلب البيانات");
            }
            
            // Try fetching treasuries
            try {
                const tr = await getTreasuries();
                if (tr && tr.success && tr.data) {
                    setTreasuries(tr.data);
                }
            } catch (e) {
                console.error("Error fetching treasuries", e);
            }

        } catch (e: any) {
            setError(e.message || "حدث خطأ غير متوقع");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filterDate]);

    const handleSettleClick = (tech: TechPayrollSummary) => {
        setSelectedTech(tech);
        setSettleError(null);
        setSettleModalOpen(true);
    };

    const confirmSettlement = async (treasuryId: string) => {
        if (!selectedTech) return;
        
        setIsSettling(true);
        setSettleError(null);
        
        try {
            const res = await settleTechnicianPayroll({
                technicianId: selectedTech.technicianId,
                startDate,
                endDate,
                totalPayableAmount: selectedTech.totalPayable,
                userId: currentUserId,
                treasuryId,
                branchId
            });

            if (res.success) {
                setSettleModalOpen(false);
                setSelectedTech(null);
                // Refresh data
                fetchData();
            } else {
                setSettleError(res.error || "فشل في عملية الصرف");
            }
        } catch (e: any) {
            setSettleError(e.message || "حدث خطأ غير متوقع");
        } finally {
            setIsSettling(false);
        }
    };

    const filteredData = data.filter(tech => 
        tech.technicianName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalKPIs = data.reduce((acc, curr) => ({
        revenue: acc.revenue + curr.totalRevenue,
        cogs: acc.cogs + curr.totalPartsCost,
        profit: acc.profit + curr.netServiceMargin,
        debt: acc.debt + curr.debtCarryover,
        payable: acc.payable + curr.totalPayable
    }), { revenue: 0, cogs: 0, profit: 0, debt: 0, payable: 0 });

    return (
        <div className="space-y-6 animate-in fade-in duration-500 font-cairo">
            
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-5 rounded-2xl border border-zinc-200 dark:border-white/10 flex flex-col justify-center shadow-sm border-b-emerald-500/50">
                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-emerald-500" /> إجمالي الإيرادات
                    </span>
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-500 font-mono tabular-nums">
                        {totalKPIs.revenue.toLocaleString()} <span className="text-xs font-cairo text-zinc-400">ج.م</span>
                    </span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-5 rounded-2xl border border-zinc-200 dark:border-white/10 flex flex-col justify-center shadow-sm border-b-rose-500/50">
                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-rose-500 rotate-180" /> تكلفة القطع (COGS)
                    </span>
                    <span className="text-xl font-black text-rose-600 dark:text-rose-500 font-mono tabular-nums">
                        {totalKPIs.cogs.toLocaleString()} <span className="text-xs font-cairo text-zinc-400">ج.م</span>
                    </span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-5 rounded-2xl border border-zinc-200 dark:border-white/10 flex flex-col justify-center shadow-sm border-b-blue-500/50">
                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1.5">
                        <Wallet className="w-3 h-3 text-blue-500" /> صافي ربح المركز
                    </span>
                    <span className="text-xl font-black text-blue-600 dark:text-blue-500 font-mono tabular-nums">
                        {totalKPIs.profit.toLocaleString()} <span className="text-xs font-cairo text-zinc-400">ج.م</span>
                    </span>
                </div>
                <div className="bg-zinc-900 dark:bg-white p-5 rounded-2xl border border-zinc-800 dark:border-zinc-200 flex flex-col justify-center shadow-lg shadow-zinc-900/10">
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1.5">
                        <DollarSign className="w-3 h-3 text-white dark:text-zinc-900" /> إجمالي المستحق للفنيين
                    </span>
                    <span className="text-xl font-black text-white dark:text-zinc-900 font-mono tabular-nums">
                        {totalKPIs.payable.toLocaleString()} <span className="text-xs font-cairo opacity-70">ج.م</span>
                    </span>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-zinc-50 dark:bg-zinc-900/30 p-2 rounded-2xl border border-zinc-200 dark:border-white/5">
                <div className="relative w-full md:w-96">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                        type="text" 
                        placeholder="ابحث عن فني..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pr-10 pl-4 py-2 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                </div>
                <button 
                    onClick={fetchData}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-all"
                >
                    <RefreshCcw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                    تحديث البيانات
                </button>
            </div>

            {/* Error State */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-bold rounded-2xl border border-red-100 dark:border-red-900/30 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* Data Table */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 font-black text-xs uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                            <tr>
                                <th className="px-6 py-4">الفني</th>
                                <th className="px-6 py-4 text-center">التذاكر</th>
                                <th className="px-6 py-4">الإيرادات</th>
                                <th className="px-6 py-4 text-rose-500">تكلفة القطع</th>
                                <th className="px-6 py-4 text-blue-500">هامش الربح</th>
                                <th className="px-6 py-4 text-emerald-500">العمولات</th>
                                <th className="px-6 py-4">الراتب الأساسي</th>
                                <th className="px-6 py-4 text-red-500">تسويات سابقة (Debt)</th>
                                <th className="px-6 py-4 text-zinc-900 dark:text-white">إجمالي المستحق</th>
                                <th className="px-6 py-4 text-center">الإجراء</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50 font-bold">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-zinc-400">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                                        جاري حساب العمولات والأرباح...
                                    </td>
                                </tr>
                            ) : filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-zinc-400">
                                        لا توجد تذاكر مدفوعة غير مسواة في هذه الفترة.
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((tech) => (
                                    <tr key={tech.technicianId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black">
                                                    {tech.technicianName.charAt(0)}
                                                </div>
                                                <span className="text-zinc-900 dark:text-white">{tech.technicianName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center tabular-nums">
                                            <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs">
                                                {tech.ticketsCount}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 tabular-nums text-emerald-600 dark:text-emerald-500">{tech.totalRevenue.toLocaleString()}</td>
                                        <td className="px-6 py-4 tabular-nums text-rose-600 dark:text-rose-500">{tech.totalPartsCost.toLocaleString()}</td>
                                        <td className="px-6 py-4 tabular-nums text-blue-600 dark:text-blue-500">{tech.netServiceMargin.toLocaleString()}</td>
                                        <td className="px-6 py-4 tabular-nums text-emerald-600 dark:text-emerald-500">{tech.commissionEarned.toLocaleString()}</td>
                                        <td className="px-6 py-4 tabular-nums text-zinc-600 dark:text-zinc-400">{tech.basicSalary.toLocaleString()}</td>
                                        <td className="px-6 py-4 tabular-nums font-bold text-red-500">
                                            {tech.debtCarryover > 0 ? `-${tech.debtCarryover.toLocaleString()}` : "0"}
                                        </td>
                                        <td className="px-6 py-4 tabular-nums text-base font-black text-zinc-900 dark:text-white">
                                            {tech.totalPayable.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {tech.totalPayable > 0 ? (
                                                <button
                                                    onClick={() => handleSettleClick(tech)}
                                                    className="px-4 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                                                >
                                                    صرف
                                                </button>
                                            ) : (
                                                <span className="text-xs text-zinc-400 font-bold">لا يوجد مستحق</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedTech && (
                <SettlementConfirmationModal
                    isOpen={settleModalOpen}
                    onClose={() => setSettleModalOpen(false)}
                    onConfirm={confirmSettlement}
                    technicianName={selectedTech.technicianName}
                    totalAmount={selectedTech.totalPayable}
                    isLoading={isSettling}
                    error={settleError}
                    treasuries={treasuries}
                />
            )}
        </div>
    )
}
