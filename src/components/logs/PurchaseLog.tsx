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
import { FlatpickrRangePicker } from '@/components/ui/flatpickr-range-picker';
import { toast } from 'sonner';
import {
    format, isToday, isYesterday, isThisWeek, isThisMonth, isSameDay,
    isWithinInterval, startOfDay, endOfDay, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, subDays
} from 'date-fns';
import { voidPurchase } from '@/actions/purchase-actions';
import { cn } from '@/lib/utils';
import { DateRange } from "react-day-picker"
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
    const [voidItem, setVoidItem] = useState<{ id: string } | null>(null);

    const filteredPurchases = purchases.filter(p => {
        const matchesSearch =
            (p.supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (`#${p.id.slice(0, 8).toUpperCase()}`.includes(searchTerm.toUpperCase()));

        const matchesStatus = statusFilter === "all" || p.status === statusFilter;

        let matchesDate = true;
        const date = new Date(p.purchaseDate);
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

        return matchesSearch && matchesStatus && matchesDate;
    });

    const computedTotals = {
        actualTotal: filteredPurchases.filter(p => p.status !== 'VOIDED').reduce((acc, p) => acc + p.totalAmount, 0),
        remaining: filteredPurchases.filter(p => p.status !== 'VOIDED').reduce((acc, p) => acc + (p.totalAmount - p.paidAmount), 0)
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
                setPurchases(purchases.map(p => p.id === id ? { ...p, status: 'VOIDED' } : p));
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
                status: allReturned ? 'VOIDED' : 'PARTIAL_RETURN',
                totalAmount: newTotal,
                items: updatedItems
            };
        }));
        setPartialReturnPurchase(null);
    };

    const getStatusBadge = (status: string, total: number, paid: number) => {
        if (status === 'VOIDED') return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">
                <XCircle className="w-3 h-3" /> مرتجع كامل
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
                                <tr key={inv.id} className={`border-white/5 hover:bg-white/5 transition-colors group ${inv.status === 'VOIDED' ? 'opacity-50' : ''}`}>
                                    <td className="py-2 px-4 text-zinc-400 text-xs text-nowrap">
                                        {format(new Date(inv.purchaseDate), 'yyyy/MM/dd HH:mm')}
                                    </td>
                                    <td className="py-2 px-4">
                                        <div className="font-mono text-indigo-400/80 text-xs font-bold">
                                            {inv.invoiceNumber || `#${inv.id.slice(0, 4)}...`}
                                        </div>
                                    </td>
                                    <td className="py-2 px-4 font-bold text-zinc-100 flex items-center gap-2">
                                        <Truck className="w-3 h-3 text-indigo-400" />
                                        {inv.supplier?.name}
                                    </td>
                                    <td className="py-2 px-4 text-right font-mono font-bold text-cyan-400">
                                        {inv.totalAmount.toLocaleString()}
                                    </td>
                                    <td className="py-2 px-4 text-right font-mono text-zinc-400">
                                        {inv.paidAmount.toLocaleString()}
                                    </td>
                                    <td className="py-2 px-4 text-center">
                                        {getStatusBadge(inv.status, inv.totalAmount, inv.paidAmount)}
                                    </td>
                                    <td className="py-2 px-4 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-indigo-400 hover:bg-indigo-400/10"
                                                title="عرض الأصناف"
                                            >
                                                <Package className="w-4 h-4" />
                                            </Button>
                                            {inv.status !== 'VOIDED' && (
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
        </div>
    );
}
