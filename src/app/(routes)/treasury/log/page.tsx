"use client";

import { useState, useEffect, useCallback } from "react";
import { TreasuryLogTable } from "@/features/treasury/ui/TreasuryLogTable";
import { TreasuryFilterBar } from "@/features/treasury/ui/TreasuryFilterBar";
import { TreasuryLogEntry, TreasuryLogFilters, TreasurySummary } from "@/features/treasury/types";
import { getTreasuryLog } from "@/features/treasury/api/treasury-service";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    History,
    RefreshCw,
    Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function TreasuryLogPage() {
    const [entries, setEntries] = useState<TreasuryLogEntry[]>([]);
    const [summary, setSummary] = useState<TreasurySummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<TreasuryLogFilters>({
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd'),
        direction: 'ALL',
        search: ''
    });

    const fetchLog = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getTreasuryLog(filters);
            if (result.success && result.data) {
                setEntries(result.data.entries);
                setSummary(result.data.summary);
            } else {
                toast.error(result.error || "فشل تحميل سجل الخزينة");
            }
        } catch (error) {
            toast.error("حدث خطأ غير متوقع");
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchLog();
    }, [fetchLog]);

    const exportToExcel = () => {
        if (!entries || entries.length === 0) {
            toast.error("لا توجد بيانات للتصدير");
            return;
        }

        const data = entries.map(entry => ({
            "التاريخ والوقت": format(new Date(entry.createdAt), 'yyyy/MM/dd HH:mm:ss'),
            "التصنيف": entry.categoryLabel,
            "البيان / الوصف": entry.description || "-",
            "المرجع": entry.referenceId || "-",
            "وارد (+)": entry.direction === 'IN' ? entry.amount : "-",
            "صادر (-)": entry.direction === 'OUT' ? entry.amount : "-",
            "طريقة الدفع": entry.paymentMethod,
            "الرصيد المتراكم": entry.balanceAfter
        }));

        const ws = XLSX.utils.json_to_sheet(data);

        // Auto-size columns trick
        const wscols = Object.keys(data[0]).map(w => ({ wch: Math.max(w.length, 15) }));
        ws['!cols'] = wscols;
        ws['!dir'] = 'rtl'; // Right to left for Arabic support if program handles it

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "سجل الخزينة");
        XLSX.writeFile(wb, `casper_treasury_log_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    };

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <History className="h-8 w-8 text-cyan-500" />
                        سجل الخزينة المجمع
                    </h1>
                    <p className="text-zinc-500 mt-2">
                        متابعة التدفقات النقدية والحركات المالية اليومية مع الرصيد اللحظي.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        className="glass-card border-white/5 hover:bg-white/10 text-zinc-300"
                        onClick={() => fetchLog()}
                    >
                        <RefreshCw className={cn("h-4 w-4 ml-2", loading && "animate-spin")} />
                        تحديث البيانات
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-cyan-600 hover:bg-cyan-500 border-none text-white shadow-lg shadow-cyan-900/20"
                        onClick={exportToExcel}
                        disabled={loading || entries.length === 0}
                    >
                        <Download className="h-4 w-4 ml-2" />
                        تصدير التقرير
                    </Button>
                </div>
            </div>

            {/* KPI Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPIWidget
                    title="الرصيد الحالي"
                    value={summary?.currentBalance || 0}
                    icon={<Wallet className="h-5 w-5 text-cyan-400" />}
                    subtitle="إجمالي النقدية المتوفرة حالياً"
                    color="cyan"
                />
                <KPIWidget
                    title="إجمالي الوارد"
                    value={summary?.totalIn || 0}
                    icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
                    subtitle="خلال الفترة المختارة"
                    color="emerald"
                />
                <KPIWidget
                    title="إجمالي الصادر"
                    value={summary?.totalOut || 0}
                    icon={<TrendingDown className="h-5 w-5 text-rose-400" />}
                    subtitle="خلال الفترة المختارة"
                    color="rose"
                />
                <KPIWidget
                    title="صافي التغيير"
                    value={summary?.netChange || 0}
                    icon={<History className="h-5 w-5 text-amber-400" />}
                    subtitle="الفرق بين الداخل والخارج"
                    color="amber"
                />
            </div>

            {/* Filters */}
            <TreasuryFilterBar filters={filters} onFilterChange={setFilters} />

            {/* Log Table */}
            <TreasuryLogTable entries={entries} loading={loading} />
        </div>
    );
}

// Internal Helper for local KPI widgets with premium look
function KPIWidget({ title, value, icon, subtitle, color }: { title: string, value: number, icon: any, subtitle: string, color: string }) {
    const colorClasses: Record<string, string> = {
        cyan: "from-cyan-500/10 to-transparent border-cyan-500/20",
        emerald: "from-emerald-500/10 to-transparent border-emerald-500/20",
        rose: "from-rose-500/10 to-transparent border-rose-500/20",
        amber: "from-amber-500/10 to-transparent border-amber-500/20"
    };

    return (
        <div className={cn(
            "p-5 rounded-2xl border bg-gradient-to-br backdrop-blur-xl transition-all hover:scale-[1.02]",
            colorClasses[color] || "from-zinc-500/10 to-transparent border-white/5"
        )}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs text-zinc-500 font-medium mb-1">{title}</p>
                    <h3 className="text-2xl font-bold font-mono text-white">
                        {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 shadow-inner">
                    {icon}
                </div>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">{subtitle}</p>
        </div>
    );
}

function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}
