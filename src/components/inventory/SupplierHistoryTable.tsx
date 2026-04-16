"use client";

import {
    ArrowUpRight, ArrowDownLeft, FileText, DollarSign,
    Calendar, Hash, X, Filter, Trash2, AlertCircle
} from "lucide-react";
import { voidPurchase } from "@/actions/purchase-actions";
import { voidSupplierPayment } from "@/actions/inventory";
import { toast } from "sonner";
import ConfirmationModal from "@/components/ui/ConfirmationModal";
import { useState, Fragment } from "react";
import {
    startOfDay, endOfDay, subDays, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, isWithinInterval, format
} from 'date-fns';
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { useTranslations } from "@/lib/i18n-mock";
import { cn, formatCurrency } from "@/lib/utils";
import { paySupplier } from "@/actions/inventory";
import { getStoreSettings } from "@/actions/settings";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import GlassModal from "../ui/GlassModal";
import { generateA4StatementHTML } from "./purchasing/A4StatementTemplate";
import { printService } from "@/lib/print-service";
import { Loader2, Banknote, CreditCard as CreditCardIcon, Building2, Check, Download, FileSpreadsheet, FileBarChart } from "lucide-react";
import * as XLSX from 'xlsx';

interface Transaction {
    id: string;
    date: Date;
    type: 'INVOICE' | 'PAYMENT';
    reference: string;
    amount: number;
    status: string;
    isCredit: boolean; // true = reduces debt (Payment), false = increases debt (Invoice)
    method?: string;
    items?: {
        name: string;
        sku: string;
        category: string;
        quantity: number;
        unitCost: number;
    }[];
    runningBalance?: number;
}

interface SupplierHistoryTableProps {
    transactions: Transaction[];
    supplierId: string;
    supplierName: string;
    balance: number;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    csrfToken: string;
}

