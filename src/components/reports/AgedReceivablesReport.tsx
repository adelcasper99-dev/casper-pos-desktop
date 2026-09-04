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
        <div className="space-y-2.5 animate-fade-in-up">
            {/* Header & Export */}
            <div className="flex justify-end">
                <button
                    onClick={exportToExcel}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5"
                >
                    <Download className="w-3.5 h-3.5" />
                    تصدير Excel
                </button>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                    { label: 'إجمالي الديون', value: formatCurrency(summary.totalDue), color: 'text-rose-400', glow: 'shadow-rose-500/10' },
                    { label: 'أقل من 30 يوم', value: formatCurrency(summary.current), color: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
                    { label: '30 - 60 يوم', value: formatCurrency(summary.days30), color: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
                    { label: '60 - 90 يوم', value: formatCurrency(summary.days60), color: 'text-amber-400', glow: 'shadow-amber-500/10' },
                    { label: 'أكثر من 90 يوم', value: formatCurrency(summary.days90), color: 'text-rose-500', glow: 'shadow-rose-500/20' }
                ].map((item, idx) => (
                    <div key={idx} className={cn(
                        "glass-card bg-card/50 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-xs transition-all hover:bg-card/70 relative overflow-hidden group",
                        item.glow
                    )}>
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">{item.label}</h3>
                        <div className={cn("text-base font-black font-mono tracking-tight", item.color)}>
                            {item.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Table */}
            <div className="glass-card bg-card/40 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden relative group shadow-xs">
                <div className="p-2.5 border-b border-border/40 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-foreground/80 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-rose-500" />
                        تفاصيل أرصدة العملاء (أعمار الديون)
                    </h3>
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted/50 border border-border/40 px-2 py-0.5 rounded-md">
                        {customers.length} عميل مديون
                    </span>
                </div>
                <div className="overflow-x-auto max-h-[calc(100vh-340px)] overflow-y-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/60 border-b border-border/40 sticky top-0 z-10 backdrop-blur-md">
                            <tr>
                                <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">العميل</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">إجمالي المديونية</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">حديثة (&lt;30 يوم)</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">30 - 60 يوم</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">60 - 90 يوم</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-rose-400 uppercase tracking-wider flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> خطرة (&gt;90 يوم)
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {customers.map((c: any) => (
                                <tr key={c.id} className="transition-all hover:bg-primary/10 even:bg-muted/30 group h-9">
                                    <td className="py-1.5 px-3">
                                        <div className="font-bold text-foreground text-xs">{c.name}</div>
                                        {c.phone && <div className="text-[10px] text-muted-foreground font-mono">{c.phone}</div>}
                                    </td>
                                    <td className="py-1.5 px-3 text-center text-foreground font-bold font-mono text-xs">{formatCurrency(c.totalDue)}</td>
                                    <td className="py-1.5 px-3 text-center text-cyan-400 font-bold font-mono">{c.current > 0 ? formatCurrency(c.current) : '-'}</td>
                                    <td className="py-1.5 px-3 text-center text-emerald-400 font-bold font-mono">{c.days30 > 0 ? formatCurrency(c.days30) : '-'}</td>
                                    <td className="py-1.5 px-3 text-center text-amber-400 font-bold font-mono">{c.days60 > 0 ? formatCurrency(c.days60) : '-'}</td>
                                    <td className="py-1.5 px-3 text-center text-rose-400 font-black font-mono">{c.days90 > 0 ? formatCurrency(c.days90) : '-'}</td>
                                </tr>
                            ))}
                            {customers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-muted-foreground font-bold text-xs">
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
