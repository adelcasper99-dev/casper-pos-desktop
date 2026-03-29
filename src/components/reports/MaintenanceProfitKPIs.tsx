'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Activity, CreditCard, Users, Briefcase, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPIProps {
    data: {
        totalRevenue: number;
        partsCOGS: number;
        totalCommissions: number;
        laborNetProfit: number;
        partsNetProfit: number;
        totalNetProfit: number;
        successRatio: string;
        highRiskCount: number;
    };
}

export function MaintenanceProfitKPIs({ data }: KPIProps) {
    const kpis = [
        {
            title: "إجمالي الإيرادات",
            value: formatCurrency(data.totalRevenue),
            icon: Activity,
            color: "text-cyan-500",
            bg: "bg-cyan-500/10",
            glow: "shadow-cyan-500/10"
        },
        {
            title: "تكلفة قطع الغيار",
            value: formatCurrency(data.partsCOGS),
            icon: CreditCard,
            color: "text-rose-500",
            bg: "bg-rose-500/10",
            glow: "shadow-rose-500/10"
        },
        {
            title: "صافي ربح القطع",
            value: formatCurrency(data.partsNetProfit),
            icon: TrendingUp,
            color: "text-orange-500",
            bg: "bg-orange-500/10",
            glow: "shadow-orange-500/10"
        },
        {
            title: "عمولات المهندسين",
            value: formatCurrency(data.totalCommissions),
            icon: Users,
            color: "text-fuchsia-500",
            bg: "bg-fuchsia-500/10",
            glow: "shadow-fuchsia-500/10"
        },
        {
            title: "ربح الصيانة (صافي)",
            value: formatCurrency(data.laborNetProfit),
            icon: Briefcase,
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
            glow: "shadow-emerald-500/10"
        },
        {
            title: "نسبة النجاح",
            value: `${data.successRatio}%`,
            icon: TrendingUp,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            glow: "shadow-amber-500/10"
        },
        {
            title: "صافي الربح العام",
            value: formatCurrency(data.totalNetProfit),
            icon: TrendingUp,
            color: "text-white",
            bg: "bg-primary",
            highlight: true,
            glow: "shadow-primary/30"
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-10">
            {kpis.map((kpi, i) => (
                <div 
                    key={i} 
                    className={cn(
                        "relative group rounded-2xl p-px overflow-hidden transition-all duration-300 hover:scale-[1.02] shadow-xl",
                        kpi.glow,
                        kpi.highlight ? "xl:col-span-1" : ""
                    )}
                >
                    {/* Glassmorphic Background */}
                    <div className={cn(
                        "absolute inset-0 transition-opacity duration-300",
                        kpi.highlight ? "bg-primary" : "bg-card/40 backdrop-blur-xl"
                    )} />
                    
                    {/* Inner Content */}
                    <div className={cn(
                        "relative h-full p-4 rounded-2xl flex flex-col justify-between border min-h-[110px]",
                        kpi.highlight ? "border-white/20 bg-primary/10" : "border-border bg-card/50"
                    )}>
                        <div className="flex items-center justify-between mb-3">
                            <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest",
                                kpi.highlight ? "text-white/70" : "text-muted-foreground"
                            )}>
                                {kpi.title}
                            </span>
                            <div className={cn(
                                "p-2 rounded-xl transition-transform duration-300 group-hover:scale-110",
                                kpi.bg,
                                kpi.highlight ? "bg-white/20" : ""
                            )}>
                                <kpi.icon className={cn("w-3.5 h-3.5", kpi.color, kpi.highlight ? "text-white" : "")} />
                            </div>
                        </div>
                        
                        <div className={cn(
                            "text-lg font-black tracking-tight",
                            kpi.highlight ? "text-white" : "text-foreground"
                        )}>
                            {kpi.value}
                        </div>
                    </div>
                </div>
            ))}
            {data.highRiskCount > 0 && (
                <div className="col-span-full mt-2">
                    <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-600 dark:text-rose-200 text-sm backdrop-blur-md animate-pulse shadow-lg shadow-rose-500/10">
                        <div className="p-2 bg-rose-500/20 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-rose-500" />
                        </div>
                        <span className="font-black">تنبيه: يوجد عدد {data.highRiskCount} تذاكر عالية المخاطر (تكرار مرتجع أو تأخير كبير).</span>
                    </div>
                </div>
            )}
        </div>
    );
}
