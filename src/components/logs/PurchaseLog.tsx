'use client';

import { useState, useEffect } from 'react';
import {
    Search, Filter, Eye, Pencil,
    Trash2, Truck,
    ChevronLeft, ChevronRight, FileText,
    CheckCircle2, XCircle, AlertCircle,
    Package, ArrowUpRight, ChevronDown,
    Calendar as CalendarIcon, RotateCcw
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
    DialogTitle, DialogFooter
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
import PartialReturnPurchaseDialog from './PartialReturnPurchaseDialog';
import { ReasonDialog } from '@/components/ui/ReasonDialog';

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
    const [partialReturnPurchase, setPartialReturnPurchase] = useState<any>(null);
    const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
    const [voidItem, setVoidItem] = useState<{ id: string } | null>(null);
    const t_logs = useTranslations("Logs");

    const getStatusLabel = (status: string, isReturn?: boolean) => {
        if (isReturn) return "مرتجع";
        switch (status) {
            case 'PAID': return "مدفوع";
            case 'PARTIAL_RETURN': return "مرتجع جزئي";
            case 'RETURNED': return "مرتجع كلي";
            case 'VOIDED': return "ملغي";
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
            (statusFilter === "VOIDED" ? (isReturn || p.status === 'VOIDED') : p.status === statusFilter);

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

    const computedTotals = {
        actualTotal: filteredPurchases.reduce((acc, p) => {
            const isReturn = p.isReturn || p._isReturnEntry;
            if (p.status === 'VOIDED' && !isReturn) return acc;
            return acc + Number(p.totalAmount);
        }, 0),
        remaining: filteredPurchases.reduce((acc, p) => {
            const isReturn = p.isReturn || p._isReturnEntry;
            if (p.status === 'VOIDED' && !isReturn) return acc;
            return acc + (Number(p.totalAmount) - Number(p.paidAmount));
        }, 0)
    };

    useEffect(() => {
        if (onTotalsChange) {
            onTotalsChange(computedTotals);
        }
    }, [computedTotals.actualTotal, computedTotals.remaining]);

    const handleVoid = async (id: string, reason?: string) => {
        if (!confirm("هل أنت متأكد من إلغاء هذه الفاتورة؟ سيتم سحب الكميات من المخزن وتعديل مديونية المورد.")) return;

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

    const handlePartialReturnDone = (purchaseId: string, returnedAmount: number, allReturned: boolean, returnedItems: any[], newTotal: number, updatedItems: any[]) => {
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
        if (isReturn || status === 'VOIDED' || status === 'RETURNED') return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">
                <XCircle className="w-3 h-3" /> {isReturn ? 'فاتورة مرتجع' : (status === 'VOIDED' ? 'ملغاة' : 'مرتجع كلي')}
            </span>
        );

        if (status === 'PARTIAL_RETURN') return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase">
                <RotateCcw className="w-3 h-3" /> مرتجع جزئي
            </span>
        );

        if (paid >= total) return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                <CheckCircle2 className="w-3 h-3" /> مدفوعة
            </span>
        );

        if (paid > 0) return (
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
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="البحث بالمورد أو رقم الفاتورة..."
                        className="pl-10 h-10 bg-zinc-900/50 border-white/10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-white/10">
                    <Button
                        variant={dateFilter === "today" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "today" ? "bg-indigo-500 text-white hover:bg-indigo-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "yesterday" ? "bg-indigo-500 text-white hover:bg-indigo-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "week" ? "bg-indigo-500 text-white hover:bg-indigo-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "month" ? "bg-indigo-500 text-white hover:bg-indigo-400" : "text-zinc-400")}
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
                        <DropdownMenuItem onClick={() => setStatusFilter("PAID")} className={statusFilter === "PAID" ? "bg-white/10" : ""}>مدفوعة</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusFilter("VOIDED")} className={statusFilter === "VOIDED" ? "bg-white/10 text-rose-400" : ""}>ملغاة / مرتجع</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {(statusFilter !== "all" || dateFilter !== "all" || searchTerm !== "") && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-500 hover:text-white"
                        onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("all");
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
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">التاريخ</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">رقم الفاتورة</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">المورد</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider text-right">الإجمالي</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider text-right">المدفوع</TableHead>
                            <TableHead className="text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider text-center">الحالة / التقييم</TableHead>
                            <TableHead className="text-right text-zinc-400 font-bold py-3 text-xs uppercase tracking-wider">الإجراءات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredPurchases.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-20 text-zinc-500 italic">
                                    لا توجد فواتير مشتريات مطابقة
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredPurchases.map((inv) => (
                                <tr key={inv.id}
                                    className={cn(
                                        "border-white/5 hover:bg-white/5 transition-colors group cursor-pointer",
                                        (inv.status === 'VOIDED' || inv.isReturn) && "opacity-60",
                                        inv.isReturn && "bg-rose-500/5 border-l-2 border-l-rose-500/40"
                                    )}
                                    onClick={() => setSelectedPurchase(inv)}
                                >
                                    <td className="py-2 px-4 text-zinc-400 text-xs text-nowrap">
                                        {format(new Date(inv.purchaseDate), 'yyyy/MM/dd HH:mm')}
                                    </td>
                                    <td className="py-2 px-4">
                                        <div className="flex flex-col gap-0.5">
                                            {inv.isReturn && (
                                                <span className="text-[9px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1">
                                                    ↩ مرتجع شراء
                                                </span>
                                            )}
                                            <div className={cn("font-mono text-xs font-bold", inv.isReturn ? "text-rose-400/80" : "text-indigo-400/80")}>
                                                {inv.invoiceNumber || `#${inv.id.slice(0, 4)}...`}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-2 px-4 font-bold text-zinc-100 flex items-center gap-2">
                                        <Truck className="w-3 h-3 text-indigo-400" />
                                        {inv.supplier?.name}
                                    </td>
                                    <td className={`py-2 px-4 text-right font-mono font-bold ${inv.isReturn ? 'text-rose-400' : 'text-cyan-400'}`}>
                                        {inv.totalAmount < 0 ? '-' : ''}{Math.abs(Number(inv.totalAmount)).toLocaleString()}
                                    </td>
                                    <td className="py-2 px-4 text-right font-mono text-zinc-400">
                                        {Math.abs(Number(inv.paidAmount)).toLocaleString()}
                                    </td>
                                    <td className="py-2 px-4 text-center">
                                        {getStatusBadge(inv.status, Number(inv.totalAmount), Number(inv.paidAmount), inv.isReturn)}
                                    </td>
                                    <td className="py-2 px-4 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-indigo-400 hover:bg-indigo-400/10"
                                                title="عرض الأصناف"
                                                onClick={() => setSelectedPurchase(inv)}
                                            >
                                                <Package className="w-4 h-4" />
                                            </Button>
                                            {inv.status !== 'VOIDED' && !inv.isReturn && (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-orange-400 hover:bg-orange-400/10"
                                                        title="مرتجع جزئي"
                                                        onClick={() => setPartialReturnPurchase(inv)}
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-cyan-400 hover:bg-cyan-400/10"
                                                        title="تعديل"
                                                        onClick={() => {
                                                            // Navigation to edit mode in Purchasing Tab
                                                            toast.info("جاري التوجيه لصفحة التعديل...");
                                                            window.location.href = `/purchasing?edit=${inv.id}`;
                                                        }}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-rose-400 hover:bg-rose-400/10"
                                                        title="إلغاء كامل"
                                                        disabled={loading === inv.id}
                                                        onClick={() => setVoidItem({ id: inv.id })}
                                                    >
                                                        {loading === inv.id ? (
                                                            <div className="w-4 h-4 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" />
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
                    <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10 text-white">
                        <DialogHeader className="pb-2">
                            <DialogTitle className="flex items-center justify-between">
                                <span className="text-xl font-bold flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-indigo-400" />
                                    تفاصيل فاتورة الشراء
                                </span>
                                <Badge variant="outline" className="border-white/10 text-xs">
                                    {selectedPurchase.invoiceNumber || `#${selectedPurchase.id.slice(0, 8).toUpperCase()}`}
                                </Badge>
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4 text-sm bg-white/5 p-4 rounded-xl border border-white/5">
                                <div className="space-y-1">
                                    <span className="text-zinc-400 text-xs block">التاريخ</span>
                                    <span className="font-bold">{format(new Date(selectedPurchase.purchaseDate), 'yyyy/MM/dd HH:mm')}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-zinc-400 text-xs block">المورد</span>
                                    <span className="font-bold">{selectedPurchase.supplier?.name}</span>
                                </div>
                                <div className="space-y-1 col-span-2 border-t border-white/5 pt-2">
                                    <span className="text-zinc-400 text-xs block">المستودع</span>
                                    <span className="font-bold">{selectedPurchase.warehouse?.name || "المستودع الافتراضي"}</span>
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="space-y-2">
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest pb-1 block">الأصناف المشتراة</span>
                                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {selectedPurchase.items?.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5 group hover:border-indigo-500/30 transition-colors">
                                            <div className="flex-1">
                                                <div className="font-bold text-sm text-zinc-100">{item.product?.name || "منتج غير معروف"}</div>
                                                <div className="text-[10px] text-zinc-500 font-mono italic">
                                                    {item.quantity} {item.unitCost ? `x ${Number(item.unitCost).toLocaleString()}` : ''}
                                                </div>
                                            </div>
                                            <div className="font-mono font-bold text-indigo-400 text-sm">
                                                {(item.quantity * Number(item.unitCost || 0)).toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Totals */}
                            <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
                                <div className="flex justify-between text-zinc-400 text-xs">
                                    <span>الإجمالي</span>
                                    <span className="font-bold">{formatCurrency(selectedPurchase.totalAmount)}</span>
                                </div>
                                <div className="flex justify-between text-emerald-400 text-xs">
                                    <span>المدفوع</span>
                                    <span className="font-bold">{formatCurrency(selectedPurchase.paidAmount)}</span>
                                </div>
                                <div className="flex justify-between text-rose-400 text-xs font-bold border-t border-white/5 pt-2">
                                    <span>المتبقي</span>
                                    <span>{formatCurrency(Number(selectedPurchase.totalAmount) - Number(selectedPurchase.paidAmount))}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-4">
                                <Button
                                    variant="outline"
                                    className="flex-1 h-10 border-white/10 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl gap-2"
                                    onClick={() => setSelectedPurchase(null)}
                                >
                                    إغلاق
                                </Button>
                                {selectedPurchase.status !== 'VOIDED' && !selectedPurchase.isReturn && (
                                    <Button
                                        className="flex-1 h-10 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl gap-2"
                                        onClick={() => { setSelectedPurchase(null); setPartialReturnPurchase(selectedPurchase); }}
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        مرتجع جزئي
                                    </Button>
                                )}
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
