"use client";

import { useMemo, useCallback } from "react";

export interface FinancialSummaryItem {
    label: string;
    value: number;
    type: "positive" | "negative" | "neutral";
    format?: "currency" | "number";
}

export interface FinancialSummaryTableProps {
    /** Total POS sales revenue */
    totalSales: number;
    /** Total returns/refunds (positive number) */
    totalReturns: number;
    /** Total expenses recorded */
    totalExpenses: number;
    /** Net cash = Sales - Returns - Expenses */
    netCash: number;
    /** Expected cash at closing */
    expectedCash: number;
    /** Variance = Actual - Expected */
    variance: number;
    /** Currency symbol, defaults to ج.م */
    currencySymbol?: string;
    /** Optional CSS class for container */
    className?: string;
}

/**
 * FinancialSummaryTable Component
 * 
 * Displays a shift's financial summary with:
 * - Total Sales
 * - Returns (shown as negative)
 * - Expenses (shown as negative)
 * - Net Cash
 * - Expected Cash
 * - Variance (difference with visual indicator)
 * 
 * @example
 * ```tsx
 * <FinancialSummaryTable
 *   totalSales={15000}
 *   totalReturns={500}
 *   totalExpenses={2000}
 *   netCash={12500}
 *   expectedCash={12600}
 *   variance={-100}
 * />
 * ```
 */
export default function FinancialSummaryTable({
    totalSales,
    totalReturns,
    totalExpenses,
    netCash,
    expectedCash,
    variance,
    currencySymbol = "ج.م",
    className = ""
}: FinancialSummaryTableProps) {
    /**
     * Format number as currency with Arabic numerals
     * @param value - The number to format
     * @returns Formatted string with currency symbol
     */
    const formatCurrency = useCallback((value: number): string => {
        const absValue = Math.abs(value);
        const formatted = absValue.toLocaleString("ar-EG", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return `${formatted} ${currencySymbol}`;
    }, [currencySymbol]);

    /**
     * Get color class based on value type
     * @param type - The item type (positive/negative/neutral)
     * @returns Tailwind color class
     */
    const getColorClass = useCallback((type: FinancialSummaryItem["type"]): string => {
        switch (type) {
            case "positive":
                return "text-emerald-600 dark:text-emerald-400";
            case "negative":
                return "text-red-600 dark:text-red-400";
            default:
                return "text-blue-600 dark:text-blue-400";
        }
    }, []);

    /**
     * Memoized summary items for performance
     */
    const summaryItems = useMemo<FinancialSummaryItem[]>(() => [
        {
            label: "إجمالي المبيعات",
            value: totalSales,
            type: "positive",
            format: "currency"
        },
        {
            label: "المرتجعات",
            value: -totalReturns,
            type: "negative",
            format: "currency"
        },
        {
            label: "المصروفات",
            value: -totalExpenses,
            type: "negative",
            format: "currency"
        },
        {
            label: "الصافي النقدي",
            value: netCash,
            type: netCash >= 0 ? "positive" : "negative",
            format: "currency"
        },
        {
            label: "السيناريو المتوقع",
            value: expectedCash,
            type: "neutral",
            format: "currency"
        }
    ], [totalSales, totalReturns, totalExpenses, netCash, expectedCash]);

    /**
     * Determine variance display properties
     */
    const varianceDisplay = useMemo(() => {
        const isProfit = variance >= 0;
        const absVariance = Math.abs(variance);
        
        return {
            isProfit,
            formattedValue: formatCurrency(absVariance),
            label: isProfit ? "ربح" : "عجز",
            colorClass: isProfit 
                ? "text-emerald-600 dark:text-emerald-400" 
                : "text-red-600 dark:text-red-400",
            bgClass: isProfit 
                ? "bg-emerald-50 dark:bg-emerald-900/20" 
                : "bg-red-50 dark:bg-red-900/20"
        };
    }, [variance, formatCurrency]);

    return (
        <div 
            className={`bg-card rounded-xl border border-border/50 p-5 shadow-sm ${className}`}
            role="region"
            aria-label="ملخص مالي لل وردية"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/30">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <svg 
                        className="w-4 h-4 text-primary" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" 
                        />
                    </svg>
                </div>
                <h3 className="font-bold text-foreground">الملخص المالي</h3>
            </div>

            {/* Summary Items */}
            <div className="space-y-3">
                {summaryItems.map((item, index) => (
                    <div 
                        key={`summary-item-${index}`}
                        className="flex justify-between items-center py-2"
                    >
                        <span className="text-sm text-muted-foreground">{item.label}</span>
                        <span className={`font-bold tabular-nums ${getColorClass(item.type)}`}>
                            {item.format === "currency" ? formatCurrency(item.value) : item.value.toLocaleString("ar-EG")}
                        </span>
                    </div>
                ))}
            </div>

            {/* Variance Section */}
            {variance !== 0 && (
                <div className={`mt-4 pt-4 border-t border-border/30 rounded-lg px-4 py-3 ${varianceDisplay.bgClass}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            {varianceDisplay.isProfit ? (
                                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                                </svg>
                            )}
                            <span className="text-sm font-medium text-muted-foreground">
                                الفرق ({varianceDisplay.label})
                            </span>
                        </div>
                        <span className={`font-black text-lg ${varianceDisplay.colorClass}`}>
                            {varianceDisplay.formattedValue}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}