"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { Combobox } from "@/components/ui/combobox";
import { TreasuryLogFilters } from "../types";
import { Search, Filter, Calendar, Tag } from "lucide-react";
import { startOfDay, endOfDay, format } from "date-fns";

const TREASURY_CATEGORIES = [
    { value: "ALL", label: "كل التصنيفات" },
    { value: "مبيعات", label: "مبيعات" },
    { value: "سداد عميل", label: "سداد عميل" },
    { value: "إيداع نقدي", label: "إيداع نقدي" },
    { value: "تحويل وارد", label: "تحويل وارد" },
    { value: "مشتريات", label: "مشتريات" },
    { value: "مصاريف عامة", label: "مصاريف عامة" },
    { value: "سحب نقدي", label: "سحب نقدي" },
    { value: "تحويل صادر", label: "تحويل صادر" }
];

interface TreasuryFilterBarProps {
    filters: TreasuryLogFilters;
    onFilterChange: (filters: TreasuryLogFilters) => void;
}

export function TreasuryFilterBar({ filters, onFilterChange }: TreasuryFilterBarProps) {
    return (
        <div className="relative z-50 flex flex-wrap items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-white/5 backdrop-blur-md mb-6">
            {/* Category Combobox */}
            <div className="flex items-center gap-2 min-w-[200px]">
                <Tag className="h-4 w-4 text-zinc-500" />
                <Combobox
                    options={TREASURY_CATEGORIES}
                    value={filters.category || "ALL"}
                    onChange={(val) => onFilterChange({ ...filters, category: val })}
                    placeholder="اختر التصنيف..."
                />
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                    placeholder="البحث برقم المرجع أو البيان..."
                    className="glass-input pr-10 border-white/10 focus:border-cyan-500/50"
                    value={filters.search || ""}
                    onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
                />
            </div>

            {/* Date Range Picker */}
            <div className="flex items-center gap-2 bg-zinc-900 rounded-lg border border-white/5 px-3 py-1">
                <Calendar className="h-4 w-4 text-zinc-500" />
                <FlatpickrRangePicker
                    className="bg-transparent border-none text-sm text-zinc-300 focus:ring-0 min-w-[240px]"
                    placeholder="اختر الفترة الزمنية"
                    onClear={() => {
                        onFilterChange({
                            ...filters,
                            startDate: undefined,
                            endDate: undefined
                        });
                    }}
                    onRangeChange={(dates: any) => {
                        if (dates.length === 2) {
                            onFilterChange({
                                ...filters,
                                startDate: format(dates[0], 'yyyy-MM-dd'),
                                endDate: format(dates[1], 'yyyy-MM-dd')
                            });
                        }
                    }}
                />
            </div>

            {/* Direction Filter */}
            <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-zinc-500" />
                <Select
                    value={filters.direction || "ALL"}
                    onValueChange={(val) => onFilterChange({ ...filters, direction: val as any })}
                >
                    <SelectTrigger className="w-[140px] glass-input border-white/10 text-zinc-300">
                        <SelectValue placeholder="نوع الحركة" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 text-zinc-300">
                        <SelectItem value="ALL">كل الحركات</SelectItem>
                        <SelectItem value="IN">الوارد فقط</SelectItem>
                        <SelectItem value="OUT">الصادر فقط</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
