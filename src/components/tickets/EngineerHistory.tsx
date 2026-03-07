'use client'

import { useState, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { Loader2, PenTool, CheckCircle, Package, Receipt, RotateCcw, MonitorPlay, AlertTriangle, PlayCircle } from "lucide-react"
import { useTranslations } from '@/lib/i18n-mock';
import { format } from "date-fns";
import { getEngineerHistory } from "@/actions/engineer-actions"

// Helper to get status color and icon
function getStatusDetails(status: string) {
    switch (status) {
        case 'NEW': return { color: 'bg-blue-500/20 text-blue-500', icon: <Package className="w-4 h-4" /> }
        case 'DIAGNOSING': return { color: 'bg-purple-500/20 text-purple-500', icon: <PenTool className="w-4 h-4" /> }
        case 'PENDING_APPROVAL': return { color: 'bg-amber-500/20 text-amber-500', icon: <AlertTriangle className="w-4 h-4" /> }
        case 'IN_PROGRESS': return { color: 'bg-indigo-500/20 text-indigo-500', icon: <PlayCircle className="w-4 h-4" /> }
        case 'QC_PENDING': return { color: 'bg-cyan-500/20 text-cyan-500', icon: <MonitorPlay className="w-4 h-4" /> }
        case 'COMPLETED': return { color: 'bg-emerald-500/20 text-emerald-500', icon: <CheckCircle className="w-4 h-4" /> }
        case 'READY_AT_BRANCH': return { color: 'bg-teal-500/20 text-teal-500', icon: <Package className="w-4 h-4" /> }
        case 'DELIVERED': case 'PAID_DELIVERED': return { color: 'bg-gray-500/20 text-gray-400', icon: <Receipt className="w-4 h-4" /> }
        case 'RETURNED': return { color: 'bg-rose-500/20 text-rose-500', icon: <RotateCcw className="w-4 h-4" /> }
        case 'CANCELLED': case 'REJECTED': return { color: 'bg-red-500/20 text-red-500 border-red-500/30', icon: <AlertTriangle className="w-4 h-4" /> }
        default: return { color: 'bg-zinc-500/20 text-zinc-400', icon: <Package className="w-4 h-4" /> }
    }
}

export default function EngineerHistory({ engineerId }: { engineerId: string }) {
    const t = useTranslations('Tickets.engineers.history');
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getEngineerHistory(engineerId).then(res => {
            if (res.data) setHistory(res.data);
            setLoading(false);
        });
    }, [engineerId]);

    if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-400" /></div>;
    if (history.length === 0) return <div className="text-center py-8 text-zinc-500">{t('noData')}</div>;

    return (
        <div className="space-y-3 relative before:absolute before:inset-y-0 before:left-4 before:w-0.5 before:bg-white/10 rtl:before:left-auto rtl:before:right-4">
            {history.map(ticket => {
                const details = getStatusDetails(ticket.status);
                return (
                    <div key={ticket.id} className="relative flex gap-4 pl-12 rtl:pl-0 rtl:pr-12">
                        {/* Timeline node */}
                        <div className={`absolute left-0 rtl:left-auto rtl:right-0 w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#12111a] z-10 ${details.color}`}>
                            {details.icon}
                        </div>

                        {/* Content Card */}
                        <div className="flex-1 bg-white/5 hover:bg-white/10 transition-colors rounded-xl border border-white/10 p-4">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-white text-lg">{ticket.barcode}</h4>
                                        <Badge variant="outline" className={`text-xs ${details.color} border-none`}>
                                            {t(`status.${ticket.status}`)}
                                        </Badge>
                                    </div>
                                    <p className="text-sm font-medium text-zinc-300">{ticket.deviceModel}</p>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-emerald-400 font-bold">
                                        SAR {Number(ticket.repairPrice || 0).toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-zinc-400 line-clamp-2 mt-2 bg-black/20 p-2 rounded-lg">
                                {ticket.issueDescription}
                            </p>

                            {ticket.completedAt && (
                                <div className="mt-3 text-xs text-zinc-500 font-medium">
                                    {format(new Date(ticket.completedAt), 'PPp')}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    );
}
