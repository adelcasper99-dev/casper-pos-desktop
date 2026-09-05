"use client";

import React from "react";
import { DailyTrendItem, PaymentBreakdownItem } from "../types";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    CartesianGrid
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, PieChart as PieIcon, AlertCircle } from "lucide-react";
import Decimal from "decimal.js";

interface DashboardChartsProps {
    trendData?: DailyTrendItem[];
    paymentData?: PaymentBreakdownItem[];
    canViewConfidential?: boolean;
}

const PAYMENT_COLORS: Record<string, string> = {
    CASH: "#10b981", // Emerald
    CARD: "#3b82f6", // Blue
    VISA: "#2563eb",
    MASTERCARD: "#f97316", // Orange
    INSTAPAY: "#8b5cf6", // Purple
    WALLET: "#a855f7",
    CREDIT: "#eab308", // Amber
    STORE_CREDIT: "#06b6d4",
    OTHER: "#64748b"
};

export function DashboardCharts({
    trendData = [],
    paymentData = [],
    canViewConfidential = true
}: DashboardChartsProps) {
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        setMounted(true);
    }, []);

    const hasTrendActivity = trendData.some((d) => d.revenue > 0);
    const hasPaymentActivity = paymentData.length > 0 && paymentData.some((p) => p.amount > 0);

    const totalPaymentAmountDecimal = paymentData.reduce(
        (sum, p) => sum.plus(new Decimal(p.amount || 0)),
        new Decimal(0)
    );
    const totalPaymentAmount = totalPaymentAmountDecimal.toNumber();

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* 1. Daily Sales & Profit Trend Area Chart (2 Cols on Large Screens) */}
            <div className="lg:col-span-2 bg-card/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-foreground">
                                مسار المبيعات اليومية
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                حجم الإيرادات يوماً بيوم خلال الفترة المحددة
                            </p>
                        </div>
                    </div>
                </div>

                {!mounted ? (
                    <div className="h-64 sm:h-72 w-full animate-pulse bg-muted/20 rounded-xl" />
                ) : hasTrendActivity ? (
                    <div className="h-64 sm:h-72 w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0891b2" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#0891b2" stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => `${val}`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "rgba(15, 23, 42, 0.9)",
                                        borderRadius: "12px",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        color: "#fff",
                                        fontSize: "12px"
                                    }}
                                    formatter={(value: unknown) => [formatCurrency(Number(value || 0)), "المبيعات"]}
                                    labelFormatter={(label) => `التاريخ: ${label}`}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#0891b2"
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#colorRevenue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="h-64 sm:h-72 w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/60 rounded-xl bg-muted/10">
                        <AlertCircle className="w-8 h-8 text-muted-foreground/50 mb-2" />
                        <p className="text-xs font-bold text-muted-foreground">
                            لا توجد حركات مبيعات مسجلة في هذا النطاق الزمني
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                            قم باختيار فترة زمنية أوسع أو سجل مبيعات جديدة في نقطة البيع
                        </p>
                    </div>
                )}
            </div>

            {/* 2. Payment Tender Type Breakdown Donut Chart (1 Col) */}
            <div className="bg-card/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                            <PieIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-foreground">
                                توزيع طرق السداد
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                التدفقات النقدية والشبكة والتحويلات
                            </p>
                        </div>
                    </div>
                </div>

                {!mounted ? (
                    <div className="h-44 w-full animate-pulse bg-muted/20 rounded-xl" />
                ) : hasPaymentActivity ? (
                    <div className="flex flex-col items-center">
                        <div className="h-44 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={paymentData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={68}
                                        paddingAngle={4}
                                        dataKey="amount"
                                    >
                                        {paymentData.map((entry, index) => {
                                            const color = PAYMENT_COLORS[entry.method.toUpperCase()] || "#64748b";
                                            return <Cell key={`cell-${index}`} fill={color} />;
                                        })}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: unknown) => [formatCurrency(Number(value || 0)), "المبلغ"]}
                                        contentStyle={{
                                            backgroundColor: "rgba(15, 23, 42, 0.9)",
                                            borderRadius: "12px",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            color: "#fff",
                                            fontSize: "12px"
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Custom Legend */}
                        <div className="w-full space-y-2 mt-3 pt-3 border-t border-border/40">
                            {paymentData.slice(0, 4).map((p, idx) => {
                                const color = PAYMENT_COLORS[p.method.toUpperCase()] || "#64748b";
                                const pct = totalPaymentAmountDecimal.gt(0)
                                    ? new Decimal(p.amount || 0).dividedBy(totalPaymentAmountDecimal).times(100).round().toNumber()
                                    : 0;
                                return (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                            <span className="font-medium text-foreground">{p.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold">{formatCurrency(p.amount)}</span>
                                            <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="h-64 sm:h-72 w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/60 rounded-xl bg-muted/10">
                        <AlertCircle className="w-8 h-8 text-muted-foreground/50 mb-2" />
                        <p className="text-xs font-bold text-muted-foreground">
                            لا توجد مدفوعات مسجلة في هذه الفترة
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                            تظهر الإحصائيات فور إتمام عمليات السداد
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
