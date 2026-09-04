"use client";

import { ArrowUpCircle, ArrowDownCircle, Banknote, TrendingUp, Wallet } from "lucide-react";
import { ReportKPIs } from "../types";

interface KPICardsProps {
    kpis: ReportKPIs;
}

export function KPICards({ kpis }: KPICardsProps) {
    const cards = [
        {
            label: "الكاش الداخل",
            value: kpis.totalCashIn,
            icon: ArrowUpCircle,
            color: "text-green-400",
            bg: "bg-green-500/10",
            border: "border-green-500/30",
            shadow: "shadow-green-500/10",
        },
        {
            label: "الكاش الخارج",
            value: kpis.totalCashOut,
            icon: ArrowDownCircle,
            color: "text-red-400",
            bg: "bg-red-500/10",
            border: "border-red-500/30",
            shadow: "shadow-red-500/10",
        },
        {
            label: "الصافي",
            value: kpis.netCash,
            icon: Wallet,
            color: "text-cyan-400",
            bg: "bg-cyan-500/10",
            border: "border-cyan-500/30",
            shadow: "shadow-cyan-500/10",
        },
        {
            label: "الربح التقريبي",
            value: kpis.approximateProfit,
            icon: TrendingUp,
            color: "text-indigo-400",
            bg: "bg-indigo-500/10",
            border: "border-indigo-500/30",
            shadow: "shadow-indigo-500/10",
        },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {cards.map((card, i) => (
                <div
                    key={i}
                    className={`glass-card p-2.5 rounded-xl border ${card.border} ${card.bg} ${card.shadow} flex flex-col gap-1 transition-all shadow-xs`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">{card.label}</p>
                        <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                    </div>
                    <div className="flex items-baseline gap-1 mt-0.5">
                        <h2 className={`text-base font-mono font-bold ${card.color}`}>
                            {card.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h2>
                        <span className="text-[9px] text-muted-foreground font-bold">ج.م</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
