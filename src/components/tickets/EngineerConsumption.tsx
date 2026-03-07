'use client'

import { useState, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { useTranslations } from '@/lib/i18n-mock';
import { format } from "date-fns";
import { getEngineerConsumption } from "@/actions/engineer-actions"

export default function EngineerConsumption({ engineerId }: { engineerId: string }) {
    const t = useTranslations('Tickets.engineers.consumption');
    const [consumption, setConsumption] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getEngineerConsumption(engineerId).then(res => {
            if (res.data) setConsumption(res.data);
            setLoading(false);
        });
    }, [engineerId]);

    if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-400" /></div>;
    if (consumption.length === 0) return <div className="text-center py-8 text-zinc-500">{t('noData')}</div>;

    return (
        <div className="space-y-2">
            {consumption.map(move => (
                <div key={move.id} className="bg-white/5 p-3 rounded-lg border border-white/10 flex justify-between items-center">
                    <div>
                        <div className="text-sm font-bold text-white">{move.product?.name || 'Unknown Part'}</div>
                        <div className="text-xs text-zinc-400">{move.product?.sku} • {format(new Date(move.createdAt), 'PP')}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-xs text-zinc-500 bg-white/5 px-2 py-1 rounded">{move.reason}</div>
                        <Badge variant="outline" className="font-mono text-base font-bold text-red-400 border-red-500/30">-{move.quantity}</Badge>
                    </div>
                </div>
            ))}
        </div>
    );
}
