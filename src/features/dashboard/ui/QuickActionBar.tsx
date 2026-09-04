"use client";

import React from "react";
import Link from "next/link";
import {
    Calculator,
    ShoppingCart,
    Coins,
    Package,
    Wrench,
    BarChart3,
    ArrowUpRight
} from "lucide-react";

export function QuickActionBar() {
    const actions = [
        {
            title: "نقطة البيع (POS)",
            desc: "بدء البيع وإصدار الفواتير",
            href: "/pos",
            icon: Calculator,
            color: "text-cyan-500",
            bg: "bg-cyan-500/10",
            border: "border-cyan-500/20 hover:border-cyan-500/40"
        },
        {
            title: "فاتورة مشتريات",
            desc: "تسجيل بضاعة واردة جديدة",
            href: "/purchasing",
            icon: ShoppingCart,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20 hover:border-amber-500/40"
        },
        {
            title: "المخزون والمنتجات",
            desc: "جرد وإدارة بطاقات الأصناف",
            href: "/inventory",
            icon: Package,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20 hover:border-blue-500/40"
        },
        {
            title: "تسجيل مصروف",
            desc: "إثبات نفقات ونثريات الخزينة",
            href: "/treasury",
            icon: Coins,
            color: "text-rose-500",
            bg: "bg-rose-500/10",
            border: "border-rose-500/20 hover:border-rose-500/40"
        },
        {
            title: "تذاكر الصيانة",
            desc: "استلام وتسليم أجهزة العملاء",
            href: "/spare-parts",
            icon: Wrench,
            color: "text-purple-500",
            bg: "bg-purple-500/10",
            border: "border-purple-500/20 hover:border-purple-500/40"
        },
        {
            title: "التقارير التحليلية",
            desc: "الأرباح والخسائر والتدفق النقدي",
            href: "/reports",
            icon: BarChart3,
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20 hover:border-emerald-500/40"
        }
    ];

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                إجراءات سريعة
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {actions.map((action, idx) => {
                    const Icon = action.icon;
                    return (
                        <Link
                            key={idx}
                            href={action.href}
                            className={`p-3.5 rounded-2xl border transition-all hover:scale-[1.02] bg-card/60 backdrop-blur-md shadow-xs flex flex-col justify-between group cursor-pointer ${action.border}`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className={`p-2 rounded-xl ${action.bg}`}>
                                    <Icon className={`w-4 h-4 ${action.color}`} />
                                </div>
                                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] transition-all" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                                    {action.title}
                                </h4>
                                <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                    {action.desc}
                                </p>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
