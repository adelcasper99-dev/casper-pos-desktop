"use client";

import React from "react";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { RefreshCw, Store, Wifi, WifiOff, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";

interface DashboardHeaderProps {
    activePreset: DatePreset;
    onPresetChange: (preset: DatePreset) => void;
    dateRange: { from?: Date; to?: Date };
    onCustomRangeChange: (range: { from?: Date; to?: Date }) => void;
    onRefresh: () => void;
    isRefreshing: boolean;
    lastUpdated?: Date;
    selectedBranchId?: string;
    onBranchChange?: (branchId: string) => void;
    branches?: { id: string; name: string }[];
}

export function DashboardHeader({
    activePreset,
    onPresetChange,
    dateRange,
    onCustomRangeChange,
    onRefresh,
    isRefreshing,
    lastUpdated,
    selectedBranchId,
    onBranchChange,
    branches = []
}: DashboardHeaderProps) {
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        setMounted(true);
    }, []);

    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

    const presets: { id: DatePreset; label: string }[] = [
        { id: "today", label: "اليوم" },
        { id: "yesterday", label: "أمس" },
        { id: "week", label: "هذا الأسبوع" },
        { id: "month", label: "هذا الشهر" }
    ];

    return (
        <div className="flex flex-col gap-4 bg-card/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-xs">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                {/* Title & Telemetry Status */}
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-cyan-500/10 text-cyan-500 rounded-xl border border-cyan-500/20">
                        <Store className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            لوحة التحكم والمؤشرات
                        </h1>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1.5" suppressHydrationWarning>
                                <span className={cn(
                                    "w-2 h-2 rounded-full inline-block animate-pulse",
                                    (!mounted || isOnline) ? "bg-emerald-500 shadow-xs shadow-emerald-500/50" : "bg-rose-500"
                                )} />
                                {mounted ? (isOnline ? "متصل بالنظام" : "الوضع غير المتصل (Offline)") : "متصل بالنظام"}
                            </span>
                            {mounted && lastUpdated && (
                                <span className="opacity-75" suppressHydrationWarning>
                                    • آخر تحديث: {lastUpdated.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Branch Selector & Refresh Button */}
                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
                    {branches.length > 0 && onBranchChange && (
                        <div className="relative">
                            <select
                                value={selectedBranchId || "all"}
                                onChange={(e) => onBranchChange(e.target.value)}
                                className="h-9 px-3 pe-8 bg-background/80 border border-border text-foreground text-xs font-bold rounded-xl focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer transition-all"
                            >
                                <option value="all">جميع الفروع</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className={cn(
                            "h-9 px-3.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer",
                            isRefreshing && "opacity-70 cursor-not-allowed"
                        )}
                        title="تحديث البيانات فورياً"
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                        <span>{isRefreshing ? "جاري التحديث..." : "تحديث"}</span>
                    </button>
                </div>
            </div>

            {/* Presets and Custom Date Picker */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-border/40">
                <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/40 w-full sm:w-auto overflow-x-auto">
                    {presets.map((p) => {
                        const isActive = activePreset === p.id;
                        return (
                            <button
                                key={p.id}
                                onClick={() => onPresetChange(p.id)}
                                className={cn(
                                    "px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer",
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-xs"
                                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                )}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                </div>

                {/* Custom Flatpickr Date Picker */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        نطاق مخصص:
                    </span>
                    <FlatpickrRangePicker
                        initialDates={dateRange.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                        onRangeChange={(dates) => {
                            if (dates.length === 2) {
                                onPresetChange("custom");
                                onCustomRangeChange({ from: dates[0], to: dates[1] });
                            } else if (dates.length === 0) {
                                onPresetChange("month");
                                onCustomRangeChange({});
                            }
                        }}
                        onClear={() => {
                            onPresetChange("month");
                            onCustomRangeChange({});
                        }}
                        className="w-full sm:w-56 text-xs h-9 bg-background/80"
                    />
                </div>
            </div>
        </div>
    );
}
