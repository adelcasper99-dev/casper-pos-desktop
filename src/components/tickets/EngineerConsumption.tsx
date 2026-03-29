'use client'

import { useState, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { useTranslations } from '@/lib/i18n-mock';
import { format } from "date-fns";
import { getEngineerConsumption } from "@/actions/engineer-actions"

export default function EngineerConsumption({ engineerId }: { engineerId: string }) {
    const t = useTranslations('Tickets.engineers');
    const [consumption, setConsumption] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getEngineerConsumption(engineerId).then(res => {
            if (res.data) setConsumption(res.data);
            setLoading(false);
        });
    }, [engineerId]);

    if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-600 dark:text-purple-400" /></div>;
    if (consumption.length === 0) return <div className="text-center py-12 text-slate-400 dark:text-zinc-500 italic border border-dashed border-slate-200 dark:border-white/10 rounded-lg font-black">{t('consumption.noData')}</div>;

    return (
        <div className="space-y-3">
            {consumption.map(move => (
                <div key={move.id} className="bg-white dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between items-center shadow-sm">
                    <div>
                        <div className="text-sm font-black text-slate-900 dark:text-white">{move.product?.name || t('details.unknownPart')}</div>
                        <div className="text-xs text-slate-500 dark:text-zinc-400 font-black mt-1">
                            {move.product?.sku} • {format(new Date(move.createdAt), 'dd MMMM yyyy', { locale: undefined })}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded">
                            {move.reason}
                        </div>
                        <Badge variant="outline" className="font-mono text-base font-black text-rose-600 dark:text-red-400 border-rose-200 dark:border-red-500/30 bg-rose-50 dark:bg-transparent">
                            -{move.quantity}
                        </Badge>
                    </div>
                </div>
            ))}
        </div>
    );
}
