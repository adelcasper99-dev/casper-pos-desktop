'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Search, Filter, Eye, Pencil,
    Trash2, Truck,
    ChevronLeft, ChevronRight, FileText,
    CheckCircle2, XCircle, AlertCircle,
    Package, ArrowUpRight, ChevronDown,
    Calendar as CalendarIcon, RotateCcw, Printer, Tag, Loader2, Download
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
    DropdownMenu, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table, TableBody, TableCell,
    TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { FlatpickrRangePicker } from '@/components/ui/flatpickr-range-picker';
import { toast } from 'sonner';
import {
    format, isToday, isYesterday, isThisWeek, isThisMonth, isSameDay,
    isWithinInterval, startOfDay, endOfDay, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, subDays
} from 'date-fns';
import { voidPurchase } from '@/actions/purchase-actions';
import { cn, formatCurrency } from '@/lib/utils';
import { DateRange } from "react-day-picker"
import { useTranslations } from '@/lib/i18n-mock';
import PartialReturnPurchaseDialog, { DialogItem } from './PartialReturnPurchaseDialog';
import { PurchaseInvoiceWithItems } from '@/types/purchasing';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { BarcodePrintDialog } from '@/components/inventory/BarcodePrintDialog';
import { generateA4PurchaseHTML } from '@/components/inventory/purchasing/A4PurchaseTemplate';
import { printService } from '@/lib/print-service';
import { getStoreSettings } from '@/actions/settings';

interface PurchaseLogProps {
    initialPurchases: any[];
    csrfToken?: string;
    onTotalsChange?: (totals: { actualTotal: number; remaining: number }) => void;
}

