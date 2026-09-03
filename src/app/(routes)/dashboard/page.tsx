"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calculator, Package, ShoppingCart } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { FinancialKPICards } from "@/features/dashboard/ui/FinancialKPICards";
import { getFinancialDashboardMetrics } from "@/features/dashboard/api/dashboard-service";
import { FinancialDashboardMetrics } from "@/features/dashboard/types";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { startOfMonth, endOfMonth } from "date-fns";
import { getCurrentShift } from "@/actions/shift-management-actions";
import ShiftPromptModal from "@/components/shift/ShiftPromptModal";

const SHIFT_DISMISSED_KEY = "shift_prompt_dismissed";

export default function Dashboard() {
    const t = useTranslations('Dashboard');

    const [metrics, setMetrics] = useState<FinancialDashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [showShiftPrompt, setShowShiftPrompt] = useState(false);
    const shiftChecked = useRef(false);

    // Default to current month
    const [dateRange, setDateRange] = useState<{ from?: Date, to?: Date }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });

    const fetchMetrics = useCallback(async (start?: Date, end?: Date) => {
        setLoading(true);
        try {
            const res = await getFinancialDashboardMetrics({
                startDate: start?.toISOString(),
                endDate: end?.toISOString()
            });
            if (res.success && res.data) {
                setMetrics(res.data);
            }
        } catch (error) {
            console.error("Failed to fetch dashboard metrics:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics(dateRange.from, dateRange.to);
    }, [dateRange, fetchMetrics]);

    // 🚀 Shift Gate: check once per session on mount
    useEffect(() => {
        if (shiftChecked.current) return;
        shiftChecked.current = true;

        // Skip if already dismissed this session
        try {
            if (sessionStorage.getItem(SHIFT_DISMISSED_KEY)) return;
        } catch {
            // sessionStorage not available (e.g., SSR guard)
            return;
        }

        getCurrentShift().then((res: any) => {
            const shift = res?.shift ?? null;
            if (!shift) {
                setShowShiftPrompt(true);
            }
        }).catch(() => {
            // Silently fail — shift check is non-blocking
        });
    }, []);

    return (
        <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8 animate-fade-in-up max-w-[2400px] mx-auto">
            {/* 🕐 Post-Login Shift Prompt Modal */}
            <ShiftPromptModal
                open={showShiftPrompt}
                onClose={() => setShowShiftPrompt(false)}
            />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold">{t('title')}</h1>

                <div className="flex items-center gap-2 bg-card p-2 rounded-xl border border-border w-full sm:w-auto">
                    <span className="text-sm font-bold text-muted-foreground mr-2">الفترة:</span>
                    <FlatpickrRangePicker
                        initialDates={dateRange.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                        onRangeChange={(dates) => {
                            if (dates.length === 2) {
                                setDateRange({ from: dates[0], to: dates[1] });
                            } else if (dates.length === 0) {
                                setDateRange({});
                            }
                        }}
                        onClear={() => setDateRange({})}
                        className="w-full sm:w-64"
                    />
                </div>
            </div>

            {/* Financial Overview KPIs */}
            <div>
                <h2 className="text-xl font-bold mb-4 text-cyan-500">الملخص المالي</h2>
                <FinancialKPICards metrics={metrics} loading={loading} />
            </div>

            {/* Quick Links / Navigation Cards */}
            <div>
                <h2 className="text-xl font-bold mb-4 text-muted-foreground">الوصول السريع</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Link href="/pos">
                        <Card className="hover:bg-accent/50 transition-colors cursor-pointer border-cyan-500/20">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-cyan-500">
                                    <Calculator className="h-6 w-6" />
                                    {t('pos')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {t('posDesc')}
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/inventory">
                        <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Package className="h-6 w-6" />
                                    {t('inventory')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {t('inventoryDesc')}
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/purchasing">
                        <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ShoppingCart className="h-6 w-6" />
                                    {t('purchasing')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {t('purchasingDesc')}
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </div>
        </div>
    );
}
