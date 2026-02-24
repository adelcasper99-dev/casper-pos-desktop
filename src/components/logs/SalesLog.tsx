'use client';

import { useState, useEffect } from 'react';
import {
    Search, Filter, Eye, RotateCcw,
    FileText, AlertCircle,
    ChevronDown, Package, Printer
} from 'lucide-react';
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
import PartialRefundDialog from './PartialRefundDialog';
import { getStoreSettings } from '@/actions/settings';
import { printService } from '@/lib/print-service';
import { formatArabicPrintText } from '@/lib/arabic-reshaper';

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

    const filteredSales = sales.filter(sale => {
        const matchesSearch =
            (sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (sale.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (`#${sale.id.slice(0, 8).toUpperCase()}`.includes(searchTerm.toUpperCase()));

        const matchesStatus = statusFilter === "all" || sale.status === statusFilter;
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
        netTotal: filteredSales
            .filter(s => s.status !== 'REFUNDED' && !s._isRefundEntry)
            .reduce((acc, s) => acc + s.totalAmount, 0),
        count: filteredSales.filter(s => !s._isRefundEntry).length
    };

    // Push totals to parent when they change
    useEffect(() => {
        if (onTotalsChange) {
            onTotalsChange(computedTotals);
        }
    }, [computedTotals.netTotal, computedTotals.count]);  // Intentionally omitting onTotalsChange to avoid unnecessary effect triggers

    const handleRefund = async (saleId: string) => {
        const reason = prompt("سبب الارتجاع (اختياري):");
        if (reason === null) return;

        setLoading(saleId);
        try {
            const res = await refundSale({ saleId, reason: reason || undefined, csrfToken });
            if (res.success) {
                toast.success("تم تنفيذ المرتجع بنجاح");

                // Find the original sale
                const originalSale = sales.find(s => s.id === saleId);

                // Build a new refund entry to show as a separate log entry
                const refundEntry = originalSale ? {
                    ...originalSale,
                    id: `refund-${saleId}`,
                    status: 'REFUNDED',
                    totalAmount: -(res.refundedAmount ?? originalSale.totalAmount),
                    taxAmount: -originalSale.taxAmount,
                    subTotal: -originalSale.subTotal,
                    createdAt: new Date().toISOString(),
                    refundReason: reason || 'مرتجع',
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

                // Update original sale's total and merge item quantities from server
                const updatedSaleItems = (s.items || [])
                    .map((item: any) => {
                        const serverItem = updatedItems.find((u: any) => u.id === item.id);
                        if (!serverItem) return null; // fully returned — remove
                        return { ...item, quantity: serverItem.quantity };
                    })
                    .filter(Boolean);

                return {
                    ...s,
                    status: allReturned ? 'REFUNDED' : 'PARTIAL_REFUND',
                    totalAmount: newTotal,
                    items: updatedSaleItems,
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
                <span class="price">${(Number(item.unitPrice) * item.quantity).toFixed(2)}</span>
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
  <div>${formatArabicPrintText('فاتورة')} #${sale.id.slice(0, 8).toUpperCase()}</div>
  <div>${new Date(sale.createdAt).toLocaleString('ar-EG')}</div>
  <div>${formatArabicPrintText('العميل')}: ${formatArabicPrintText(sale.customerName || 'نقدي')}</div>
</div>
${itemsHtml}
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

    return (
        <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="البحث برقم الفاتورة أو اسم العميل..."
                        className="pl-10 h-10 bg-zinc-900/50 border-white/10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-white/10">
                    <Button
                        variant={dateFilter === "today" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "today" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "yesterday" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "week" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "month" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-zinc-400")}
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                    >
                        الشهر
                    </Button>

                    <div className="w-px h-4 bg-white/10 mx-1" />

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
                        className="w-48"
                    />
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="border-white/10 gap-2 h-10 px-4 bg-zinc-900/50">
                            <Filter className="w-4 h-4" />
                            <span>تصفية</span>
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border-white/10 text-white">
                        <DropdownMenuLabel className="text-xs uppercase tracking-widest text-zinc-500">حالة الفاتورة</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setStatusFilter("all")} className={statusFilter === "all" ? "bg-white/10" : ""}>الكل</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusFilter("PAID")} className={statusFilter === "PAID" ? "bg-white/10 text-emerald-400" : ""}>مدفوع</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusFilter("REFUNDED")} className={statusFilter === "REFUNDED" ? "bg-white/10 text-red-400" : ""}>مرتجع</DropdownMenuItem>

                        <DropdownMenuSeparator className="bg-white/5" />

                        <DropdownMenuLabel className="text-xs uppercase tracking-widest text-zinc-500">طريقة الدفع</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setPaymentFilter("all")} className={paymentFilter === "all" ? "bg-white/10" : ""}>الكل</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPaymentFilter("CASH")} className={paymentFilter === "CASH" ? "bg-white/10" : ""}>كاش</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPaymentFilter("VISA")} className={paymentFilter === "VISA" ? "bg-white/10" : ""}>فيزا</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {(statusFilter !== "all" || paymentFilter !== "all" || dateFilter !== "all" || searchTerm !== "") && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-500 hover:text-white"
                        onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("all");
                            setPaymentFilter("all");
                            setDateFilter("all");
                            setDateRange(undefined);
                        }}
                    >
                        حذف الكل
                    </Button>
                )}
            </div>

            {/* Main Table */}
            <div className="rounded-xl border border-white/5 bg-zinc-900/20 overflow-hidden shadow-2xl">
                <Table>
                    <TableHeader className="bg-zinc-900/50">
                        <TableRow className="border-white/5 hover:bg-transparent">
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">رقم الفاتورة</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">التاريخ</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">العميل</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">الإجمالي</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">طريقة الدفع</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">الحالة</TableHead>
                            <TableHead className="text-right text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">الإجراءات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredSales.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-20 text-zinc-500 italic">
                                    لا توجد عمليات بيع مطابقة للبحث
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredSales.map((sale) => (
                                <tr key={sale.id} className={`border-white/5 hover:bg-white/5 transition-colors group ${sale._isRefundEntry ? 'bg-red-500/5 border-l-2 border-l-red-500/40' : ''}`}>
                                    <td className="py-2 px-4">
                                        <div className="flex flex-col gap-0.5">
                                            {sale._isRefundEntry && (
                                                <span className="text-[9px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1">
                                                    ↩ ارتجاع
                                                </span>
                                            )}
                                            <div className={`font-mono text-xs ${sale._isRefundEntry ? 'text-red-400/80' : 'text-cyan-500/80'}`}>
                                                #{sale._isRefundEntry ? sale.id.replace('refund-', '').slice(0, 8).toUpperCase() : sale.id.slice(0, 8).toUpperCase()}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-2 px-4 text-zinc-300 text-xs">
                                        {format(new Date(sale.createdAt), 'yyyy/MM/dd HH:mm')}
                                    </td>
                                    <td className="py-2 px-4 font-bold text-zinc-100 italic">
                                        {sale.customerName || "عميل نقدي"}
                                    </td>
                                    <td className={`py-2 px-4 font-mono font-bold ${sale._isRefundEntry ? 'text-red-400' : 'text-zinc-100'}`}>
                                        {sale.totalAmount < 0 ? '-' : ''}{Math.abs(sale.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-4">
                                        <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 font-bold uppercase">
                                            {sale.paymentMethod}
                                        </Badge>
                                    </td>
                                    <td className="py-2 px-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${sale.status === 'REFUNDED'
                                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                            : sale.status === 'PARTIAL_REFUND'
                                                ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            }`}>
                                            {sale.status === 'REFUNDED' ? 'مرتجع كامل'
                                                : sale.status === 'PARTIAL_REFUND' ? 'مرتجع جزئي'
                                                    : 'مدفوع'}
                                        </span>
                                    </td>

                                    <td className="py-2 px-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-cyan-400 hover:bg-cyan-400/10"
                                                onClick={() => setSelectedSale(sale)}
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            {!sale._isRefundEntry && sale.status !== 'REFUNDED' && (
                                                <>
                                                    {/* Partial Refund */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-orange-400 hover:bg-orange-400/10"
                                                        title="مرتجع جزئي"
                                                        onClick={() => setPartialRefundSale(sale)}
                                                    >
                                                        <Package className="w-4 h-4" />
                                                    </Button>
                                                    {/* Full Refund */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-400 hover:bg-red-400/10"
                                                        title="مرتجع كامل"
                                                        disabled={loading === sale.id}
                                                        onClick={() => handleRefund(sale.id)}
                                                    >
                                                        {loading === sale.id ? (
                                                            <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
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

            {/* Details Dialog */}
            {selectedSale && (
                <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
                    <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10 text-white">
                        <Card className="bg-transparent border-0 shadow-none">
                            <DialogHeader className="pb-2">
                                <DialogTitle className="flex items-center justify-between">
                                    <span className="text-xl font-bold flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-cyan-400" />
                                        تفاصيل الفاتورة
                                    </span>
                                    <Badge variant="outline" className="border-white/10 text-xs">
                                        #{selectedSale.id.slice(0, 8).toUpperCase()}
                                    </Badge>
                                </DialogTitle>
                            </DialogHeader>
                            <CardContent className="space-y-4 pt-4">
                                <div className="grid grid-cols-2 gap-4 text-sm bg-white/5 p-4 rounded-xl border border-white/5">
                                    <div className="space-y-1">
                                        <span className="text-zinc-400 text-xs block">التاريخ</span>
                                        <span className="font-bold">{format(new Date(selectedSale.createdAt), 'yyyy/MM/dd HH:mm')}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-zinc-400 text-xs block">البائع</span>
                                        <span className="font-bold">{selectedSale.user?.name || "النظام"}</span>
                                    </div>
                                    <div className="space-y-1 col-span-2 border-t border-white/5 pt-2">
                                        <span className="text-zinc-400 text-xs block">العميل</span>
                                        <span className="font-bold">{selectedSale.customerName || "عميل نقدي"}</span>
                                    </div>
                                </div>

                                {/* Items List */}
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest pb-1 block">الأصناف</span>
                                    <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                        {selectedSale.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5 group hover:border-cyan-500/30 transition-colors">
                                                <div className="flex-1">
                                                    <div className="font-bold text-sm text-zinc-100">{item.product?.name || "منتج غير معروف"}</div>
                                                    <div className="text-[10px] text-zinc-500 font-mono italic">
                                                        {item.quantity} x {item.unitPrice.toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="font-mono font-bold text-cyan-400 text-sm">
                                                    {(item.quantity * item.unitPrice).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Totals */}
                                <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
                                    <div className="flex justify-between text-zinc-400 text-xs">
                                        <span>طريقة الدفع</span>
                                        <span className="font-bold text-white">{selectedSale.paymentMethod}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <span className="text-lg font-bold">الإجمالي النهائي</span>
                                        <span className="text-3xl font-mono font-bold text-cyan-400">
                                            {selectedSale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>

                                {selectedSale.status !== 'REFUNDED' && (
                                    <div className="flex gap-2 mt-4">
                                        <Button
                                            className="flex-1 h-10 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl gap-2"
                                            onClick={() => handlePrintInvoice(selectedSale)}
                                        >
                                            <Printer className="w-4 h-4" />
                                            طباعة الفاتورة
                                        </Button>
                                        <Button
                                            className="flex-1 h-10 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl gap-2"
                                            onClick={() => { setSelectedSale(null); setPartialRefundSale(selectedSale); }}
                                        >
                                            <Package className="w-4 h-4" />
                                            مرتجع جزئي
                                        </Button>
                                        <Button
                                            className="flex-1 h-10 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl gap-2"
                                            onClick={() => handleRefund(selectedSale.id)}
                                            disabled={loading === selectedSale.id}
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            {loading === selectedSale.id ? '...' : 'مرتجع كامل'}
                                        </Button>
                                    </div>
                                )}
                                {selectedSale.status === 'REFUNDED' && (
                                    <Button
                                        className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl mt-4 gap-2"
                                        onClick={() => handlePrintInvoice(selectedSale)}
                                    >
                                        <Printer className="w-4 h-4" />
                                        طباعة الفاتورة
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    </DialogContent>
                </Dialog>
            )}

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
