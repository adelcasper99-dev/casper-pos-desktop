"use client";

import React from "react";
import { FinancialDashboardMetrics } from "../types";
import {
    Landmark,
    Wallet,
    ShoppingCart,
    TrendingUp,
    TrendingDown,
    Award,
    Info,
    Receipt,
    Percent,
    Wrench,
    LucideIcon
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface KPICardDef {
    title: string;
    value: number;
    icon: LucideIcon;
    color: string;
    bg: string;
    border: string;
    tooltip: string;
    badge?: string;
    subtext?: string;
    isRawNumber?: boolean;
}

interface FinancialKPICardsProps {
    metrics: FinancialDashboardMetrics | null;
    loading?: boolean;
}

export function FinancialKPICards({ metrics, loading = false }: FinancialKPICardsProps) {
    const canViewConfidential = metrics?.canViewConfidentialFinancials ?? true;

    // Full Executive View (Admins/Managers/Accountants)
    const confidentialCards: KPICardDef[] = [
        {
            title: "إجمالي المبيعات",
            value: metrics?.periodSales || 0,
            icon: TrendingUp,
            color: "text-blue-500 dark:text-blue-400",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20",
            tooltip: "إجمالي إيرادات مبيعات نقطة البيع خلال الفترة",
            badge: metrics?.salesCount ? `${metrics.salesCount} فاتورة` : undefined,
            subtext: metrics?.averageOrderValue ? `متوسط الفاتورة: ${formatCurrency(metrics.averageOrderValue)}` : undefined
        },
        {
            title: "صافي الربح",
            value: metrics?.netProfit || 0,
            icon: Award,
            color: (metrics?.netProfit || 0) >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400",
            bg: (metrics?.netProfit || 0) >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10",
            border: (metrics?.netProfit || 0) >= 0 ? "border-emerald-500/20" : "border-rose-500/20",
            tooltip: "المبيعات + الصيانة - تكلفة البضاعة (COGS) - المصروفات",
            badge: metrics?.profitMarginPercentage !== undefined ? `هامش: ${metrics.profitMarginPercentage}%` : undefined,
            subtext: "بعد خصم التكلفة والمصروفات"
        },
        {
            title: "المصروفات التشغيلية",
            value: metrics?.periodExpenses || 0,
            icon: TrendingDown,
            color: "text-rose-500 dark:text-rose-400",
            bg: "bg-rose-500/10",
            border: "border-rose-500/20",
            tooltip: "إجمالي المصروفات العامة والتشغيلية خلال الفترة",
            subtext: "إيجار، رواتب، مرافق، ونثريات"
        },
        {
            title: "المشتريات (الفترة)",
            value: metrics?.periodPurchases || 0,
            icon: ShoppingCart,
            color: "text-amber-500 dark:text-amber-400",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
            tooltip: "إجمالي توريدات وفواتير الشراء خلال الفترة",
            subtext: "بضاعة واردة للمخزن"
        },
        {
            title: "رأس المال الحالي",
            value: metrics?.currentCapital || 0,
            icon: Wallet,
            color: "text-purple-500 dark:text-purple-400",
            bg: "bg-purple-500/10",
            border: "border-purple-500/20",
            tooltip: "حقوق الملكية - المسحوبات الشخصية",
            subtext: "حقوق الشركاء الصافية"
        },
        {
            title: "إجمالي الأصول",
            value: metrics?.totalAssets || 0,
            icon: Landmark,
            color: "text-cyan-500 dark:text-cyan-400",
            bg: "bg-cyan-500/10",
            border: "border-cyan-500/20",
            tooltip: "نقدية + مخزون + عملاء + أصول ثابتة",
            subtext: "القيمة الإجمالية للمؤسسة"
        }
    ];

    // Operational View (Cashiers / Sales staff with restricted financial access)
    const operationalCards: KPICardDef[] = [
        {
            title: "إجمالي مبيعاتك",
            value: metrics?.periodSales || 0,
            icon: TrendingUp,
            color: "text-blue-500 dark:text-blue-400",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20",
            tooltip: "إجمالي مبيعات الوردية أو الفترة المحددة",
            badge: metrics?.salesCount ? `${metrics.salesCount} فاتورة` : undefined,
            subtext: metrics?.averageOrderValue ? `متوسط الفاتورة: ${formatCurrency(metrics.averageOrderValue)}` : undefined
        },
        {
            title: "عدد فواتير البيع",
            value: metrics?.salesCount || 0,
            isRawNumber: true,
            icon: Receipt,
            color: "text-emerald-500 dark:text-emerald-400",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20",
            tooltip: "إجمالي عدد الفواتير المكتملة",
            subtext: "عمليات بيع ناجحة"
        },
        {
            title: "متوسط قيمة الفاتورة",
            value: metrics?.averageOrderValue || 0,
            icon: Percent,
            color: "text-purple-500 dark:text-purple-400",
            bg: "bg-purple-500/10",
            border: "border-purple-500/20",
            tooltip: "متوسط الإنفاق لكل عميل (AOV)",
            subtext: "حجم سلة الشراء"
        },
        {
            title: "إيراد تذاكر الصيانة",
            value: metrics?.maintenanceRevenue || 0,
            icon: Wrench,
            color: "text-cyan-500 dark:text-cyan-400",
            bg: "bg-cyan-500/10",
            border: "border-cyan-500/20",
            tooltip: "إيرادات خدمات وتذاكر الصيانة المسلمة",
            badge: metrics?.maintenanceCount ? `${metrics.maintenanceCount} جهاز` : undefined,
            subtext: "أجهزة تم تسليمها للعملاء"
        }
    ];

    const cards = canViewConfidential ? confidentialCards : operationalCards;

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-32 rounded-2xl bg-card/40 animate-pulse border border-border/50" />
                ))}
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${canViewConfidential ? "xl:grid-cols-6" : "xl:grid-cols-4"} gap-3 sm:gap-4`}>
            {cards.map((card, index) => {
                const Icon = card.icon;
                return (
                    <div
                        key={index}
                        className={`relative p-4 rounded-2xl border transition-all hover:scale-[1.01] bg-card/60 backdrop-blur-md shadow-xs flex flex-col justify-between ${card.border}`}
                    >
                        <div>
                            <div className="flex justify-between items-start mb-2.5">
                                <span className="text-xs font-bold text-muted-foreground">
                                    {card.title}
                                </span>
                                <div className={`p-2 rounded-xl ${card.bg}`}>
                                    <Icon className={`w-4 h-4 ${card.color}`} />
                                </div>
                            </div>

                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${card.color}`}>
                                    {card.isRawNumber ? card.value : formatCurrency(card.value)}
                                </span>
                                {card.badge && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                                        {card.badge}
                                    </span>
                                )}
                            </div>

                            {card.subtext && (
                                <p className="text-[11px] text-muted-foreground/80 mt-1 font-medium truncate" title={card.subtext}>
                                    {card.subtext}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 mt-3 pt-2.5 border-t border-border/40">
                            <Info className="w-3 h-3 opacity-60 shrink-0" />
                            <span className="truncate" title={card.tooltip}>{card.tooltip}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
