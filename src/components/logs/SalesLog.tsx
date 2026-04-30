'use client';

import { useState, useEffect } from 'react';
import {
    Search, Filter, Eye, RotateCcw,
    FileText, AlertCircle,
    ChevronDown, Package, Printer, Download
} from 'lucide-react';
import * as XLSX from "xlsx";
import {
    DropdownMenu, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table, TableBody, TableCell,
    TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { FlatpickrRangePicker } from '@/components/ui/flatpickr-range-picker';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
    format, isToday, isYesterday, isThisWeek, isThisMonth, isSameDay,
    isWithinInterval, startOfDay, endOfDay, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, subDays
} from 'date-fns';
import { refundSale } from '@/actions/sales-actions';
import { cn, formatCurrency } from '@/lib/utils';
import { DateRange } from "react-day-picker";
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import PartialRefundDialog from './PartialRefundDialog';
import RefundSelectionDialog from './RefundSelectionDialog';
import { getStoreSettings } from '@/actions/settings';
import { printService } from '@/lib/print-service';
import { formatArabicPrintText } from '@/lib/arabic-reshaper';
import { generateA4ReceiptHTML } from '@/components/pos/A4ReceiptTemplate';
import { generateA4ReturnHTML } from '@/components/pos/A4ReturnTemplate';

interface SalesLogProps {
    initialSales: any[];
    csrfToken?: string;
    onTotalsChange?: (totals: { netTotal: number; count: number }) => void;
}