export default function SupplierHistoryTable({
    transactions,
    supplierId,
    supplierName,
    balance,
    phone,
    email,
    address,
    csrfToken
}: SupplierHistoryTableProps) {
    const router = useRouter();
    const t = useTranslations('Inventory.Suppliers.Details');
    const [dateFilter, setDateFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);
    const [isVoiding, setIsVoiding] = useState(false);
    const [transactionToVoid, setTransactionToVoid] = useState<Transaction | null>(null);
    const [voidDialogOpen, setVoidDialogOpen] = useState(false);

    // Payment & Print States
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("CASH");
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
        getStoreSettings().then((res: any) => {
            if (res.success) setSettings(res.data);
        });
    }, []);

    async function handlePayment() {
        if (!amount || isNaN(parseFloat(amount))) {
            toast.error("مبلغ غير صحيح");
            return;
        }

        setLoading(true);
        try {
            const res = await paySupplier({ supplierId, amount: parseFloat(amount), method, csrfToken });
            if (res?.success) {
                toast.success("تم تسجيل الدفعة بنجاح");
                setIsPaymentModalOpen(false);
                setAmount("");
                setMethod("CASH");
                router.refresh();
            } else {
                toast.error(res?.error || "فشل تسجيل الدفعة");
            }
        } catch (error) {
            toast.error("حدث خطأ غير متوقع");
        } finally {
            setLoading(false);
        }
    }

    const handlePrint = async () => {
        const supplierData = {
            name: supplierName,
            phone,
            address,
            balance
        };

        const html = generateA4StatementHTML({
            supplierData,
            transactions: transactions.map(tx => ({
                ...tx,
                amount: tx.amount // Template expects number
            })),
            settings
        });

        try {
            const registry = printService.getRegistry();
            const printer = registry?.a4Printer && registry.a4Printer !== 'none' ? registry.a4Printer : undefined;

            await toast.promise(
                printService.printHTML(html, printer || '', { paperWidthMm: 210 }),
                {
                    loading: 'جاري تحضير الطباعة...',
                    success: 'تم الإرسال للطابعة',
                    error: (err: any) => `فشل في الطباعة: ${err?.message || 'خطأ غير معروف'}`
                }
            );
        } catch (e) {
            console.error("Print Error:", e);
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
            }
        }
    };

    const PAYMENT_METHODS = [
        { id: 'CASH', label: 'نقداً', icon: Banknote },
        { id: 'CARD', label: 'بطاقة', icon: CreditCardIcon },
        { id: 'TRANSFER', label: 'تحويل', icon: Building2 },
    ];

    const exportToExcel = () => {
        // 1. Prepare Metadata Rows
        const storeName = settings?.name || 'CASPER POS';
        const reportDate = format(new Date(), "dd/MM/yyyy HH:mm");
        
        const headerRows = [
            [storeName],
            ['كشف حساب مورد (Statement)'],
            [`المورد: ${supplierName}`],
            [`تاريخ التقرير: ${reportDate}`],
            [], // Spacer
            ['التاريخ', 'البيان / الوصف', 'الأصناف التفصيلية', 'المرجع', 'مدين (+)', 'دائن (-)', 'الرصيد الجاري']
        ];

        // 2. Prepare Transaction Data
        const transactionData = filteredTransactions.map(tx => [
            format(new Date(tx.date), "dd/MM/yyyy h:mm a"),
            tx.type === 'INVOICE' ? (tx.reference.startsWith('RTN-') ? 'مرتجع شراء' : 'فاتورة شراء') : 'دفعة مستلمة',
            tx.items?.map(i => `${i.name} (${i.quantity})`).join(' | ') || '-',
            tx.reference,
            !tx.isCredit ? tx.amount : 0,
            tx.isCredit ? tx.amount : 0,
            tx.runningBalance || 0
        ]);

        const allRows = [...headerRows, ...transactionData];

        // 3. Create Worksheet
        const ws = XLSX.utils.aoa_to_sheet(allRows);

        // 4. Set RTL & Sheet Properties
        if (!ws['!ref']) ws['!ref'] = 'A1:G' + allRows.length;
        
        // Column Widths (Approximate characters)
        ws['!cols'] = [
            { wch: 12 }, // Date
            { wch: 20 }, // Type
            { wch: 40 }, // Items
            { wch: 15 }, // Ref
            { wch: 12 }, // Debit
            { wch: 12 }, // Credit
            { wch: 15 }  // Balance
        ];

        // 5. Create Workbook and set RTL view
        const wb = XLSX.utils.book_new();
        wb.Workbook = {
            Views: [{ RTL: true }]
        };

        XLSX.utils.book_append_sheet(wb, ws, "Statement");

        // 6. Save File
        XLSX.writeFile(wb, `Ledger_${supplierName}_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
        toast.success("تم تصدير ملف Excel بنجاح");
    };

    const exportToPDF = async () => {
        const supplierData = {
            name: supplierName,
            phone,
            address,
            balance
        };

        const html = generateA4StatementHTML({
            supplierData,
            transactions: filteredTransactions.map(tx => ({
                ...tx,
                amount: tx.amount
            })),
            settings
        });

        const filename = `Ledger_${supplierName}_${format(new Date(), "dd-MM-yyyy")}.pdf`;

        try {
            const res = await printService.saveToPDF(html, filename);
            if (res.success) {
                toast.success("تم حفظ ملف PDF بنجاح");
            } else {
                toast.error(res.error || "فشل حفظ ملف PDF");
                // Fallback to print dialog if save fails
                handlePrint();
            }
        } catch (error) {
            console.error("PDF Export Error:", error);
            handlePrint();
        }
    };

    const handleVoid = async () => {
        if (!transactionToVoid) return;
        setIsVoiding(true);
        try {
            let res;
            if (transactionToVoid.type === 'INVOICE') {
                res = await voidPurchase({ id: transactionToVoid.id, reason: "Manual void from history" });
            } else {
                res = await voidSupplierPayment({ paymentId: transactionToVoid.id });
            }

            if (res.success) {
                toast.success("تم إلغاء المعاملة بنجاح");
                setVoidDialogOpen(false);
            } else {
                toast.error(res.error || "فشل إلغاء المعاملة");
            }
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ غير متوقع");
        } finally {
            setIsVoiding(false);
            setTransactionToVoid(null);
        }
    };

    const filteredTransactions = transactions.filter(tx => {
        if (dateRange?.from && dateRange?.to) {
            return isWithinInterval(new Date(tx.date), {
                start: dateRange.from,
                end: dateRange.to
            });
        }
        return true;
    });

    return (
        <div className="space-y-4 animate-fade-in-up">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 bg-muted/30 p-3 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">الفترة</span>
                </div>

                <div className="flex bg-background/50 p-1 rounded-lg border border-border/50">
                    <button
                        onClick={() => {
                            setDateFilter("today");
                            setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                            dateFilter === "today" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        اليوم
                    </button>
                    <button
                        onClick={() => {
                            const yesterday = subDays(new Date(), 1);
                            setDateFilter("yesterday");
                            setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                            dateFilter === "yesterday" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        أمس
                    </button>
                    <button
                        onClick={() => {
                            setDateFilter("week");
                            setDateRange({ from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) });
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                            dateFilter === "week" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        الأسبوع
                    </button>
                    <button
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                            dateFilter === "month" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        الشهر
                    </button>
                </div>

                <FlatpickrRangePicker
                    onRangeChange={(dates) => {
                        if (dates.length === 2) {
                            setDateRange({ from: dates[0], to: dates[1] });
                            setDateFilter("custom");
                        } else if (dates.length === 0) {
                            setDateRange(undefined);
                            setDateFilter("all");
                        }
                    }}
                    onClear={() => {
                        setDateRange(undefined);
                        setDateFilter("all");
                    }}
                    initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                    className="w-56"
                />

                {dateFilter !== "all" && (
                    <button
                        onClick={() => {
                            setDateRange(undefined);
                            setDateFilter("all");
                        }}
                        className="flex items-center gap-1 text-[10px] text-orange-400 font-bold hover:text-orange-300 transition-colors"
                    >
                        <X className="w-3 h-3" /> مسح الفلتر
                    </button>
                )}

                <div className="ms-auto flex items-center gap-2">
                    <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border/50 me-2 gap-1">
                        <button
                            onClick={exportToExcel}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-emerald-500 hover:bg-emerald-500 hover:text-black transition-all text-[11px] font-bold"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>Excel</span>
                        </button>
                        <button
                            onClick={exportToPDF}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-[11px] font-bold border-l border-border/50"
                        >
                            <FileBarChart className="w-4 h-4" />
                            <span>PDF</span>
                        </button>
                    </div>

                    <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-2 hover:bg-emerald-500 hover:text-black transition-all"
                    >
                        <DollarSign className="w-3.5 h-3.5" />
                        تسجيل دفعة
                    </button>
                    <button
                        onClick={handlePrint}
                        className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-2 hover:bg-indigo-500 hover:text-white transition-all"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        كشف الحساب
                    </button>
                </div>
            </div>

            {filteredTransactions.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                    <FileText className="w-12 h-12 mb-4 opacity-20" />
                    <p>{t('noDebt')}</p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden bg-card border border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-start text-sm border-collapse">
                            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                                <tr>
                                    <th className="p-3 text-start border-r border-border/50">{t('table.date')}</th>
                                    <th className="p-3 text-start border-r border-border/50">{t('table.description')}</th>
                                    <th className="p-3 text-start border-r border-border/50 w-[20%]">الصنف</th>
                                    <th className="p-3 text-center border-r border-border/50">الكمية</th>
                                    <th className="p-3 text-end border-r border-border/50">سعر الشراء</th>
                                    <th className="p-3 text-center border-r border-border/50">{t('table.ref')}</th>
                                    <th className="p-3 text-end border-r border-border/50 bg-amber-500/5 text-amber-600">{t('table.debit')}</th>
                                    <th className="p-3 text-end border-r border-border/50 bg-emerald-500/5 text-emerald-600">{t('table.credit')}</th>
                                    <th className="p-3 text-end border-r border-border/50 font-bold">{t('table.balance')}</th>
                                    <th className="p-3 text-center">{t('table.actions') || 'إجراءات'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50 text-xs sm:text-sm">
                                {filteredTransactions.map((tx) => (
                                    <Fragment key={tx.id}>
                                        <tr className="hover:bg-muted/50 transition-colors group">
                                             <td className="p-3 border-r border-border/50 text-center">
                                                <div className="font-mono text-muted-foreground">{format(new Date(tx.date), "dd/MM/yyyy")}</div>
                                                <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{format(new Date(tx.date), "h:mm a")}</div>
                                             </td>
                                            <td className="p-3 border-r border-border/50 font-medium">
                                                {tx.type === 'INVOICE' ? (
                                                    tx.reference.startsWith('RTN-') ? (
                                                        <span className="text-rose-500 flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                                            مرتجع شراء
                                                        </span>
                                                    ) : (
                                                        <span className="text-indigo-400">فاتورة شراء</span>
                                                    )
                                                ) : (
                                                    <span className="text-emerald-500">دفعة مستلمة</span>
                                                )}
                                                {tx.method ? <span className="text-[10px] text-muted-foreground ms-1">({tx.method})</span> : ''}
                                            </td>
                                            
                                            {/* Dedicated Item Columns */}
                                            <td className="p-3 border-r border-border/50">
                                                {tx.items && tx.items.length > 0 ? (
                                                    <div className="flex flex-col gap-1.5">
                                                        {tx.items.map((i, idx) => (
                                                            <div key={idx} className="font-bold text-foreground truncate min-h-[1.5rem] flex items-center">
                                                                {i.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-muted-foreground/30">—</span>}
                                            </td>

                                            <td className="p-3 border-r border-border/50 text-center">
                                                {tx.items && tx.items.length > 0 ? (
                                                    <div className="flex flex-col gap-1.5 font-mono">
                                                        {tx.items.map((i, idx) => (
                                                            <div key={idx} className="text-indigo-400 font-bold min-h-[1.5rem] flex items-center justify-center">
                                                                {i.quantity}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-muted-foreground/30">—</span>}
                                            </td>

                                            <td className="p-3 border-r border-border/50 text-end">
                                                {tx.items && tx.items.length > 0 ? (
                                                    <div className="flex flex-col gap-1.5 font-mono">
                                                        {tx.items.map((i, idx) => (
                                                            <div key={idx} className="text-emerald-500/90 min-h-[1.5rem] flex items-center justify-end">
                                                                {formatCurrency(i.unitCost, 'EGP')}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-muted-foreground/30">—</span>}
                                            </td>

                                            <td className="p-3 border-r border-border/50 text-center font-mono text-xs">
                                                {tx.reference}
                                            </td>

                                            {/* DEBIT (Invoice - Increases Debt) */}
                                            <td className="p-3 border-r border-border/50 text-end font-mono bg-amber-500/[0.02]">
                                                {!tx.isCredit && (
                                                    <span className="text-amber-600 font-medium">
                                                        {tx.amount.toFixed(2)}
                                                    </span>
                                                )}
                                            </td>

                                            {/* CREDIT (Payment - Reduces Debt) */}
                                            <td className="p-3 border-r border-border/50 text-end font-mono bg-emerald-500/[0.02]">
                                                {tx.isCredit && (
                                                    <span className="text-emerald-600 font-medium">
                                                        {tx.amount.toFixed(2)}
                                                    </span>
                                                )}
                                            </td>

                                            {/* RUNNING BALANCE */}
                                            <td className="p-3 text-end border-r border-border/50 font-mono font-bold">
                                                <div className="flex flex-col items-end">
                                                    <span className={(tx.runningBalance || 0) > 0 ? 'text-rose-500' : 'text-emerald-500'}>
                                                        {Math.abs(tx.runningBalance || 0).toFixed(2)}
                                                    </span>
                                                    {(tx.runningBalance || 0) < 0 && (
                                                        <span className="text-[9px] text-emerald-500/70 uppercase">دائن لنا</span>
                                                    )}
                                                    {(tx.runningBalance || 0) > 0 && (
                                                        <span className="text-[9px] text-rose-500/70 uppercase">مديونية</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* ACTIONS */}
                                            <td className="p-3 text-center">
                                                <button
                                                    disabled={['VOIDED', 'CANCELLED', 'RETURNED'].includes(tx.status)}
                                                    onClick={() => {
                                                        setTransactionToVoid(tx);
                                                        setVoidDialogOpen(true);
                                                    }}
                                                    className={cn(
                                                        "p-2 rounded-lg transition-all",
                                                        ['VOIDED', 'CANCELLED', 'RETURNED'].includes(tx.status)
                                                            ? "text-muted-foreground/30 cursor-not-allowed" 
                                                            : "text-red-500 hover:bg-red-500/10 hover:shadow-lg hover:shadow-red-500/10"
                                                    )}
                                                    title="إلغاء المعاملة"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={voidDialogOpen}
                onClose={() => setVoidDialogOpen(false)}
                onConfirm={handleVoid}
                loading={isVoiding}
                title="تأكيد إلغاء المعاملة"
                message={
                    transactionToVoid?.type === 'INVOICE' 
                        ? "هل أنت متأكد من رغبتك في إلغاء هذه الفاتورة؟ سيتم عكس المخزون وإلغاء المديونية. لا يمكن التراجع عن هذا الإجراء." 
                        : "هل أنت متأكد من رغبتك في إلغاء هذا السداد؟ سيتم استرداد المبلغ للخزينة وإلغاء سداد الفواتير المرتبطة. لا يمكن التراجع عن هذا الإجراء."
                }
                confirmText="تأكيد الإلغاء"
                variant="danger"
            />

            {/* Payment Modal */}
            <GlassModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                title={`تسجيل دفعة للمورد: ${supplierName}`}
            >
                <div className="space-y-6">
                    {/* Balance Info */}
                    <div className="bg-muted/50 p-4 rounded-xl text-center border border-border">
                        <div className="text-muted-foreground text-xs uppercase mb-1">الرصيد الحالي</div>
                        <div className={`text-2xl font-mono font-bold ${balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {formatCurrency(Math.abs(balance), 'EGP')}
                            <span className="text-xs ms-1">{balance > 0 ? '(مديونية)' : '(دائن لنا)'}</span>
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">مبلغ الدفع</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="glass-input w-full text-xl font-bold"
                            placeholder="0.00"
                            autoFocus
                        />
                    </div>

                    {/* Method Selection */}
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-2 block">طريقة الدفع</label>
                        <div className="grid grid-cols-3 gap-2">
                            {PAYMENT_METHODS.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMethod(m.id)}
                                    className={cn(
                                        "p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all",
                                        method === m.id
                                            ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                                            : 'bg-card border-border hover:border-indigo-500/50 text-muted-foreground'
                                    )}
                                >
                                    <m.icon className="w-5 h-5" />
                                    <span className="text-[10px] font-bold">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={loading || !amount}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                    >
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Check className="w-5 h-5" />}
                        تأكيد الدفع
                    </button>
                </div>
            </GlassModal>
        </div>
    );
}
