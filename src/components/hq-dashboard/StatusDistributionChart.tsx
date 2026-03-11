'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Legend,
    Tooltip
} from 'recharts';
import { useTranslations } from "@/lib/i18n-mock";

interface StatusDistributionChartProps {
    data: { name: string; value: number }[] | null;
    loading: boolean;
}

const COLORS = [
    '#3b82f6', // New - blue
    '#f59e0b', // In Progress - amber
    '#10b981', // Delivered - emerald
    '#ef4444', // Rejected - red
    '#8b5cf6', // Ready - violet
    '#6366f1', // Diagnosing - indigo
    '#ec4899', // Waiting - pink
    '#14b8a6', // QC - teal
];

const STATUS_COLOR_MAP: Record<string, string> = {
    'NEW': '#06b6d4',             // Cyan
    'DIAGNOSING': '#38bdf8',      // Sky
    'IN_PROGRESS': '#0ea5e9',     // Blue
    'WAITING_FOR_PARTS': '#f59e0b',// Amber
    'QC_PENDING': '#6366f1',      // Indigo
    'COMPLETED': '#10b981',       // Emerald
    'READY_AT_BRANCH': '#10b981', // Emerald
    'DELIVERED': '#22c55e',       // Green
    'PAID_DELIVERED': '#22c55e',  // Green
    'REJECTED': '#f43f5e',        // Rose
    'AT_CENTER': '#94a3b8',       // Slate
};

export function StatusDistributionChart({ data, loading }: StatusDistributionChartProps) {
    const t = useTranslations("MaintenanceHQ.statusDistribution");
    const chartData = data || [];

    return (
        <Card className="col-span-1 lg:col-span-1 border-border/50 shadow-lg">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold flex items-center gap-2 tracking-tight">
                    {t('title')}
                </CardTitle>
                <div className="text-xs text-muted-foreground">{t('subtitle')}</div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="h-[300px] w-full bg-muted/50 animate-pulse rounded-lg" />
                ) : chartData.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm italic">
                        {t('noTickets')}
                    </div>
                ) : (
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={65}
                                    outerRadius={85}
                                    paddingAngle={4}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={STATUS_COLOR_MAP[entry.name] || '#64748b'}
                                            className="hover:opacity-80 transition-opacity duration-300"
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(23, 23, 23, 0.9)',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                                        color: '#fff'
                                    }}
                                    itemStyle={{ fontSize: '12px', color: '#fff' }}
                                    cursor={{ fill: 'transparent' }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    align="center"
                                    layout="horizontal"
                                    iconType="circle"
                                    iconSize={8}
                                    formatter={(value) => (
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider">
                                            {value.replace(/_/g, ' ')}
                                        </span>
                                    )}
                                    wrapperStyle={{ paddingTop: '20px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
