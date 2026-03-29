'use client'

import { useState, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { Loader2, Package, Search, ExternalLink, Clock, User, HardDrive, Receipt } from "lucide-react"
import { useTranslations } from '@/lib/i18n-mock';
import { format } from "date-fns";
import { getEngineerHistory } from "@/actions/engineer-actions"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"

// Helper to get status color
const getStatusDetails = (status: string) => {
    switch (status) {
        case 'NEW': return 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30'
        case 'DIAGNOSING': return 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30'
        case 'PENDING_APPROVAL': return 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30'
        case 'IN_PROGRESS': return 'bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-indigo-500/30'
        case 'QC_PENDING': return 'bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30'
        case 'COMPLETED': return 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        case 'READY_AT_BRANCH': return 'bg-teal-500/10 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400 border-teal-500/30'
        case 'DELIVERED': case 'PAID_DELIVERED': return 'bg-slate-500/10 dark:bg-zinc-500/20 text-slate-700 dark:text-zinc-400 border-slate-500/30'
        case 'RETURNED': return 'bg-rose-500/10 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-500/30'
        case 'CANCELLED': case 'REJECTED': return 'bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30'
        default: return 'bg-slate-500/10 dark:bg-zinc-500/20 text-slate-700 dark:text-zinc-400 border-slate-500/30'
    }
}

export default function EngineerHistory({ engineerId }: { engineerId: string }) {
    const t = useTranslations('Tickets.engineers.history');
    const tList = useTranslations('Tickets.table');
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const router = useRouter();

    useEffect(() => {
        getEngineerHistory(engineerId).then(res => {
            if (res.data) setHistory(res.data);
            setLoading(false);
        });
    }, [engineerId]);

    const filteredHistory = history.filter(item => 
        item.barcode.toLowerCase().includes(search.toLowerCase()) ||
        item.customerName?.toLowerCase().includes(search.toLowerCase()) ||
        item.deviceModel?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return (
        <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
    );

    if (history.length === 0) return (
        <div className="text-center py-12 text-slate-400 dark:text-zinc-500 bg-white dark:bg-black/20 rounded-xl border border-slate-200 dark:border-white/5 font-black">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
            {t('noData')}
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Search filter consistent with other logs */}
            <div className="relative group/search max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-zinc-500 group-focus-within/search:text-cyan-500 transition-all font-black" />
                <Input
                    placeholder={t('searchPlaceholder') || "Search history..."}
                    className="pl-9 bg-white dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:border-cyan-500/50 transition-all rounded-xl h-10 font-black shadow-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="glass-card overflow-hidden rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-zinc-900/50 shadow-xl overflow-x-auto zebra-table">
                <table className="w-full text-left rtl:text-right text-sm border-collapse">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-zinc-400 uppercase font-black text-[10px] tracking-widest border-b border-slate-200 dark:border-white/10">
                        <tr>
                            <th className="px-6 py-4">{tList('status')}</th>
                            <th className="px-6 py-4">{tList('date')}</th>
                            <th className="px-6 py-4">{tList('ticketInfo')}</th>
                            <th className="px-6 py-4">{tList('customer')}</th>
                            <th className="px-6 py-4">{tList('device')}</th>
                            <th className="px-6 py-4 text-emerald-600 dark:text-emerald-400">{t('price') || 'Price'}</th>
                            <th className="px-6 py-4 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {filteredHistory.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic font-black">
                                    {t('noResults') || "No matching records found"}
                                </td>
                            </tr>
                        ) : (
                            filteredHistory.map((ticket) => (
                                <tr 
                                    key={ticket.id}
                                    onClick={() => router.push(`/ar/maintenance/tickets/${ticket.id}`)}
                                    className="transition-all cursor-pointer group"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <Badge className={`${getStatusDetails(ticket.status)} font-black text-[10px] border px-2 py-0.5 rounded-md shadow-sm`}>
                                            {t(`status.${ticket.status}`)}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-slate-900 dark:text-zinc-300 font-black">
                                                {format(new Date(ticket.completedAt || ticket.updatedAt), 'dd/MM/yyyy')}
                                            </span>
                                            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-black">
                                                {format(new Date(ticket.completedAt || ticket.updatedAt), 'HH:mm')}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 dark:bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-center">
                                                <HardDrive className="w-4 h-4 text-cyan-600 dark:text-cyan-500" />
                                            </div>
                                            <span className="font-mono text-slate-900 dark:text-zinc-200 font-black group-hover:text-cyan-600 transition-colors">
                                                #{ticket.barcode}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-black text-slate-900 dark:text-zinc-300 group-hover:text-cyan-700 dark:group-hover:text-white transition-colors capitalize">
                                                {ticket.customerName || "-"}
                                            </span>
                                            <span className="text-xs text-slate-500 dark:text-zinc-500 font-black">
                                                {ticket.customerPhone || "-"}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-slate-900 dark:text-zinc-300 font-black truncate max-w-[150px]">
                                                {ticket.deviceBrand} {ticket.deviceModel}
                                            </span>
                                            <span className="text-[10px] text-slate-500 dark:text-zinc-500 italic line-clamp-1 font-black">
                                                {ticket.issueDescription}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5 font-black text-emerald-600 dark:text-emerald-400 text-base">
                                            <Receipt className="w-3.5 h-3.5 opacity-50" />
                                            {Number(ticket.repairPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <ExternalLink className="w-4 h-4 text-slate-400 dark:text-zinc-600 group-hover:text-cyan-600 transition-all opacity-0 group-hover:opacity-100" />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

