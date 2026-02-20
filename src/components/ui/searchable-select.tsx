"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n-mock";

export interface SearchableOption {
    label: string;
    value: string;
}

interface SearchableSelectProps {
    options: (string | SearchableOption)[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    onAdd?: (newValue: string) => void;
    onSearch?: (query: string) => void;
    disabled?: boolean;
}

export function SearchableSelect({
    options,
    value,
    onChange,
    placeholder,
    className,
    onAdd,
    onSearch,
    disabled = false
}: SearchableSelectProps) {
    const t = useTranslations('UI.select');
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Normalize options to objects
    const normalizedOptions: SearchableOption[] = options.map(opt =>
        typeof opt === 'string' ? { label: opt, value: opt } : opt
    );

    const resolvedPlaceholder = placeholder || t('placeholder');

    const filteredOptions = query === ""
        ? normalizedOptions
        : normalizedOptions.filter((opt) =>
            opt.label.toLowerCase().includes(query.toLowerCase())
        );

    const exactMatch = filteredOptions.some(
        (opt) => opt.label.toLowerCase() === query.toLowerCase()
    );

    // Initial value sync
    useEffect(() => {
        if (value) {
            // Find option by value to get correct label
            const match = normalizedOptions.find(o => o.value === value || o.label === value);
            setQuery(match ? match.label : value);
        } else {
            setQuery("");
        }
    }, [value, options]); // Re-run if options change (important for async loading)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (option: SearchableOption) => {
        onChange(option.value); // Return the VALUE
        setQuery(option.label); // Show the LABEL
        setIsOpen(false);
    };

    const handleAdd = () => {
        if (!onAdd) return;
        const newValue = query.trim();
        if (newValue) {
            onAdd(newValue);
            onChange(newValue);
            setIsOpen(false);
        }
    }

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    className={cn(
                        "glass-input w-full pr-10 bg-transparent border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                    placeholder={resolvedPlaceholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (onSearch) onSearch(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            if (filteredOptions.length > 0) {
                                // If exact match or top result? 
                                // Best UX: If exact match exists, pick it. If not, pick top result?
                                // Let's pick top result if it matches query start or just top result.
                                handleSelect(filteredOptions[0]);
                            } else if (onAdd && query.trim()) {
                                handleAdd();
                            }
                        }
                    }}
                    disabled={disabled}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {value && (
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setQuery("");
                                inputRef.current?.focus();
                            }}
                            className="text-zinc-500 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    <ChevronsUpDown className="h-4 w-4 text-zinc-500 opacity-50 pointer-events-none" />
                </div>
            </div>

            {isOpen && !disabled && (
                <div className="absolute z-50 w-full mt-1 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto">
                    {filteredOptions.length === 0 && !onAdd && (
                        <div className="p-3 text-sm text-zinc-500 text-center">{t('noOptions')}</div>
                    )}

                    {filteredOptions.map((option) => (
                        <button
                            key={option.value} // Use value as key
                            type="button"
                            className={cn(
                                "w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors",
                                option.value === value ? "bg-cyan-500/20 text-cyan-400" : "text-zinc-300 hover:bg-white/10 hover:text-white"
                            )}
                            onClick={() => handleSelect(option)}
                        >
                            <span>{option.label}</span>
                            {option.value === value && <Check className="h-4 w-4" />}
                        </button>
                    ))}

                    {/* Create Option */}
                    {onAdd && query.trim() !== "" && !exactMatch && (
                        <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-cyan-400 hover:bg-cyan-500/10 border-t border-white/10"
                            onClick={handleAdd}
                        >
                            <Plus className="h-4 w-4" />
                            {t('create', { val: query })}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
