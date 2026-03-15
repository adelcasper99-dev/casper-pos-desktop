'use client';

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
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
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

export function MaintenanceProfitTable({ tickets }: TableProps) {
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
            case 'high': return 'bg-rose-500/20 text-rose-400 border-rose-500/20';
            case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/20';
            default: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20';
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
            <Badge variant="outline" className="text-[10px] bg-zinc-800/50 border-white/5 text-zinc-400 px-2 py-0.5">
                {labels[status] || status}
            </Badge>
        );
    };

    return (
        <div className="relative group rounded-2xl overflow-hidden border border-white/5 bg-zinc-900/30 backdrop-blur-xl shadow-2xl shadow-black/50">
            <Table>
                <TableHeader className="bg-zinc-900/80">
                    <TableRow className="hover:bg-transparent border-white/5">
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest py-4">رقم التذكرة</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">التاريخ</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">العميل</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">المهندس</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">الإيراد</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">تكلفة القطع</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">العمولة</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-cyan-500 uppercase tracking-widest">صافي الربح</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">التأخير</TableHead>
                        <TableHead className="text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">المخاطر</TableHead>
                        <TableHead className="text-center text-[10px] font-bold text-zinc-500 uppercase tracking-widest">الحالة</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {tickets.map((ticket) => (
                        <TableRow key={ticket.id} className="hover:bg-white/[0.02] border-white/5 transition-all group/row">
                            <TableCell className="font-bold">
                                <Link 
                                    href={`/ar/maintenance/tickets/${ticket.id}`}
                                    className="text-cyan-500 hover:text-cyan-400 underline-offset-4 hover:underline flex items-center gap-2"
                                >
                                    <div className="w-1.5 h-6 bg-cyan-500/50 rounded-full opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    {ticket.barcode}
                                </Link>
                            </TableCell>
                            <TableCell className="text-[11px] text-zinc-500 font-mono">
                                {format(new Date(ticket.date), 'yyyy-MM-dd hh:mm a')}
                            </TableCell>
                            <TableCell className="text-sm font-bold text-zinc-200">{ticket.customerName}</TableCell>
                            <TableCell className="text-[11px] text-zinc-400">{ticket.technicianName}</TableCell>
                            <TableCell className="font-bold text-zinc-200">{formatCurrency(ticket.revenue)}</TableCell>
                            <TableCell className="text-rose-400 text-[11px] font-medium opacity-80">-{formatCurrency(ticket.partsCost)}</TableCell>
                            <TableCell className="text-fuchsia-400 text-[11px] font-medium opacity-80">-{formatCurrency(ticket.commission)}</TableCell>
                            <TableCell>
                                <div className="font-black text-cyan-400 text-sm">
                                    {formatCurrency(ticket.netProfit)}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono bg-zinc-800/30 w-fit px-2 py-1 rounded-lg">
                                    <Clock className="w-3 h-3 text-zinc-600" />
                                    {ticket.gap}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge className={cn("border px-2 py-0.5 text-[10px] font-bold rounded-lg", getRiskColor(ticket.riskLevel))}>
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
