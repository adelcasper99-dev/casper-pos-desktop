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
        totalDues: number;
        totalPaid: number;
        totalDeferred: number;
        laborRevenue: number;
    };
}

export function MaintenanceProfitKPIs({ data }: KPIProps) {
    const kpis = [
        {
            title: "إجمالي المستحقات",
            value: formatCurrency(Number(data.totalDues)),
            icon: Briefcase,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            glow: "shadow-blue-500/10"
        },
        {
            title: "إجمالي المدفوع",
            value: formatCurrency(Number(data.totalPaid)),
            icon: CreditCard,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
            glow: "shadow-emerald-500/10"
        },
        {
            title: "إجمالي الآجل",
            value: formatCurrency(Number(data.totalDeferred)),
            icon: AlertTriangle,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
            glow: "shadow-amber-500/10"
        },
        {
            title: "إجمالي الصيانة بدون قطع",
            value: formatCurrency(Number(data.laborRevenue)),
            icon: Activity,
            color: "text-cyan-400",
            bg: "bg-cyan-500/10",
            glow: "shadow-cyan-500/10"
        },
        {
            title: "تكلفة قطع الغيار",
            value: formatCurrency(Number(data.partsCOGS)),
            icon: CreditCard,
            color: "text-rose-400",
            bg: "bg-rose-500/10",
            glow: "shadow-rose-500/10"
        },
        {
            title: "عمولات المهندسين",
            value: formatCurrency(Number(data.totalCommissions)),
            icon: Users,
            color: "text-fuchsia-400",
            bg: "bg-fuchsia-500/10",
            glow: "shadow-fuchsia-500/10"
        },
        {
            title: "ربح الصيانة (صافي)",
            value: formatCurrency(Number(data.laborNetProfit)),
            icon: TrendingUp,
            color: "text-orange-400",
            bg: "bg-orange-500/10",
            glow: "shadow-orange-500/10"
        },
        {
            title: "صافي ربح القطع",
            value: formatCurrency(Number(data.partsNetProfit)),
            icon: TrendingUp,
            color: "text-teal-400",
            bg: "bg-teal-500/10",
            glow: "shadow-teal-500/10"
        },
        {
            title: "نسبة النجاح",
            value: `${data.successRatio}%`,
            icon: TrendingUp,
            color: "text-indigo-400",
            bg: "bg-indigo-500/10",
            glow: "shadow-indigo-500/10"
        },
        {
            title: "إجمالي ربح المركز",
            value: formatCurrency(Number(data.totalNetProfit)),
            icon: TrendingUp,
            color: "text-white",
            bg: "bg-primary",
            highlight: true,
            glow: "shadow-primary/30"
        }
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
            {kpis.map((kpi, i) => (
                <div 
                    key={i} 
                    className={cn(
                        "relative group rounded-2xl p-px overflow-hidden transition-all duration-300 hover:scale-[1.02] shadow-xl",
                        kpi.glow,
                        kpi.highlight ? "col-span-2 md:col-span-1 lg:col-span-1" : ""
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
                        <div className="flex items-center justify-between mb-3 border-b border-border/10 pb-2">
                            <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest leading-none",
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
                            "text-lg font-black tracking-tight mt-1",
                            kpi.highlight ? "text-white" : "text-foreground"
                        )}>
                            {kpi.value}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
