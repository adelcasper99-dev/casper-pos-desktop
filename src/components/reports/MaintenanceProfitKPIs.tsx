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
            color: "text-cyan-400",
            bg: "bg-cyan-500/10",
            glow: "shadow-[0_0_20px_rgba(6,182,212,0.15)]"
        },
        {
            title: "تكلفة قطع الغيار",
            value: formatCurrency(data.partsCOGS),
            icon: CreditCard,
            color: "text-rose-400",
            bg: "bg-rose-500/10",
            glow: "shadow-[0_0_20px_rgba(244,63,94,0.15)]"
        },
        {
            title: "صافي ربح القطع",
            value: formatCurrency(data.partsNetProfit),
            icon: TrendingUp,
            color: "text-orange-400",
            bg: "bg-orange-500/10",
            glow: "shadow-[0_0_20px_rgba(249,115,22,0.15)]"
        },
        {
            title: "عمولات المهندسين",
            value: formatCurrency(data.totalCommissions),
            icon: Users,
            color: "text-fuchsia-400",
            bg: "bg-fuchsia-500/10",
            glow: "shadow-[0_0_20px_rgba(217,70,239,0.15)]"
        },
        {
            title: "ربح الصيانة (صافي)",
            value: formatCurrency(data.laborNetProfit),
            icon: Briefcase,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
            glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]"
        },
        {
            title: "نسبة النجاح",
            value: `${data.successRatio}%`,
            icon: TrendingUp,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
            glow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]"
        },
        {
            title: "صافي الربح العام",
            value: formatCurrency(data.totalNetProfit),
            icon: TrendingUp,
            color: "text-white",
            bg: "bg-cyan-500",
            highlight: true,
            glow: "shadow-[0_0_30px_rgba(6,182,212,0.3)]"
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-10">
            {kpis.map((kpi, i) => (
                <div 
                    key={i} 
                    className={cn(
                        "relative group rounded-2xl p-0.5 overflow-hidden transition-all duration-300 hover:scale-[1.02]",
                        kpi.glow,
                        kpi.highlight ? "xl:col-span-1 shadow-cyan-500/20" : ""
                    )}
                >
                    {/* Glassmorphic Background */}
                    <div className={cn(
                        "absolute inset-0 bg-gradient-to-br transition-opacity duration-300",
                        kpi.highlight ? "from-cyan-600 to-cyan-800 opacity-100" : "from-zinc-900 to-zinc-950 opacity-100"
                    )} />
                    
                    {/* Inner Content */}
                    <div className={cn(
                        "relative h-full p-4 rounded-2xl flex flex-col justify-between border min-h-[110px]",
                        kpi.highlight ? "border-white/20" : "border-white/5 bg-zinc-900/40 backdrop-blur-xl"
                    )}>
                        <div className="flex items-center justify-between mb-3">
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                kpi.highlight ? "text-cyan-100/70" : "text-zinc-500"
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
                            kpi.highlight ? "text-white" : "text-zinc-100"
                        )}>
                            {kpi.value}
                        </div>
                    </div>
                </div>
            ))}
            {data.highRiskCount > 0 && (
                <div className="col-span-full mt-2">
                    <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-200 text-sm backdrop-blur-md animate-pulse">
                        <div className="p-2 bg-rose-500/20 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                        </div>
                        <span className="font-medium">تنبيه: يوجد عدد {data.highRiskCount} تذاكر عالية المخاطر (تكرار مرتجع أو تأخير كبير).</span>
                    </div>
                </div>
            )}
        </div>
    );
}
