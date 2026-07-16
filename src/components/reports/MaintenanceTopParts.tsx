'use client';

import React from 'react';
import { formatCurrency } from "@/lib/utils";
import { Award, ShoppingBag, Coins, TrendingUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PartAggregate {
    name: string;
    qty: number;
    revenue: number;
    profit: number;
    type: string;
}

interface MaintenanceTopPartsProps {
    data: {
        selling: PartAggregate[];
        profitable: PartAggregate[];
    };
}

export function MaintenanceTopParts({ data }: MaintenanceTopPartsProps) {
    const { selling = [], profitable = [] } = data || {};

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            {/* Column 1: الأكثر مبيعاً */}
            <div className="relative group rounded-3xl p-px overflow-hidden shadow-2xl transition-all duration-300 hover:shadow-cyan-500/5">
                {/* Border Gradient effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute inset-0 bg-card/40 backdrop-blur-xl" />
                
                <div className="relative p-6 rounded-3xl border border-border/80 bg-card/40 flex flex-col h-full min-h-[400px]">
                    <div className="flex items-center justify-between mb-6 border-b border-border/10 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/5 animate-pulse">
                                <Award className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-foreground tracking-tight">القطع والخدمات الأكثر طلباً</h3>
                                <p className="text-xs text-muted-foreground font-semibold">مرتبة تنازلياً حسب الكمية المباعة</p>
                            </div>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">الأكثر مبيعاً</span>
                    </div>

                    {selling.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 py-10 text-muted-foreground font-medium">
                            <ShoppingBag className="w-8 h-8 opacity-20 mb-2" />
                            <p className="text-sm">لا توجد بيانات مبيعات متوفرة حالياً</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 flex-1">
                            {selling.map((item, idx) => (
                                <div 
                                    key={idx}
                                    className="relative flex items-center justify-between p-4 rounded-2xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-all duration-300 group/item hover:translate-x-[-4px]"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center font-mono font-black text-cyan-400 text-sm">
                                            #{idx + 1}
                                        </div>
                                        <div>
                                            <div className="text-sm font-black text-foreground group-hover/item:text-cyan-400 transition-colors">
                                                {item.name}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={cn(
                                                    "text-[10px] font-extrabold px-2 py-0.5 rounded-md",
                                                    item.type === 'SERVICE' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                )}>
                                                    {item.type === 'SERVICE' ? 'خدمة' : 'قطعة غيار'}
                                                </span>
                                                <span className="text-xs text-muted-foreground font-semibold">
                                                    إيراد: {formatCurrency(item.revenue)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-left">
                                        <div className="text-base font-black text-foreground">
                                            {item.qty} <span className="text-xs text-muted-foreground font-medium">وحدة</span>
                                        </div>
                                        <div className="text-[11px] text-emerald-400 font-bold mt-0.5 flex items-center justify-end gap-1">
                                            <TrendingUp className="w-3 h-3" />
                                            <span>ربح: {formatCurrency(item.profit)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Column 2: الأكثر ربحاً */}
            <div className="relative group rounded-3xl p-px overflow-hidden shadow-2xl transition-all duration-300 hover:shadow-emerald-500/5">
                {/* Border Gradient effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute inset-0 bg-card/40 backdrop-blur-xl" />
                
                <div className="relative p-6 rounded-3xl border border-border/80 bg-card/40 flex flex-col h-full min-h-[400px]">
                    <div className="flex items-center justify-between mb-6 border-b border-border/10 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-500/5 animate-pulse">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-foreground tracking-tight">القطع والخدمات الأكثر ربحية</h3>
                                <p className="text-xs text-muted-foreground font-semibold">مرتبة تنازلياً حسب صافي الربح المحقق للمركز</p>
                            </div>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">الأكثر ربحاً</span>
                    </div>

                    {profitable.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 py-10 text-muted-foreground font-medium">
                            <Coins className="w-8 h-8 opacity-20 mb-2" />
                            <p className="text-sm">لا توجد بيانات أرباح متوفرة حالياً</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 flex-1">
                            {profitable.map((item, idx) => (
                                <div 
                                    key={idx}
                                    className="relative flex items-center justify-between p-4 rounded-2xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-all duration-300 group/item hover:translate-x-[-4px]"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center font-mono font-black text-emerald-400 text-sm">
                                            #{idx + 1}
                                        </div>
                                        <div>
                                            <div className="text-sm font-black text-foreground group-hover/item:text-emerald-400 transition-colors">
                                                {item.name}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={cn(
                                                    "text-[10px] font-extrabold px-2 py-0.5 rounded-md",
                                                    item.type === 'SERVICE' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                )}>
                                                    {item.type === 'SERVICE' ? 'خدمة' : 'قطعة غيار'}
                                                </span>
                                                <span className="text-xs text-muted-foreground font-semibold">
                                                    الكمية: {item.qty}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-left">
                                        <div className="text-base font-black text-emerald-400">
                                            {formatCurrency(item.profit)}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                                            إيراد: {formatCurrency(item.revenue)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
