"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { TreasuryLogEntry } from "../types";
import { ArrowDownLeft, ArrowUpRight, FileText } from "lucide-react";

interface TreasuryLogTableProps {
    entries: TreasuryLogEntry[];
    loading?: boolean;
}

export function TreasuryLogTable({ entries, loading }: TreasuryLogTableProps) {
    if (loading) {
        return (
            <div className="w-full h-64 flex items-center justify-center text-zinc-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mr-2" />
                جاري تحميل السجل...
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="w-full h-64 flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/40 rounded-xl border border-white/5">
                <FileText className="h-10 w-10 mb-2 opacity-20" />
                <p>لا توجد حركات نقدية مطابقة للمعايير المختارة.</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl overflow-hidden">
            <Table>
                <TableHeader className="bg-white/5">
                    <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-right text-zinc-400 font-bold">التاريخ والوقت</TableHead>
                        <TableHead className="text-right text-zinc-400 font-bold">التصنيف</TableHead>
                        <TableHead className="text-right text-zinc-400 font-bold">البيان / الوصف</TableHead>
                        <TableHead className="text-right text-zinc-400 font-bold">المرجع</TableHead>
                        <TableHead className="text-center text-zinc-400 font-bold">وارد (+)</TableHead>
                        <TableHead className="text-center text-zinc-400 font-bold">صادر (-)</TableHead>
                        <TableHead className="text-right text-zinc-400 font-bold bg-white/5">الرصيد</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {entries.map((entry) => (
                        <TableRow key={entry.id} className="border-white/5 hover:bg-white/5 transition-colors group">
                            <TableCell className="text-right py-4">
                                <div className="text-zinc-200 font-medium">
                                    {format(new Date(entry.createdAt), "yyyy/MM/dd")}
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                    {format(new Date(entry.createdAt), "HH:mm:ss")}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                <Badge variant="outline" className={cn(
                                    "px-2 py-0.5 border-none",
                                    entry.direction === 'IN'
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-rose-500/10 text-rose-400"
                                )}>
                                    {entry.categoryLabel}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right text-zinc-300 text-xs max-w-[200px] truncate">
                                {entry.description || "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-[11px] text-zinc-500">
                                {entry.referenceId || entry.id.substring(0, 8)}
                            </TableCell>
                            <TableCell className="text-center">
                                {entry.direction === 'IN' ? (
                                    <div className="inline-flex items-center gap-1 font-bold text-emerald-400">
                                        <ArrowDownLeft className="h-3 w-3" />
                                        <span>{entry.amount.toLocaleString()}</span>
                                    </div>
                                ) : "-"}
                            </TableCell>
                            <TableCell className="text-center">
                                {entry.direction === 'OUT' ? (
                                    <div className="inline-flex items-center gap-1 font-bold text-rose-400">
                                        <ArrowUpRight className="h-3 w-3" />
                                        <span>{entry.amount.toLocaleString()}</span>
                                    </div>
                                ) : "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-zinc-100 bg-white/5 group-hover:bg-white/10 transition-colors">
                                {entry.balanceAfter.toLocaleString()}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
