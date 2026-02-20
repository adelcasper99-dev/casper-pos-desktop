"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
    label: string;
    value: string;
    disabled?: boolean;
}

interface ComboboxProps {
    options: ComboboxOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    className?: string;
    disabled?: boolean;
    emptyText?: string;
}

export function Combobox({
    options,
    value,
    onChange,
    placeholder = "Select...",
    className,
    disabled = false,
    emptyText = "Twjood options found."
}: ComboboxProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter options
    const filteredOptions = query === ""
        ? options
        : options.filter((opt) =>
            opt.label.toLowerCase().includes(query.toLowerCase())
        );

    // Create a display map for fast lookups
    const selectedLabel = options.find(o => o.value === value)?.label || "";

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Handle selection
    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setQuery(""); // Reset query on select? Or keep it? Usually reset.
    };

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            {/* Trigger Area - Looks like an Input */}
            <div
                className={cn(
                    "glass-input w-full flex items-center justify-between px-3 h-10 cursor-pointer transition-colors",
                    disabled && "opacity-50 cursor-not-allowed",
                    !value && "text-muted-foreground"
                )}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className="truncate text-sm">
                    {selectedLabel || placeholder}
                </span>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground opacity-50" />
            </div>

            {/* Dropdown Content */}
            {isOpen && !disabled && (
                <div className="absolute z-[60] w-full mt-1 bg-popover/95 backdrop-blur-xl border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                    {/* Search Input Sticky Top */}
                    <div className="p-2 border-b border-white/5">
                        <input
                            ref={inputRef}
                            autoFocus
                            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none px-2 py-1"
                            placeholder={options.length > 5 ? "Type to search..." : ""}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>

                    {/* Options List */}
                    <div className="max-h-60 overflow-y-auto p-1">
                        {filteredOptions.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground px-2">
                                {emptyText}
                            </div>
                        ) : (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    disabled={opt.disabled}
                                    className={cn(
                                        "w-full text-left px-2 py-2 text-sm flex items-center justify-between rounded-md transition-colors",
                                        opt.value === value
                                            ? "bg-cyan-500/20 text-cyan-500"
                                            : "text-foreground hover:bg-muted",
                                        opt.disabled && "opacity-50 cursor-not-allowed"
                                    )}
                                    onClick={() => !opt.disabled && handleSelect(opt.value)}
                                >
                                    <span>{opt.label}</span>
                                    {opt.value === value && <Check className="h-4 w-4" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
