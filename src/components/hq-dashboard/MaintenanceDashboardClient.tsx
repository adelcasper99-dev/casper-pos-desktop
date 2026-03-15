"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHQMaintenanceStats } from "@/actions/hq-maintenance-actions";
import { LiveStatusBoard } from "./LiveStatusBoard";
import { AgingAnalysis } from "./AgingAnalysis";
import { BranchPerformanceMatrix } from "./BranchPerformanceMatrix";
import { TechnicianLeaderboard } from "./TechnicianLeaderboard";
import { StatusDistributionChart } from "./StatusDistributionChart";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import { DrillDownModal } from "./DrillDownModal";
import { getHQDrilldownData, DrillDownType } from "@/actions/hq-drilldown-actions";
import { useTranslations } from "@/lib/i18n-mock";
import Link from "next/link";
import { FileBarChart } from "lucide-react";

interface MaintenanceDashboardClientProps {
    initialData: any;
    branches: { id: string; name: string }[];
}

export function MaintenanceDashboardClient({ initialData, branches }: MaintenanceDashboardClientProps) {
    const t = useTranslations("MaintenanceHQ");
    const [branchId, setBranchId] = useState<string>("ALL");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: subDays(new Date(), 30),
        to: new Date()
    });

    // Drill Down State
    const [drillDownState, setDrillDownState] = useState<{
        isOpen: boolean;
        title: string;
        data: any[] | null;
        loading: boolean;
    }>({
        isOpen: false,
        title: "",
        data: null,
        loading: false
    });

    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['hq-maintenance', branchId, dateRange],
        queryFn: async () => {
            const result = await getHQMaintenanceStats({
                branchId: branchId === "ALL" ? undefined : branchId,
                dateRange: dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined
            });
            if (result.success) {
                return result; // secureAction spreads: { success, liveStatus, agingAnalysis, ... }
            }
            throw new Error(result.error);
        },
        initialData: initialData,
        refetchInterval: 60000, // 60 seconds polling for desktop
    });

    const handleDrillDown = async (type: DrillDownType, title: string, specificFilter?: any) => {
        setDrillDownState(prev => ({ ...prev, isOpen: true, loading: true, title, data: null }));

        try {
            const result = await getHQDrilldownData({
                type,
                filters: {
                    branchId: branchId === "ALL" ? undefined : branchId,
                    dateRange: dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined,
                    ...specificFilter
                }
            });

            if (result.success && result.data) {
                setDrillDownState(prev => ({ ...prev, loading: false, data: result.data || [] }));
            } else {
                setDrillDownState(prev => ({ ...prev, loading: false, data: [] }));
            }
        } catch (error) {
            console.error("Drilldown failed", error);
            setDrillDownState(prev => ({ ...prev, loading: false, data: [] }));
        }
    };

    return (
        <div className="space-y-6">
            {/* Filters & Controls */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-zinc-900/50 backdrop-blur-sm border border-border/50 rounded-2xl mb-8 shadow-xl">
                <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                    <div className="w-full md:w-64">
                        <Select
                            value={branchId}
                            onValueChange={setBranchId}
                        >
                            <SelectTrigger className="bg-zinc-900 border-border/50 text-white h-11 rounded-xl focus:ring-cyan-500/20">
                                <SelectValue placeholder={t('selectBranch')} />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-border text-white">
                                <SelectItem value="ALL">{t('allBranches')}</SelectItem>
                                {branches.map(branch => (
                                    <SelectItem key={branch.id} value={branch.id}>
                                        {branch.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-full md:w-auto">
                        <DateRangePicker
                            from={dateRange.from}
                            to={dateRange.to}
                            onSelect={(from, to) => setDateRange({ from, to })}
                            className="bg-zinc-900 border-border/50 text-white h-11 rounded-xl"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3 pr-2">
                    <span className="text-[10px] text-zinc-500 font-mono hidden md:inline-block tracking-widest uppercase opacity-70">
                        {t('autoRefresh')}
                    </span>
                    
                    <Link href="/dashboard/reports/maintenance-profit">
                        <Button
                            variant="outline"
                            className="bg-zinc-800 border-border/50 text-cyan-400 hover:text-cyan-300 hover:bg-zinc-700 h-10 rounded-xl gap-2 text-xs"
                        >
                            <FileBarChart className="h-4 w-4" />
                            تقرير الأرباح
                        </Button>
                    </Link>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        className={cn(
                            "h-10 w-10 rounded-xl transition-all",
                            isRefetching
                                ? "animate-spin text-cyan-500"
                                : "text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800"
                        )}
                    >
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Widgets */}
            <LiveStatusBoard
                stats={data?.liveStatus || initialData?.liveStatus}
                loading={isLoading}
                onDrillDown={handleDrillDown}
            />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <StatusDistributionChart
                    data={data?.statusDistribution || initialData?.statusDistribution}
                    loading={isLoading}
                />
                <AgingAnalysis
                    data={data?.agingAnalysis || initialData?.agingAnalysis}
                    loading={isLoading}
                    onDrillDown={handleDrillDown}
                />
                <TechnicianLeaderboard
                    data={data?.leaderboard || initialData?.leaderboard}
                    loading={isLoading}
                    onDrillDown={handleDrillDown}
                />
            </div>

            <BranchPerformanceMatrix
                data={data?.branchMatrix || initialData?.branchMatrix}
                loading={isLoading}
                onDrillDown={(bId, type) => handleDrillDown(type as DrillDownType, `Branch Details`, { specificBranchId: bId })}
            />

            <DrillDownModal
                isOpen={drillDownState.isOpen}
                onClose={() => setDrillDownState(prev => ({ ...prev, isOpen: false }))}
                title={drillDownState.title}
                data={drillDownState.data}
                loading={drillDownState.loading}
            />
        </div>
    );
}
