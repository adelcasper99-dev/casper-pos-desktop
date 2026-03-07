"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calculator, Package, ShoppingCart } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { FinancialKPICards } from "@/features/dashboard/ui/FinancialKPICards";
import { getFinancialDashboardMetrics } from "@/features/dashboard/api/dashboard-service";
import { FinancialDashboardMetrics } from "@/features/dashboard/types";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { startOfMonth, endOfMonth } from "date-fns";

export default function Dashboard() {
    const t = useTranslations('Dashboard');

    const [metrics, setMetrics] = useState<FinancialDashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);

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

    return (
        <div className="p-8 space-y-8 animate-fade-in-up">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold">{t('title')}</h1>

                <div className="flex items-center gap-2 bg-card p-2 rounded-xl border border-border">
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
                        className="w-64"
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
