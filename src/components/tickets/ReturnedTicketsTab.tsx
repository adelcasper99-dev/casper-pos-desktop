'use client';

import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Calendar, User, Wrench, AlertTriangle, Loader2, Search, X, ChevronDown, Filter } from 'lucide-react';
import { useTranslations, useLocale } from '@/lib/i18n-mock';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FlatpickrRangePicker } from '@/components/ui/flatpickr-range-picker';
import {
    startOfDay, endOfDay, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, subDays
} from 'date-fns';
import { DateRange } from "react-day-picker";
import { cn } from '@/lib/utils';
import { getReturnedTickets } from '@/actions/ticket-actions';

interface ReturnedTicket {
    id: string;
    barcode: string;
    customerName: string;
    customerPhone: string;
    deviceBrand: string;
    deviceModel: string;
    warrantyExpiryDate: Date | null;
    returnCount: number;
    lastReturnedAt: Date | null;
    returnReason: string | null;
    issueDescription: string;
    status: string;
    technicianName: string | null;
    createdAt: Date;
}

export default function ReturnedTicketsTab() {
    const t = useTranslations('returns');
    const tt = useTranslations('Tickets');
    const locale = useLocale();
    const [tickets, setTickets] = useState<ReturnedTicket[]>([]);
    const [loading, setLoading] = useState(true);

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    
    // Date Filtering - To match TicketsList
    const [dateFilter, setDateFilter] = useState<string>("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        fetchReturnedTickets();
    }, []);

    const fetchReturnedTickets = async () => {
        setLoading(true);
        try {
            const res = await getReturnedTickets();
            if (res.success) {
                setTickets(res.tickets || []);
            }
        } catch (error) {
            console.error('Failed to fetch returned tickets:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        console.log("Current Tickets in State:", tickets.length);
        if (tickets.length > 0) {
            console.log("Sample Ticket lastReturnedAt:", tickets[0].lastReturnedAt);
        }
    }, [tickets]);

    const isUnderWarranty = (expiryDate: Date | null) => {
        if (!expiryDate) return false;
        return new Date(expiryDate) > new Date();
    };

    // Advanced Filter Logic
    const filteredTickets = useMemo(() => {
        return tickets.filter(ticket => {
            // 1. Search Query
            const query = searchQuery.toLowerCase();
            const matchesSearch =
                ticket.customerName.toLowerCase().includes(query) ||
                ticket.customerPhone.includes(query) ||
                ticket.deviceBrand.toLowerCase().includes(query) ||
                ticket.deviceModel.toLowerCase().includes(query) ||
                ticket.barcode.toLowerCase().includes(query);

            if (!matchesSearch) return false;

            // 2. Status Filter
            const underWarranty = isUnderWarranty(ticket.warrantyExpiryDate);
            if (filterStatus === 'warranty' && !underWarranty) return false;
            if (filterStatus === 'outOfWarranty' && underWarranty) return false;

            // 3. Date Filter
            if (dateRange?.from) {
                const ticketDate = ticket.lastReturnedAt ? new Date(ticket.lastReturnedAt) : new Date(ticket.createdAt);
                const start = startOfDay(new Date(dateRange.from));
                const end = dateRange.to ? endOfDay(new Date(dateRange.to)) : endOfDay(new Date(dateRange.from));
                
                if (ticketDate < start || ticketDate > end) return false;
            }

            return true;
        });
    }, [tickets, searchQuery, filterStatus, dateRange]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t('tabTitle')}</h2>
                    <p className="text-sm text-slate-500 dark:text-zinc-500 font-bold">
                        {filteredTickets.length} أجهزة مرتجعة تم العثور عليها
                    </p>
                </div>
            </div>

            {/* Robust Filters - Aligned with TicketsList */}
            <div className="flex gap-4 items-center flex-wrap">
                <div className="relative flex-1 min-w-[300px] group/search">
                    <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within/search:text-cyan-400 transition-all pointer-events-none" />
                    <Input
                        placeholder={tt('search.placeholder')}
                        className="ps-12 solid-input h-10 bg-slate-100 dark:bg-zinc-900/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:border-cyan-500/50 transition-all font-black rounded-xl"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute end-4 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition-all active:scale-90"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900/50 p-1 rounded-lg border border-slate-200 dark:border-white/10 flex-wrap">
                    <Button
                        variant={dateFilter === "all" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md", dateFilter === "all" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-900 dark:text-zinc-400")}
                        onClick={() => {
                            setDateFilter("all");
                            setDateRange(undefined);
                        }}
                    >
                        الكل
                    </Button>
                    <Button
                        variant={dateFilter === "today" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md", dateFilter === "today" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-900 dark:text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md", dateFilter === "yesterday" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-900 dark:text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md", dateFilter === "week" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-900 dark:text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md", dateFilter === "month" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-900 dark:text-zinc-400")}
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                    >
                        الشهر
                    </Button>

                    <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />

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
                        className="w-48 bg-transparent border-0 text-xs h-8 text-zinc-300 placeholder:text-zinc-600"
                    />
                </div>

                <div className="flex gap-2 flex-wrap">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-slate-200 dark:border-white/10 gap-2 h-10 px-4 bg-slate-100 dark:bg-zinc-900/50 text-slate-900 dark:text-white font-black">
                                <Filter className="w-4 h-4" />
                                <span>{filterStatus === 'all' ? tt('filters.all') : tt(`filters.${filterStatus}`)}</span>
                                <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white">
                            <DropdownMenuLabel className="text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">حالة الضمان</DropdownMenuLabel>
                            {['all', 'warranty', 'outOfWarranty'].map(st => (
                                <DropdownMenuItem 
                                    key={st} 
                                    onClick={() => setFilterStatus(st)}
                                    className={cn("font-black", filterStatus === st ? "bg-slate-100 dark:bg-white/10" : "")}
                                >
                                    {st === 'all' ? tt('filters.all') : st === 'warranty' ? 'ضمن الضمان' : 'خارج الضمان'}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={fetchReturnedTickets} 
                        className="h-10 px-4 bg-slate-100 dark:bg-zinc-900/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/5"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Table with Zebra Styling */}
            <div className="glass-card overflow-hidden rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-black/20 shadow-xl">
                <Table className="zebra-table">
                    <TableHeader className="bg-slate-200 dark:bg-zinc-900 text-slate-950 dark:text-zinc-300 uppercase font-black text-[11px] tracking-wider border-b border-slate-300 dark:border-white/10">
                        <TableRow className="hover:bg-transparent border-slate-200 dark:border-white/5 font-black">
                            <TableHead className="w-[50px] text-center font-black">#</TableHead>
                            <TableHead className="font-black">{t('table.device')}</TableHead>
                            <TableHead className="font-black">{t('table.customer')}</TableHead>
                            <TableHead className="font-black">{t('table.returnedAt')}</TableHead>
                            <TableHead className="font-black">{t('table.reason')}</TableHead>
                            <TableHead className="font-black">{t('table.status')}</TableHead>
                            <TableHead className="font-black">{t('table.technician')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTickets.length === 0 ? (
                            <TableRow className="hover:bg-transparent border-white/5">
                                <TableCell colSpan={7} className="h-32 text-center text-zinc-500 font-medium">
                                    <div className="flex flex-col items-center gap-2">
                                        <AlertTriangle className="w-8 h-8 opacity-20" />
                                        لم يتم العثور على أجهزة مرتجعة تطابق الفلاتر المختارة
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTickets.map((ticket, index) => {
                                const underWarranty = isUnderWarranty(ticket.warrantyExpiryDate);

                                return (
                                    <TableRow
                                        key={ticket.id}
                                        className="bg-white even:bg-slate-100 dark:bg-transparent dark:even:bg-white/10 cursor-pointer hover:bg-slate-200 dark:hover:bg-white/20 transition-colors group border-slate-200 dark:border-white/5"
                                    // onClick={() => router.push(`/tickets/${ticket.id}`)} // If we want navigation
                                    >
                                        <TableCell className="text-center font-black text-xs text-slate-700 dark:text-zinc-400">
                                            {index + 1}
                                        </TableCell>
                                        <TableCell className="font-black">
                                            <div className="flex flex-col">
                                                <span className="font-black text-slate-900 dark:text-zinc-200 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors uppercase">{ticket.deviceBrand} {ticket.deviceModel}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500 dark:text-zinc-500 font-black italic">#{ticket.barcode}</span>
                                                    {ticket.returnCount > 1 && (
                                                        <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20 font-black">
                                                            {ticket.returnCount}x
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-black">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-slate-900 dark:text-zinc-300">{ticket.customerName}</span>
                                                <span className="text-xs text-slate-500 dark:text-zinc-500 font-black tracking-tight">{ticket.customerPhone}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-black">
                                            <div className="flex items-center gap-2 text-slate-700 dark:text-zinc-400 font-black">
                                                <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                                                {(() => {
                                                    const dateVal = ticket.lastReturnedAt || ticket.createdAt;
                                                    if (!dateVal) return <span className="text-sm">-</span>;
                                                    const dateObj = new Date(dateVal);
                                                    return (
                                                        <div className="flex flex-col gap-0.5 min-w-[110px]">
                                                            <span className="text-slate-900 dark:text-zinc-200 font-bold text-xs">
                                                                {dateObj.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </span>
                                                            <span className="text-[10px] text-zinc-500 dark:text-zinc-500 font-semibold flex items-center gap-1">
                                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                                                                {dateObj.toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {ticket.returnReason ? (
                                                    <div className="flex items-center gap-1.5 text-orange-400/80">
                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                        <span className="text-sm font-medium truncate max-w-[150px]" title={ticket.returnReason}>
                                                            {ticket.returnReason}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-zinc-600">-</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-black">
                                            <Badge
                                                className={cn(
                                                    "font-black border",
                                                    underWarranty
                                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                                )}
                                            >
                                                {underWarranty ? 'ضمن الضمان' : 'خارج الضمان'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {ticket.technicianName ? (
                                                <div className="flex items-center gap-2 text-purple-400/80 font-bold">
                                                    <Wrench className="w-3.5 h-3.5" />
                                                    <span className="text-sm">{ticket.technicianName}</span>
                                                </div>
                                            ) : (
                                                <span className="text-zinc-600">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
