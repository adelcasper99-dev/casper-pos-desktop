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
        <div className="w-full px-4 md:px-8 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-[2400px] mx-auto">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-8">
                <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
                        <Activity className="w-3.5 h-3.5" />
                        مركز مراجعة العمليات
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tight text-foreground">
                            السجلات والتقارير <span className="text-muted-foreground font-light font-sans italic opacity-50">Logs</span>
                        </h1>
                        <p className="text-muted-foreground font-medium max-w-lg text-sm">
                            مراجعة، تعديل، ومرتجع فواتير البيع والشراء مع نظام تتبع آلي لضمان دقة المخزون والحسابات.
                        </p>
                    </div>
                </div>

                <div className="flex gap-4">
                    <div className="glass-card flex items-center gap-4 px-6 py-3 rounded-2xl border-border">
                        <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter opacity-70">حالة النظام</span>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">تشفير آمن ونشط</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Beam - High Impact Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {activeTab === 'sales' ? (
                    <>
                        <div className="glass-card p-5 rounded-2xl flex items-center gap-5 group hover:border-cyan-500/50 transition-all duration-300">
                            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 group-hover:scale-110 transition-transform">
                                <ShoppingBag className="w-6 h-6 text-cyan-500" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">إجمالي المبيعات</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-foreground">
                                        {salesTotals.netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[10px] font-bold text-muted-foreground">ج.م</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-card p-5 rounded-2xl flex items-center gap-5 group hover:border-indigo-500/50 transition-all duration-300">
                            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 transition-transform">
                                <FileText className="w-6 h-6 text-indigo-500" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">العمليات المنفذة</span>
                                <span className="text-2xl font-black text-foreground">{salesTotals.count}</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="glass-card p-5 rounded-2xl flex items-center gap-5 group hover:border-indigo-500/50 transition-all duration-300">
                            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 transition-transform">
                                <Truck className="w-6 h-6 text-indigo-500" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">إجمالي المشتريات</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-foreground">
                                        {purchaseTotals.actualTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[10px] font-bold text-muted-foreground">ج.م</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-card p-5 rounded-2xl flex items-center gap-5 group hover:border-rose-500/50 transition-all duration-300">
                            <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 group-hover:scale-110 transition-transform">
                                <ArrowDownLeft className="w-6 h-6 text-rose-500" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">مطبقي للموردين</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                                        {purchaseTotals.remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[10px] font-bold text-rose-500/60 font-sans italic">DR</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="glass-card p-5 rounded-2xl flex items-center gap-5 lg:col-span-2 bg-muted/40 border-dashed border-border group">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">تحليل البيانات اللحظي</span>
                        </div>
                        <p className="text-xs text-muted-foreground/80 leading-relaxed font-medium">
                            يتم تحديث هذه البيانات ديناميكياً بناءً على معايير البحث والتصفية المختارة أدناه. استخدم التصفية للنتائج المحددة.
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Tabs Layout */}
            <Tabs defaultValue="sales" className="w-full" onValueChange={setActiveTab}>
                <div className="flex items-center justify-between mb-8">
                    <TabsList className="bg-muted border border-border p-1 h-14 rounded-2xl shadow-inner max-w-fit">
                        <TabsTrigger
                            value="sales"
                            className="px-8 rounded-xl gap-2 font-black text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300"
                        >
                            <ShoppingBag className="w-4 h-4" />
                            فواتير البيع
                        </TabsTrigger>
                        <TabsTrigger
                            value="purchases"
                            className="px-8 rounded-xl gap-2 font-black text-sm data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-lg transition-all duration-300"
                        >
                            <Truck className="w-4 h-4" />
                            فواتير المشتريات
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="sales" className="mt-0 outline-none ring-0 focus-visible:ring-0">
                    <div className="animate-in fade-in slide-in-from-bottom-6 duration-500">
                        <SalesLog initialSales={sales} csrfToken={csrfToken} onTotalsChange={setSalesTotals} />
                    </div>
                </TabsContent>

                <TabsContent value="purchases" className="mt-0 outline-none ring-0 focus-visible:ring-0">
                    <div className="animate-in fade-in slide-in-from-bottom-6 duration-500">
                        <PurchaseLog initialPurchases={purchases} csrfToken={csrfToken} onTotalsChange={setPurchaseTotals} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
