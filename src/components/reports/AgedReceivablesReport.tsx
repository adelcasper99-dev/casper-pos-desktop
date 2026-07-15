'use client';

import { useState, useEffect, useTransition } from "react";
import { getAgedDebts } from "@/actions/reports/aged-receivables";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { Users, DollarSign, Download, Clock, AlertTriangle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";

export function AgedReceivablesReport() {
    const [isPending, startTransition] = useTransition();
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = () => {
        startTransition(async () => {
            const res = await getAgedDebts();
            if (res.success) {
                setData(res.data);
            } else {
                toast.error(res.error || "حدث خطأ أثناء جلب التقرير");
                setData({ customers: [], summary: { totalDue: 0, current: 0, days30: 0, days60: 0, days90: 0, customerCount: 0 } });
            }
        });
    };

    const exportToExcel = () => {
        if (!data) return;

        const excelData = data.customers.map((c: any) => ({
            "العميل": c.name,
            "الهاتف": c.phone || "",
            "إجمالي المديونية": c.totalDue,
            "أقل من 30 يوم": c.current,
            "30 - 60 يوم": c.days30,
            "60 - 90 يوم": c.days60,
            "أكثر من 90 يوم": c.days90
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "أعمار الديون");
        XLSX.writeFile(wb, `aged_receivables_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    if (isPending && !data) {
        return <div className="flex items-center justify-center p-32"><CasperLoader /></div>;
    }

    if (!data) return null;

    const { summary, customers } = data;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header & Export */}
            <div className="flex justify-end">
                <button
                    onClick={exportToExcel}
                    className="h-11 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center gap-2"
                >
                    <Download className="w-4 h-4 ml-1" />
                    تصدير Excel
                </button>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
                {[
                    { label: 'إجمالي الديون', value: formatCurrency(summary.totalDue), color: 'text-rose-400', glow: 'shadow-rose-500/10', icon: DollarSign, span: 2 },
                    { label: 'أقل من 30 يوم', value: formatCurrency(summary.current), color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                    { label: '30 - 60 يوم', value: formatCurrency(summary.days30), color: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
                    { label: '60 - 90 يوم', value: formatCurrency(summary.days60), color: 'text-amber-400', glow: 'shadow-amber-500/10' },
                    { label: 'أكثر من 90 يوم', value: formatCurrency(summary.days90), color: 'text-rose-500', glow: 'shadow-rose-500/20' }
                ].map((item, idx) => (
                    <div key={idx} className={cn(
                        "glass-card bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:bg-card/60 relative overflow-hidden group",
                        item.glow,
                        item.span ? `md:col-span-${item.span}` : ""
                    )}>
                        <h3 className="text-[10px] font-black text-foreground/60 uppercase tracking-widest mb-3">{item.label}</h3>
                        <div className={cn("text-xl lg:text-2xl font-black tracking-tight", item.color)}>
                            {item.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Table */}
            <div className="glass-card bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-rose-500/10 transition-colors" />
                <div className="p-6 border-b border-border/40 flex items-center justify-between">
                    <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest flex items-center gap-2">
                        <Users className="w-4 h-4 text-rose-500" />
                        تفاصيل أرصدة العملاء (أعمار الديون)
                    </h3>
                    <span className="text-[10px] font-bold text-foreground/40 bg-zinc-950/40 border border-border/40 px-3 py-1 rounded-full uppercase tracking-wider">
                        {customers.length} عميل مديون
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b border-border/40">
                            <tr>
                                <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">العميل</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">إجمالي المديونية</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">حديثة (&lt;30 يوم)</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">30 - 60 يوم</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">60 - 90 يوم</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> خطرة (&gt;90 يوم)
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {customers.map((c: any) => (
                                <tr key={c.id} className="transition-all hover:bg-primary/10 even:bg-muted/70 group h-14">
                                    <td className="py-2 px-6">
                                        <div className="font-black text-foreground text-sm">{c.name}</div>
                                        {c.phone && <div className="text-[10px] text-foreground/50 font-mono mt-0.5">{c.phone}</div>}
                                    </td>
                                    <td className="py-2 px-6 text-center text-foreground font-black font-mono text-sm">{formatCurrency(c.totalDue)}</td>
                                    <td className="py-2 px-6 text-center text-cyan-500 font-bold font-mono">{c.current > 0 ? formatCurrency(c.current) : '-'}</td>
                                    <td className="py-2 px-6 text-center text-emerald-500 font-bold font-mono">{c.days30 > 0 ? formatCurrency(c.days30) : '-'}</td>
                                    <td className="py-2 px-6 text-center text-amber-500 font-bold font-mono">{c.days60 > 0 ? formatCurrency(c.days60) : '-'}</td>
                                    <td className="py-2 px-6 text-center text-rose-500 font-black font-mono">{c.days90 > 0 ? formatCurrency(c.days90) : '-'}</td>
                                </tr>
                            ))}
                            {customers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-foreground/40 font-bold text-xs uppercase tracking-widest">
                                        لا توجد مديونيات للعملاء حالياً
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
