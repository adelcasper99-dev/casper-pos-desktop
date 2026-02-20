'use client';

import { useState } from 'react';
import {
    Search, Filter, Eye, RotateCcw,
    User, CreditCard,
    ChevronLeft, ChevronRight, FileText,
    CheckCircle2, XCircle, AlertCircle,
    ChevronDown, CalendarCheck2,
    Calendar as CalendarIcon
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
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
import { cn } from '@/lib/utils';
import { DateRange } from "react-day-picker"

interface SalesLogProps {
    initialSales: any[];
}

export default function SalesLog({ initialSales }: SalesLogProps) {
    const [activeTab, setActiveTab] = useState("sales");
    const [sales, setSales] = useState(initialSales);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [paymentFilter, setPaymentFilter] = useState<string>("all");
    const [dateFilter, setDateFilter] = useState<string>("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedSale, setSelectedSale] = useState<any>(null);
    const [loading, setLoading] = useState<string | null>(null);

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

    const handleRefund = async (saleId: string) => {
        const reason = prompt("سبب الارتجاع (اختياري):");
        if (reason === null) return;

        setLoading(saleId);
        try {
            const res = await refundSale({ saleId, reason: reason || undefined });
            if (res.success) {
                toast.success("تم تنفيذ المرتجع بنجاح");
                setSales(sales.map(s => s.id === saleId ? { ...s, status: 'REFUNDED' } : s));
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
                                <tr key={sale.id} className="border-white/5 hover:bg-white/5 transition-colors group">
                                    <td className="py-2 px-4">
                                        <div className="font-mono text-cyan-500/80 text-xs">
                                            #{sale.id.slice(0, 8).toUpperCase()}
                                        </div>
                                    </td>
                                    <td className="py-2 px-4 text-zinc-300 text-xs">
                                        {format(new Date(sale.createdAt), 'yyyy/MM/dd HH:mm')}
                                    </td>
                                    <td className="py-2 px-4 font-bold text-zinc-100 italic">
                                        {sale.customerName || "عميل نقدي"}
                                    </td>
                                    <td className="py-2 px-4 font-mono font-bold text-zinc-100">
                                        {sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-4">
                                        <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 font-bold uppercase">
                                            {sale.paymentMethod}
                                        </Badge>
                                    </td>
                                    <td className="py-2 px-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${sale.status === 'REFUNDED'
                                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            }`}>
                                            {sale.status === 'REFUNDED' ? 'مرتجع' : 'مدفوع'}
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
                                            {sale.status !== 'REFUNDED' && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-red-400 hover:bg-red-400/10"
                                                    disabled={loading === sale.id}
                                                    onClick={() => handleRefund(sale.id)}
                                                >
                                                    {loading === sale.id ? (
                                                        <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                                    ) : (
                                                        <RotateCcw className="w-4 h-4" />
                                                    )}
                                                </Button>
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
                                    <Button
                                        className="w-full h-12 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl mt-4 gap-2 shadow-lg shadow-red-900/20"
                                        onClick={() => handleRefund(selectedSale.id)}
                                        disabled={loading === selectedSale.id}
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        {loading === selectedSale.id ? "جاري المعالجة..." : "عمل مرتجع للفاتورة"}
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
