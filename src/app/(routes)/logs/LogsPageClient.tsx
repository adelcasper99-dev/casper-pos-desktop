'use client';

import { useState } from 'react';
import {
    History, ShoppingBag, Truck,
    FileText, ArrowDownLeft, ArrowUpRight,
    Activity, ShieldCheck
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SalesLog from '@/components/logs/SalesLog';
import PurchaseLog from '@/components/logs/PurchaseLog';

interface LogsPageClientProps {
    sales: any[];
    purchases: any[];
    csrfToken?: string;
}

export default function LogsPageClient({ sales, purchases, csrfToken }: LogsPageClientProps) {
    const [activeTab, setActiveTab] = useState("sales");
    const [salesTotals, setSalesTotals] = useState({ netTotal: 0, count: 0 });
    const [purchaseTotals, setPurchaseTotals] = useState({ actualTotal: 0, remaining: 0 });

    return (
        <div className="w-full p-2.5 sm:p-3.5 space-y-2.5 animate-in fade-in duration-300 max-w-[2400px] mx-auto font-cairo" dir="rtl">
            {/* Header Section */}
            <div className="flex items-center justify-between gap-2.5 bg-zinc-50/80 dark:bg-zinc-900/40 p-2 px-3.5 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-xs">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs">
                        <History className="w-4 h-4" />
                    </div>
                    <h1 className="text-sm sm:text-base font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                        السجلات والتقارير <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">Logs</span>
                        <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400 hidden sm:inline">(مراجعة وتتبع فواتير البيع والشراء)</span>
                    </h1>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>تشفير آمن ونشط</span>
                </div>
            </div>

            {/* Summary Beam - Compact Totals */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                {activeTab === 'sales' ? (
                    <>
                        <div className="bg-zinc-900/80 border border-cyan-500/25 rounded-2xl p-2.5 px-3 flex items-center gap-3 shadow-xs hover:border-cyan-500/40 transition-all">
                            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                                <ShoppingBag className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-zinc-400 leading-tight mb-0.5">إجمالي المبيعات</span>
                                <span className="text-base sm:text-lg font-black text-cyan-400 font-mono tracking-tight tabular-nums flex items-center gap-1">
                                    {salesTotals.netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    <span className="text-[10px] font-normal opacity-70 italic font-cairo">ج.م</span>
                                </span>
                            </div>
                        </div>

                        <div className="bg-zinc-900/80 border border-indigo-500/25 rounded-2xl p-2.5 px-3 flex items-center gap-3 shadow-xs hover:border-indigo-500/40 transition-all">
                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                <FileText className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-zinc-400 leading-tight mb-0.5">العمليات المنفذة</span>
                                <span className="text-base sm:text-lg font-black text-white font-mono tracking-tight tabular-nums">
                                    {salesTotals.count}
                                </span>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-zinc-900/80 border border-indigo-500/25 rounded-2xl p-2.5 px-3 flex items-center gap-3 shadow-xs hover:border-indigo-500/40 transition-all">
                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                <Truck className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-zinc-400 leading-tight mb-0.5">إجمالي المشتريات</span>
                                <span className="text-base sm:text-lg font-black text-indigo-400 font-mono tracking-tight tabular-nums flex items-center gap-1">
                                    {purchaseTotals.actualTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    <span className="text-[10px] font-normal opacity-70 italic font-cairo">ج.م</span>
                                </span>
                            </div>
                        </div>

                        <div className="bg-zinc-900/80 border border-rose-500/25 rounded-2xl p-2.5 px-3 flex items-center gap-3 shadow-xs hover:border-rose-500/40 transition-all">
                            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                                <ArrowDownLeft className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-zinc-400 leading-tight mb-0.5">متبقي للموردين</span>
                                <span className="text-base sm:text-lg font-black text-rose-500 font-mono tracking-tight tabular-nums flex items-center gap-1">
                                    {purchaseTotals.remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    <span className="text-[10px] font-normal opacity-70 italic font-mono">DR</span>
                                </span>
                            </div>
                        </div>
                    </>
                )}

                {/* Tabs Embedded in Summary Row */}
                <Tabs defaultValue="sales" className="w-full flex items-center" onValueChange={setActiveTab}>
                    <TabsList className="bg-zinc-100 dark:bg-muted/50 border border-zinc-200 dark:border-white/10 p-1 h-11 rounded-2xl shadow-inner w-full flex">
                        <TabsTrigger
                            value="sales"
                            className="flex-1 rounded-xl gap-1.5 font-bold text-xs h-9 data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900 transition-all cursor-pointer"
                        >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            فواتير البيع
                        </TabsTrigger>
                        <TabsTrigger
                            value="purchases"
                            className="flex-1 rounded-xl gap-1.5 font-bold text-xs h-9 data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900 transition-all cursor-pointer"
                        >
                            <Truck className="w-3.5 h-3.5" />
                            فواتير المشتريات
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Main Tabs Content */}
            <div className="w-full">
                {activeTab === "sales" ? (
                    <div className="animate-in fade-in duration-300">
                        <SalesLog initialSales={sales} csrfToken={csrfToken} onTotalsChange={setSalesTotals} />
                    </div>
                ) : (
                    <div className="animate-in fade-in duration-300">
                        <PurchaseLog initialPurchases={purchases} csrfToken={csrfToken} onTotalsChange={setPurchaseTotals} />
                    </div>
                )}
            </div>
        </div>
    );
}
