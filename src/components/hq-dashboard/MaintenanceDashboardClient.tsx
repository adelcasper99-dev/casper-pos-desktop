"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHQMaintenanceStats } from "@/actions/hq-maintenance-actions";
import { LiveStatusBoard } from "./LiveStatusBoard";
import { AgingAnalysis } from "./AgingAnalysis";
import { BranchPerformanceMatrix } from "./BranchPerformanceMatrix";
import { TechnicianLeaderboard } from "./TechnicianLeaderboard";
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
import { subDays } from "date-fns";
import { DrillDownModal } from "./DrillDownModal";
import { getHQDrilldownData, DrillDownType } from "@/actions/hq-drilldown-actions";

interface MaintenanceDashboardClientProps {
    initialData: any;
    branches: { id: string; name: string }[];
}

export function MaintenanceDashboardClient({ initialData, branches }: MaintenanceDashboardClientProps) {
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
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-4 rounded-xl border shadow-sm">
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    <div className="w-full md:w-[200px]">
                        <Select value={branchId} onValueChange={setBranchId}>
                            <SelectTrigger className="bg-slate-50 border-none shadow-none focus:ring-1 focus:ring-blue-500">
                                <SelectValue placeholder="Select Branch" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Branches</SelectItem>
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
                            className="bg-slate-50 border-none shadow-none"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono hidden md:inline-block">
                        AUTO-SYNC: 60S
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        className={isRefetching ? "animate-spin text-blue-500" : "text-slate-400 hover:text-blue-500"}
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
