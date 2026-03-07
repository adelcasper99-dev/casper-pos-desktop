import { FinancialDashboardMetrics } from "../types";
import {
    Landmark,
    Wallet,
    ShoppingCart,
    TrendingUp,
    TrendingDown,
    Award,
    Info
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface FinancialKPICardsProps {
    metrics: FinancialDashboardMetrics | null;
    loading?: boolean;
}

export function FinancialKPICards({ metrics, loading = false }: FinancialKPICardsProps) {
    const cards = [
        {
            title: "إجمالي الأصول",
            value: metrics?.totalAssets || 0,
            icon: Landmark,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20",
            tooltip: "نقدية + مخزون + عملاء + أصول أخرى",
        },
        {
            title: "رأس المال الحالي",
            value: metrics?.currentCapital || 0,
            icon: Wallet,
            color: "text-purple-500",
            bg: "bg-purple-500/10",
            border: "border-purple-500/20",
            tooltip: "حقوق الملكية - المسحوبات الشخصية",
        },
        {
            title: "المبيعات (الفترة)",
            value: metrics?.periodSales || 0,
            icon: TrendingUp,
            color: "text-green-500",
            bg: "bg-green-500/10",
            border: "border-green-500/20",
            tooltip: "إجمالي إيرادات المبيعات خلال الفترة المحددة",
        },
        {
            title: "المشتريات (الفترة)",
            value: metrics?.periodPurchases || 0,
            icon: ShoppingCart,
            color: "text-orange-500",
            bg: "bg-orange-500/10",
            border: "border-orange-500/20",
            tooltip: "إجمالي مشتريات البضاعة خلال الفترة المحددة",
        },
        {
            title: "المصروفات (الفترة)",
            value: metrics?.periodExpenses || 0,
            icon: TrendingDown,
            color: "text-red-500",
            bg: "bg-red-500/10",
            border: "border-red-500/20",
            tooltip: "إجمالي المصروفات التشغيلية والعمومية",
        },
        {
            title: "صافي الربح",
            value: metrics?.netProfit || 0,
            icon: Award,
            color: "text-yellow-500",
            bg: "bg-yellow-500/10",
            border: "border-yellow-500/20",
            tooltip: "المبيعات - تكلفة البضاعة (COGS) - المصروفات",
        }
    ];

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse border border-border" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card, index) => (
                <div
                    key={index}
                    className={`relative p-5 rounded-2xl border transition-all hover:scale-[1.02] bg-card ${card.border}`}
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-col">
                            <h3 className="text-sm font-bold text-muted-foreground mb-1">
                                {card.title}
                            </h3>
                            <div className="flex items-center gap-1 group">
                                <span className={`text-2xl font-bold font-mono tracking-tight ${card.color}`}>
                                    {formatCurrency(card.value)}
                                </span>
                            </div>
                        </div>
                        <div className={`p-3 rounded-xl ${card.bg}`}>
                            <card.icon className={`w-5 h-5 ${card.color}`} />
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 border-t border-border/50 pt-3">
                        <Info className="w-3.5 h-3.5 opacity-50" />
                        <span className="truncate" title={card.tooltip}>{card.tooltip}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
