"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, Phone, X, Check, Loader2, UserPlus, MapPin } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { searchCustomers, createCustomer, getEmployeesForLink } from "@/actions/customer-actions";
import { useCartStore } from "@/store/cart";
import clsx from "clsx";
import { useFormatCurrency } from "@/contexts/SettingsContext";

export default function CustomerSearch() {
    const t = useTranslations("POS");
    const formatCurrency = useFormatCurrency();
    const { customerName, customerPhone, customerId, linkedEmployeeId, isSupplier, setCustomer } = useCartStore();

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
    const [newAddress, setNewAddress] = useState("");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState("");
    const [duplicateCustomer, setDuplicateCustomer] = useState<any>(null);

    // Employee Linking State
    const [isEmployee, setIsEmployee] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
    const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);

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
        setCustomer(
            customer.name, 
            customer.phone, 
            customer.id || undefined, 
            customer.balance, 
            customer.linkedEmployeeId || undefined, 
            customer.type === 'SUPPLIER',
            customer.address || undefined
        );
        setQuery(customer.name);
        setIsOpen(false);
        setShowAddForm(false);
        // Explicitly blur the input to release focus
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    const handleClear = () => {
        setCustomer("", "", undefined, undefined, undefined, undefined);
        setQuery("");
        setResults([]);
        setIsOpen(false);
        setShowAddForm(false);
        setNewName("");
        setNewPhone("");
        setNewAddress("");
        setCreateError("");
        setDuplicateCustomer(null);
        setIsEmployee(false);
        setSelectedEmployeeId("");
        // Explicitly blur the input to release focus
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    const openAddForm = () => {
        // Pre-fill name/phone from search query if it looks like a phone number
        const looksLikePhone = /^[\d\s+\-()]{7,}$/.test(query);
        setNewName(looksLikePhone ? "" : query);
        setNewPhone(looksLikePhone ? query : "");
        setNewAddress("");
        setCreateError("");
        setDuplicateCustomer(null);
        setIsEmployee(false);
        setSelectedEmployeeId("");
        setShowAddForm(true);
        setIsOpen(false);

        // Fetch employees
        if (employees.length === 0) {
            setLoadingEmployees(true);
            getEmployeesForLink().then(res => {
                if (res.success && res.employees) {
                    setEmployees(res.employees);
                }
                setLoadingEmployees(false);
            });
        }
    };

    const handleCreate = async () => {
        if (!newName.trim() || !newPhone.trim()) {
            setCreateError(t('requiredFields') || "الاسم ورقم الهاتف مطلوبان");
            return;
        }
        setCreating(true);
        setCreateError("");
        setDuplicateCustomer(null);

        const payload: any = { name: newName, phone: newPhone, address: newAddress };
        if (isEmployee && selectedEmployeeId) {
            payload.linkedEmployeeId = selectedEmployeeId;
        }

        const res = await createCustomer(payload);

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
            handleSelect({
                ...res.customer,
                address: newAddress
            });
            setShowAddForm(false);
            setNewName("");
            setNewPhone("");
            setNewAddress("");
        }
    };

    const isCustomerSelected = !!customerName;

    return (
        <div className="relative w-full z-30" ref={searchRef} data-inhibit-pos-focus="true">
            <div className="flex gap-2">
                {/* Search Input */}
                <div className={clsx(
                    "flex items-center gap-3 h-14 px-4 flex-1 border transition-all relative group/search rounded-2xl",
                    isCustomerSelected
                        ? "border-zinc-400 bg-zinc-100 dark:border-white/30 dark:bg-zinc-800 shadow-sm"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 focus-within:border-zinc-400 dark:focus-within:border-white/40"
                )}>
                    <User className={clsx(
                        "w-5 h-5 transition-colors pointer-events-none shrink-0",
                        isCustomerSelected ? "text-cyan-400" : "text-cyan-500/50 group-focus-within/search:text-cyan-400"
                    )} />
                    <div className="flex-1 overflow-hidden relative">
                        {isCustomerSelected && linkedEmployeeId && (
                            <span className="absolute end-0 top-1/2 -translate-y-1/2 text-[10px] bg-cyan-900/60 text-cyan-200 border border-cyan-500/40 px-2 py-0.5 rounded-full font-bold shadow-lg shadow-cyan-900/20 whitespace-nowrap z-10">
                                موظف داخلي
                            </span>
                        )}
                        {isCustomerSelected && isSupplier && (
                            <span className="absolute end-0 top-1/2 -translate-y-1/2 text-[10px] bg-emerald-900/60 text-emerald-200 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold shadow-lg shadow-emerald-900/20 whitespace-nowrap z-10 transition-all">
                                مورد
                            </span>
                        )}
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
                            className="bg-transparent outline-none w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-base text-zinc-900 dark:text-white font-bold pr-16"
                        />
                    </div>

                    {loading ? (
                        <div className="absolute end-12 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                        </div>
                    ) : (customerName || query) && (
                        <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClear();
                        }}
                            className="absolute end-3 h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-500 hover:text-red-400 transition-all active:scale-90"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Add New Customer Button */}
                {!isCustomerSelected && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openAddForm();
                        }}
                        title={t('addNewCustomer') || "إضافة عميل جديد"}
                        className={clsx(
                            "w-14 h-14 rounded-2xl flex items-center justify-center border transition-all active:scale-95 shrink-0 shadow-sm",
                            showAddForm
                                ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-black dark:border-white"
                                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-zinc-400 dark:hover:border-white/30 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        )}
                    >
                        <UserPlus className={clsx("w-5 h-5", showAddForm ? "animate-pulse" : "")} />
                    </button>
                )}
            </div>

            {/* Dropdown: Search Results */}
            {isOpen && results.length > 0 && !showAddForm && (
                <div 
                    role="dialog"
                    className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden max-h-[300px] overflow-y-auto animate-in fade-in zoom-in-95 duration-100 z-50"
                >
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
                                        {c.id ? (
                                            c.type === 'SUPPLIER' ? <User className="w-4 h-4 text-emerald-400" /> : <User className="w-4 h-4" />
                                        ) : <UserPlus className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm text-foreground">{c.name}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Phone className="w-3 h-3" /> {c.phone}
                                        </div>
                                        {c.address && (
                                            <div className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5 max-w-[200px] truncate">
                                                <MapPin className="w-2.5 h-2.5" /> {c.address}
                                            </div>
                                        )}
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
                                        {c.linkedEmployeeId && (
                                            <div className="mt-1">
                                                <span className="text-[10px] bg-cyan-900/60 text-cyan-200 border border-cyan-500/40 px-2 py-0.5 rounded-full font-bold">
                                                    موظف داخلي
                                                </span>
                                            </div>
                                        )}
                                        {c.type === 'SUPPLIER' && (
                                            <div className="mt-1">
                                                <span className="text-[10px] bg-emerald-900/60 text-emerald-200 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                                                    مورد
                                                </span>
                                            </div>
                                        )}
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
                            onMouseDown={(e) => { 
                                e.preventDefault(); 
                                e.stopPropagation();
                                openAddForm(); 
                            }}
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
                <div 
                    role="dialog"
                    className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 z-50"
                >
                    <div className="p-6 flex flex-col items-center gap-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/10">
                            <UserPlus className="w-6 h-6 text-cyan-500/50" />
                        </div>
                        <p className="text-sm text-zinc-400">{t('noCustomerFound') || "لا يوجد عميل بهذا الاسم أو الهاتف"}</p>
                        <button
                            onMouseDown={(e) => { 
                                e.preventDefault(); 
                                e.stopPropagation();
                                openAddForm(); 
                            }}
                            className="flex items-center gap-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-6 py-2.5 rounded-xl border border-cyan-500/30 text-sm font-bold transition-all active:scale-95 shadow-lg shadow-cyan-900/20"
                        >
                            <UserPlus className="w-5 h-5" />
                            {t('addAsNewCustomer') || "إضافة كعميل جديد"}
                        </button>
                    </div>
                </div>
            )}

            {/* Quick Add Form */}
            {showAddForm && (
                <div 
                    role="dialog"
                    className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 z-50"
                >
                    <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <UserPlus className="w-4 h-4 text-cyan-400" />
                            <span className="text-sm font-bold text-foreground">{t('addNewCustomer') || "إضافة عميل جديد"}</span>
                        </div>

                        {/* Name & Phone */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950 h-12 rounded-xl px-4 border border-zinc-200 dark:border-white/10 focus-within:border-zinc-400 dark:focus-within:border-white/40 transition-all">
                                <User className="w-4 h-4 text-zinc-500 shrink-0" />
                                <input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder={t('customerName') || "الاسم"}
                                    className="bg-transparent outline-none w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-sm text-zinc-900 dark:text-white"
                                    autoFocus
                                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                                />
                            </div>

                            <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950 h-12 rounded-xl px-4 border border-zinc-200 dark:border-white/10 focus-within:border-zinc-400 dark:focus-within:border-white/40 transition-all">
                                <Phone className="w-4 h-4 text-zinc-500 shrink-0" />
                                <input
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    placeholder={t('customerPhone') || "رقم الهاتف"}
                                    type="tel"
                                    className="bg-transparent outline-none w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-sm text-zinc-900 dark:text-white"
                                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                                />
                            </div>

                            <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950 h-12 rounded-xl px-4 border border-zinc-200 dark:border-white/10 focus-within:border-zinc-400 dark:focus-within:border-white/40 transition-all">
                                <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />
                                <input
                                    value={newAddress}
                                    onChange={(e) => setNewAddress(e.target.value)}
                                    placeholder={t('customerAddress') || "العنوان (اختياري)"}
                                    className="bg-transparent outline-none w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-sm text-zinc-900 dark:text-white"
                                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                                />
                            </div>
                        </div>

                        {/* Employee Link Toggle */}
                        <div className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-950/50 rounded-xl border border-zinc-200 dark:border-white/10">
                            <label className="flex items-center justify-between cursor-pointer group">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                                        <User className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{t('linkToEmployee') || "ربط بملف موظف"}</span>
                                </div>
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only" 
                                        checked={isEmployee}
                                        onChange={(e) => {
                                            setIsEmployee(e.target.checked);
                                            if (!e.target.checked) setSelectedEmployeeId("");
                                        }}
                                    />
                                    <div className={clsx(
                                        "w-10 h-6 bg-zinc-700/50 rounded-full transition-colors",
                                        isEmployee && "bg-cyan-500"
                                    )}></div>
                                    <div className={clsx(
                                        "absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform",
                                        isEmployee && "translate-x-4"
                                    )}></div>
                                </div>
                            </label>

                            {isEmployee && (
                                <div className="mt-2 animate-in slide-in-from-top-2 fade-in duration-200">
                                    {loadingEmployees ? (
                                        <div className="flex items-center gap-2 text-xs text-zinc-400 h-10 px-3">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            {t('loading') || "جاري التحميل..."}
                                        </div>
                                    ) : (
                                        <select
                                            value={selectedEmployeeId}
                                            onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                            className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors"
                                        >
                                            <option value="">{t('selectEmployee') || "اختر الموظف..."}</option>
                                            {employees.map(emp => (
                                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
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
