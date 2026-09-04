"use client";

import { useState, useEffect } from "react";
import { fetchCashFlowData } from "@/actions/cash-flow-actions";
import { ReportData, TransactionReportFilters } from "@/features/reports/types";
import { ReportFilterBar } from "@/features/reports/ui/ReportFilterBar";
import { KPICards } from "@/features/reports/ui/KPICards";
import { Landmark, Loader2, FileText, Download, Printer } from "lucide-react";
import { format } from "date-fns";

const ACCOUNT_NAME_TRANSLATIONS: Record<string, string> = {
    "Cash in Hand": "نقدية بالخزينة (الكاش)",
    "Bank / Card Settlements": "تسويات البنك / البطاقات",
    "Petty Cash Fund": "صندوق النثرية",
    "Cash in Treasury / Wallet": "نقدية بالصندوق / المحفظة",
    "Accounts Receivable": "العملاء (أوراق القبض)",
    "Inventory Asset": "مخزون الأصول",
    "Fixed Assets (Equip. & Furniture)": "الأصول الثابتة (أجهزة وأثاث)",
    "Accumulated Depreciation": "مجمع الإهلاك",
    "Engineer Tech Custody / AR": "عهدة فني المهندس",
    "Accounts Payable": "الموردين (أوراق الدفع)",
    "Sales Tax Payable": "ضريبة المبيعات المستحقة",
    "Store Credit Liability": "التزامات رصيد المتجر",
    "Accrued Salaries & Wages": "رواتب وأجور مستحقة",
    "Owner's Equity / Capital": "حقوق الملكية / رأس المال",
    "Retained Earnings (Legacy Alias)": "أرباح محتجزة (حساب سابق)",
    "Owner's Drawings": "مسحوبات شخصية للمالك",
    "Retained Earnings / Accumulated Profit": "أرباح مرحلة / محتجزة",
    "Opening Balance Equity": "رأس المال الافتتاحي",
    "Sales Revenue": "إيرادات المبيعات",
    "Service Revenue": "إيرادات الخدمات",
    "Sales Returns": "مرتجع مبيعات",
    "Sales Discounts": "خصم مبيعات",
    "Other Income": "إيرادات أخرى",
    "E-Wallet Commission Revenue": "إيرادات عمولة المحفظة الإلكترونية",
    "Cost of Goods Sold": "تكلفة البضاعة المباعة",
    "Salaries & Wages Expense": "مصروفات الرواتب والأجور",
    "Bonuses & Incentives": "مكافآت وحوافز",
    "Daily Wages": "أجور يومية",
    "General & Admin Expenses": "مصروفات عمومية وإدارية",
    "Rent Expense": "مصروف الإيجار",
    "Utilities (Electricity & Water)": "المرافق (كهرباء ومياه)",
    "Internet & Communications": "الإنترنت والاتصالات",
    "Maintenance & Repairs": "الصيانة والإصلاحات",
    "Cleaning & Hospitality": "النظافة والضيافة",
    "Office Supplies": "أدوات ومستلزمات مكتبية",
    "Miscellaneous General Expense": "مصروفات عمومية متنوعة",
    "Marketing & Advertising": "التسويق والإعلانات",
    "Paid Ads": "إعلانات ممولة",
    "Promotions & Gifts": "عروض وهدايا ترويجية",
    "Packaging": "التعبئة والتغليف",
    "Depreciation Expense": "مصروف الإهلاك",
    "Cash Over/Short": "فروقات نقدية (زيادة/عجز)",
    "Inventory Spoilage": "تالف المخزون",
};

function translateAccountName(name: string): string {
    return ACCOUNT_NAME_TRANSLATIONS[name] || name;
}

function translateDescription(desc: string): string {
    if (!desc) return "";
    
    // Exact matches
    const exactMatches: Record<string, string> = {
        "Cost of Goods Sold": "تكلفة البضاعة المباعة",
        "Inventory Asset (Out)": "صرف مخزون (صادر)",
        "Inventory Asset Restored": "استرجاع مخزون (وارد)",
        "COGS Reversed": "عكس تكلفة البضاعة المباعة",
        "AR Reduced": "تخفيض حساب العملاء (مدينون)",
        "ACCOUNT received": "مبيعات آجلة مستلمة",
        "Sales Tax Payable": "ضريبة المبيعات المستحقة",
        "Service Revenue": "إيرادات خدمات",
        "SUPPLIER_OFFSET received": "تسوية مقاصة مورد (خصم مديونية)",
        "Sales Revenue (ex-tax)": "إيرادات مبيعات (بدون ضريبة)",
    };

    if (exactMatches[desc]) {
        return exactMatches[desc];
    }

    // Pattern matches
    if (desc.startsWith("Sales Revenue Reversed")) {
        return desc.replace("Sales Revenue Reversed", "عكس إيرادات مبيعات");
    }
    if (desc.startsWith("Service Payment received")) {
        return desc.replace("Service Payment received", "دفعة خدمات مستلمة");
    }
    if (desc.startsWith("Refund")) {
        return desc.replace("Refund", "مرتجع");
    }
    if (desc.startsWith("Supplier Payment")) {
        return desc.replace("Supplier Payment", "دفعة للمورد");
    }
    if (desc.startsWith("Sale #")) {
        return desc.replace("Sale", "فاتورة مبيعات");
    }

    return desc;
}

