'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from "@/lib/utils";
import { DrillDownType } from "@/actions/hq-drilldown-actions";
import { useTranslations } from "@/lib/i18n-mock";

interface TechStat {
    id: string;
    name: string;
    ticketsClosed: number;
    revenueGenerated: number;
    bounceRate: string;
}

interface LeaderboardProps {
    data: TechStat[] | null;
    loading: boolean;
    onDrillDown?: (type: DrillDownType, title: string, filter?: Record<string, unknown>) => void;
}

export function TechnicianLeaderboard({ data, loading, onDrillDown }: LeaderboardProps) {
    const t = useTranslations("MaintenanceHQ.leaderboard");
    return (
        <Card className="col-span-1 lg:col-span-1 overflow-hidden border-border/50 shadow-2xl bg-zinc-950/40 backdrop-blur-sm">
            <CardHeader className="bg-zinc-900/50 border-b border-border/10 py-5">
                <CardTitle className="text-xl font-bold flex items-center gap-3 tracking-tight text-white">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    {t('title')}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {loading ? (
                    <div className="space-y-3 p-4">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-14 bg-zinc-900/50 animate-pulse rounded-xl border border-border/10" />
                        ))}
                    </div>
                ) : (
                    <div className="divide-y divide-border/5 max-h-[450px] overflow-y-auto no-scrollbar">
                        {data?.map((tech, index) => (
                            <div
                                key={tech.id}
                                className={cn(
                                    "p-4 transition-all duration-300 flex items-center justify-between group",
                                    onDrillDown ? 'cursor-pointer hover:bg-zinc-800' : ''
                                )}
                                onClick={() => onDrillDown && onDrillDown('TECH_COMPLETED', `Tickets: ${tech.name}`, { technicianId: tech.id })}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-inner transition-transform group-hover:scale-110",
                                        index === 0 ? 'bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/30' :
                                            index === 1 ? 'bg-zinc-400/20 text-zinc-300 ring-1 ring-zinc-400/30' :
                                                index === 2 ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30' :
                                                    'bg-zinc-800 text-zinc-500 ring-1 ring-border/50'
                                    )}>
                                        {index === 0 && '🥇'}
                                        {index === 1 && '🥈'}
                                        {index === 2 && '🥉'}
                                        {index > 2 && index + 1}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm text-white group-hover:text-cyan-400 transition-colors tracking-tight">{tech.name}</div>
                                        <div className="text-[11px] text-zinc-500 font-medium mt-0.5">{tech.ticketsClosed} {t('ticketsResolved')}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-black text-white tracking-tight">
                                        {Number(tech.revenueGenerated).toLocaleString()} <span className="text-[10px] font-medium text-zinc-600 ml-0.5">EGP</span>
                                    </div>
                                    <div className={`text-[10px] flex items-center justify-end gap-1.5 mt-1 font-bold ${Number(tech.bounceRate) > 15 ? 'text-rose-500' :
                                        Number(tech.bounceRate) > 5 ? 'text-amber-500' :
                                            'text-emerald-400'
                                        }`}>
                                        {Number(tech.bounceRate) > 10
                                            ? <TrendingUp className="h-2.5 w-2.5" />
                                            : <TrendingDown className="h-2.5 w-2.5" />
                                        }
                                        {tech.bounceRate}% {t('recalls')}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!data || data.length === 0) && (
                            <div className="py-20 text-center text-zinc-500 text-sm italic">
                                {t('noActivity')}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
