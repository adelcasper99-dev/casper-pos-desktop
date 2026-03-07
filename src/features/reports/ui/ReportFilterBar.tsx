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
        <div className="glass-card p-4 rounded-2xl border border-border/50 bg-muted/20">
            <div className="flex flex-wrap items-center gap-4">

                {/* Date Picker */}
                <div className="flex items-center gap-2 flex-1 min-w-[300px]">
                    <Calendar className="w-4 h-4 text-cyan-400" />
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
                        className="w-full"
                    />
                </div>

                <div className="h-6 w-px bg-border hidden lg:block" />

                {/* Category Selector */}
                <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <select
                        value={filters.categoryGroup || "ALL"}
                        onChange={(e) => onFilterChange({ ...filters, categoryGroup: e.target.value as CategoryGroup })}
                        className="glass-input h-10 text-sm py-0 min-w-[140px] [&>option]:text-black"
                    >
                        {CATEGORIES.map(cat => (
                            <option key={cat.key} value={cat.key}>{cat.label}</option>
                        ))}
                    </select>
                </div>

                {/* Method Selector */}
                <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-purple-400" />
                    <select
                        value={filters.paymentMethod || "ALL"}
                        onChange={(e) => onFilterChange({ ...filters, paymentMethod: e.target.value })}
                        className="glass-input h-10 text-sm py-0 min-w-[140px] [&>option]:text-black"
                    >
                        {METHODS.map(m => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                    </select>
                </div>

                {/* Reset Button */}
                <button
                    onClick={() => onFilterChange({ categoryGroup: "ALL", paymentMethod: "ALL" })}
                    className="ms-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-bold text-xs transition-all border border-orange-500/20"
                >
                    <X className="w-4 h-4" /> مسح الفلاتر
                </button>
            </div>
        </div>
    );
}
