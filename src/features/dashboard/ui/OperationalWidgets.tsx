"use client";

import React from "react";
import Link from "next/link";
import {
    ActiveShiftSummary,
    TopProductItem,
    LowStockItem,
    RecentTransactionItem
} from "../types";
import {
    Clock,
    Flame,
    AlertTriangle,
    History,
    ChevronLeft,
    CheckCircle2,
    DollarSign,
    ShoppingCart,
    Calculator,
    Package
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface OperationalWidgetsProps {
    activeShift?: ActiveShiftSummary | null;
    topProducts?: TopProductItem[];
    lowStockItems?: LowStockItem[];
    recentTransactions?: RecentTransactionItem[];
}

export function OperationalWidgets({
    activeShift,
    topProducts = [],
    lowStockItems = [],
    recentTransactions = []
}: OperationalWidgetsProps) {
    const maxProductRevenue = topProducts.length > 0 ? Math.max(...topProducts.map((p) => p.revenue)) : 1;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
            {/* 1. Active Shift & Cash Drawer */}
            <div className="bg-card/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-xs flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                                <Clock className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">حالة الوردية النشطة</h3>
                                <p className="text-[11px] text-muted-foreground">متابعة الدرج الحالية</p>
                            </div>
                        </div>
                        {activeShift && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                مفتوحة
                            </span>
                        )}
                    </div>

                    {activeShift ? (
                        <div className="space-y-3 my-2 text-xs">
                            <div className="flex justify-between items-center py-1.5 border-b border-border/30">
                                <span className="text-muted-foreground">الكاشير:</span>
                                <span className="font-bold text-foreground">{activeShift.cashierName}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 border-b border-border/30">
                                <span className="text-muted-foreground">رصيد الافتتاح:</span>
                                <span className="font-mono font-bold text-foreground">{formatCurrency(activeShift.startCash)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 border-b border-border/30">
                                <span className="text-muted-foreground">كاش المبيعات بالدرج:</span>
                                <span className="font-mono font-bold text-emerald-500">{formatCurrency(activeShift.totalCashSales)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground">عدد فواتير الوردية:</span>
                                <span className="font-mono font-bold text-foreground">{activeShift.salesCount} فاتورة</span>
                            </div>
                        </div>
                    ) : (
                        <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center">
                            <Clock className="w-8 h-8 opacity-40 mb-2" />
                            <p className="font-bold">لا توجد وردية مفتوحة حالياً</p>
                            <p className="text-[11px] opacity-75 mt-0.5">افتح وردية جديدة لبدء البيع</p>
                        </div>
                    )}
                </div>

                <div className="pt-3 border-t border-border/40">
                    <Link
                        href="/pos"
                        className="w-full py-2 px-3 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-600/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                        <Calculator className="w-3.5 h-3.5" />
                        <span>{activeShift ? "متابعة البيع (POS)" : "فتح وردية جديدة"}</span>
                    </Link>
                </div>
            </div>

            {/* 2. Top 5 Best-Selling Products */}
            <div className="bg-card/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-xs flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500">
                                <Flame className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">الأكثر مبيعاً</h3>
                                <p className="text-[11px] text-muted-foreground">أعلى الأصناف إيراداً</p>
                            </div>
                        </div>
                    </div>

                    {topProducts.length > 0 ? (
                        <div className="space-y-3 my-2">
                            {topProducts.map((p, idx) => {
                                const pct = maxProductRevenue > 0 ? Math.round((p.revenue / maxProductRevenue) * 100) : 0;
                                return (
                                    <div key={p.id} className="space-y-1">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-foreground truncate max-w-[130px]" title={p.name}>
                                                {idx + 1}. {p.name}
                                            </span>
                                            <span className="font-mono text-muted-foreground text-[11px]">
                                                {formatCurrency(p.revenue)}
                                            </span>
                                        </div>
                                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-orange-500 rounded-full transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center">
                            <Package className="w-8 h-8 opacity-40 mb-2" />
                            <p className="font-bold">لا توجد بيانات للأصناف</p>
                            <p className="text-[11px] opacity-75">ستظهر هنا الأصناف الأكثر مبيعاً</p>
                        </div>
                    )}
                </div>

                <div className="pt-3 border-t border-border/40">
                    <Link
                        href="/reports"
                        className="w-full py-2 px-3 text-xs font-bold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1"
                    >
                        <span>تقرير المبيعات التفصيلي</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>

            {/* 3. Low Stock Warnings */}
            <div className="bg-card/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-xs flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
                                <AlertTriangle className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">نواقص المخزون</h3>
                                <p className="text-[11px] text-muted-foreground">أصناف قاربت على النفاد</p>
                            </div>
                        </div>
                        {lowStockItems.length > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                {lowStockItems.length} أصناف
                            </span>
                        )}
                    </div>

                    {lowStockItems.length > 0 ? (
                        <div className="space-y-2.5 my-2">
                            {lowStockItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="p-2 rounded-xl bg-background/60 border border-border/50 flex items-center justify-between text-xs"
                                >
                                    <div className="truncate max-w-[130px]">
                                        <p className="font-bold text-foreground truncate" title={item.name}>{item.name}</p>
                                        <p className="text-[10px] text-muted-foreground">حد الطلب: {item.minStock}</p>
                                    </div>
                                    <span className={`font-mono font-black px-2 py-0.5 rounded-md text-[11px] ${
                                        item.stock <= 0 ? "bg-rose-500/20 text-rose-500" : "bg-amber-500/20 text-amber-500"
                                    }`}>
                                        {item.stock} متبقي
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mb-2" />
                            <p className="font-bold">المخزون في حالة ممتازة</p>
                            <p className="text-[11px] opacity-75">لا توجد نواقص تحت حد الطلب</p>
                        </div>
                    )}
                </div>

                <div className="pt-3 border-t border-border/40">
                    <Link
                        href="/purchasing"
                        className="w-full py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>إنشاء أمر شراء</span>
                    </Link>
                </div>
            </div>

            {/* 4. Recent Transactions Feed */}
            <div className="bg-card/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-xs flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
                                <History className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">أحدث العمليات</h3>
                                <p className="text-[11px] text-muted-foreground">آخر فواتير تم تسجيلها</p>
                            </div>
                        </div>
                    </div>

                    {recentTransactions.length > 0 ? (
                        <div className="space-y-2.5 my-2">
                            {recentTransactions.map((tx) => (
                                <div
                                    key={tx.id}
                                    className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 text-xs"
                                >
                                    <div className="truncate max-w-[120px]">
                                        <p className="font-bold text-foreground truncate">{tx.reference}</p>
                                        <p className="text-[10px] text-muted-foreground">{tx.customerName}</p>
                                    </div>
                                    <div className="text-end">
                                        <p className="font-mono font-bold text-foreground">{formatCurrency(tx.amount)}</p>
                                        <span className="text-[10px] text-muted-foreground">{tx.paymentMethod}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center">
                            <History className="w-8 h-8 opacity-40 mb-2" />
                            <p className="font-bold">لا توجد حركات حديثة</p>
                            <p className="text-[11px] opacity-75">تظهر هنا فور إتمام المبيعات</p>
                        </div>
                    )}
                </div>

                <div className="pt-3 border-t border-border/40">
                    <Link
                        href="/pos"
                        className="w-full py-2 px-3 text-xs font-bold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1"
                    >
                        <span>سجل المبيعات</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
