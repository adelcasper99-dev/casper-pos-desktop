"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { Combobox } from "@/components/ui/combobox";
import { TreasuryLogFilters } from "../types";
import { Search, Filter, Calendar, Tag } from "lucide-react";
import { startOfDay, endOfDay, format } from "date-fns";

interface TreasuryFilterBarProps {
    filters: TreasuryLogFilters;
    onFilterChange: (filters: TreasuryLogFilters) => void;
    dbCategories: { value: string, label: string }[];
}

export function TreasuryFilterBar({ filters, onFilterChange, dbCategories }: TreasuryFilterBarProps) {
    return (
        <div className="relative z-10 flex flex-wrap items-center gap-2 bg-zinc-50 dark:bg-white/[0.02] p-2 rounded-xl border border-zinc-200 dark:border-white/5">
            {/* Category Combobox */}
            <div className="flex items-center gap-1.5 min-w-[180px]">
                <Tag className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <Combobox
                    options={dbCategories}
                    value={filters.category || "ALL"}
                    onChange={(val) => onFilterChange({ ...filters, category: val })}
                    placeholder="اختر التصنيف..."
                />
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                <Input
                    placeholder="البحث برقم المرجع أو البيان..."
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 rounded-xl h-8.5 text-xs pr-9 focus-visible:ring-1 focus-visible:ring-primary/50"
                    value={filters.search || ""}
                    onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
                />
            </div>

            {/* Date Range Picker */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-white/5 px-2.5 h-8.5">
                <Calendar className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <FlatpickrRangePicker
                    className="bg-transparent border-none text-xs text-zinc-900 dark:text-zinc-300 focus:ring-0 min-w-[190px] font-bold"
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
            <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <Select
                    value={filters.direction || "ALL"}
                    onValueChange={(val) => onFilterChange({ ...filters, direction: val as any })}
                >
                    <SelectTrigger className="w-[125px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 text-zinc-900 dark:text-zinc-300 rounded-xl h-8.5 text-xs">
                        <SelectValue placeholder="نوع الحركة" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-300 rounded-xl shadow-xl text-xs">
                        <SelectItem value="ALL">كل الحركات</SelectItem>
                        <SelectItem value="IN">الوارد فقط</SelectItem>
                        <SelectItem value="OUT">الصادر فقط</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
