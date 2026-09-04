"use client";

import { Filter, X, Calendar, CreditCard, Layers } from "lucide-react";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { CategoryGroup, TransactionReportFilters } from "../types";

const CATEGORIES: { key: CategoryGroup; label: string }[] = [
    { key: "ALL", label: "كل التصنيفات" },
    { key: "SALES", label: "المبيعات" },
    { key: "PURCHASES", label: "المشتريات" },
    { key: "EXPENSES", label: "المصروفات" },
    { key: "DRAWINGS", label: "المسحوبات" },
];

const METHODS = [
    { key: "ALL", label: "كل طرق الدفع" },
    { key: "CASH", label: "نقداً" },
    { key: "VISA", label: "فيزا / بطاقة" },
    { key: "WALLET", label: "محفظة" },
    { key: "INSTAPAY", label: "انستاباي" },
];

interface ReportFilterBarProps {
    filters: TransactionReportFilters;
    onFilterChange: (filters: TransactionReportFilters) => void;
}

export function ReportFilterBar({ filters, onFilterChange }: ReportFilterBarProps) {
    return (
        <div className="p-2.5 rounded-xl border border-border/50 bg-card/40 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">

                {/* Date Picker */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <FlatpickrRangePicker
                        onRangeChange={(dates) => {
                            if (dates.length === 2) {
                                onFilterChange({
                                    ...filters,
                                    startDate: dates[0].toISOString(),
                                    endDate: dates[1].toISOString()
                                });
                            }
                        }}
                        onClear={() => onFilterChange({ ...filters, startDate: undefined, endDate: undefined })}
                        initialDates={filters.startDate ? [new Date(filters.startDate), new Date(filters.endDate!)] : []}
                        className="w-full h-8 text-xs"
                    />
                </div>

                <div className="h-5 w-px bg-border/60 hidden lg:block" />

                {/* Category Selector */}
                <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <select
                        value={filters.categoryGroup || "ALL"}
                        onChange={(e) => onFilterChange({ ...filters, categoryGroup: e.target.value as CategoryGroup })}
                        className="glass-input h-8 text-xs py-0 px-2 min-w-[120px] rounded-xl [&>option]:text-black"
                    >
                        {CATEGORIES.map(cat => (
                            <option key={cat.key} value={cat.key}>{cat.label}</option>
                        ))}
                    </select>
                </div>

                {/* Method Selector */}
                <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <select
                        value={filters.paymentMethod || "ALL"}
                        onChange={(e) => onFilterChange({ ...filters, paymentMethod: e.target.value })}
                        className="glass-input h-8 text-xs py-0 px-2 min-w-[120px] rounded-xl [&>option]:text-black"
                    >
                        {METHODS.map(m => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                    </select>
                </div>

                {/* Reset Button */}
                <button
                    onClick={() => onFilterChange({ categoryGroup: "ALL", paymentMethod: "ALL" })}
                    className="ms-auto flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-bold text-xs transition-all border border-orange-500/20 h-8"
                >
                    <X className="w-3.5 h-3.5" /> مسح الفلاتر
                </button>
            </div>
        </div>
    );
}
