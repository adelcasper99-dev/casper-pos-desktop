'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, TrendingDown, TrendingUp } from 'lucide-react';
import { DrillDownType } from "@/actions/hq-drilldown-actions";

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
    return (
        <Card className="col-span-1 lg:col-span-1 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Technician Performance
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {loading ? (
                    <div className="space-y-2 p-4">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-12 bg-slate-50 animate-pulse rounded" />
                        ))}
                    </div>
                ) : (
                    <div className="divide-y max-h-[400px] overflow-y-auto">
                        {data?.map((tech, index) => (
                            <div
                                key={tech.id}
                                className={`p-4 transition-colors flex items-center justify-between group ${onDrillDown ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                                onClick={() => onDrillDown && onDrillDown('TECH_COMPLETED', `Tickets: ${tech.name}`, { technicianId: tech.id })}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                                            index === 1 ? 'bg-slate-200 text-slate-700' :
                                                index === 2 ? 'bg-orange-100 text-orange-700' :
                                                    'bg-slate-100 text-slate-500'
                                        }`}>
                                        {index === 0 && '🥇'}
                                        {index === 1 && '🥈'}
                                        {index === 2 && '🥉'}
                                        {index > 2 && index + 1}
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm text-slate-700">{tech.name}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">{tech.ticketsClosed} completed</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-slate-800">
                                        {Number(tech.revenueGenerated).toLocaleString()} <span className="text-[10px] font-normal text-slate-400">EGP</span>
                                    </div>
                                    <div className={`text-[10px] flex items-center justify-end gap-1 ${Number(tech.bounceRate) > 15 ? 'text-red-500' :
                                            Number(tech.bounceRate) > 5 ? 'text-orange-500' :
                                                'text-green-500'
                                        }`}>
                                        {Number(tech.bounceRate) > 10
                                            ? <TrendingUp className="h-2 w-2" />
                                            : <TrendingDown className="h-2 w-2" />
                                        }
                                        {tech.bounceRate}% Bounce
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!data || data.length === 0) && (
                            <div className="p-8 text-center text-slate-400 text-sm">
                                No activity recorded
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
