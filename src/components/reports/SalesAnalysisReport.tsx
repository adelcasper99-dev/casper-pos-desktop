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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-4">
                <div className="flex items-center gap-2">
                    {groupingOptions.map((opt) => {
                        const Icon = opt.icon;
                        const isActive = groupBy === opt.id;
                        return (
                            <button
                                key={opt.id}
                                onClick={() => setGroupBy(opt.id as GroupByOption)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                    isActive 
                                        ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" 
                                        : "bg-muted/50 text-foreground/60 hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {opt.label}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={exportToExcel}
                    className="h-10 px-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center gap-2"
                >
                    <Download className="w-4 h-4 ml-1" />
                    تصدير
                </button>
            </div>

            {/* Content Area */}
            {data && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Summary Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-cyan-500/10 transition-colors" />
                            <h3 className="text-[10px] font-black text-foreground/60 uppercase tracking-widest mb-3">إجمالي الإيرادات</h3>
                            <div className="text-3xl font-black tracking-tight text-cyan-400">
                                {formatCurrency(data.summary.totalRevenue)}
                            </div>
                        </div>

                        {(groupBy === 'product' || groupBy === 'category') && (
                            <div className="glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors" />
                                <h3 className="text-[10px] font-black text-foreground/60 uppercase tracking-widest mb-3">إجمالي الأرباح</h3>
                                <div className="text-3xl font-black tracking-tight text-emerald-400">
                                    {formatCurrency(data.summary.totalProfit)}
                                </div>
                            </div>
                        )}
                        
                        <div className="glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-rose-500/10 transition-colors" />
                            <h3 className="text-[10px] font-black text-foreground/60 uppercase tracking-widest mb-3">
                                إجمالي {groupBy === 'product' || groupBy === 'category' ? 'الكميات المباعة' : 'عدد العمليات'}
                            </h3>
                            <div className="text-3xl font-black tracking-tight text-rose-400">
                                {data.summary.totalSales.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Main Table */}
                    <div className="lg:col-span-3 glass-card bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl overflow-hidden relative group">
                        <div className="p-6 border-b border-border/40 flex items-center justify-between">
                            <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-rose-500" />
                                تحليل المبيعات ({groupingOptions.find(o => o.id === groupBy)?.label})
                            </h3>
                        </div>
                        {isPending ? (
                            <div className="flex items-center justify-center p-20"><CasperLoader /></div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 border-b border-border/40">
                                        <tr>
                                            <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الاسم</th>
                                            <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">
                                                {groupBy === 'product' || groupBy === 'category' ? 'الكمية المباعة' : 'عدد العمليات'}
                                            </th>
                                            <th className="text-left py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الإيرادات</th>
                                            {(groupBy === 'product' || groupBy === 'category') && (
                                                <th className="text-left py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الأرباح</th>
                                            )}
                                            <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">النسبة من الإجمالي</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/20">
                                        {data.results.map((r: any, idx: number) => {
                                            const percentage = data.summary.totalRevenue > 0 
                                                ? (r.revenue / data.summary.totalRevenue) * 100 
                                                : 0;
                                            return (
                                                <tr key={idx} className="transition-all hover:bg-primary/10 even:bg-muted/70 group h-14">
                                                    <td className="py-2 px-6 font-black text-foreground text-xs">{r.name}</td>
                                                    <td className="py-2 px-6 text-center text-foreground/60 font-bold font-mono">
                                                        {(r.quantity || r.transactionCount).toLocaleString()}
                                                    </td>
                                                    <td className="py-2 px-6 text-left text-cyan-500 font-bold font-mono">{formatCurrency(r.revenue)}</td>
                                                    {(groupBy === 'product' || groupBy === 'category') && (
                                                        <td className="py-2 px-6 text-left text-emerald-500 font-bold font-mono">{formatCurrency(r.profit)}</td>
                                                    )}
                                                    <td className="py-2 px-6">
                                                        <div className="flex items-center gap-3 justify-end">
                                                            <span className="text-[10px] font-bold font-mono text-foreground/60">{percentage.toFixed(1)}%</span>
                                                            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                                                <div 
                                                                    className="h-full bg-rose-500 rounded-full transition-all duration-1000"
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
                                                <td colSpan={5} className="py-12 text-center text-foreground/40 font-bold text-xs uppercase tracking-widest">
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
