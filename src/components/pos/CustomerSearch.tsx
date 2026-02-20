"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, Phone, X, Check, Loader2, UserPlus } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { searchCustomers } from "@/actions/customer-actions";
import { useCartStore } from "@/store/cart";
import clsx from "clsx";
import { useFormatCurrency } from "@/contexts/SettingsContext";

export default function CustomerSearch() {
    const t = useTranslations("POS");
    const formatCurrency = useFormatCurrency();
    const { customerName, customerPhone, customerId, setCustomer } = useCartStore();

    // Local state for search
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // Sync query with store initially or when cleared
    useEffect(() => {
        if (!isOpen && customerName) {
            setQuery(customerName);
        } else if (!isOpen && !customerName) {
            setQuery("");
        }
    }, [customerName, isOpen]);

    // Click outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Search Logic
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.length >= 2 && isOpen) {
                setLoading(true);
                searchCustomers(query).then(res => {
                    if (res?.customers) {
                        setResults(res.customers);
                    }
                    setLoading(false);
                });
            } else {
                setResults([]);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, isOpen]);

    const handleSelect = (customer: any) => {
        setCustomer(customer.name, customer.phone, customer.id || undefined);
        setQuery(customer.name);
        setIsOpen(false);
    };

    const handleClear = () => {
        setCustomer("", "", undefined);
        setQuery("");
        setResults([]);
        setIsOpen(false);
    };

    return (
        <div className="relative w-full z-30" ref={searchRef}>
            <div className="flex gap-3">
                <div className="bg-black/40 rounded-xl flex items-center gap-3 h-14 px-4 w-full border border-white/10 transition-all focus-within:border-cyan-500/50 focus-within:bg-black/60 relative group/search">
                    <User className="w-5 h-5 text-cyan-500/50 group-focus-within/search:text-cyan-400 transition-colors pointer-events-none" />
                    <input
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                            if (e.target.value === "") handleClear();
                        }}
                        onFocus={() => setIsOpen(true)}
                        placeholder={t('searchCustomer') || "Search Customer (Name/Phone)..."}
                        className="bg-transparent outline-none w-full placeholder:text-zinc-600 text-base text-white font-medium"
                    />

                    {loading ? (
                        <div className="absolute end-12 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                        </div>
                    ) : (customerName || query) && (
                        <button
                            onClick={handleClear}
                            className="absolute end-3 h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-500 hover:text-red-400 transition-all active:scale-90"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Dropdown Results */}
            {isOpen && results.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-2 space-y-1">
                        {results.map((c, i) => (
                            <button
                                key={i}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelect(c);
                                }}
                                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={clsx(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                                        c.id ? "bg-cyan-500/10 text-cyan-400" : "bg-yellow-500/10 text-yellow-500"
                                    )}>
                                        {c.id ? <User className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm text-foreground">{c.name}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Phone className="w-3 h-3" /> {c.phone}
                                        </div>
                                    </div>
                                </div>

                                {c.id ? (
                                    <div className="text-right">
                                        <div className="text-[10px] uppercase text-muted-foreground font-bold">Balance</div>
                                        <div className={clsx(
                                            "text-sm font-mono font-bold",
                                            c.balance > 0 ? "text-red-400" : "text-green-400"
                                        )}>
                                            {formatCurrency(c.balance)}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full font-bold">
                                        New
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
