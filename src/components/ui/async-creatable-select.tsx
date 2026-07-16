"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "use-debounce";
import { SearchableOption } from "./searchable-select";

interface AsyncCreatableSelectProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    onAdd?: (newValue: string) => Promise<string | void> | void;
    fetchOptions: (query: string) => Promise<SearchableOption[]>;
    disabled?: boolean;
    defaultOptions?: SearchableOption[];
}

export function AsyncCreatableSelect({
    value,
    onChange,
    placeholder,
    className,
    onAdd,
    fetchOptions,
    disabled = false,
    defaultOptions = []
}: AsyncCreatableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [debouncedQuery] = useDebounce(query, 300);
    const [options, setOptions] = useState<SearchableOption[]>(defaultOptions);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initial value label lookup
    useEffect(() => {
        if (value) {
            const match = options.find(o => o.value === value);
            if (match && query !== match.label) {
                setQuery(match.label);
            }
        }
    }, [value, options]);

    useEffect(() => {
        let active = true;

        const loadOptions = async () => {
            if (!isOpen) return;
            setIsLoading(true);
            try {
                const results = await fetchOptions(debouncedQuery);
                if (active) {
                    setOptions(results);
                }
            } catch (err) {
                console.error("Failed to fetch options", err);
            } finally {
                if (active) setIsLoading(false);
            }
        };

        loadOptions();

        return () => {
            active = false;
        };
    }, [debouncedQuery, fetchOptions, isOpen]);

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
        onChange(option.value);
        setQuery(option.label);
        setIsOpen(false);
    };

    const handleAdd = async () => {
        if (!onAdd) return;
        const newValue = query.trim();
        if (newValue) {
            setIsCreating(true);
            try {
                const returnedValue = await onAdd(newValue);
                onChange(returnedValue || newValue);
                setIsOpen(false);
            } finally {
                setIsCreating(false);
            }
        }
    }

    const exactMatch = options.some(
        (opt) => opt.label.toLowerCase() === query.toLowerCase()
    );

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-10",
                        isOpen && "ring-2 ring-ring ring-offset-2"
                    )}
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                        // Clear selection if typing
                        if (value && e.target.value !== options.find(o => o.value === value)?.label) {
                            onChange("");
                        }
                    }}
                    onFocus={() => setIsOpen(true)}
                    disabled={disabled || isCreating}
                />
                <div className="absolute right-3 top-2.5 flex items-center gap-1 opacity-50">
                    {isLoading || isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronsUpDown className="h-4 w-4" />}
                </div>
            </div>

            {isOpen && !disabled && (
                <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground rounded-md border shadow-md max-h-[300px] overflow-auto">
                    {isLoading && options.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            Loading...
                        </div>
                    ) : (
                        <ul className="py-1">
                            {options.map((option) => (
                                <li
                                    key={option.value}
                                    className={cn(
                                        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                        value === option.value && "bg-accent text-accent-foreground"
                                    )}
                                    onClick={() => handleSelect(option)}
                                >
                                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                        {value === option.value && (
                                            <Check className="h-4 w-4" />
                                        )}
                                    </span>
                                    {option.label}
                                </li>
                            ))}
                            {query && !exactMatch && onAdd && (
                                <li
                                    className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm text-cyan-600 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950/50 outline-none"
                                    onClick={handleAdd}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create &quot;{query}&quot;
                                    <span className="ml-2 rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300">
                                        New
                                    </span>
                                </li>
                            )}
                            {!isLoading && options.length === 0 && !query && (
                                <li className="py-6 text-center text-sm text-muted-foreground">
                                    No results found.
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
