"use client";

import { useState, useEffect, useRef } from "react";

interface MoneyCounterProps {
    initialTotal?: number;
    showToggle?: boolean;
    defaultExpanded?: boolean;
    currency?: 'USD' | 'EGP';
}

// Common denominations
const USD_DENOMINATIONS = [
    { value: 100, label: "$100" },
    { value: 50, label: "$50" },
    { value: 20, label: "$20" },
    { value: 10, label: "$10" },
    { value: 5, label: "$5" },
    { value: 1, label: "$1" },
];

const EGP_DENOMINATIONS = [
    { value: 200, label: "200" },
    { value: 100, label: "100" },
    { value: 50, label: "50" },
    { value: 20, label: "20" },
    { value: 10, label: "10" },
    { value: 5, label: "5" },
    { value: 1, label: "1" },
];

export default function MoneyCounter({ 
    initialTotal = 0, 
    showToggle = true, 
    defaultExpanded = false,
    currency = 'EGP' 
}: MoneyCounterProps) {
    const [counts, setCounts] = useState<Record<number, string>>(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem(`money-counter-${currency}`);
            return saved ? JSON.parse(saved) : {};
        }
        return {};
    });
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const mounted = useRef(false);
    const prevTotal = useRef<number | null>(null);

    const denominations = currency === 'USD' ? USD_DENOMINATIONS : EGP_DENOMINATIONS;
    const currencySymbol = currency === 'USD' ? '$' : 'ج.م';

    // Persist counts to session storage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(`money-counter-${currency}`, JSON.stringify(counts));
        }
    }, [counts, currency]);

    // Removed auto-emitting logic so it just acts as a calculator.
    useEffect(() => {
        mounted.current = true;
    }, []);

    const setCount = (value: number, countStr: string) => {
        setCounts(prev => ({ ...prev, [value]: countStr }));
    };

    const clearAll = () => {
        setCounts({});
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const nextIndex = index + 1;
            if (nextIndex < denominations.length) {
                inputRefs.current[nextIndex]?.focus();
                inputRefs.current[nextIndex]?.select();
            }
        }
    };

    const total = Object.entries(counts).reduce((sum, [value, countStr]) => {
        const count = parseInt(countStr) || 0;
        return sum + (parseFloat(value) * count);
    }, 0);

    return (
        <div className="bg-gray-800/50 rounded-lg border border-gray-600/50">
            {showToggle && (
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full p-3 flex items-center justify-between text-sm font-medium text-gray-300 hover:bg-gray-700/50 transition-colors rounded-lg"
                >
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        {currency === 'EGP' ? 'عداد النقدية' : 'Money Counter'}
                    </div>
                    <div className="flex items-center gap-2">
                        {total > 0 && (
                            <span className="text-green-400 font-bold">
                                {currency === 'USD' ? `${currencySymbol}${total.toFixed(2)}` : `${total.toLocaleString()} ${currencySymbol}`}
                            </span>
                        )}
                        <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </button>
            )}

            {isExpanded && (
                <div className="p-3 pt-0 space-y-2">
                    {/* All denominations in a simple grid */}
                    <div className="grid grid-cols-4 gap-2">
                        {denominations.map((denom, index) => {
                            const countStr = counts[denom.value] || "";
                            const countNum = parseInt(countStr) || 0;
                            return (
                                <div key={`${denom.value}-${index}`} className="text-center">
                                    <div className={`text-[10px] font-semibold mb-1 ${denom.value >= 1 ? 'text-green-400' : 'text-gray-400'}`}>
                                        {denom.label}
                                    </div>
                                    <input
                                        ref={el => { inputRefs.current[index] = el; }}
                                        type="number"
                                        min="0"
                                        value={countStr}
                                        onChange={(e) => setCount(denom.value, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, index)}
                                        onFocus={(e) => e.target.select()}
                                        placeholder="0"
                                        className="w-full h-8 bg-gray-700 border border-gray-600 rounded text-center text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent no-spinner"
                                    />
                                    {countNum > 0 && (
                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                            {currency === 'USD' ? `${currencySymbol}${(countNum * denom.value).toFixed(2)}` : `${(countNum * denom.value).toLocaleString()}`}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Total and Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-600">
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-400/10"
                        >
                            {currency === 'EGP' ? 'تفريغ' : 'Clear'}
                        </button>
                        <div className="text-right">
                            <span className="text-xs text-gray-400 mr-2">{currency === 'EGP' ? 'الإجمالي:' : 'Total:'}</span>
                            <span className="text-lg font-bold text-green-400">
                                {currency === 'USD' ? `${currencySymbol}${total.toFixed(2)}` : `${total.toLocaleString()} ${currencySymbol}`}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
