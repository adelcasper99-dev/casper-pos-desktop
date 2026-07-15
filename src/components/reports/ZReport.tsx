'use client';

import { useState, useEffect, useTransition } from "react";
import { getZReports } from "@/actions/reports/z-report";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { FileText, DollarSign, Download, Clock, AlertTriangle, CreditCard, Wallet, Calculator } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";

export function ZReport() {
    const [isPending, startTransition] = useTransition();
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = () => {
        startTransition(async () => {
            const res = await getZReports();
            if (res.success) {
                setData(res.data);
            } else {
                toast.error(res.error || "حدث خطأ أثناء جلب التقرير");
            }
        });
    };

    const exportToExcel = () => {
        if (!data?.shifts) return;

        const excelData = data.shifts.map((s: any) => ({
            "رقم الوردية": s.id.substring(0, 8),
            "الحالة": s.status === 'CLOSED' ? 'مغلقة' : 'مفتوحة',
            "الكاشير": s.cashierName,
            "وقت الفتح": format(new Date(s.openedAt), 'yyyy/MM/dd HH:mm'),
            "وقت الإغلاق": s.closedAt ? format(new Date(s.closedAt), 'yyyy/MM/dd HH:mm') : '',
            "مبيعات الكاش": s.totalCashSales,
            "مبيعات الفيزا": s.totalCardSales,
            "إجمالي المرتجعات": s.totalRefunds,
            "إجمالي المصروفات": s.totalExpenses,
            "الرصيد الافتتاحي": s.startCash,
            "الكاش المتوقع": s.expectedCash,
            "الكاش الفعلي": s.actualCash,
            "العجز/الزيادة": s.cashVariance
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Z-Report (الورديات)");
        XLSX.writeFile(wb, `z_report_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    if (isPending && !data) {
        return <div className="flex items-center justify-center p-32"><CasperLoader /></div>;
    }

    if (!data) return null;

    const { summary, shifts } = data;

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

            {/* Main Table */}
            <div className="glass-card bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors" />
                <div className="p-6 border-b border-border/40 flex items-center justify-between">
                    <h3 className="text-sm font-black text-foreground/80 uppercase tracking-widest flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-500" />
                        Z-Report (تقارير الورديات)
                    </h3>
                    <span className="text-[10px] font-bold text-foreground/40 bg-zinc-950/40 border border-border/40 px-3 py-1 rounded-full uppercase tracking-wider">
                        آخر {shifts.length} وردية
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b border-border/40">
                            <tr>
                                <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">تاريخ ووقت الفتح</th>
                                <th className="text-right py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الكاشير</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">مبيعات كاش</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">مبيعات فيزا</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">مرتجعات</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">المصروفات</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">كاش متوقع</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">كاش فعلي</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">العجز/الزيادة</th>
                                <th className="text-center py-4 px-6 text-[10px] font-black text-foreground/60 uppercase tracking-widest">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {shifts.map((s: any) => (
                                <tr key={s.id} className="transition-all hover:bg-primary/10 even:bg-muted/70 group">
                                    <td className="py-3 px-6">
                                        <div className="font-black text-foreground text-xs">{format(new Date(s.openedAt), 'yyyy/MM/dd HH:mm')}</div>
                                        {s.closedAt && <div className="text-[10px] text-foreground/50 font-mono mt-0.5">إغلاق: {format(new Date(s.closedAt), 'HH:mm')}</div>}
                                    </td>
                                    <td className="py-3 px-6 font-bold text-foreground/80 text-xs">{s.cashierName}</td>
                                    <td className="py-3 px-6 text-center text-cyan-500 font-bold font-mono">{formatCurrency(s.totalCashSales)}</td>
                                    <td className="py-3 px-6 text-center text-indigo-400 font-bold font-mono">{formatCurrency(s.totalCardSales)}</td>
                                    <td className="py-3 px-6 text-center text-rose-400 font-bold font-mono">{formatCurrency(s.totalRefunds)}</td>
                                    <td className="py-3 px-6 text-center text-amber-500 font-bold font-mono">{formatCurrency(s.totalExpenses)}</td>
                                    <td className="py-3 px-6 text-center text-foreground/60 font-bold font-mono">{formatCurrency(s.expectedCash)}</td>
                                    <td className="py-3 px-6 text-center text-emerald-500 font-black font-mono">{formatCurrency(s.actualCash)}</td>
                                    <td className="py-3 px-6 text-center">
                                        <div className={cn(
                                            "font-black font-mono text-xs",
                                            s.cashVariance === 0 ? "text-foreground/40" : s.cashVariance > 0 ? "text-emerald-500" : "text-rose-500"
                                        )}>
                                            {s.cashVariance > 0 ? '+' : ''}{formatCurrency(s.cashVariance)}
                                        </div>
                                    </td>
                                    <td className="py-3 px-6 text-center">
                                        {s.status === 'CLOSED' ? (
                                            <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">مغلقة</span>
                                        ) : (
                                            <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1 w-fit mx-auto">
                                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                مفتوحة
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {shifts.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="py-12 text-center text-foreground/40 font-bold text-xs uppercase tracking-widest">
                                        لا توجد ورديات حالياً
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