export default function CashFlowDashboard({ isTab = false }: { isTab?: boolean }) {
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
        <div className="space-y-2.5 animate-fade-in-up">
            {/* Header */}
            {!isTab ? (
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-sm font-bold tracking-tight">تقرير التدفقات النقدية والربح</h1>
                        <p className="text-muted-foreground text-xs mt-0.5">تحليل مفصل للكاش الداخل، الخارج، وصافي الربح التقريبي.</p>
                    </div>
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => window.print()}
                            className="px-3 py-1.5 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-bold text-xs flex items-center gap-1.5 border border-border/50 h-8"
                        >
                            <Printer className="w-3.5 h-3.5" /> طباعة
                        </button>
                        <button
                            onClick={handleExport}
                            className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center gap-1.5 h-8"
                        >
                            <Download className="w-3.5 h-3.5" /> تصدير CSV
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex justify-end gap-1.5">
                    <button
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-bold text-xs flex items-center gap-1.5 border border-border/50 h-8"
                    >
                        <Printer className="w-3.5 h-3.5" /> طباعة
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center gap-1.5 h-8"
                    >
                        <Download className="w-3.5 h-3.5" /> تصدير CSV
                    </button>
                </div>
            )}

            {/* Filters */}
            <ReportFilterBar filters={filters} onFilterChange={setFilters} />

            {/* KPIs */}
            {data ? (
                <KPICards kpis={data.kpis} />
            ) : (
                <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-16 rounded-xl bg-muted/20 animate-pulse border border-border/30" />
                    ))}
                </div>
            )}

            {/* Transactions Table */}
            <div className="glass-card rounded-xl border border-border overflow-hidden bg-card/40 shadow-xs">
                <div className="p-2.5 px-3 border-b border-border flex items-center gap-1.5 bg-muted/30">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <h3 className="font-bold text-xs">سجل الحركات المالية (دفتر اليومية)</h3>
                    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 ms-2" />}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right rtl">
                        <thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase font-black tracking-wider border-b border-border">
                            <tr>
                                <th className="py-2 px-3 text-right">التاريخ</th>
                                <th className="py-2 px-3 text-right">البيان / الوصف</th>
                                <th className="py-2 px-3 text-right">الحساب</th>
                                <th className="py-2 px-3 text-right">الرمز</th>
                                <th className="py-2 px-3 text-left">مدين (Deb)</th>
                                <th className="py-2 px-3 text-left">دائن (Cre)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {loading ? (
                                [1, 2, 3, 4, 5].map(i => (
                                    <tr key={i}>
                                        <td colSpan={6} className="py-2 px-3"><div className="h-4 bg-muted/20 rounded animate-pulse" /></td>
                                    </tr>
                                ))
                            ) : data?.transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-muted-foreground font-bold italic text-xs">لا توجد حركات في هذه الفترة</td>
                                </tr>
                            ) : (
                                data?.transactions.map(tx => (
                                    <tr key={tx.id} className="hover:bg-primary/10 even:bg-muted/40 transition-colors group">
                                        <td className="py-1.5 px-3 font-mono text-[10px] text-muted-foreground">
                                            {format(new Date(tx.date), "dd/MM/yyyy HH:mm")}
                                        </td>
                                        <td className="py-1.5 px-3 font-bold text-foreground group-hover:text-cyan-400 transition-colors">
                                            {translateDescription(tx.description)}
                                        </td>
                                        <td className="py-1.5 px-3 font-medium text-muted-foreground">
                                            {translateAccountName(tx.accountName)}
                                        </td>
                                        <td className="py-1.5 px-3">
                                            <span className="px-1.5 py-0.2 rounded bg-muted text-[10px] font-mono border border-border/50">
                                                {tx.accountCode}
                                            </span>
                                        </td>
                                        <td className={`py-1.5 px-3 text-left font-mono font-bold ${tx.debit > 0 ? "text-green-400" : "text-muted-foreground/30"}`}>
                                            {tx.debit > 0 ? tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}
                                        </td>
                                        <td className={`py-1.5 px-3 text-left font-mono font-bold ${tx.credit > 0 ? "text-red-400" : "text-muted-foreground/30"}`}>
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
