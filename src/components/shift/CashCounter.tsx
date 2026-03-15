"use client";

import { useState, useEffect } from "react";
import { Decimal } from "decimal.js";

interface Denomination {
    label: string | number;
    value: number;
    isCoin?: boolean;
}

const EGYPTIAN_DENOMINATIONS: Denomination[] = [
    { label: 200, value: 200 },
    { label: 100, value: 100 },
    { label: 50, value: 50 },
    { label: 20, value: 20 },
    { label: 10, value: 10 },
    { label: 5, value: 5 },
    { label: "1 (Paper)", value: 1 },
    { label: "Coins / Other", value: 1, isCoin: true },
];

import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";

interface CashCounterProps {
    onChange: (total: number, breakdown: Record<string, number>) => void;
    onEnterAtEnd?: () => void;
    initialBreakdown?: Record<string, number>;
}

export default function CashCounter({ onChange, onEnterAtEnd, initialBreakdown = {} }: CashCounterProps) {
    const { handleKeyDown, getNavProps } = useKeyboardNavigation();
    const [counts, setCounts] = useState<Record<string, number>>(() => {
        const initial: Record<string, number> = {};
        EGYPTIAN_DENOMINATIONS.forEach(d => {
            initial[d.label.toString()] = initialBreakdown[d.label.toString()] || 0;
        });
        return initial;
    });

    const calculateTotal = (currentCounts: Record<string, number>) => {
        let total = new Decimal(0);
        EGYPTIAN_DENOMINATIONS.forEach(d => {
            const count = currentCounts[d.label.toString()] || 0;
            if (d.isCoin) {
                // For coins, the "count" might actually be the amount directly depending on UX
                // But user requested "Number Input for the Count (Quantity of bills)"
                // For "Coins" we might treat it as a direct sum or just 1-unit coins
                total = total.plus(new Decimal(count));
            } else {
                total = total.plus(new Decimal(d.value).times(count));
            }
        });
        return total.toNumber();
    };

    const handleCountChange = (label: string, value: string) => {
        const numValue = value === "" ? 0 : parseFloat(value);
        if (isNaN(numValue) || numValue < 0) return;

        const newCounts = { ...counts, [label]: numValue };
        setCounts(newCounts);
        
        const total = calculateTotal(newCounts);
        onChange(total, newCounts);
    };

    return (
        <div className="space-y-3 bg-gray-900 bg-opacity-40 p-3 rounded-xl border border-gray-700" dir="rtl">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex justify-between items-center px-1">
                <span>عداد النقدية (Cash Counter)</span>
                <span className="text-blue-400">العملة المصرية</span>
            </h4>
            
            <div className="grid grid-cols-4 gap-2">
                {EGYPTIAN_DENOMINATIONS.slice(0, 7).map((d, index) => {
                    const labelStr = d.label.toString();
                    const count = counts[labelStr] || 0;
                    const rowTotal = d.value * count;

                    return (
                        <div key={labelStr} className={`flex flex-col gap-1 p-2 bg-gray-800 bg-opacity-40 rounded-lg border border-white/5 hover:border-blue-500/30 transition-all ${index >= 4 ? 'col-span-1 border-dashed' : ''}`}>
                            <div className="flex justify-between items-center px-0.5">
                                <span className="text-[11px] font-black text-gray-300">
                                    {d.label}
                                </span>
                                <span className="text-[9px] font-mono text-blue-400">
                                    {rowTotal > 0 ? rowTotal.toLocaleString() : ""}
                                </span>
                            </div>
                            
                            <input
                                type="number"
                                min="0"
                                {...getNavProps(index)}
                                value={count === 0 ? "" : count}
                                onChange={(e) => handleCountChange(labelStr, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, index, EGYPTIAN_DENOMINATIONS.slice(0, 7).length, onEnterAtEnd)}
                                className="w-full bg-black/40 border border-white/10 rounded px-1 py-1 text-white text-center text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none placeholder:text-gray-700"
                                placeholder="0"
                            />
                        </div>
                    );
                })}
            </div>

            <div className="pt-2 border-t border-gray-700/50 flex justify-between items-center text-white px-1">
                <span className="text-[11px] font-black text-gray-400">إجمالي النقدية</span>
                <span className="text-xl font-black text-blue-500 drop-shadow-sm">
                    {calculateTotal(counts).toLocaleString()} <span className="text-[10px] text-gray-500 font-normal">ج.م</span>
                </span>
            </div>
        </div>
    );
}
