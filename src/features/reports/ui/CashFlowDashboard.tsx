"use client";

import { useState, useEffect } from "react";
import { fetchCashFlowData } from "@/actions/cash-flow-actions";
import { ReportData, TransactionReportFilters } from "@/features/reports/types";
import { ReportFilterBar } from "@/features/reports/ui/ReportFilterBar";
import { KPICards } from "@/features/reports/ui/KPICards";
import { Landmark, Loader2, FileText, Download, Printer } from "lucide-react";
import { format } from "date-fns";

export default function CashFlowDashboard() {
    const [filters, setFilters] = useState<TransactionReportFilters>({
        categoryGroup: "ALL",
        paymentMethod: "ALL"
    });
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async (activeFilters: TransactionReportFilters) => {
        setLoading(true);
        const res = await fetchCashFlowData(activeFilters);
        if (res.success && res.data) {
            setData(res.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData(filters);
    }, [filters]);

    const handleExport = () => {
        if (!data) return;
        const headers = ["التاريخ", "البيان", "الحساب", "الرمزم", "مدين", "دائن"];
        const csvRows = [headers.join(",")];

        data.transactions.forEach(tx => {
            const row = [
                format(new Date(tx.date), "yyyy-MM-dd HH:mm"),
                `"${tx.description.replace(/"/g, '""')}"`,
                tx.accountName,
                tx.accountCode,
                tx.debit.toFixed(2),
                tx.credit.toFixed(2),
            ];
            csvRows.push(row.join(","));
        });

        const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `cash_flow_report_${format(new Date(), 'yyyyMMdd')}.csv`;
        link.click();
    };

    return (
        <div className="space-y-6 animate-fade-in-up">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">تقرير التدفقات النقدية والربح</h1>
                    <p className="text-muted-foreground mt-1">تحليل مفصل للكاش الداخل، الخارج، وصافي الربح التقريبي.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => window.print()}
                        className="px-4 py-2 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-bold text-sm flex items-center gap-2 border border-border/50"
                    >
                        <Printer className="w-4 h-4" /> طباعة
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" /> تصدير CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <ReportFilterBar filters={filters} onFilterChange={setFilters} />

            {/* KPIs */}
            {data ? (
                <KPICards kpis={data.kpis} />
            ) : (
                <div className="grid grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-32 rounded-2xl bg-muted/20 animate-pulse border border-border/30" />
                    ))}
                </div>
            )}

            {/* Transactions Table */}
            <div className="glass-card rounded-2xl border border-border/50 overflow-hidden bg-muted/5 shadow-xl">
                <div className="p-4 border-b border-border/50 flex items-center gap-2 bg-muted/30">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-bold text-sm">سجل الحركات المالية (دفتر اليومية)</h3>
                    {loading && <Loader2 className="w-4 h-4 animate-spin text-cyan-400 ms-2" />}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right rtl">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-bold tracking-widest border-b border-border/50">
                            <tr>
                                <th className="p-4 text-right">التاريخ</th>
                                <th className="p-4 text-right">البيان / الوصف</th>
                                <th className="p-4 text-right">الحساب</th>
                                <th className="p-4 text-right">الرمز</th>
                                <th className="p-4 text-left">مدين (Deb)</th>
                                <th className="p-4 text-left">دائن (Cre)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {loading ? (
                                [1, 2, 3, 4, 5].map(i => (
                                    <tr key={i}>
                                        <td colSpan={6} className="p-4"><div className="h-4 bg-muted/20 rounded animate-pulse" /></td>
                                    </tr>
                                ))
                            ) : data?.transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-20 text-center text-muted-foreground font-bold italic">لا توجد حركات في هذه الفترة</td>
                                </tr>
                            ) : (
                                data?.transactions.map(tx => (
                                    <tr key={tx.id} className="hover:bg-cyan-500/5 transition-colors group">
                                        <td className="p-4 font-mono text-xs text-muted-foreground">
                                            {format(new Date(tx.date), "dd/MM/yyyy HH:mm")}
                                        </td>
                                        <td className="p-4 font-bold text-foreground group-hover:text-cyan-400 transition-colors">
                                            {tx.description}
                                        </td>
                                        <td className="p-4 font-medium text-muted-foreground">
                                            {tx.accountName}
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-mono border border-border/50">
                                                {tx.accountCode}
                                            </span>
                                        </td>
                                        <td className={`p-4 text-left font-mono font-bold ${tx.debit > 0 ? "text-green-400" : "text-muted-foreground/30"}`}>
                                            {tx.debit > 0 ? tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}
                                        </td>
                                        <td className={`p-4 text-left font-mono font-bold ${tx.credit > 0 ? "text-red-400" : "text-muted-foreground/30"}`}>
                                            {tx.credit > 0 ? tx.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
