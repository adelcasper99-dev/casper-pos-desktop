'use client';

import React, { useState, useMemo } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";
import { AlertCircle, ChevronUp, ChevronDown, Clock, Calendar, User, Wrench, Wallet, TrendingUp } from "lucide-react";
import Link from "next/link";

interface TicketData {
    id: string;
    barcode: string;
    date: Date;
    customerName: string;
    technicianName: string;
    revenue: number;
    partsCost: number;
    commission: number;
    netProfit: number;
    gap: string;
    riskLevel: string;
    status: string;
}

interface TableProps {
    tickets: TicketData[];
}

type SortKey = 'date' | 'barcode' | 'customerName' | 'technicianName' | 'revenue' | 'partsCost' | 'commission' | 'netProfit';

export function MaintenanceProfitTable({ tickets }: TableProps) {
    const [sortBy, setSortBy] = useState<SortKey>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const handleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('asc');
        }
    };

    const sortedTickets = useMemo(() => {
        return [...tickets].sort((a, b) => {
            let aValue = a[sortBy];
            let bValue = b[sortBy];

            if (sortBy === 'date') {
                aValue = new Date(aValue).getTime();
                bValue = new Date(bValue).getTime();
            }

            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [tickets, sortBy, sortOrder]);

    if (tickets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 bg-zinc-900/20 border-2 border-dashed border-white/5 rounded-3xl backdrop-blur-sm">
                <div className="p-4 bg-zinc-900/50 rounded-full mb-4">
                    <AlertCircle className="w-10 h-10 text-zinc-700" />
                </div>
                <p className="text-zinc-500 font-bold text-lg">لا توجد تذاكر مطابقة لهذه الفلاتر</p>
                <p className="text-zinc-600 text-sm">جرب تغيير الفلاتر أو البحث عن عميل آخر</p>
            </div>
        );
    }

    const getRiskColor = (level: string) => {
        switch (level) {
            case 'high': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            default: return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        }
    };

    const getStatusBadge = (status: string) => {
        const labels: Record<string, string> = {
            'DELIVERED': 'تم التسليم',
            'PAID_DELIVERED': 'مسلم ومدفوع',
            'CLOSED': 'مغلق',
            'PICKED_UP': 'تم الاستلام'
        };
        return (
            <Badge variant="outline" className="text-[10px] bg-zinc-900/50 border-white/5 text-zinc-400 px-2 py-0.5 font-bold tracking-tighter">
                {labels[status] || status}
            </Badge>
        );
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortBy !== column) return <ChevronDown className="w-3 h-3 opacity-20" />;
        return sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-cyan-400" /> : <ChevronDown className="w-3 h-3 text-cyan-400" />;
    };

    return (
        <div className="relative group rounded-2xl overflow-hidden border border-white/5 bg-zinc-900/10 backdrop-blur-xl shadow-2xl shadow-black/50">
            <Table>
                <TableHeader className="bg-white/5">
                    <TableRow className="hover:bg-transparent border-white/5 h-14">
                        <TableHead className="text-right py-4 cursor-pointer hover:bg-white/5 transition-colors group/head" onClick={() => handleSort('barcode')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                <SortIcon column="barcode" />
                                رقم التذكرة
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head" onClick={() => handleSort('date')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                <SortIcon column="date" />
                                التاريخ
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head" onClick={() => handleSort('customerName')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                <SortIcon column="customerName" />
                                العميل
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head" onClick={() => handleSort('technicianName')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                <SortIcon column="technicianName" />
                                المهندس
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head" onClick={() => handleSort('revenue')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                <SortIcon column="revenue" />
                                الإيراد
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head" onClick={() => handleSort('partsCost')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                <SortIcon column="partsCost" />
                                تكلفة القطع
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head" onClick={() => handleSort('commission')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                <SortIcon column="commission" />
                                العمولة
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-white/5 transition-colors group/head" onClick={() => handleSort('netProfit')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-cyan-500 uppercase tracking-widest">
                                <SortIcon column="netProfit" />
                                صافي الربح
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">التأخير</TableHead>
                        <TableHead className="text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">المخاطر</TableHead>
                        <TableHead className="text-center text-[10px] font-black text-zinc-500 uppercase tracking-widest">الحالة</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-white/5 bg-[#0a0a0a]/40">
                    {sortedTickets.map((ticket) => (
                        <TableRow key={ticket.id} className="hover:bg-white/[0.02] even:bg-white/[0.03] border-white/5 transition-all group/row h-14">
                            <TableCell className="font-mono">
                                <Link 
                                    href={`/ar/maintenance/tickets/${ticket.id}`}
                                    className="text-cyan-500 hover:text-cyan-400 underline-offset-4 hover:underline flex items-center gap-2 group/link"
                                >
                                    <div className="w-1 h-6 bg-cyan-500/50 rounded-full opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    <span className="font-black tracking-tighter">{ticket.barcode}</span>
                                </Link>
                            </TableCell>
                            <TableCell className="text-[11px] text-zinc-500 font-mono">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3 h-3 opacity-30" />
                                    {format(new Date(ticket.date), 'yyyy-MM-dd | HH:mm')}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center">
                                        <User className="w-3.5 h-3.5 text-zinc-600" />
                                    </div>
                                    <div className="text-sm font-black text-white group-hover/row:text-cyan-400 transition-colors uppercase">
                                        {ticket.customerName}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-bold">
                                    <Wrench className="w-3 h-3 opacity-30" />
                                    {ticket.technicianName}
                                </div>
                            </TableCell>
                            <TableCell className="font-mono font-bold text-zinc-200">{formatCurrency(ticket.revenue)}</TableCell>
                            <TableCell className="text-rose-400/80 font-mono text-[11px] font-black">-{formatCurrency(ticket.partsCost)}</TableCell>
                            <TableCell className="text-fuchsia-400/80 font-mono text-[11px] font-black">-{formatCurrency(ticket.commission)}</TableCell>
                            <TableCell>
                                <div className="font-black text-cyan-400 text-sm font-mono flex items-center gap-1.5">
                                    <Wallet className="w-3.5 h-3.5 opacity-30" />
                                    {formatCurrency(ticket.netProfit)}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono bg-zinc-900/50 w-fit px-2.5 py-1.5 rounded-lg border border-white/5 group-hover/row:border-zinc-700/50 transition-colors shadow-inner">
                                    <Clock className="w-3 h-3 text-zinc-700" />
                                    {ticket.gap}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge className={cn("border px-2.5 py-1 text-[10px] font-black rounded-lg uppercase tracking-tighter shadow-sm", getRiskColor(ticket.riskLevel))}>
                                    {ticket.riskLevel === 'high' ? 'عالي الخطورة' : ticket.riskLevel === 'medium' ? 'متوسط' : 'آمن'}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                                {getStatusBadge(ticket.status)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
