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

            {/* Main Table */}
            <div className="glass-card bg-card/40 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden relative group shadow-xs">
                <div className="p-2.5 border-b border-border/40 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-foreground/80 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        Z-Report (تقارير الورديات)
                    </h3>
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted/50 border border-border/40 px-2 py-0.5 rounded-md">
                        آخر {shifts.length} وردية
                    </span>
                </div>
                <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/60 border-b border-border/40 sticky top-0 z-10 backdrop-blur-md">
                            <tr>
                                <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">تاريخ ووقت الفتح</th>
                                <th className="text-right py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الكاشير</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">مبيعات كاش</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">مبيعات فيزا</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">مرتجعات</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">المصروفات</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">كاش متوقع</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">كاش فعلي</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">العجز/الزيادة</th>
                                <th className="text-center py-2 px-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {shifts.map((s: any) => (
                                <tr key={s.id} className="transition-all hover:bg-primary/10 even:bg-muted/30 group h-9">
                                    <td className="py-1.5 px-3">
                                        <div className="font-bold text-foreground text-xs">{format(new Date(s.openedAt), 'yyyy/MM/dd HH:mm')}</div>
                                        {s.closedAt && <div className="text-[10px] text-muted-foreground font-mono">إغلاق: {format(new Date(s.closedAt), 'HH:mm')}</div>}
                                    </td>
                                    <td className="py-1.5 px-3 font-medium text-foreground text-xs">{s.cashierName}</td>
                                    <td className="py-1.5 px-3 text-center text-cyan-400 font-bold font-mono">{formatCurrency(s.totalCashSales)}</td>
                                    <td className="py-1.5 px-3 text-center text-indigo-400 font-bold font-mono">{formatCurrency(s.totalCardSales)}</td>
                                    <td className="py-1.5 px-3 text-center text-rose-400 font-bold font-mono">{formatCurrency(s.totalRefunds)}</td>
                                    <td className="py-1.5 px-3 text-center text-amber-400 font-bold font-mono">{formatCurrency(s.totalExpenses)}</td>
                                    <td className="py-1.5 px-3 text-center text-muted-foreground font-bold font-mono">{formatCurrency(s.expectedCash)}</td>
                                    <td className="py-1.5 px-3 text-center text-emerald-400 font-bold font-mono">{formatCurrency(s.actualCash)}</td>
                                    <td className="py-1.5 px-3 text-center">
                                        <div className={cn(
                                            "font-bold font-mono text-xs",
                                            s.cashVariance === 0 ? "text-muted-foreground" : s.cashVariance > 0 ? "text-emerald-400" : "text-rose-400"
                                        )}>
                                            {s.cashVariance > 0 ? '+' : ''}{formatCurrency(s.cashVariance)}
                                        </div>
                                    </td>
                                    <td className="py-1.5 px-3 text-center">
                                        {s.status === 'CLOSED' ? (
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">مغلقة</span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 w-fit mx-auto">
                                                <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                                                مفتوحة
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {shifts.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="py-8 text-center text-muted-foreground font-bold text-xs">
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
