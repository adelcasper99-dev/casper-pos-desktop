"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { FinancialKPICards } from "@/features/dashboard/ui/FinancialKPICards";
import { DashboardHeader, DatePreset } from "@/features/dashboard/ui/DashboardHeader";
import { DashboardCharts } from "@/features/dashboard/ui/DashboardCharts";
import { OperationalWidgets } from "@/features/dashboard/ui/OperationalWidgets";
import { QuickActionBar } from "@/features/dashboard/ui/QuickActionBar";
import { getFinancialDashboardMetrics } from "@/features/dashboard/api/dashboard-service";
import { FinancialDashboardMetrics } from "@/features/dashboard/types";
import {
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    subDays
} from "date-fns";
import { getCurrentShift } from "@/actions/shift-management-actions";
import { getBranchesForReports } from "@/actions/reports/profit-loss";
import ShiftPromptModal from "@/components/shift/ShiftPromptModal";

const SHIFT_DISMISSED_KEY = "shift_prompt_dismissed";

interface BranchOption {
    id: string;
    name: string;
}

export default function Dashboard() {
    const [metrics, setMetrics] = useState<FinancialDashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [showShiftPrompt, setShowShiftPrompt] = useState(false);
    const shiftChecked = useRef(false);

    // Preset & Date Filter State (Defaults to current month)
    const [activePreset, setActivePreset] = useState<DatePreset>("month");
    const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });

    // Branch selection state
    const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
    const [branches, setBranches] = useState<BranchOption[]>([]);

    // Fetch branches once on mount
    useEffect(() => {
        getBranchesForReports().then((res: { success: boolean; branches?: BranchOption[] }) => {
            if (res?.success && Array.isArray(res.branches)) {
                setBranches(res.branches);
            }
        }).catch(() => {});
    }, []);

    // Fetch Dashboard Metrics with current filters
    const fetchMetrics = useCallback(async (start?: Date, end?: Date, branch?: string, silent: boolean = false) => {
        if (!silent) setLoading(true);
        setIsRefreshing(true);
        try {
            const res = await getFinancialDashboardMetrics({
                startDate: start ? start.toISOString().slice(0, 10) : undefined,
                endDate: end ? end.toISOString().slice(0, 10) : undefined,
                branchId: branch && branch !== "all" ? branch : undefined
            });
            if (res.success && res.data) {
                setMetrics(res.data);
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error("Failed to fetch dashboard metrics:", error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Trigger on dateRange or branch change
    useEffect(() => {
        fetchMetrics(dateRange.from, dateRange.to, selectedBranchId);
    }, [dateRange, selectedBranchId, fetchMetrics]);

    // ── Auto-Refresh: Refresh every 60 seconds smoothly in background ──
    useEffect(() => {
        const timer = setInterval(() => {
            fetchMetrics(dateRange.from, dateRange.to, selectedBranchId, true);
        }, 60000);
        return () => clearInterval(timer);
    }, [dateRange, selectedBranchId, fetchMetrics]);

    // Handle Quick Date Presets
    const handlePresetChange = (preset: DatePreset) => {
        setActivePreset(preset);
        const now = new Date();

        switch (preset) {
            case "today":
                setDateRange({ from: startOfDay(now), to: endOfDay(now) });
                break;
            case "yesterday": {
                const yesterday = subDays(now, 1);
                setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
                break;
            }
            case "week":
                // Week starting Saturday (common in Egypt/MENA)
                setDateRange({
                    from: startOfWeek(now, { weekStartsOn: 6 }),
                    to: endOfWeek(now, { weekStartsOn: 6 })
                });
                break;
            case "month":
                setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
                break;
            case "custom":
                // Kept for flatpickr manual range selection
                break;
        }
    };

    // 🚀 Shift Gate: check once per session on mount
    useEffect(() => {
        if (shiftChecked.current) return;
        shiftChecked.current = true;

        try {
            if (sessionStorage.getItem(SHIFT_DISMISSED_KEY)) return;
        } catch {
            return;
        }

        getCurrentShift().then((res: { shift?: unknown }) => {
            const shift = res?.shift ?? null;
            if (!shift) {
                setShowShiftPrompt(true);
            }
        }).catch(() => {});
    }, []);

    return (
        <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8 animate-fade-in-up max-w-[2400px] mx-auto min-h-screen">
            {/* 🕐 Post-Login Shift Prompt Modal */}
            <ShiftPromptModal
                open={showShiftPrompt}
                onClose={() => setShowShiftPrompt(false)}
            />

            {/* 1. Header & Filters Bar */}
            <DashboardHeader
                activePreset={activePreset}
                onPresetChange={handlePresetChange}
                dateRange={dateRange}
                onCustomRangeChange={setDateRange}
                onRefresh={() => fetchMetrics(dateRange.from, dateRange.to, selectedBranchId)}
                isRefreshing={isRefreshing}
                lastUpdated={lastUpdated}
                selectedBranchId={selectedBranchId}
                onBranchChange={setSelectedBranchId}
                branches={branches}
            />

            {/* 2. Executive Financial & Operational KPIs */}
            <div>
                <FinancialKPICards metrics={metrics} loading={loading} />
            </div>

            {/* 3. Interactive Charts (Sales Trend & Payment Distribution) */}
            <div>
                <DashboardCharts
                    trendData={metrics?.salesTrend}
                    paymentData={metrics?.paymentBreakdown}
                    canViewConfidential={metrics?.canViewConfidentialFinancials}
                />
            </div>

            {/* 4. Operational Pulse (Active Shift, Top 5 Products, Low Stock, Recent Invoices) */}
            <div>
                <OperationalWidgets
                    activeShift={metrics?.activeShift}
                    topProducts={metrics?.topProducts}
                    lowStockItems={metrics?.lowStockItems}
                    recentTransactions={metrics?.recentTransactions}
                />
            </div>

            {/* 5. Quick Action Hub */}
            <div className="pt-2">
                <QuickActionBar />
            </div>
        </div>
    );
}
