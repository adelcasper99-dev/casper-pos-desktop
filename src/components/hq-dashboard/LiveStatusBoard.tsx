'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { DrillDownType } from "@/actions/hq-drilldown-actions";
import { useTranslations } from "@/lib/i18n-mock";

interface LiveStatusBoardProps {
    stats: {
        pending: number;
        criticalAging: number;
        delivered: number;
        successRate: string;
        bounceRate: string;
    } | null;
    loading: boolean;
    onDrillDown?: (type: DrillDownType, title: string) => void;
}

export function LiveStatusBoard({ stats, loading, onDrillDown }: LiveStatusBoardProps) {
    const t = useTranslations("MaintenanceHQ.stats");
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Pending */}
            <Card
                className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
                onClick={() => handleClick('PENDING', 'Pending Repairs')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        {t('pending')}
                    </CardTitle>
                    <Clock className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-blue-500">{stats?.pending ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t('pendingDesc')}
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
                        {t('critical')}
                    </CardTitle>
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600">{stats?.criticalAging ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t('criticalDesc')}
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
                        {t('delivered')}
                    </CardTitle>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats?.delivered ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t('deliveredDesc')}
                    </p>
                </CardContent>
            </Card>

            {/* Success Rate */}
            <Card
                className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
                onClick={() => handleClick('REPAIRED', 'Repaired Tickets (Success)')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        {t('successRatio')}
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-emerald-500">
                        {stats?.successRate ?? '0.0'}%
                    </div>
                    <Progress
                        value={parseFloat(stats?.successRate ?? '0')}
                        className="h-2 mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        {t('successRatioDesc')}
                    </p>
                </CardContent>
            </Card>

            {/* Bounce Rate */}
            <Card
                className="border-l-4 border-l-orange-500 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        {t('bounceRate')}
                    </CardTitle>
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-orange-600">
                        {stats?.bounceRate ?? '0.0'}%
                    </div>
                    <Progress
                        value={parseFloat(stats?.bounceRate ?? '0')}
                        className="h-2 mt-2 bg-slate-100"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        {t('bounceRateDesc')}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
