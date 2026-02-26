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
        <div className="w-full px-4 md:px-8 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest">
                        <Activity className="w-3 h-3" />
                        مركز مراجعة العمليات
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight italic bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
                        السجلات والتقارير <span className="text-zinc-600 font-light font-sans not-italic">Logs</span>
                    </h1>
                    <p className="text-zinc-500 font-medium max-w-lg">
                        مراجعة، تعديل، ومرتجع فواتير البيع والشراء مع نظام تتبع آلي لضمان دقة المخزون والحسابات.
                    </p>
                </div>

                <div className="flex gap-4">
                    <div className="glass-card flex items-center gap-4 px-6 py-3 border-white/5 bg-zinc-900/40 rounded-2xl">
                        <div className="p-2 bg-emerald-500/10 rounded-xl">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">حالة الربط</span>
                            <span className="text-sm font-bold text-emerald-400">نظام آمن ومفعل</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Tabs Layout */}
            <Tabs defaultValue="sales" className="w-full" onValueChange={setActiveTab}>
                <div className="flex items-center justify-between mb-6">
                    <TabsList className="bg-zinc-900/60 border border-white/5 p-1 h-12 rounded-xl">
                        <TabsTrigger
                            value="sales"
                            className="px-6 rounded-lg gap-2 font-bold data-[state=active]:bg-cyan-500 data-[state=active]:text-black transition-all"
                        >
                            <ShoppingBag className="w-4 h-4" />
                            فواتير البيع
                        </TabsTrigger>
                        <TabsTrigger
                            value="purchases"
                            className="px-6 rounded-lg gap-2 font-bold data-[state=active]:bg-indigo-500 data-[state=active]:text-white transition-all"
                        >
                            <Truck className="w-4 h-4" />
                            فواتير المشتريات
                        </TabsTrigger>
                    </TabsList>

                    <div className="hidden lg:flex items-center gap-6">
                        {activeTab === 'sales' ? (
                            <>
                                <div className="flex flex-col text-right">
                                    <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">إجمالي المبيعات (الصافي)</span>
                                    <span className="text-cyan-400 font-bold text-sm font-mono">
                                        {salesTotals.netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="w-px h-8 bg-white/5" />
                                <div className="flex flex-col text-right">
                                    <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">عدد العمليات</span>
                                    <span className="text-zinc-300 font-bold text-sm font-mono">{salesTotals.count}</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex flex-col text-right">
                                    <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">إجمالي المشتريات الفعلي</span>
                                    <span className="text-indigo-400 font-bold text-sm font-mono">
                                        {purchaseTotals.actualTotal.toLocaleString()}
                                    </span>
                                </div>
                                <div className="w-px h-8 bg-white/5" />
                                <div className="flex flex-col text-right">
                                    <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">المتبقي للموردين</span>
                                    <span className="text-rose-400 font-bold text-sm font-mono">
                                        {purchaseTotals.remaining.toLocaleString()}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <TabsContent value="sales" className="mt-0 ring-0 focus-visible:ring-0">
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        <SalesLog initialSales={sales} csrfToken={csrfToken} onTotalsChange={setSalesTotals} />
                    </div>
                </TabsContent>

                <TabsContent value="purchases" className="mt-0 ring-0 focus-visible:ring-0">
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        <PurchaseLog initialPurchases={purchases} csrfToken={csrfToken} onTotalsChange={setPurchaseTotals} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
