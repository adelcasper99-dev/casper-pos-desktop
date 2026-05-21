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
    revenue: number | string;
    partsCost: number | string;
    commission: number | string;
    netProfit: number | string;
    gap: string;
    issueDescription: string;
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
                aValue = new Date(aValue).getTime() as any;
                bValue = new Date(bValue).getTime() as any;
            } else if (['revenue', 'partsCost', 'commission', 'netProfit'].includes(sortBy)) {
                aValue = Number(aValue) as any;
                bValue = Number(bValue) as any;
            }

            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [tickets, sortBy, sortOrder]);

    if (tickets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 bg-muted/20 border-2 border-dashed border-border rounded-3xl backdrop-blur-sm">
                <div className="p-4 bg-muted/50 rounded-full mb-4">
                    <AlertCircle className="w-10 h-10 text-muted-foreground/40" />
                </div>
                <p className="text-foreground font-black text-lg">لا توجد تذاكر مطابقة لهذه الفلاتر</p>
                <p className="text-muted-foreground text-sm font-medium">جرب تغيير الفلاتر أو البحث عن عميل آخر</p>
            </div>
        );
    }



    const getStatusBadge = (status: string) => {
        const labels: Record<string, string> = {
            'DELIVERED': 'تم التسليم',
            'PAID_DELIVERED': 'مسلم ومدفوع',
            'CLOSED': 'مغلق',
            'PICKED_UP': 'تم الاستلام'
        };
        return (
            <Badge variant="outline" className="text-[10px] bg-muted/30 border-border text-muted-foreground px-2 py-1 font-black tracking-tighter uppercase whitespace-nowrap">
                {labels[status] || status}
            </Badge>
        );
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortBy !== column) return <ChevronDown className="w-3 h-3 opacity-20" />;
        return sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
    };

    return (
        <div className="glass-card rounded-2xl overflow-hidden border border-border bg-card/50 backdrop-blur-xl shadow-2xl transition-all duration-300">
            <Table>
                <TableHeader className="bg-muted/60">
                    <TableRow className="hover:bg-transparent border-border h-14">
                        <TableHead className="text-right py-4 cursor-pointer hover:bg-muted/50 transition-colors group/head" onClick={() => handleSort('barcode')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-foreground/80 uppercase tracking-widest">
                                <SortIcon column="barcode" />
                                رقم التذكرة
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group/head" onClick={() => handleSort('date')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-foreground/80 uppercase tracking-widest">
                                <SortIcon column="date" />
                                التاريخ
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group/head" onClick={() => handleSort('customerName')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-foreground/80 uppercase tracking-widest">
                                <SortIcon column="customerName" />
                                العميل
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group/head" onClick={() => handleSort('revenue')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-foreground/80 uppercase tracking-widest">
                                <SortIcon column="revenue" />
                                الإيراد
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group/head" onClick={() => handleSort('partsCost')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-foreground/80 uppercase tracking-widest">
                                <SortIcon column="partsCost" />
                                تكلفة القطع
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group/head" onClick={() => handleSort('commission')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-foreground/80 uppercase tracking-widest">
                                <SortIcon column="commission" />
                                العمولة
                            </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group/head" onClick={() => handleSort('netProfit')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest">
                                <SortIcon column="netProfit" />
                                صافي الربح
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-black text-foreground/80 uppercase tracking-widest">التأخير</TableHead>
                        <TableHead className="text-right text-[10px] font-black text-foreground/80 uppercase tracking-widest">العطل</TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group/head" onClick={() => handleSort('technicianName')}>
                            <div className="flex items-center gap-2 text-[10px] font-black text-foreground/80 uppercase tracking-widest">
                                <SortIcon column="technicianName" />
                                المهندس
                            </div>
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-black text-foreground/80 uppercase tracking-widest">الحالة</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="bg-transparent">
                    {sortedTickets.map((ticket) => (
                        <TableRow 
                            key={ticket.id} 
                            className={cn(
                                "border-border transition-all group/row h-14 hover:bg-primary/10",
                                "even:bg-muted/70"
                            )}
                        >
                            <TableCell className="font-mono">
                                <Link 
                                    href={`/ar/maintenance/tickets/${ticket.id}`}
                                    className="text-primary hover:text-primary/80 underline-offset-4 hover:underline flex items-center gap-2 group/link"
                                >
                                    <div className="w-1 h-6 bg-primary/50 rounded-full opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    <span className="font-black tracking-tighter">{ticket.barcode}</span>
                                </Link>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground font-mono font-medium">
                                <div className="flex items-center gap-1.5 opacity-80">
                                    <Calendar className="w-3 h-3 opacity-50" />
                                    {format(new Date(ticket.date), 'yyyy-MM-dd | HH:mm')}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center">
                                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="text-sm font-black text-foreground group-hover/row:text-primary transition-colors uppercase">
                                        {ticket.customerName}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="font-mono font-black text-sm text-foreground/90">{formatCurrency(Number(ticket.revenue))}</TableCell>
                            <TableCell className="text-rose-600 dark:text-rose-400/80 font-mono text-[11px] font-black">-{formatCurrency(Number(ticket.partsCost))}</TableCell>
                            <TableCell className="text-fuchsia-600 dark:text-fuchsia-400/80 font-mono text-[11px] font-black">-{formatCurrency(Number(ticket.commission))}</TableCell>
                            <TableCell>
                                <div className="font-black text-primary text-sm font-mono flex items-center gap-1.5">
                                    <Wallet className="w-3.5 h-3.5 opacity-30" />
                                    {formatCurrency(Number(ticket.netProfit))}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono bg-muted/50 w-fit px-2.5 py-1.5 rounded-lg border border-border group-hover/row:border-primary/30 transition-colors shadow-inner font-bold">
                                    <Clock className="w-3 h-3 text-muted-foreground/50" />
                                    {ticket.gap}
                                </div>
                            </TableCell>
                             <TableCell>
                                <div className="text-[10px] font-black text-muted-foreground truncate max-w-[120px]" title={ticket.issueDescription}>
                                    {ticket.issueDescription}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-bold">
                                    <Wrench className="w-3.5 h-3.5 opacity-30" />
                                    {ticket.technicianName}
                                </div>
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
