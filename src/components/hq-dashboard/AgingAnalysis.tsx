'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { DrillDownType } from "@/actions/hq-drilldown-actions";

interface AgingAnalysisProps {
    data: {
        under24h: number;
        between24and48h: number;
        over48h: number;
    } | null;
    loading: boolean;
    onDrillDown?: (type: DrillDownType, title: string) => void;
}

export function AgingAnalysis({ data, loading, onDrillDown }: AgingAnalysisProps) {
    const chartData = [
        { name: '< 24h', value: data?.under24h ?? 0, color: '#22c55e', type: 'AGING_LESS_24' as DrillDownType },
        { name: '24h - 48h', value: data?.between24and48h ?? 0, color: '#eab308', type: 'AGING_24_48' as DrillDownType },
        { name: '> 48h', value: data?.over48h ?? 0, color: '#ef4444', type: 'AGING_MORE_48' as DrillDownType },
    ];

    const handleBarClick = (entry: typeof chartData[0]) => {
        if (onDrillDown) {
            onDrillDown(entry.type, `Ticket Aging: ${entry.name}`);
        }
    };

    return (
        <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    Ticket Aging Analysis
                </CardTitle>
                <div className="text-xs text-slate-400">Current backlog distribution by age</div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="h-[250px] w-full bg-slate-50 animate-pulse rounded-lg" />
                ) : (
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12 }}
                                />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-white p-2 shadow-lg rounded border text-xs">
                                                    <p className="font-bold">{payload[0].payload.name}</p>
                                                    <p className="text-slate-500">{payload[0].value} Tickets</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar
                                    dataKey="value"
                                    radius={[4, 4, 0, 0]}
                                    barSize={60}
                                    style={{ cursor: onDrillDown ? 'pointer' : 'default' }}
                                    onClick={(entry) => handleBarClick(entry as typeof chartData[0])}
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} cursor={onDrillDown ? 'pointer' : 'default'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