export default function SalesLog({ initialSales, csrfToken, onTotalsChange }: SalesLogProps) {
    const [activeTab, setActiveTab] = useState("sales");
    const [sales, setSales] = useState(initialSales);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [paymentFilter, setPaymentFilter] = useState<string>("all");
    const [dateFilter, setDateFilter] = useState<string>("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedSale, setSelectedSale] = useState<any>(null);
    const [loading, setLoading] = useState<string | null>(null);
    const [partialRefundSale, setPartialRefundSale] = useState<any>(null);
    const [refundItem, setRefundItem] = useState<{ id: string } | null>(null);

    const getPaymentMethodLabel = (method: string) => {
        switch (method?.toUpperCase()) {
            case 'CASH': return 'كاش';
            case 'ACCOUNT': return 'آجل';
            case 'VISA': return 'فيزا';
            default: return method;
        }
    };

    const getStatusLabel = (status: string, paymentMethod: string) => {
        if (status === 'VOIDED') return 'ملغاة (مسترد)';
        if (status === 'REFUNDED') return 'مرتجع كامل';
        if (status === 'PARTIAL_REFUND') return 'مرتجع جزئي';
        if (paymentMethod === 'ACCOUNT') return 'آجل';
        return 'مدفوع';
    };

    const getStatusStyles = (status: string, paymentMethod: string) => {
        if (status === 'VOIDED') return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
        if (status === 'REFUNDED') return 'bg-red-500/10 text-red-400 border border-red-500/20';
        if (status === 'PARTIAL_REFUND') return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
        if (paymentMethod === 'ACCOUNT') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    };

    const filteredSales = sales.filter(sale => {
        const matchesSearch =
            (sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (sale.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (`#${sale.id.slice(0, 8).toUpperCase()}`.includes(searchTerm.toUpperCase()));

        const isReturn = sale.isReturn || sale._isRefundEntry;
        const matchesStatus = statusFilter === "all" || 
            (statusFilter === "REFUNDED" ? isReturn : sale.status === statusFilter);
        const matchesPayment = paymentFilter === "all" || sale.paymentMethod === paymentFilter;

        let matchesDate = true;
        const date = new Date(sale.createdAt);
        if (dateFilter === "today") matchesDate = isToday(date);
        else if (dateFilter === "yesterday") matchesDate = isYesterday(date);
        else if (dateFilter === "week") matchesDate = isThisWeek(date);
        else if (dateFilter === "month") matchesDate = isThisMonth(date);
        else if (dateFilter === "custom" && dateRange?.from) {
            if (dateRange.to) {
                matchesDate = isWithinInterval(date, {
                    start: startOfDay(dateRange.from),
                    end: endOfDay(dateRange.to)
                });
            } else {
                matchesDate = isSameDay(date, dateRange.from);
            }
        }

        return matchesSearch && matchesStatus && matchesPayment && matchesDate;
    });

    // Compute totals based on filtered results
    const computedTotals = {
        netTotal: filteredSales.reduce((acc, s) => {
            const isReturn = s.isReturn || s._isRefundEntry;
            if (s.status === 'VOIDED' && !isReturn) return acc;
            return acc + Number(s.totalAmount);
        }, 0),
        count: filteredSales.filter(s => !s.isReturn && !s._isRefundEntry).length
    };

    // Push totals to parent when they change
    useEffect(() => {
        if (onTotalsChange) {
            onTotalsChange(computedTotals);
        }
    }, [computedTotals.netTotal, computedTotals.count]);  // Intentionally omitting onTotalsChange to avoid unnecessary effect triggers

    const handleRefund = async (saleId: string, data: { treasuryId: string, paymentMethod: string, reason?: string, refundMethod?: 'CASH' | 'STORE_CREDIT' }) => {
        setLoading(saleId);
        try {
            const res = await refundSale({
                saleId,
                reason: data.reason || undefined,
                treasuryId: data.treasuryId,
                refundMethod: data.refundMethod,
                csrfToken
            });
            if (res.success) {
                toast.success("تم تنفيذ المرتجع بنجاح");

                // Find the original sale
                const originalSale = sales.find(s => s.id === saleId);

                // Build a new refund entry to show as a separate log entry
                const refundEntry = originalSale ? {
                    ...originalSale,
                    id: `refund-${saleId}`,
                    status: 'REFUNDED',
                    totalAmount: -(res.refundedAmount ?? Number(originalSale.totalAmount)),
                    taxAmount: -Number(originalSale.taxAmount),
                    subTotal: -Number(originalSale.subTotal),
                    createdAt: new Date().toISOString(),
                    refundReason: data.reason || 'مرتجع',
                    _isRefundEntry: true,
                } : null;

                setSales(prev => {
                    const updated = prev.map(s => s.id === saleId ? { ...s, status: 'REFUNDED' } : s);
                    return refundEntry ? [refundEntry, ...updated] : updated;
                });

                if (selectedSale?.id === saleId) setSelectedSale({ ...selectedSale, status: 'REFUNDED' });
            } else {
                toast.error(res.error || "فشل تنفيذ المرتجع");
            }

        } catch (error) {
            toast.error("خطأ في الخادم");
        } finally {
            setLoading(null);
        }
    };

    const exportToExcel = () => {
        const data = filteredSales.map(sale => ({
            "رقم الفاتورة": sale.invoiceNumber || (sale._isRefundEntry ? sale.id.replace('refund-', '').slice(0, 8).toUpperCase() : sale.id.slice(0, 8).toUpperCase()),
            "التاريخ": format(new Date(sale.createdAt), 'yyyy/MM/dd HH:mm'),
            "العميل": sale.customerName || "عميل نقدي",
            "الإجمالي": sale.totalAmount,
            "طريقة الدفع": getPaymentMethodLabel(sale.paymentMethod),
            "الحالة": getStatusLabel(sale.status, sale.paymentMethod)
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "سجل المبيعات");
        XLSX.writeFile(wb, `casper_sales_log_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    };

    const handlePartialRefundDone = (saleId: string, refundedAmount: number, allReturned: boolean, returnedItems: any[], newTotal: number, updatedItems: any[]) => {
        const originalSale = sales.find(s => s.id === saleId);

        // Build a refund entry for the log
        const refundEntry = originalSale ? {
            ...originalSale,
            id: `refund-${Date.now()}-${saleId}`,
            status: 'REFUNDED',
            totalAmount: -refundedAmount,
            createdAt: new Date().toISOString(),
            _isRefundEntry: true,
            _partialItems: returnedItems,
        } : null;

        setSales(prev => {
            const updated = prev.map(s => {
                if (s.id !== saleId) return s;
                return {
                    ...s,
                    status: allReturned ? 'REFUNDED' : 'PARTIAL_REFUND'
                    // Original totalAmount and items are preserved for audit trail
                };
            });
            return refundEntry ? [refundEntry, ...updated] : updated;
        });

        setPartialRefundSale(null);
    };

    const handlePrintInvoice = async (sale: any) => {
        const settingsRes = await getStoreSettings();
        const settings = settingsRes.success ? settingsRes.data : null;

        const paperWidthMm = settings?.paperSize === '58mm' ? 58 : (settings?.paperSize === '100mm' ? 100 : 80);

        const itemsHtml = (sale.items || []).map((item: any) => `
            <div class="item">
                <span class="item-name">${formatArabicPrintText(item.product?.name || 'صنف')} x${item.quantity}</span>
                <span class="price">${(Number(item.unitPrice) * Number(item.quantity)).toFixed(2)}</span>
            </div>
        `).join('');

        const html = `<!DOCTYPE html>
<html dir="ltr">
<head>
<meta charset="utf-8">
<style>
@page { margin: 0; }
body { font-family: Arial, sans-serif; width: ${paperWidthMm}mm; margin: 0 auto; padding: 0mm; direction: ltr; text-align: right; font-size: 14px; background: white; color: black; box-sizing: border-box; }
.header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
.store-name { font-size: 18px; font-weight: 900; }
.item { display: flex; justify-content: space-between; flex-direction: row-reverse; padding: 3px 0; border-bottom: 1px dotted #ccc; font-weight: bold; }
.item-name { flex: 1; text-align: right; padding-right: 5px; }
.price { font-weight: bold; }
.total { font-weight: 900; font-size: 16px; display: flex; justify-content: space-between; flex-direction: row-reverse; border-top: 2px dashed #000; padding-top: 6px; margin-top: 6px; }
.footer { text-align: center; font-size: 10px; color: #333; margin-top: 15px; }
</style>
</head>
<body>
<div class="header">
<div class="store-name">${formatArabicPrintText(settings?.name || 'CASPER ERP')}</div>
  <div>${formatArabicPrintText(settings?.address || '')}</div>
  <div>${formatArabicPrintText('فاتورة')} #${sale.invoiceNumber || sale.id.slice(0, 8).toUpperCase()}</div>
  <div>${new Date(sale.createdAt).toLocaleString('ar-EG')}</div>
  <div>${formatArabicPrintText('العميل')}: ${formatArabicPrintText(sale.customerName || 'نقدي')}</div>
</div>
${itemsHtml}
<div class="item" style="border-top: 1px dashed #000; padding-top: 5px;">
    <span>${Number(sale.subTotal || sale.totalAmount).toFixed(2)}</span>
    <span>${formatArabicPrintText('المجموع الفرعي')}</span>
</div>
${(sale.discountAmount && Number(sale.discountAmount) > 0) ? `
<div class="item" style="color: #000; font-weight: bold;">
    <span>-${Number(sale.discountAmount).toFixed(2)}</span>
    <span>${formatArabicPrintText('الخصم')}</span>
</div>
` : ''}
<div class="total">
            <span>${Number(sale.totalAmount).toFixed(2)} ${formatArabicPrintText(settings?.currency || 'ج.م')}</span>
            <span>${formatArabicPrintText('الإجمالي')}</span>
        </div>
<div class="footer">${formatArabicPrintText(settings?.receiptFooter || 'شكراً لتعاملكم معنا')}</div>
</body></html>`;

        const receiptPrinter = typeof window !== 'undefined' ? localStorage.getItem('casper_receipt_printer') : null;
        toast.promise(printService.printHTML(html, receiptPrinter || undefined, { paperWidthMm }), {
            loading: 'جارى الطباعة...',
            success: 'تم الإرسال للطابعة',
            error: (err: any) => `فشل الطباعة: ${err.message}`
        });
    };

    const handlePrintA4 = async (sale: any) => {
        const settingsRes = await getStoreSettings();
        const settings = settingsRes.success ? settingsRes.data : null;

        const isRefund = sale._isRefundEntry || sale.status === 'REFUNDED';
        const html = isRefund
            ? generateA4ReturnHTML({ saleData: sale, settings })
            : generateA4ReceiptHTML({ saleData: sale, settings });

        const registry = printService.getRegistry();
        const a4Printer = registry?.a4Printer && registry.a4Printer !== 'none' ? registry.a4Printer : undefined;

        toast.promise(printService.printHTML(html, a4Printer || '', { paperWidthMm: 210 }), {
            loading: 'جارى طباعة A4...',
            success: 'تم الإرسال للطابعة',
            error: (err: any) => `فشل الطباعة: ${err.message}`
        });
    };

    return (
        <div className="space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-col xl:flex-row gap-4">
                <div className="relative flex-1 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        placeholder="البحث برقم الفاتورة أو اسم العميل..."
                        className="glass-input pl-11 h-12 w-full focus:ring-2 focus:ring-primary/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border">
                    <Button
                        variant={dateFilter === "today" ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                            "h-9 text-xs font-black px-4 rounded-xl transition-all",
                            dateFilter === "today" 
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => {
                            setDateFilter("today");
                            setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
                        }}
                    >
                        اليوم
                    </Button>
                    <Button
                        variant={dateFilter === "yesterday" ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                            "h-9 text-xs font-black px-4 rounded-xl transition-all",
                            dateFilter === "yesterday" 
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => {
                            const yesterday = subDays(new Date(), 1);
                            setDateFilter("yesterday");
                            setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
                        }}
                    >
                        أمس
                    </Button>
                    <Button
                        variant={dateFilter === "week" ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                            "h-9 text-xs font-black px-4 rounded-xl transition-all",
                            dateFilter === "week" 
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => {
                            setDateFilter("week");
                            setDateRange({ from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) });
                        }}
                    >
                        الأسبوع
                    </Button>
                    <Button
                        variant={dateFilter === "month" ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                            "h-9 text-xs font-black px-4 rounded-xl transition-all",
                            dateFilter === "month" 
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                    >
                        الشهر
                    </Button>

                    <div className="w-px h-5 bg-border mx-1" />

                    <FlatpickrRangePicker
                        onRangeChange={(dates) => {
                            if (dates.length === 2) {
                                setDateRange({ from: dates[0], to: dates[1] });
                                setDateFilter("custom");
                            } else if (dates.length === 1) {
                                setDateRange({ from: dates[0], to: undefined });
                                setDateFilter("custom");
                            } else {
                                setDateRange(undefined);
                                setDateFilter("all");
                            }
                        }}
                        onClear={() => {
                            setDateRange(undefined);
                            setDateFilter("all");
                        }}
                        initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                        className="w-48 bg-transparent border-none py-0 h-9 text-xs font-bold focus:ring-0"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-border gap-2 h-12 px-6 rounded-2xl bg-card hover:bg-muted transition-all font-bold">
                                <Filter className="w-4 h-4 text-primary" />
                                <span>تصفية المخرجات</span>
                                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 p-2 rounded-2xl bg-card border-border shadow-2xl">
                            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5">حالة الفاتورة</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setStatusFilter("all")} className={cn("rounded-xl h-10 px-3", statusFilter === "all" ? "bg-primary/10 text-primary font-bold" : "")}>الكل</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter("PAID")} className={cn("rounded-xl h-10 px-3", statusFilter === "PAID" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold" : "")}>مدفوع</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter("REFUNDED")} className={cn("rounded-xl h-10 px-3", statusFilter === "REFUNDED" ? "bg-red-500/10 text-red-600 dark:text-red-400 font-bold" : "")}>مرتجع كامل</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter("PARTIAL_REFUND")} className={cn("rounded-xl h-10 px-3", statusFilter === "PARTIAL_REFUND" ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold" : "")}>مرتجع جزئي</DropdownMenuItem>

                            <DropdownMenuSeparator className="my-2 bg-border" />

                            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5">طريقة الدفع</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setPaymentFilter("all")} className={cn("rounded-xl h-10 px-3", paymentFilter === "all" ? "bg-primary/10 text-primary font-bold" : "")}>الكل</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPaymentFilter("CASH")} className={cn("rounded-xl h-10 px-3", paymentFilter === "CASH" ? "bg-primary/10 text-primary font-bold" : "")}>كاش</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPaymentFilter("VISA")} className={cn("rounded-xl h-10 px-3", paymentFilter === "VISA" ? "bg-primary/10 text-primary font-bold" : "")}>فيزا</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPaymentFilter("ACCOUNT")} className={cn("rounded-xl h-10 px-3", paymentFilter === "ACCOUNT" ? "bg-primary/10 text-primary font-bold" : "")}>آجل / عميل</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                        variant="outline"
                        className="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-2 h-12 px-6 rounded-2xl group transition-all font-bold"
                        onClick={exportToExcel}
                    >
                        <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                        <span>تصدير Excel</span>
                    </Button>
                </div>

                {(statusFilter !== "all" || paymentFilter !== "all" || dateFilter !== "all" || searchTerm !== "") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 rounded-2xl text-red-500 hover:bg-red-500/10 shrink-0"
                        title="حذف جميع الفلاتر"
                        onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("all");
                            setPaymentFilter("all");
                            setDateFilter("all");
                            setDateRange(undefined);
                        }}
                    >
                        <RotateCcw className="w-5 h-5" />
                    </Button>
                )}
            </div>

            {/* Main Table */}
            <div className="glass-card rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
                <Table>
                    <TableHeader className="bg-muted/60">
                        <TableRow className="border-border hover:bg-transparent">
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">رقم الفاتورة</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">التاريخ</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">العميل</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">الإجمالي</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">طريقة الدفع</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">الحالة</TableHead>
                            <TableHead className="text-left text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest px-6">الإجراءات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredSales.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-24">
                                    <div className="flex flex-col items-center gap-3 opacity-40">
                                        <div className="p-4 rounded-full bg-muted border border-border">
                                            <Search className="w-10 h-10" />
                                        </div>
                                        <span className="text-sm font-medium italic">لا توجد عمليات بيع تطابقة لمعايير البحث الحالية</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredSales.map((sale) => (
                                <tr
                                    key={sale.id}
                                    className={cn(
                                        "border-border hover:bg-primary/10 transition-all group cursor-pointer border-b",
                                        "even:bg-muted/70",
                                        (sale.isReturn || sale._isRefundEntry) && "bg-red-500/[0.02] dark:bg-red-500/[0.04]",
                                        !(sale.isReturn || sale._isRefundEntry) && Number(sale.discountAmount) > 0 && "bg-amber-500/[0.02] dark:bg-amber-500/[0.04]"
                                    )}
                                    onClick={() => setSelectedSale(sale)}
                                >
                                    <td className="py-4 px-4 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            {(sale.isReturn || sale._isRefundEntry) && (
                                                <span className="text-[8px] font-black uppercase bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">
                                                    إرجاع
                                                </span>
                                            )}
                                            <div className={cn(
                                                "font-mono text-xs font-bold px-2 py-1 rounded-md", 
                                                (sale.isReturn || sale._isRefundEntry) ? 'bg-red-500/5 text-red-500' : 'bg-primary/5 text-primary'
                                            )}>
                                                {sale.invoiceNumber || (sale._isRefundEntry ? sale.id.replace('refund-', '').slice(0, 8).toUpperCase() : sale.id.slice(0, 8).toUpperCase())}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center text-muted-foreground text-[11px] font-medium font-mono">
                                        {format(new Date(sale.createdAt), 'yyyy/MM/dd HH:mm')}
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <div className="font-bold text-foreground text-sm">
                                            {sale.customerName || "عميل نقدي"}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <div className={cn(
                                            "font-mono font-black text-sm px-3 py-1 rounded-lg inline-block",
                                            (sale.isReturn || sale._isRefundEntry) ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-muted text-foreground'
                                        )}>
                                            {sale.totalAmount < 0 ? '-' : ''}{Math.abs(Number(sale.totalAmount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <Badge variant="outline" className="text-[10px] border-border bg-background/50 font-black uppercase text-muted-foreground">
                                            {getPaymentMethodLabel(sale.paymentMethod)}
                                        </Badge>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm",
                                            getStatusStyles(sale.status, sale.paymentMethod)
                                        )}>
                                            {getStatusLabel(sale.status, sale.paymentMethod)}
                                        </span>
                                    </td>

                                    <td className="py-4 px-6 text-left" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex justify-start gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-primary hover:bg-primary/10 rounded-xl"
                                                onClick={() => setSelectedSale(sale)}
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-indigo-500 hover:bg-indigo-500/10 rounded-xl"
                                                title="طباعة A4"
                                                onClick={() => handlePrintA4(sale)}
                                            >
                                                <FileText className="w-4 h-4" />
                                            </Button>
                                            {!(sale.isReturn || sale._isRefundEntry) && sale.status !== 'REFUNDED' && (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-orange-500 hover:bg-orange-500/10 rounded-xl"
                                                        title="مرتجع جزئي"
                                                        onClick={() => setPartialRefundSale(sale)}
                                                    >
                                                        <Package className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-red-500 hover:bg-red-500/10 rounded-xl"
                                                        title="مرتجع كامل"
                                                        disabled={loading === sale.id}
                                                        onClick={() => setRefundItem({ id: sale.id })}
                                                    >
                                                        {loading === sale.id ? (
                                                            <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                                                        ) : (
                                                            <RotateCcw className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Full Refund Selection Dialog */}
            <RefundSelectionDialog
                isOpen={!!refundItem}
                onClose={() => setRefundItem(null)}
                sale={sales.find(s => s.id === refundItem?.id)}
                loading={!!loading}
                onConfirm={(data) => {
                    if (refundItem) handleRefund(refundItem.id, data);
                    setRefundItem(null);
                }}
            />

            {/* Details Dialog */}
            {
                selectedSale && (
                    <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
                        <DialogContent className="sm:max-w-xl bg-card border-border text-foreground shadow-2xl rounded-3xl p-0 overflow-hidden">
                            <div className="p-8 space-y-6">
                                <DialogHeader className="pb-4 border-b border-border">
                                    <DialogTitle className="flex items-center justify-between">
                                        <span className="text-2xl font-black flex items-center gap-3">
                                            <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20">
                                                <FileText className="w-6 h-6 text-primary" />
                                            </div>
                                            تفاصيل الفاتورة
                                        </span>
                                        <Badge variant="outline" className="border-border bg-muted/50 text-xs px-3 py-1 font-mono rounded-lg">
                                            #{selectedSale.invoiceNumber || selectedSale.id.slice(0, 8).toUpperCase()}
                                        </Badge>
                                    </DialogTitle>
                                </DialogHeader>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-1 group hover:border-primary/30 transition-all">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">التاريخ والوقت</span>
                                        <span className="font-bold text-sm block italic">{format(new Date(selectedSale.createdAt), 'yyyy/MM/dd HH:mm:ss')}</span>
                                    </div>
                                    <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-1 group hover:border-primary/30 transition-all">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">المبيعات بواسطة</span>
                                        <span className="font-bold text-sm block">{selectedSale.user?.name || "النظام الآلي"}</span>
                                    </div>
                                    <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-2 col-span-2 group hover:border-primary/30 transition-all">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">العميل المرتبط</span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 text-primary font-bold text-xs uppercase">
                                                {(selectedSale.customerName?.[0] || 'C').toUpperCase()}
                                            </div>
                                            <span className="font-black text-lg italic">{selectedSale.customerName || "عميل نقدي"}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Items List */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">الأصناف الملحقة ({selectedSale.items?.length})</span>
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">المجموع الفرعي</span>
                                    </div>
                                    <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                        {selectedSale.items?.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center p-4 rounded-2xl bg-muted/20 border border-border group hover:bg-muted/40 hover:border-primary/20 transition-all">
                                                <div className="flex-1">
                                                    <div className="font-black text-sm text-foreground">{item.product?.name || "صنف غير محدد"}</div>
                                                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5 opacity-80">
                                                        {Number(item.quantity)} وحدة <span className="mx-1.5 opacity-30">×</span> {Number(item.unitPrice).toLocaleString()} ج.م
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-mono font-black text-primary text-sm">
                                                        {(Number(item.quantity) * Number(item.unitPrice)).toLocaleString()}
                                                    </div>
                                                    <div className="text-[9px] font-black uppercase text-muted-foreground opacity-40">صافي الصنف</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Summary & Actions Area */}
                                <div className="bg-muted/50 rounded-3xl p-6 border border-border space-y-4 shadow-inner">
                                    <div className="grid grid-cols-2 gap-y-3">
                                        <div className="flex justify-between items-center text-muted-foreground text-xs px-2">
                                            <span className="font-medium opacity-60 uppercase tracking-widest text-[10px]">المجموع قبل الخصم</span>
                                            <span className="font-bold italic">{formatCurrency(Number(selectedSale.subTotal))}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs px-2 border-r border-border ml-2 pl-4">
                                            <span className="font-medium text-muted-foreground opacity-60 uppercase tracking-widest text-[10px]">طريقة السداد</span>
                                            <Badge variant="outline" className="bg-background border-border font-black text-[9px] uppercase px-2 py-0.5 rounded-md">
                                                {getPaymentMethodLabel(selectedSale.paymentMethod)}
                                            </Badge>
                                        </div>
                                        {Number(selectedSale.discountAmount) > 0 && (
                                            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 text-xs px-2 col-span-2 bg-emerald-500/5 py-1.5 rounded-lg border border-emerald-500/10">
                                                <span className="font-black uppercase tracking-widest text-[10px]">قيمة الخصم التجاري</span>
                                                <span className="font-black">-{formatCurrency(Number(selectedSale.discountAmount))}</span>
                                            </div>
                                        )}
                                        {Number(selectedSale.taxAmount) > 0 && (
                                            <div className="flex justify-between items-center text-muted-foreground text-xs px-2 col-span-2 pt-1 border-t border-border mt-1">
                                                <span className="font-black uppercase tracking-widest text-[10px] opacity-60">الضرائب المضافة</span>
                                                <span className="font-bold">+{formatCurrency(Number(selectedSale.taxAmount))}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-4 border-t border-border flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">إجمالي المدفوع نهائي</span>
                                            <span className="text-xs text-muted-foreground font-medium italic">السعر يشمل كافة المصاريف والضرائب</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-4xl font-black font-mono tracking-tighter text-primary">
                                                {Number(selectedSale.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                <span className="text-xs font-bold text-muted-foreground mr-1.5 opacity-50 uppercase tracking-tighter">jod/egp</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                {selectedSale.status !== 'REFUNDED' && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <Button
                                            variant="outline"
                                            className="h-12 bg-background border-border hover:bg-muted font-black rounded-2xl gap-2 text-xs shadow-sm"
                                            onClick={() => handlePrintInvoice(selectedSale)}
                                        >
                                            <Printer className="w-4 h-4 text-muted-foreground" />
                                            إيصال حراري
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="h-12 bg-background border-border hover:bg-primary/5 hover:border-primary/30 font-black rounded-2xl gap-2 text-xs shadow-sm"
                                            onClick={() => handlePrintA4(selectedSale)}
                                        >
                                            <FileText className="w-4 h-4 text-indigo-500" />
                                            فاتورة A4
                                        </Button>
                                        <Button
                                            className="h-12 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl gap-2 text-xs shadow-lg shadow-orange-900/10"
                                            onClick={() => { setSelectedSale(null); setPartialRefundSale(selectedSale); }}
                                        >
                                            <Package className="w-4 h-4" />
                                            مرتجع جزئي
                                        </Button>
                                        <Button
                                            className="h-12 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl gap-2 text-xs shadow-lg shadow-red-900/10"
                                            onClick={() => setRefundItem({ id: selectedSale.id })}
                                            disabled={loading === selectedSale.id}
                                        >
                                            {loading === selectedSale.id ? (
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <RotateCcw className="w-4 h-4" />
                                            )}
                                            مرتجع كامل
                                        </Button>
                                    </div>
                                )}
                                {selectedSale.status === 'REFUNDED' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button
                                            variant="outline"
                                            className="h-12 bg-background border-border hover:bg-muted font-black rounded-2xl gap-2 text-sm shadow-sm"
                                            onClick={() => handlePrintInvoice(selectedSale)}
                                        >
                                            <Printer className="w-5 h-5 text-muted-foreground" />
                                            طباعة (حراري)
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="h-12 bg-background border-border hover:bg-primary/5 hover:border-primary/30 font-black rounded-2xl gap-2 text-sm shadow-sm"
                                            onClick={() => handlePrintA4(selectedSale)}
                                        >
                                            <FileText className="w-5 h-5 text-indigo-500" />
                                            طباعة (A4)
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                )
            }

            {/* Partial Refund Dialog */}
            <PartialRefundDialog
                isOpen={!!partialRefundSale}
                onClose={() => setPartialRefundSale(null)}
                sale={partialRefundSale}
                csrfToken={csrfToken}
                onRefundDone={handlePartialRefundDone}
            />
        </div>
    );
}
