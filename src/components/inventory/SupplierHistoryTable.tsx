"use client";

import {
    ArrowUpRight, ArrowDownLeft, FileText, DollarSign,
    Calendar, Hash, X, Filter,
    Calendar as CalendarIcon
} from "lucide-react";
import { useState, Fragment } from "react";
import {
    startOfDay, endOfDay, subDays, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, isWithinInterval, format
} from 'date-fns';
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { useTranslations } from "@/lib/i18n-mock";
import { cn } from "@/lib/utils";

interface Transaction {
    id: string;
    date: Date;
    type: 'INVOICE' | 'PAYMENT';
    reference: string;
    amount: number;
    status: string;
    isCredit: boolean; // true = reduces debt (Payment), false = increases debt (Invoice)
    method?: string;
    items?: {
        name: string;
        sku: string;
        category: string;
        quantity: number;
        unitCost: number;
    }[];
    runningBalance?: number;
}

export default function SupplierHistoryTable({ transactions }: { transactions: Transaction[] }) {
    const t = useTranslations('Inventory.Suppliers.Details');
    const [dateFilter, setDateFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);

    const filteredTransactions = transactions.filter(tx => {
        if (dateRange?.from && dateRange?.to) {
            return isWithinInterval(new Date(tx.date), {
                start: dateRange.from,
                end: dateRange.to
            });
        }
        return true;
    });

    return (
        <div className="space-y-4 animate-fade-in-up">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 bg-muted/30 p-3 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">الفترة</span>
                </div>

                <div className="flex bg-background/50 p-1 rounded-lg border border-border/50">
                    <button
                        onClick={() => {
                            setDateFilter("today");
                            setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                            dateFilter === "today" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        اليوم
                    </button>
                    <button
                        onClick={() => {
                            const yesterday = subDays(new Date(), 1);
                            setDateFilter("yesterday");
                            setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                            dateFilter === "yesterday" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        أمس
                    </button>
                    <button
                        onClick={() => {
                            setDateFilter("week");
                            setDateRange({ from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) });
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                            dateFilter === "week" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        الأسبوع
                    </button>
                    <button
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                            dateFilter === "month" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        الشهر
                    </button>
                </div>

                <FlatpickrRangePicker
                    onRangeChange={(dates) => {
                        if (dates.length === 2) {
                            setDateRange({ from: dates[0], to: dates[1] });
                            setDateFilter("custom");
                        } else if (dates.length === 0) {
                            setDateRange(undefined);
                            setDateFilter("all");
                        }
                    }}
                    onClear={() => {
                        setDateRange(undefined);
                        setDateFilter("all");
                    }}
                    initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                    className="w-56"
                />

                {dateFilter !== "all" && (
                    <button
                        onClick={() => {
                            setDateRange(undefined);
                            setDateFilter("all");
                        }}
                        className="ms-auto flex items-center gap-1 text-[10px] text-orange-400 font-bold hover:text-orange-300 transition-colors"
                    >
                        <X className="w-3 h-3" /> مسح الفلتر
                    </button>
                )}
            </div>

            {filteredTransactions.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                    <FileText className="w-12 h-12 mb-4 opacity-20" />
                    <p>{t('noDebt')}</p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden bg-card border border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-start text-sm border-collapse">
                            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                                <tr>
                                    <th className="p-3 text-start border-r border-border/50">{t('table.date')}</th>
                                    <th className="p-3 text-start border-r border-border/50 w-[30%]">{t('table.description')}</th>
                                    <th className="p-3 text-center border-r border-border/50">{t('table.ref')}</th>
                                    <th className="p-3 text-end border-r border-border/50 bg-amber-500/5 text-amber-600">{t('table.debit')}</th>
                                    <th className="p-3 text-end border-r border-border/50 bg-emerald-500/5 text-emerald-600">{t('table.credit')}</th>
                                    <th className="p-3 text-end font-bold">{t('table.balance')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50 text-xs sm:text-sm">
                                {filteredTransactions.map((tx) => (
                                    <Fragment key={tx.id}>
                                        <tr className="hover:bg-muted/50 transition-colors group">
                                            <td className="p-3 border-r border-border/50 whitespace-nowrap font-mono text-muted-foreground">
                                                {format(new Date(tx.date), "dd/MM/yyyy")}
                                            </td>
                                            <td className="p-3 border-r border-border/50">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-foreground">
                                                        {tx.type === 'INVOICE' ? t('table.purchaseInvoice') : t('table.paymentReceived')}
                                                        {tx.method ? ` ${t('table.via')} ${tx.method}` : ''}
                                                    </span>
                                                    {tx.items && tx.items.length > 0 && (
                                                        <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                                            {tx.items.length} {t('table.items')}: {tx.items.map(i => i.name).join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 border-r border-border/50 text-center font-mono text-xs">
                                                {tx.reference}
                                            </td>

                                            {/* DEBIT (Invoice - Increases Debt) */}
                                            <td className="p-3 border-r border-border/50 text-end font-mono bg-amber-500/[0.02]">
                                                {!tx.isCredit && (
                                                    <span className="text-amber-600 font-medium">
                                                        {tx.amount.toFixed(2)}
                                                    </span>
                                                )}
                                            </td>

                                            {/* CREDIT (Payment - Reduces Debt) */}
                                            <td className="p-3 border-r border-border/50 text-end font-mono bg-emerald-500/[0.02]">
                                                {tx.isCredit && (
                                                    <span className="text-emerald-600 font-medium">
                                                        {tx.amount.toFixed(2)}
                                                    </span>
                                                )}
                                            </td>

                                            {/* RUNNING BALANCE */}
                                            <td className="p-3 text-end font-mono font-bold">
                                                <span className={(tx.runningBalance || 0) > 0 ? 'text-red-500' : 'text-green-500'}>
                                                    {(tx.runningBalance || 0).toFixed(2)}
                                                </span>
                                            </td>
                                        </tr>
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
