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
        <div className="space-y-2.5 animate-in fade-in duration-300 font-cairo">
            {/* Compact KPIs Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-zinc-50/80 dark:bg-zinc-900/40 p-2 px-3 rounded-xl border border-zinc-200/80 dark:border-white/10 flex items-center justify-between shadow-2xs border-r-4 border-r-emerald-500/80">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-bold flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> إجمالي الإيرادات
                    </span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                        {totalKPIs.revenue.toLocaleString()} <span className="text-[10px] font-cairo text-zinc-400 font-normal">ج.م</span>
                    </span>
                </div>
                <div className="bg-zinc-50/80 dark:bg-zinc-900/40 p-2 px-3 rounded-xl border border-zinc-200/80 dark:border-white/10 flex items-center justify-between shadow-2xs border-r-4 border-r-rose-500/80">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-bold flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-rose-500 rotate-180" /> تكلفة القطع
                    </span>
                    <span className="text-sm font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                        {totalKPIs.cogs.toLocaleString()} <span className="text-[10px] font-cairo text-zinc-400 font-normal">ج.م</span>
                    </span>
                </div>
                <div className="bg-zinc-50/80 dark:bg-zinc-900/40 p-2 px-3 rounded-xl border border-zinc-200/80 dark:border-white/10 flex items-center justify-between shadow-2xs border-r-4 border-r-indigo-500/80">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-bold flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-indigo-500" /> صافي ربح المركز
                    </span>
                    <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono tabular-nums">
                        {totalKPIs.profit.toLocaleString()} <span className="text-[10px] font-cairo text-zinc-400 font-normal">ج.م</span>
                    </span>
                </div>
                <div className="bg-zinc-900 dark:bg-white p-2 px-3 rounded-xl border border-zinc-800 dark:border-zinc-200 flex items-center justify-between shadow-xs">
                    <span className="text-xs text-zinc-300 dark:text-zinc-700 font-bold flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-white dark:text-zinc-900" /> مستحق الفنيين
                    </span>
                    <span className="text-sm font-black text-white dark:text-zinc-900 font-mono tabular-nums">
                        {totalKPIs.payable.toLocaleString()} <span className="text-[10px] font-cairo opacity-70 font-normal">ج.م</span>
                    </span>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-2 items-center justify-between bg-zinc-50/80 dark:bg-zinc-900/30 p-2 px-3 rounded-xl border border-zinc-200/80 dark:border-white/5 shadow-2xs">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input 
                        type="text" 
                        placeholder="ابحث عن فني..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pr-8 pl-3 h-8 text-xs font-bold focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                    />
                </div>
                <button 
                    onClick={fetchData}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 h-8 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-all shadow-2xs active:scale-95"
                >
                    <RefreshCcw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                    تحديث
                </button>
            </div>

            {/* Error State */}
            {error && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Data Table */}
            <div className="bg-white dark:bg-zinc-950/40 border border-zinc-200/80 dark:border-white/10 rounded-xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] custom-scrollbar">
                    <table className="w-full text-xs text-right border-collapse">
                        <thead className="sticky top-0 z-20 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs text-zinc-500 dark:text-zinc-400 font-black text-[10px] uppercase tracking-wider border-b border-zinc-200/80 dark:border-zinc-800">
                            <tr>
                                <th className="px-3 py-2">الفني</th>
                                <th className="px-3 py-2 text-center">التذاكر</th>
                                <th className="px-3 py-2">الإيرادات</th>
                                <th className="px-3 py-2 text-rose-500">تكلفة القطع</th>
                                <th className="px-3 py-2 text-indigo-500">هامش الربح</th>
                                <th className="px-3 py-2 text-emerald-500">العمولات</th>
                                <th className="px-3 py-2">الراتب الأساسي</th>
                                <th className="px-3 py-2 text-rose-500">تسويات سابقة</th>
                                <th className="px-3 py-2 text-zinc-900 dark:text-white">إجمالي المستحق</th>
                                <th className="px-3 py-2 text-center">الإجراء</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/50 font-bold">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-12 text-center text-zinc-400">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                                        <span className="text-xs">جاري حساب العمولات والأرباح...</span>
                                    </td>
                                </tr>
                            ) : filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-12 text-center text-zinc-400 text-xs">
                                        لا توجد تذاكر مدفوعة غير مسواة في هذه الفترة.
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((tech) => (
                                    <tr key={tech.technicianId} className="hover:bg-zinc-100/70 dark:hover:bg-zinc-800/20 transition-colors">
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center font-black text-[10px]">
                                                    {tech.technicianName.charAt(0)}
                                                </div>
                                                <span className="text-zinc-900 dark:text-white font-bold">{tech.technicianName}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-1.5 text-center tabular-nums">
                                            <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md text-[10px] font-mono font-bold">
                                                {tech.ticketsCount}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{tech.totalRevenue.toLocaleString()}</td>
                                        <td className="px-3 py-1.5 font-mono tabular-nums text-rose-600 dark:text-rose-400">{tech.totalPartsCost.toLocaleString()}</td>
                                        <td className="px-3 py-1.5 font-mono tabular-nums text-indigo-600 dark:text-indigo-400">{tech.netServiceMargin.toLocaleString()}</td>
                                        <td className="px-3 py-1.5 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{tech.commissionEarned.toLocaleString()}</td>
                                        <td className="px-3 py-1.5 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">{tech.basicSalary.toLocaleString()}</td>
                                        <td className="px-3 py-1.5 font-mono tabular-nums font-bold text-rose-500">
                                            {tech.debtCarryover > 0 ? `-${tech.debtCarryover.toLocaleString()}` : "0"}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono tabular-nums font-black text-zinc-900 dark:text-white">
                                            {tech.totalPayable.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-1.5 text-center">
                                            <button
                                                onClick={() => handleSettleClick(tech)}
                                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold transition-all shadow-2xs active:scale-95"
                                            >
                                                تسوية
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Settle Modal */}
            {settleModalOpen && selectedTech && (
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
