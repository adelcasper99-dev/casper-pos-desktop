'use client';

import { useState, useEffect, useTransition } from "react";
import { getSalesAnalysis } from "@/actions/reports/sales-analysis";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { BarChart3, Download, Layers, User, Store, Tag } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";

type GroupByOption = 'product' | 'category' | 'salesman' | 'branch';

export function SalesAnalysisReport() {
    const [isPending, startTransition] = useTransition();
    const [data, setData] = useState<any>(null);
    const [groupBy, setGroupBy] = useState<GroupByOption>('category');

    useEffect(() => {
        fetchReport();
    }, [groupBy]);

    const fetchReport = () => {
        startTransition(async () => {
            const res = await getSalesAnalysis(groupBy);
            if (res.success) {
                setData(res.data);
            } else {
                toast.error(res.error || "حدث خطأ أثناء جلب التقرير");
            }
        });
    };

    const exportToExcel = () => {
        if (!data?.results) return;

        const excelData = data.results.map((r: any) => ({
            "الاسم": r.name,
            "إجمالي المبيعات (الكمية/العدد)": r.quantity || r.transactionCount,
            "الإيرادات": r.revenue,
            ...(r.profit !== undefined ? { "الأرباح": r.profit } : {})
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "تحليل المبيعات");
        XLSX.writeFile(wb, `sales_analysis_${groupBy}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    const groupingOptions = [
        { id: 'category', label: 'حسب التصنيف', icon: Layers },
        { id: 'product', label: 'حسب المنتج', icon: Tag },
        { id: 'salesman', label: 'حسب البائع', icon: User },
        { id: 'branch', label: 'حسب الفرع', icon: Store }
    ];

    if (isPending && !data) {
        return <div className="flex items-center justify-center p-32"><CasperLoader /></div>;
    }

    return (
        <div className="space-y-2.5 animate-fade-in-up">
            {/* Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-xl p-2 shadow-xs">
                <div className="flex items-center gap-1.5">
                    {groupingOptions.map((opt) => {
                        const Icon = opt.icon;
                        const isActive = groupBy === opt.id;
                        return (
                            <button
                                key={opt.id}
                                onClick={() => setGroupBy(opt.id as GroupByOption)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-all",
                                    isActive 
                                        ? "bg-rose-500 text-white shadow-xs" 
                                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {opt.label}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={exportToExcel}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5"
                >
                    <Download className="w-3.5 h-3.5" />
                    تصدير
                </button>
            </div>

            {/* Content Area */}
            {data && (
                <div className="space-y-2.5">
                    {/* Summary Cards Row */}
                    <div className={cn(
                        "grid gap-2",
                        (groupBy === 'product' || groupBy === 'category') ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
                    )}>
                        <div className="glass-card bg-card/50 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-xs relative overflow-hidden group">
                            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">إجمالي الإيرادات</h3>
                            <div className="text-base font-black font-mono tracking-tight text-cyan-400">
                                {formatCurrency(data.summary.totalRevenue)}
                            </div>
                        </div>

                        {(groupBy === 'product' || groupBy === 'category') && (
                            <div className="glass-card bg-card/50 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-xs relative overflow-hidden group">
                                <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">إجمالي الأرباح</h3>
                                <div className="text-base font-black font-mono tracking-tight text-emerald-400">
                                    {formatCurrency(data.summary.totalProfit)}
                                </div>
                            </div>
                        )}
                        
                        <div className="glass-card bg-card/50 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-xs relative overflow-hidden group">
                            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">
                                إجمالي {groupBy === 'product' || groupBy === 'category' ? 'الكميات المباعة' : 'عدد العمليات'}
                            </h3>
                            <div className="text-base font-black font-mono tracking-tight text-rose-400">
                                {data.summary.totalSales.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Main Table */}
                    <div className="glass-card bg-card/40 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden relative group shadow-xs">
                        <div className="p-2.5 border-b border-border/40 flex items-center justify-between">
                            <h3 className="text-xs font-bold text-foreground/80 flex items-center gap-1.5">
                                <BarChart3 className="w-3.5 h-3.5 text-rose-500" />
                                تحليل المبيعات ({groupingOptions.find(o => o.id === groupBy)?.label})
                            </h3>
                        </div>
                        {isPending ? (
                            <div className="flex items-center justify-center p-12"><CasperLoader /></div>
                        ) : (
                            <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/60 border-b border-border/40 sticky top-0 z-10 backdrop-blur-md">
                                        <tr>
                                            <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الاسم</th>
                                            <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                                                {groupBy === 'product' || groupBy === 'category' ? 'الكمية المباعة' : 'عدد العمليات'}
                                            </th>
                                            <th className="text-left py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الإيرادات</th>
                                            {(groupBy === 'product' || groupBy === 'category') && (
                                                <th className="text-left py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الأرباح</th>
                                            )}
                                            <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">النسبة من الإجمالي</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/20">
                                        {data.results.map((r: any, idx: number) => {
                                            const percentage = data.summary.totalRevenue > 0 
                                                ? (r.revenue / data.summary.totalRevenue) * 100 
                                                : 0;
                                            return (
                                                <tr key={idx} className="transition-all hover:bg-primary/10 even:bg-muted/30 group h-9">
                                                    <td className="py-1.5 px-3 font-bold text-foreground text-xs">{r.name}</td>
                                                    <td className="py-1.5 px-3 text-center text-muted-foreground font-bold font-mono">
                                                        {(r.quantity || r.transactionCount).toLocaleString()}
                                                    </td>
                                                    <td className="py-1.5 px-3 text-left text-cyan-400 font-bold font-mono">{formatCurrency(r.revenue)}</td>
                                                    {(groupBy === 'product' || groupBy === 'category') && (
                                                        <td className="py-1.5 px-3 text-left text-emerald-400 font-bold font-mono">{formatCurrency(r.profit)}</td>
                                                    )}
                                                    <td className="py-1.5 px-3">
                                                        <div className="flex items-center gap-2 justify-end">
                                                            <span className="text-[10px] font-bold font-mono text-muted-foreground">{percentage.toFixed(1)}%</span>
                                                            <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                                                                <div 
                                                                    className="h-full bg-rose-500 rounded-full transition-all duration-500"
                                                                    style={{ width: `${percentage}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {data.results.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-8 text-center text-muted-foreground font-bold text-xs">
                                                    لا توجد بيانات لهذا التصنيف
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
