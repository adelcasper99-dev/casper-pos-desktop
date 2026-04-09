"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
    label: string;
    value: string;
    disabled?: boolean;
}

export interface ComboboxProps {
    options: ComboboxOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    emptyText?: string;
    onQuickCreate?: (data: { name: string; phone?: string }) => void;
    quickCreateType?: 'SUPPLIER' | 'CATEGORY';
    side?: 'top' | 'bottom';
}

export function Combobox({
    options,
    value,
    onChange,
    placeholder = "Select...",
    className,
    disabled = false,
    emptyText = "No options found.",
    onQuickCreate,
    quickCreateType,
    side = 'bottom',
    ...props
}: ComboboxProps & Omit<React.HTMLAttributes<HTMLButtonElement>, 'onChange'>) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [quickPhone, setQuickPhone] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter options
    const filteredOptions = !options 
        ? [] 
        : query === ""
            ? options
            : options.filter((opt: ComboboxOption) =>
                opt.label.toLowerCase().includes(query.toLowerCase())
            );

    const exactMatch = options?.some((o: ComboboxOption) => o.label.toLowerCase() === query.toLowerCase());
    const showQuickCreate = onQuickCreate && query.trim().length > 0 && !exactMatch;

    // Create a display map for fast lookups
    const selectedLabel = options?.find((o: ComboboxOption) => o.value === value)?.label || "";

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setIsCreating(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Handle selection
    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setQuery(""); 
    };

    const handleQuickCreateClick = () => {
        if (quickCreateType === 'SUPPLIER') {
            setIsCreating(true);
        } else {
            onQuickCreate?.({ name: query.trim() });
            setIsOpen(false);
            setQuery("");
        }
    };

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            {/* Trigger Area - Looks like an Input */}
            <button
                type="button"
                className={cn(
                    "glass-input w-full flex items-center justify-between px-3 h-10 cursor-pointer transition-colors text-left",
                    disabled && "opacity-50 cursor-not-allowed",
                    !value && "text-muted-foreground"
                )}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                {...Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-')))}
            >
                <span className="truncate text-sm">
                    {selectedLabel || placeholder}
                </span>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground opacity-50" />
            </button>

            {/* Dropdown Content */}
            {isOpen && !disabled && (
                <div className={cn(
                    "absolute z-[70] w-full bg-white dark:bg-zinc-900/95 backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col font-cairo",
                    side === 'top' ? "bottom-full mb-1 origin-bottom" : "top-full mt-1 origin-top"
                )}>
                    {/* Search Input Sticky Top */}
                    {!isCreating && (
                        <div className="p-2 border-b border-black/5 dark:border-white/10">
                            <input
                                ref={inputRef}
                                autoFocus
                                className="w-full bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none px-2 py-1"
                                placeholder={options.length > 5 ? "ابحث..." : ""}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Options List */}
                    {!isCreating && (
                        <div className="max-h-60 overflow-y-auto p-1">
                            {filteredOptions.length === 0 && !showQuickCreate ? (
                                <div className="py-6 text-center text-sm text-muted-foreground px-2">
                                    {emptyText}
                                </div>
                            ) : (
                                <>
                                    {filteredOptions.map((opt: ComboboxOption) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            disabled={opt.disabled}
                                            className={cn(
                                                "w-full text-left px-2 py-2 text-sm flex items-center justify-between rounded-md transition-colors",
                                                opt.value === value
                                                    ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-500"
                                                    : "text-zinc-900 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5",
                                                opt.disabled && "opacity-50 cursor-not-allowed"
                                            )}
                                            onClick={() => !opt.disabled && handleSelect(opt.value)}
                                        >
                                            <span>{opt.label}</span>
                                            {opt.value === value && <Check className="h-4 w-4" />}
                                        </button>
                                    ))}

                                    {showQuickCreate && (
                                        <button
                                            type="button"
                                            onClick={handleQuickCreateClick}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-emerald-500/10 transition-colors text-start group border-t border-white/5 mt-1"
                                        >
                                            <span className="flex-shrink-0 p-1 bg-emerald-500/10 text-emerald-500 rounded-md group-hover:bg-emerald-500/20">
                                                <Plus className="w-3 h-3" />
                                            </span>
                                            <div>
                                                <div className="text-xs font-black text-emerald-500">إضافة جديد</div>
                                                <div className="text-[10px] text-muted-foreground truncate max-w-[14rem]">"{query.trim()}"</div>
                                            </div>
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Inline Creation Form (Suppliers only for now) */}
                    {isCreating && (
                        <div className="p-3 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                             <div className="flex items-center gap-2 mb-1">
                                <Plus className="w-3 h-3 text-emerald-500" />
                                <span className="text-[10px] font-black uppercase text-zinc-400">إضافة مورد جديد</span>
                             </div>
                             <div>
                                <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">الاسم</label>
                                <input 
                                    className="w-full h-8 bg-white/5 border border-white/10 rounded-lg px-2 text-xs outline-none focus:border-emerald-500/50"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                             </div>
                             <div>
                                <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">رقم الهاتف</label>
                                <input 
                                    className="w-full h-8 bg-white/5 border border-white/10 rounded-lg px-2 text-xs outline-none focus:border-emerald-500/50 font-mono"
                                    placeholder="01xxxxxxxxx"
                                    autoFocus
                                    value={quickPhone}
                                    onChange={e => setQuickPhone(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onQuickCreate?.({ name: query.trim(), phone: quickPhone.trim() });
                                            setIsOpen(false);
                                            setIsCreating(false);
                                            setQuery("");
                                            setQuickPhone("");
                                        }
                                    }}
                                />
                             </div>
                             <div className="flex gap-2 pt-1">
                                <button 
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="flex-1 h-8 rounded-lg bg-white/5 text-[10px] font-bold hover:bg-white/10"
                                >
                                    إلغاء
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => {
                                        onQuickCreate?.({ name: query.trim(), phone: quickPhone.trim() });
                                        setIsOpen(false);
                                        setIsCreating(false);
                                        setQuery("");
                                        setQuickPhone("");
                                    }}
                                    className="flex-1 h-8 rounded-lg bg-emerald-500 text-black text-[10px] font-black hover:bg-emerald-400"
                                >
                                    حفظ
                                </button>
                             </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