export default function PurchaseLog({ initialPurchases, csrfToken, onTotalsChange }: PurchaseLogProps) {
    const [purchases, setPurchases] = useState(initialPurchases);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [dateFilter, setDateFilter] = useState<string>("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [loading, setLoading] = useState<string | null>(null);
    const [partialReturnPurchase, setPartialReturnPurchase] = useState<PurchaseInvoiceWithItems | null>(null);
    const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
    const [voidItem, setVoidItem] = useState<{ id: string } | null>(null);
    const [showBarcodePrint, setShowBarcodePrint] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

    useEffect(() => {
        getStoreSettings().then(res => {
            if (res.success) setSettings(res.data);
        });
    }, []);
    const t_logs = useTranslations("Logs");

    const getStatusLabel = (status: string, isReturn?: boolean) => {
        if (isReturn) return "مرتجع";
        switch (status) {
            case 'PAID': return "مدفوع";
            case 'PARTIAL_RETURN': return "مرتجع جزئي";
            case 'RETURNED': return "مرتجع كلي";
            case 'VOIDED': return "ملغاة (مسترد)";
            case 'PENDING': return "قيد الانتظار";
            default: return status;
        }
    };
    const filteredPurchases = purchases.filter(p => {
        const matchesSearch =
            (p.supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (`#${p.id.slice(0, 8).toUpperCase()}`.includes(searchTerm.toUpperCase()));

        const isReturn = p.isReturn || p._isReturnEntry;
        const matchesStatus = statusFilter === "all" || 
            (statusFilter === "VOIDED" ? (isReturn || ['VOIDED', 'CANCELLED'].includes(p.status)) : p.status === statusFilter);

        let matchesDate = true;
        const date = new Date(p.purchaseDate);
        if (dateFilter === "today") {
            matchesDate = isToday(date);
        } else if (dateFilter === "yesterday") {
            matchesDate = isYesterday(date);
        } else if (dateFilter === "week") {
            matchesDate = isThisWeek(date);
        } else if (dateFilter === "month") {
            matchesDate = isThisMonth(date);
        } else if (dateFilter === "custom" && dateRange?.from) {
            if (dateRange.to) {
                matchesDate = isWithinInterval(date, {
                    start: startOfDay(dateRange.from),
                    end: endOfDay(dateRange.to)
                });
            } else {
                matchesDate = isSameDay(date, dateRange.from);
            }
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    const computedTotals = useMemo(() => ({
        actualTotal: filteredPurchases.reduce((acc, p) => {
            const isReturn = p.isReturn || p._isReturnEntry;
            if (['VOIDED', 'CANCELLED'].includes(p.status) && !isReturn) return acc;
            return acc + Number(p.totalAmount);
        }, 0),
        remaining: filteredPurchases.reduce((acc, p) => {
            const isReturn = p.isReturn || p._isReturnEntry;
            if (['VOIDED', 'CANCELLED'].includes(p.status) && !isReturn) return acc;
            return acc + (Number(p.totalAmount) - Number(p.paidAmount));
        }, 0)
    }), [filteredPurchases]);

    useEffect(() => {
        if (onTotalsChange) {
            onTotalsChange(computedTotals);
        }
    }, [computedTotals, onTotalsChange]);

    const handleDirectPrint = async (inv: any) => {
        setLoadingInvoiceId(inv.id);
        try {
            const purchaseData = {
                invoiceNumber: inv.invoiceNumber,
                supplierName: inv.supplier?.name || "N/A",
                supplierPhone: inv.supplier?.phone || "",
                supplierAddress: inv.supplier?.address || "",
                date: new Date(inv.purchaseDate),
                status: inv.status,
                items: inv.items.map((item: any) => ({
                    productId: item.productId,
                    name: item.product?.name || item.name || "N/A",
                    sku: item.product?.sku || item.sku || "N/A",
                    unitCost: Number(item.unitCost),
                    quantity: Number(item.quantity)
                })),
                totalAmount: Number(inv.totalAmount),
                paidAmount: Number(inv.paidAmount),
                deliveryCharge: Number(inv.deliveryCharge)
            };

            const html = generateA4PurchaseHTML({ purchaseData, settings });
            const registry = printService.getRegistry();
            const printer = registry?.a4Printer && registry.a4Printer !== 'none' ? registry.a4Printer : undefined;

            await printService.printHTML(html, printer, { paperWidthMm: 210 });
            toast.success("تم إرسال الفاتورة للطابعة");
        } catch (error: any) {
            toast.error(error.message || "فشل طباعة الفاتورة");
        } finally {
            setLoadingInvoiceId(null);
        }
    };

    const handleDirectBarcode = (inv: any) => {
        setSelectedPurchase(inv);
        setShowBarcodePrint(true);
    };
    const handleVoid = async (id: string, reason?: string) => {
        setLoading(id);
        try {
            const res = await voidPurchase({ id, reason: reason || undefined, csrfToken });
            if (res.success) {
                toast.success("تم إلغاء الفاتورة بنجاح");
                setPurchases(purchases.map(p => p.id === id ? { ...p, status: 'RETURNED' } : p));
            } else {
                toast.error(res.error || "فشل إلغاء الفاتورة");
            }
        } catch (error) {
            toast.error("خطأ في الخادم");
        } finally {
            setLoading(null);
        }
    };

    const exportToExcel = () => {
        toast.info("جاري تجهيز ملف إكسل للمشتريات...");
        // This would normally use a library like xlsx
    };

    const handlePartialReturnDone = (purchaseId: string, returnedAmount: number, allReturned: boolean, returnedItems: DialogItem[], newTotal: number, updatedItems: DialogItem[]) => {
        setPurchases(prev => prev.map(p => {
            if (p.id !== purchaseId) return p;
            return {
                ...p,
                status: allReturned ? 'RETURNED' : 'PARTIAL_RETURN'
                // Note: we no longer mutate totalAmount or items of the original invoice here
                // because separate return documents are now fetched/added to the list.
            };
        }));
        setPartialReturnPurchase(null);
    };

    const getStatusBadge = (status: string, total: number, paid: number, isReturn?: boolean) => {
        const numTotal = Number(total);
        const numPaid = Number(paid);
        if (isReturn || ['VOIDED', 'CANCELLED', 'RETURNED'].includes(status)) return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">
                <XCircle className="w-3 h-3" /> {isReturn ? 'فاتورة مرتجع' : (['VOIDED', 'CANCELLED'].includes(status) ? 'ملغاة (مسترد)' : 'مرتجع كلي')}
            </span>
        );

        if (status === 'PARTIAL_RETURN') return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase">
                <RotateCcw className="w-3 h-3" /> مرتجع جزئي
            </span>
        );

        if (numPaid >= numTotal) return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                <CheckCircle2 className="w-3 h-3" /> مدفوعة
            </span>
        );

        if (numPaid > 0) return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                <AlertCircle className="w-3 h-3" /> جزئية
            </span>
        );

        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 uppercase">
                <CalendarIcon className="w-3 h-3" /> آجلة
            </span>
        );
    };

    return (
        <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        placeholder="البحث بالمورد أو رقم الفاتورة..."
                        className="pl-10 h-12 glass-input border-border focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-1 bg-muted/60 p-1.5 rounded-2xl border border-border shadow-inner">
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
                                <Filter className="w-4 h-4 text-secondary" />
                                <span>تصفية المشتريات</span>
                                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 p-2 rounded-2xl bg-card border-border shadow-2xl">
                            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5">حالة التوريد</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setStatusFilter("all")} className={cn("rounded-xl h-10 px-3", statusFilter === "all" ? "bg-primary/10 text-primary font-bold" : "")}>الكل</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter("PAID")} className={cn("rounded-xl h-10 px-3", statusFilter === "PAID" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold" : "")}>مدفوعة</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter("VOIDED")} className={cn("rounded-xl h-10 px-3", statusFilter === "VOIDED" ? "bg-red-500/10 text-red-600 dark:text-red-400 font-bold" : "")}>ملغاة / مرتجع</DropdownMenuItem>
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

                {(statusFilter !== "all" || dateFilter !== "all" || searchTerm !== "") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 rounded-2xl text-red-500 hover:bg-red-500/10 shrink-0"
                        title="حذف جميع الفلاتر"
                        onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("all");
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
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">التاريخ</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">رقم الفاتورة</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">المورد</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-right px-6">الإجمالي</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-right px-6">المدفوع</TableHead>
                            <TableHead className="text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest text-center px-4">الحالة / التقييم</TableHead>
                            <TableHead className="text-left text-foreground/80 font-black py-4 text-[10px] uppercase tracking-widest px-6">الإجراءات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredPurchases.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-24">
                                    <div className="flex flex-col items-center gap-3 opacity-40">
                                        <div className="p-4 rounded-full bg-muted border border-border">
                                            <Search className="w-10 h-10" />
                                        </div>
                                        <span className="text-sm font-medium italic">لا توجد فواتير مشتريات مطابقة لمعايير البحث</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredPurchases.map((inv) => (
                                <tr key={inv.id}
                                    className={cn(
                                        "border-border hover:bg-primary/10 transition-all group cursor-pointer border-b",
                                        "even:bg-muted/70",
                                        (inv.status === 'VOIDED' || inv.status === 'CANCELLED' || inv.isReturn) && "opacity-60 bg-red-500/[0.02]",
                                        inv.isReturn && "bg-red-500/[0.04]"
                                    )}
                                    onClick={() => setSelectedPurchase(inv)}
                                >
                                    <td className="py-4 px-4 text-center text-muted-foreground text-[11px] font-medium font-mono">
                                        {format(new Date(inv.purchaseDate || inv.createdAt), 'yyyy/MM/dd HH:mm')}
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            {inv.isReturn && (
                                                <span className="text-[8px] font-black uppercase bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">
                                                    إرجاع
                                                </span>
                                            )}
                                            <div className={cn(
                                                "font-mono text-xs font-bold px-2 py-1 rounded-md", 
                                                inv.isReturn ? "bg-red-500/5 text-red-500" : "bg-secondary/10 text-secondary"
                                            )}>
                                                {inv.invoiceNumber || `#${inv.id.slice(0, 4)}...`}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <div className="font-bold text-foreground text-sm flex items-center justify-center gap-2">
                                            <Truck className="w-3.5 h-3.5 text-secondary/70" />
                                            {inv.supplier?.name || "مورد نقدي"}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        <div className={cn(
                                            "font-mono font-black text-sm px-3 py-1 rounded-lg inline-block",
                                            inv.isReturn ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-muted text-foreground'
                                        )}>
                                            {inv.totalAmount < 0 ? '-' : ''}{Math.abs(Number(inv.totalAmount)).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-right font-mono text-muted-foreground font-bold">
                                        {Math.abs(Number(inv.paidAmount)).toLocaleString()}
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        {getStatusBadge(inv.status, Number(inv.totalAmount), Number(inv.paidAmount), inv.isReturn)}
                                    </td>
                                    <td className="py-4 px-6 text-left" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex justify-start gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={loadingInvoiceId === inv.id}
                                                className="h-9 w-9 text-muted-foreground hover:bg-muted rounded-xl"
                                                title="طباعة A4"
                                                onClick={(e) => { e.stopPropagation(); handleDirectPrint(inv); }}
                                            >
                                                {loadingInvoiceId === inv.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Printer className="w-4 h-4" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-secondary hover:bg-secondary/10 rounded-xl"
                                                title="طباعة باركود"
                                                onClick={(e) => { e.stopPropagation(); handleDirectBarcode(inv); }}
                                            >
                                                <Tag className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-primary hover:bg-primary/10 rounded-xl"
                                                title="عرض التفاصيل"
                                                onClick={(e) => { e.stopPropagation(); setSelectedPurchase(inv); }}
                                            >
                                                <Package className="w-4 h-4" />
                                            </Button>
                                            {!['VOIDED', 'CANCELLED', 'RETURNED'].includes(inv.status) && !inv.isReturn && (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-orange-500 hover:bg-orange-500/10 rounded-xl"
                                                        title="مرتجع جزئي"
                                                        onClick={(e) => { e.stopPropagation(); setPartialReturnPurchase(inv); }}
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-secondary hover:bg-secondary/10 rounded-xl"
                                                        title="تعديل"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toast.info("جاري التوجيه لصفحة التعديل...");
                                                            window.location.href = `/purchasing?edit=${inv.id}`;
                                                        }}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-rose-500 hover:bg-rose-500/10 rounded-xl"
                                                        title="إلغاء كامل"
                                                        disabled={loading === inv.id}
                                                        onClick={() => setVoidItem({ id: inv.id })}
                                                    >
                                                        {loading === inv.id ? (
                                                            <div className="w-4 h-4 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
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

            {/* Void Reason Dialog */}
            <ReasonDialog
                isOpen={!!voidItem}
                onClose={() => setVoidItem(null)}
                onConfirm={(reason) => {
                    if (voidItem) handleVoid(voidItem.id, reason);
                }}
                title="سبب إلغاء فاتورة المشتريات"
                placeholder="أدخل سبب الإلغاء (اختياري)..."
            />

            {/* Partial Return Dialog */}
            <PartialReturnPurchaseDialog
                isOpen={!!partialReturnPurchase}
                onClose={() => setPartialReturnPurchase(null)}
                purchase={partialReturnPurchase}
                onReturnDone={handlePartialReturnDone}
                csrfToken={csrfToken}
            />

            {/* Details Dialog */}
            {selectedPurchase && (
                <Dialog open={!!selectedPurchase} onOpenChange={() => setSelectedPurchase(null)}>
                    <DialogContent className="sm:max-w-xl bg-card border-border text-foreground shadow-2xl rounded-3xl p-0 overflow-hidden">
                        <div className="p-8 space-y-6">
                            <DialogHeader className="pb-4 border-b border-border">
                                <DialogTitle className="flex items-center justify-between">
                                    <span className="text-2xl font-black flex items-center gap-3">
                                        <div className="p-2.5 rounded-2xl bg-secondary/10 border border-secondary/20">
                                            <FileText className="w-6 h-6 text-secondary" />
                                        </div>
                                        تفاصيل فاتورة شراء
                                    </span>
                                    <Badge variant="outline" className="border-border bg-muted/50 text-xs px-3 py-1 font-mono rounded-lg">
                                        {selectedPurchase.invoiceNumber || `#${selectedPurchase.id.slice(0, 8).toUpperCase()}`}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription className="sr-only">
                                    عرض تفاصيل فاتورة الشراء.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-1 group hover:border-secondary/30 transition-all">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">التاريخ والوقت</span>
                                    <span className="font-bold text-sm block italic">{format(new Date(selectedPurchase.purchaseDate || selectedPurchase.createdAt), 'yyyy/MM/dd HH:mm')}</span>
                                </div>
                                <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-1 group hover:border-secondary/30 transition-all">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">المورد المعتمد</span>
                                    <span className="font-bold text-sm block">{selectedPurchase.supplier?.name || "مورد نقدي"}</span>
                                </div>
                                <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-2 col-span-2 group hover:border-secondary/30 transition-all">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">موقع التخزين (المستودع)</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary/20 text-secondary font-bold text-xs uppercase">
                                            {(selectedPurchase.warehouse?.name?.[0] || 'W').toUpperCase()}
                                        </div>
                                        <span className="font-black text-lg italic">{selectedPurchase.warehouse?.name || "المستودع الافتراضي"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">الأصناف الموردة ({selectedPurchase.items?.length})</span>
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">تكلفة التوريد</span>
                                </div>
                                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {selectedPurchase.items?.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center p-4 rounded-2xl bg-muted/20 border border-border group hover:bg-muted/40 hover:border-secondary/20 transition-all">
                                            <div className="flex-1">
                                                <div className="font-black text-sm text-foreground">{item.product?.name || "صنف غير محدد"}</div>
                                                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 opacity-80">
                                                    {Number(item.quantity)} وحدة {item.unitCost ? <span className="mx-1.5 opacity-30">×</span> : ''} {item.unitCost ? Number(item.unitCost).toLocaleString() : ''}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono font-black text-secondary text-sm">
                                                    {(Number(item.quantity) * Number(item.unitCost || 0)).toLocaleString()}
                                                </div>
                                                <div className="text-[9px] font-black uppercase text-muted-foreground opacity-40">صافي التكلفة</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Summary & Totals */}
                            <div className="bg-muted/50 rounded-3xl p-6 border border-border space-y-4 shadow-inner">
                                <div className="grid grid-cols-2 gap-y-3">
                                    <div className="flex justify-between items-center text-muted-foreground text-xs px-2">
                                        <span className="font-medium opacity-60 uppercase tracking-widest text-[10px]">إجمالي الفاتورة</span>
                                        <span className="font-bold italic">{formatCurrency(Number(selectedPurchase.totalAmount))}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs px-2 border-r border-border ml-2 pl-4">
                                        <span className="font-medium text-muted-foreground opacity-60 uppercase tracking-widest text-[10px]">الحالة المالية</span>
                                        <Badge variant="outline" className={cn(
                                            "font-black text-[9px] uppercase px-2 py-0.5 rounded-md",
                                            selectedPurchase.status === 'PAID' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                        )}>
                                            {selectedPurchase.status === 'PAID' ? 'تم الدفع بالكامل' : 'مدفوع جزئياً'}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 text-xs px-2 col-span-2 pt-1 border-t border-border mt-1">
                                        <span className="font-black uppercase tracking-widest text-[10px] opacity-60">المدفوع للمورد</span>
                                        <span className="font-black">+{formatCurrency(Number(selectedPurchase.paidAmount))}</span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-border flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest text-rose-500">المبلغ الآجل (مديونية)</span>
                                        <span className="text-xs text-muted-foreground font-medium italic">القيمة المستحقة للمورد لاحقاً</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-4xl font-black font-mono tracking-tighter text-rose-600 dark:text-rose-400">
                                            {(Number(selectedPurchase.totalAmount) - Number(selectedPurchase.paidAmount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            <span className="text-xs font-bold text-muted-foreground mr-1.5 opacity-50 uppercase tracking-tighter">jod/egp</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 h-12 bg-background border-border hover:bg-muted font-black rounded-2xl gap-2 text-sm shadow-sm"
                                    onClick={() => setSelectedPurchase(null)}
                                >
                                    إغلاق النافذة
                                </Button>
                                {['VOIDED', 'CANCELLED'].includes(selectedPurchase.status) ? null : (!selectedPurchase.isReturn && (
                                    <>
                                        <Button
                                            variant="outline"
                                            className="h-12 border-secondary/20 bg-secondary/5 hover:bg-secondary/10 text-secondary font-black rounded-2xl gap-2 px-6 whitespace-nowrap text-xs shadow-sm"
                                            onClick={() => setShowBarcodePrint(true)}
                                        >
                                            <Printer className="w-4 h-4" />
                                            طباعة الباركود
                                        </Button>
                                        <Button
                                            className="flex-1 h-12 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg shadow-secondary/20 font-black rounded-2xl gap-2 text-sm"
                                            onClick={() => { setSelectedPurchase(null); setPartialReturnPurchase(selectedPurchase); }}
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            مرتجع جزئي
                                        </Button>
                                    </>
                                ))}
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Barcode Print Dialog */}
            {showBarcodePrint && selectedPurchase && (
                <BarcodePrintDialog
                    products={selectedPurchase.items.map((item: any) => ({
                        id: item.productId || item.product?.id || `temp-${item.sku}`,
                        name: item.product?.name || item.name,
                        sku: item.product?.sku || item.sku,
                        sellPrice: Number(item.sellPrice || item.product?.sellPrice || 0)
                    }))}
                    initialQuantities={selectedPurchase.items.reduce((acc: any, item: any) => {
                        const id = item.productId || item.product?.id || `temp-${item.sku}`;
                        acc[id] = Number(item.quantity);
                        return acc;
                    }, {})}
                    onClose={() => setShowBarcodePrint(false)}
                />
            )}
        </div>
    );
}
