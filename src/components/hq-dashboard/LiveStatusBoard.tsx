'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { DrillDownType } from "@/actions/hq-drilldown-actions";

interface LiveStatusBoardProps {
    stats: {
        pending: number;
        criticalAging: number;
        delivered: number;
        successRate: string;
    } | null;
    loading: boolean;
    onDrillDown?: (type: DrillDownType, title: string) => void;
}

export function LiveStatusBoard({ stats, loading, onDrillDown }: LiveStatusBoardProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 bg-slate-100 rounded-xl" />
                ))}
            </div>
        );
    }

    const handleClick = (type: DrillDownType, title: string) => {
        if (onDrillDown) onDrillDown(type, title);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pending */}
            <Card
                className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
                onClick={() => handleClick('PENDING', 'Pending Repairs')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Pending Repair
                    </CardTitle>
                    <Clock className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats?.pending ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Active tickets in workflow
                    </p>
                </CardContent>
            </Card>

            {/* Critical Aging */}
            <Card
                className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
                onClick={() => handleClick('CRITICAL', 'Critical Aging Tickets (>48h)')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Critical Aging (&gt;48h)
                    </CardTitle>
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600">{stats?.criticalAging ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Tickets overdue for turnover
                    </p>
                </CardContent>
            </Card>

            {/* Delivered */}
            <Card
                className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
                onClick={() => handleClick('DELIVERED', 'Delivered Tickets')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Delivered
                    </CardTitle>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats?.delivered ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Successfully returned to customer
                    </p>
                </CardContent>
            </Card>

            {/* Success Rate */}
            <Card
                className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
                onClick={() => handleClick('REPAIRED', 'Repaired Tickets (Success)')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Success Ratio
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-purple-600">
                        {stats?.successRate ?? '0.0'}%
                    </div>
                    <Progress
                        value={parseFloat(stats?.successRate ?? '0')}
                        className="h-2 mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Repaired vs. Total Closed
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
