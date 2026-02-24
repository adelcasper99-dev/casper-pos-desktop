"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, Phone, X, Check, Loader2, UserPlus } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { searchCustomers, createCustomer } from "@/actions/customer-actions";
import { useCartStore } from "@/store/cart";
import clsx from "clsx";
import { useFormatCurrency } from "@/contexts/SettingsContext";

export default function CustomerSearch() {
    const t = useTranslations("POS");
    const formatCurrency = useFormatCurrency();
    const { customerName, customerPhone, customerId, setCustomer } = useCartStore();

    // Search state
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // Quick-add form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState("");
    const [duplicateCustomer, setDuplicateCustomer] = useState<any>(null);

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
                setShowAddForm(false);
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
        setCustomer(customer.name, customer.phone, customer.id || undefined, customer.balance);
        setQuery(customer.name);
        setIsOpen(false);
        setShowAddForm(false);
    };

    const handleClear = () => {
        setCustomer("", "", undefined, undefined);
        setQuery("");
        setResults([]);
        setIsOpen(false);
        setShowAddForm(false);
        setNewName("");
        setNewPhone("");
        setCreateError("");
        setDuplicateCustomer(null);
    };

    const openAddForm = () => {
        // Pre-fill name/phone from search query if it looks like a phone number
        const looksLikePhone = /^[\d\s+\-()]{7,}$/.test(query);
        setNewName(looksLikePhone ? "" : query);
        setNewPhone(looksLikePhone ? query : "");
        setCreateError("");
        setDuplicateCustomer(null);
        setShowAddForm(true);
        setIsOpen(false);
    };

    const handleCreate = async () => {
        if (!newName.trim() || !newPhone.trim()) {
            setCreateError(t('requiredFields') || "الاسم ورقم الهاتف مطلوبان");
            return;
        }
        setCreating(true);
        setCreateError("");
        setDuplicateCustomer(null);

        const res = await createCustomer({ name: newName, phone: newPhone });

        setCreating(false);

        if (res?.error) {
            setCreateError(res.error);
            if (res.customer) {
                setDuplicateCustomer(res.customer);
                // We show the error and the duplicate customer info instead of auto-selecting
            }
            return;
        }

        if (res?.customer) {
            handleSelect(res.customer);
            setShowAddForm(false);
            setNewName("");
            setNewPhone("");
        }
    };

    const isCustomerSelected = !!customerName;

    return (
        <div className="relative w-full z-30" ref={searchRef}>
            <div className="flex gap-2">
                {/* Search Input */}
                <div className={clsx(
                    "bg-black/40 rounded-xl flex items-center gap-3 h-14 px-4 flex-1 border transition-all relative group/search",
                    isCustomerSelected
                        ? "border-cyan-500/50 bg-black/60"
                        : "border-white/10 focus-within:border-cyan-500/50 focus-within:bg-black/60"
                )}>
                    <User className={clsx(
                        "w-5 h-5 transition-colors pointer-events-none shrink-0",
                        isCustomerSelected ? "text-cyan-400" : "text-cyan-500/50 group-focus-within/search:text-cyan-400"
                    )} />
                    <input
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                            setShowAddForm(false);
                            if (e.target.value === "") handleClear();
                        }}
                        onFocus={() => {
                            setIsOpen(true);
                            setShowAddForm(false);
                        }}
                        placeholder={t('searchCustomer') || "ابحث عن عميل (اسم / هاتف)..."}
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

                {/* Add New Customer Button */}
                {!isCustomerSelected && (
                    <button
                        onClick={openAddForm}
                        title={t('addNewCustomer') || "إضافة عميل جديد"}
                        className={clsx(
                            "w-14 h-14 rounded-xl flex items-center justify-center border transition-all active:scale-95 shrink-0",
                            showAddForm
                                ? "bg-cyan-500 text-black border-cyan-400"
                                : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20"
                        )}
                    >
                        <UserPlus className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Dropdown: Search Results */}
            {isOpen && results.length > 0 && !showAddForm && (
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
                                        <div className="text-[10px] uppercase text-muted-foreground font-bold">{t('balance') || "رصيد"}</div>
                                        <div className={clsx(
                                            "text-sm font-mono font-bold",
                                            c.balance > 0 ? "text-red-400" : "text-green-400"
                                        )}>
                                            {formatCurrency(c.balance)}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full font-bold">
                                        {t('new') || "جديد"}
                                    </span>
                                )}
                            </button>
                        ))}

                        {/* Add New button at bottom of results */}
                        <button
                            onMouseDown={(e) => { e.preventDefault(); openAddForm(); }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-cyan-500/10 text-cyan-400 transition-colors border border-dashed border-cyan-500/20 mt-1"
                        >
                            <UserPlus className="w-4 h-4" />
                            <span className="text-sm font-bold">{t('addNewCustomer') || "إضافة عميل جديد"}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* No results — show add button */}
            {isOpen && !loading && query.length >= 2 && results.length === 0 && !showAddForm && (
                <div className="absolute top-full left-0 w-full mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-4 flex flex-col items-center gap-3 text-center">
                        <p className="text-sm text-muted-foreground">{t('noCustomerFound') || "لا يوجد عميل بهذا الاسم أو الهاتف"}</p>
                        <button
                            onMouseDown={(e) => { e.preventDefault(); openAddForm(); }}
                            className="flex items-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded-xl border border-cyan-500/20 text-sm font-bold transition-all"
                        >
                            <UserPlus className="w-4 h-4" />
                            {t('addAsNewCustomer') || "إضافة كعميل جديد"}
                        </button>
                    </div>
                </div>
            )}

            {/* Quick Add Form */}
            {showAddForm && (
                <div className="absolute top-full left-0 w-full mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 z-40">
                    <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <UserPlus className="w-4 h-4 text-cyan-400" />
                            <span className="text-sm font-bold text-foreground">{t('addNewCustomer') || "إضافة عميل جديد"}</span>
                        </div>

                        {/* Name */}
                        <div className="flex items-center gap-3 bg-black/30 rounded-xl px-4 h-12 border border-white/10 focus-within:border-cyan-500/50 transition-all">
                            <User className="w-4 h-4 text-zinc-500 shrink-0" />
                            <input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder={t('customerName') || "الاسم"}
                                className="bg-transparent outline-none w-full placeholder:text-zinc-600 text-sm text-white"
                                autoFocus
                                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            />
                        </div>

                        {/* Phone */}
                        <div className="flex items-center gap-3 bg-black/30 rounded-xl px-4 h-12 border border-white/10 focus-within:border-cyan-500/50 transition-all">
                            <Phone className="w-4 h-4 text-zinc-500 shrink-0" />
                            <input
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value)}
                                placeholder={t('customerPhone') || "رقم الهاتف"}
                                type="tel"
                                className="bg-transparent outline-none w-full placeholder:text-zinc-600 text-sm text-white"
                                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            />
                        </div>

                        {/* Error & Duplicate Handling */}
                        {createError && (
                            <div className="space-y-2">
                                <p className="text-xs text-red-400 px-1">{createError}</p>
                                {duplicateCustomer && (
                                    <button
                                        onClick={() => handleSelect(duplicateCustomer)}
                                        className="w-full flex items-center justify-between p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-left"
                                    >
                                        <div className="flex items-center gap-2">
                                            <User className="w-3 h-3 text-cyan-400" />
                                            <div className="text-xs">
                                                <div className="font-bold text-white">{duplicateCustomer.name}</div>
                                                <div className="text-cyan-400/70">{duplicateCustomer.phone}</div>
                                            </div>
                                        </div>
                                        <div className="text-[10px] bg-cyan-500 text-black px-2 py-0.5 rounded-full font-bold">
                                            {t('select') || "اختيار"}
                                        </div>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => { setShowAddForm(false); setCreateError(""); }}
                                className="flex-1 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-sm font-bold transition-all border border-white/10"
                            >
                                {t('cancel') || "إلغاء"}
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={creating || !newName.trim() || !newPhone.trim()}
                                className="flex-1 h-10 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {creating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                                {creating ? (t('adding') || "جاري الإضافة...") : (t('add') || "إضافة")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
