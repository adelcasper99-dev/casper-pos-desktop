"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Truck, Phone, Mail, MapPin, Check, Search, Filter, ChevronDown, X, Clock, Loader2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { createSupplier, updateSupplier, deleteSupplier, paySupplier } from "@/actions/inventory";
import { formatCurrency, cn } from "@/lib/utils";
import GlassModal from "../ui/GlassModal";
import { useTranslations } from "@/lib/i18n-mock";
import { getEmployeesForLink } from "@/actions/customer-actions";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { 
    startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, 
    startOfMonth, endOfMonth, isWithinInterval 
} from "date-fns";
import clsx from "clsx";

export default function SuppliersTab({ suppliers, csrfToken, currency = "EGP" }: { suppliers: any[], csrfToken?: string, currency?: string }) {
    const t = useTranslations('Purchasing.Suppliers');
    const tCommon = useTranslations('Common');
    const router = useRouter();
    const [isAddMode, setIsAddMode] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Filtering States
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);

    // Form State
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [address, setAddress] = useState("");
    const [createError, setCreateError] = useState("");
    const [duplicateSupplier, setDuplicateSupplier] = useState<any>(null);

    // Employee Linking State
    const [isEmployee, setIsEmployee] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
    const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    const filteredSuppliers = suppliers.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             s.phone?.includes(searchTerm);
        if (!matchesSearch) return false;

        if (statusFilter === 'inDebt' && s.balance <= 0) return false;
        if (statusFilter === 'credit' && s.balance >= 0) return false;

        if (dateRange?.from && dateRange?.to) {
            const createdDate = new Date(s.createdAt);
            return isWithinInterval(createdDate, {
                start: dateRange.from,
                end: dateRange.to
            });
        }

        return true;
    });

    const stats = {
        totalDebt: filteredSuppliers.reduce((acc, s) => acc + (Number(s.balance) > 0 ? Number(s.balance) : 0), 0),
        totalCredit: filteredSuppliers.reduce((acc, s) => acc + (Number(s.balance) < 0 ? Math.abs(Number(s.balance)) : 0), 0),
        inDebtCount: filteredSuppliers.filter(s => Number(s.balance) > 0).length
    };

    function resetForm() {
        setName("");
        setPhone("");
        setEmail("");
        setAddress("");
        setEditingId(null);
        setIsAddMode(false);
        setCreateError("");
        setDuplicateSupplier(null);
        setIsEmployee(false);
        setSelectedEmployeeId("");
    }

    async function handleSave() {
        if (!name.trim()) return;
        setLoading(true);
        setCreateError("");
        setDuplicateSupplier(null);

        const data: any = {
            name,
            phone,
            email,
            address,
            csrfToken
        };

        if (isEmployee && selectedEmployeeId) {
            data.linkedEmployeeId = selectedEmployeeId;
        } else {
            data.linkedEmployeeId = null;
        }

        let res;
        if (editingId) {
            res = await updateSupplier({ id: editingId, ...data });
        } else {
            res = await createSupplier(data);
        }

        setLoading(false);

        if (res?.success) {
            resetForm();
        } else {
            setCreateError(res?.error || "Failed to save supplier");
            if (res?.duplicateSupplier) {
                setDuplicateSupplier(res.duplicateSupplier);
            }
        }
    }

    async function handleDelete(id: string) {
        if (confirm(t('confirmDelete'))) {
            setLoading(true);
            const res = await deleteSupplier({ id, csrfToken });
            setLoading(false);

            if (!res?.success) {
                alert(res?.error || "Failed to delete supplier");
            }
        }
    }

    function startEdit(s: any) {
        setEditingId(s.id);
        setName(s.name);
        setPhone(s.phone || "");
        setEmail(s.email || "");
        setAddress(s.address || "");
        
        if (s.linkedEmployeeId) {
            setIsEmployee(true);
            setSelectedEmployeeId(s.linkedEmployeeId);
            fetchEmployees();
        } else {
            setIsEmployee(false);
            setSelectedEmployeeId("");
        }

        setIsAddMode(true);
    }

    async function fetchEmployees() {
        if (employees.length > 0) return;
        setLoadingEmployees(true);
        const res = await getEmployeesForLink();
        if (res.success && res.employees) {
            setEmployees(res.employees);
        }
        setLoadingEmployees(false);
    }

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState("");
    const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState<any>(null);

    function startPayment(s: any) {
        setSelectedSupplierForPayment(s);
        setPaymentAmount("");
        setIsPaymentModalOpen(true);
    }

    async function handlePayment() {
        if (!selectedSupplierForPayment || !paymentAmount) return;
        setLoading(true);
        await paySupplier({ supplierId: selectedSupplierForPayment.id, amount: parseFloat(paymentAmount), csrfToken });
        setLoading(false);
        setIsPaymentModalOpen(false);
        setSelectedSupplierForPayment(null);
    }

    return (
        <div className="space-y-2.5 animate-fly-in font-cairo" dir="rtl">
            {/* Stats Cards (Clearly Defined, Stacked & Visible) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. إجمالي المديونية (عليهم/علينا) */}
                <div className="bg-zinc-900/80 dark:bg-zinc-900/80 border border-rose-500/25 rounded-2xl p-2.5 px-3.5 flex items-center gap-3 shadow-sm hover:border-rose-500/40 transition-all">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                        <ArrowUpRight className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10.5px] font-bold text-zinc-400 leading-tight mb-0.5">{t('stats.totalDebt')}</span>
                        <span className="text-base sm:text-lg font-black text-rose-500 font-mono tracking-tight tabular-nums">
                            {formatCurrency(stats.totalDebt, currency)}
                        </span>
                    </div>
                </div>

                {/* 2. عدد الموردين */}
                <div className="bg-zinc-900/80 dark:bg-zinc-900/80 border border-zinc-700/60 dark:border-white/10 rounded-2xl p-2.5 px-3.5 flex items-center gap-3 shadow-sm hover:border-cyan-500/30 transition-all">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                        <Truck className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10.5px] font-bold text-zinc-400 leading-tight mb-0.5">{t('stats.suppliersCount')}</span>
                        <span className="text-base sm:text-lg font-black text-white font-mono tracking-tight tabular-nums">
                            {filteredSuppliers.length}
                        </span>
                    </div>
                </div>

                {/* 3. إجمالي لنا (دائن) */}
                <div className="bg-zinc-900/80 dark:bg-zinc-900/80 border border-emerald-500/25 rounded-2xl p-2.5 px-3.5 flex items-center gap-3 shadow-sm hover:border-emerald-500/40 transition-all">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <ArrowDownLeft className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10.5px] font-bold text-zinc-400 leading-tight mb-0.5">إجمالي لنا (دائن)</span>
                        <span className="text-base sm:text-lg font-black text-emerald-500 font-mono tracking-tight tabular-nums">
                            {formatCurrency(stats.totalCredit, currency)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="flex gap-2 items-center flex-wrap justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                    <div className="relative flex-1 group/search">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 group-focus-within/search:text-zinc-900 dark:group-focus-within/search:text-white transition-all pointer-events-none" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={t('search')}
                            className="w-full h-8.5 ps-8 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:border-zinc-900 dark:focus:border-white transition-all font-bold text-xs rounded-xl shadow-inner"
                        />
                    </div>

                    <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900/50 p-1 rounded-xl border border-zinc-200 dark:border-white/10 flex-wrap shadow-inner">
                        <button
                            onClick={() => {
                                setDateFilter("today");
                                setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
                            }}
                            className={clsx(
                                "h-6.5 text-[10px] font-black px-2.5 rounded-lg transition-all uppercase tracking-widest cursor-pointer",
                                dateFilter === "today" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            اليوم
                        </button>
                        <button
                            onClick={() => {
                                const yesterday = subDays(new Date(), 1);
                                setDateFilter("yesterday");
                                setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
                            }}
                            className={clsx(
                                "h-6.5 text-[10px] font-black px-2.5 rounded-lg transition-all uppercase tracking-widest cursor-pointer",
                                dateFilter === "yesterday" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            أمس
                        </button>
                        <button
                            onClick={() => {
                                setDateFilter("week");
                                setDateRange({ from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) });
                            }}
                            className={clsx(
                                "h-6.5 text-[10px] font-black px-2.5 rounded-lg transition-all uppercase tracking-widest cursor-pointer",
                                dateFilter === "week" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            الأسبوع
                        </button>
                        <button
                            onClick={() => {
                                setDateFilter("month");
                                setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                            }}
                            className={clsx(
                                "h-6.5 text-[10px] font-black px-2.5 rounded-lg transition-all uppercase tracking-widest cursor-pointer",
                                dateFilter === "month" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            الشهر
                        </button>

                        <div className="w-px h-3.5 bg-zinc-200 dark:bg-white/10 mx-1 hidden sm:block" />

                        <FlatpickrRangePicker
                            onRangeChange={(dates: Date[]) => {
                                if (dates.length === 2) {
                                    setDateRange({ from: dates[0], to: dates[1] });
                                    setDateFilter("custom");
                                } else if (dates.length === 0) {
                                    setDateRange(undefined);
                                    setDateFilter("all");
                                }
                            }}
                            onClear={() => {
                                setDateRange(undefined);
                                setDateFilter("all");
                            }}
                            initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                            className="w-48 min-w-[170px] bg-transparent border-0 text-[11px] h-6.5 text-zinc-900 dark:text-zinc-300 placeholder:text-zinc-400 font-bold"
                        />
                    </div>
                </div>

                <div className="flex gap-2 items-center">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-zinc-200 dark:border-white/10 gap-2 h-8.5 px-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl shadow-inner text-xs">
                                <Filter className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
                                <span className="font-black text-xs uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
                                    {statusFilter === 'all' ? t('filters.all') : 
                                     statusFilter === 'inDebt' ? t('filters.inDebt') : 
                                     t('filters.credit')}
                                </span>
                                <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-2 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-400 mb-2 px-3">
                                {t('filters.status')}
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setStatusFilter('all')} className={cn("rounded-lg font-bold px-3 py-2 text-xs", statusFilter === 'all' ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-300")}>
                                {t('filters.all')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('inDebt')} className={cn("rounded-lg font-bold px-3 py-2 text-xs", statusFilter === 'inDebt' ? "bg-rose-500/10 text-rose-600" : "text-zinc-600 dark:text-zinc-300")}>
                                {t('filters.inDebt')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('credit')} className={cn("rounded-lg font-bold px-3 py-2 text-xs", statusFilter === 'credit' ? "bg-emerald-500/10 text-emerald-600" : "text-zinc-600 dark:text-zinc-300")}>
                                {t('filters.credit')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {(dateFilter !== "all" || statusFilter !== 'all' || searchTerm !== "") && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setDateRange(undefined);
                                setDateFilter("all");
                                setStatusFilter('all');
                                setSearchTerm("");
                            }}
                            className="bg-zinc-100 dark:bg-white/5 text-orange-600 dark:text-orange-400 hover:bg-orange-500 hover:text-white h-8.5 px-3 rounded-xl font-black gap-1.5 text-xs transition-all"
                        >
                            <X className="w-3.5 h-3.5" /> {tCommon('clearFilters') || "مسح الفلاتر"}
                        </Button>
                    )}

                    <button
                        onClick={() => setIsAddMode(true)}
                        className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 hover:opacity-90 transition-all active:scale-95 shadow-sm text-xs uppercase tracking-widest h-8.5 cursor-pointer shrink-0"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {t('new')}
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-900/50 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm">
                <table className="w-full text-right text-xs text-zinc-600 dark:text-zinc-400 zebra-table">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/80 text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-white/10">
                        <tr className="hover:bg-transparent border-none">
                            <th className="px-3.5 py-2 text-start font-black text-[10px] uppercase tracking-widest">{t('table.supplier')}</th>
                            <th className="px-3.5 py-2 text-start font-black text-[10px] uppercase tracking-widest">{t('table.contact')}</th>
                            <th className="px-3.5 py-2 text-start font-black text-[10px] uppercase tracking-widest">{t('table.address')}</th>
                            <th className="px-3.5 py-2 text-end font-black text-[10px] uppercase tracking-widest">{t('table.balance')}</th>
                            <th className="px-3.5 py-2 text-end font-black text-[10px] uppercase tracking-widest">{t('table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-white/5">
                        {filteredSuppliers.map((s) => (
                            <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors group border-none cursor-pointer" onClick={() => router.push(`/inventory/suppliers/${s.id}`)}>
                                <td className="px-3.5 py-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm">
                                            {s.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-black text-zinc-900 dark:text-white text-xs group-hover:underline transition-all">{s.name}</span>
                                                {s.linkedEmployeeId && (
                                                    <span className="text-[9px] bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-zinc-300 border border-zinc-200 dark:border-white/10 px-1.5 py-0.2 rounded-full font-black uppercase tracking-tighter">
                                                        موظف
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3.5 py-2 text-zinc-500 dark:text-zinc-400">
                                    <div className="flex flex-col gap-0.5 text-[10.5px]">
                                        <span className="flex items-center gap-1.5 font-bold"><Phone className="w-3 h-3 opacity-50" /> {s.phone || "-"}</span>
                                        <span className="flex items-center gap-1.5 font-bold"><Mail className="w-3 h-3 opacity-50" /> {s.email || "-"}</span>
                                    </div>
                                </td>
                                <td className="px-3.5 py-2 text-zinc-500 dark:text-zinc-400 max-w-[180px] truncate text-[10.5px] font-bold leading-relaxed">
                                    {s.address ? <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3 opacity-50 shrink-0" /> {s.address}</span> : "-"}
                                </td>
                                <td className="px-3.5 py-2 text-end">
                                    <div className="flex flex-col items-end">
                                        <span className={clsx(
                                            "text-xs font-black font-mono",
                                            s.balance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                                        )}>
                                            {formatCurrency(Math.abs(s.balance), currency)}
                                        </span>
                                        {s.balance < 0 && <span className="text-[9px] text-emerald-600 dark:text-emerald-500/70 font-black uppercase tracking-widest">لنا</span>}
                                        {s.balance > 0 && <span className="text-[9px] text-rose-600 dark:text-rose-500/70 font-black uppercase tracking-widest">عليه</span>}
                                    </div>
                                </td>
                                <td className="px-3.5 py-2 text-end" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-end gap-1.5">
                                        <button onClick={() => startPayment(s)} className="w-7 h-7 flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition-all shadow-xs active:scale-90 cursor-pointer" title={tCommon('pay') || "دفع"}>
                                            <div className="w-3.5 h-3.5 flex items-center justify-center font-bold font-mono text-xs">$</div>
                                        </button>
                                        <button onClick={() => startEdit(s)} className="w-7 h-7 flex items-center justify-center bg-zinc-100 dark:bg-white/5 hover:bg-zinc-900 dark:hover:bg-white hover:text-white dark:hover:text-zinc-900 rounded-lg transition-all shadow-xs active:scale-90 cursor-pointer">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(s.id)} className="w-7 h-7 flex items-center justify-center bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-xs active:scale-90 cursor-pointer">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredSuppliers.length === 0 && (
                    <div className="p-12 text-center">
                        <div className="inline-flex p-4 rounded-full bg-zinc-50 dark:bg-white/5 mb-4">
                            <Truck className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400 font-bold">{t('empty')}</p>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            <GlassModal
                isOpen={isAddMode}
                onClose={resetForm}
                title={editingId ? t('editSupplier') : t('new')}
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('companyName')}</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="glass-input w-full"
                            placeholder={t('companyName')}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('phone')}</label>
                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="glass-input w-full"
                                placeholder={t('phonePlaceholder')}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('email')}</label>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="glass-input w-full"
                                placeholder={t('emailPlaceholder')}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('address')}</label>
                        <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="glass-input w-full h-20 resize-none"
                            placeholder={t('addressPlaceholder')}
                        />
                    </div>

                    <div className="p-3 rounded-xl border border-white/5 bg-black/20 space-y-3">
                        <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                                    <Check className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">ربط بملف موظف</p>
                                    <p className="text-xs text-zinc-500">جعل هذا المورد مرتبطاً بموظف داخلي</p>
                                </div>
                            </div>
                            <div className="relative inline-block w-10 overflow-hidden h-5 rounded-full bg-zinc-800">
                                <input
                                    type="checkbox"
                                    className="peer sr-only"
                                    checked={isEmployee}
                                    onChange={(e) => {
                                        setIsEmployee(e.target.checked);
                                        if (e.target.checked) fetchEmployees();
                                        else setSelectedEmployeeId("");
                                    }}
                                />
                                <div className={clsx(
                                    "absolute top-0.5 start-0.5 bg-white w-4 h-4 rounded-full transition-all peer-checked:bg-cyan-500",
                                    isEmployee ? "translate-x-full !bg-white" : ""
                                )}></div>
                                <div className={clsx(
                                    "absolute inset-0 transition-colors peer-checked:bg-cyan-500",
                                    isEmployee ? "bg-cyan-500" : "bg-zinc-700"
                                )}></div>
                            </div>
                        </label>

                        {isEmployee && (
                            <div className="animate-in fade-in slide-in-from-top-2 pt-2 border-t border-white/5">
                                {loadingEmployees ? (
                                    <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        جاري التحميل...
                                    </div>
                                ) : (
                                    <select
                                        value={selectedEmployeeId}
                                        onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                        className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors cursor-pointer"
                                    >
                                        <option value="">اختر الموظف...</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}
                    </div>

                    {createError && (
                        <div className="space-y-2">
                            <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded-lg border border-red-400/20">{createError}</p>
                            {duplicateSupplier && (
                                <button
                                    onClick={() => {
                                        router.push(`/inventory/suppliers/${duplicateSupplier.id}`);
                                        resetForm();
                                    }}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-right"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                            <Truck className="w-4 h-4" />
                                        </div>
                                        <div className="text-xs text-right">
                                            <div className="font-bold text-white">{duplicateSupplier.name}</div>
                                            <div className="text-indigo-400/70">{duplicateSupplier.phone}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs bg-indigo-500 text-white px-3 py-1 rounded-full font-bold">
                                        {tCommon('view') || "عرض"}
                                    </div>
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={loading || !name}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Check />}
                        {t('saveSupplier')}
                    </button>
                </div>
            </GlassModal>

            {/* Payment Modal */}
            <GlassModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                title={t('payTitle', { name: selectedSupplierForPayment?.name })}
            >
                <div className="space-y-4">
                    <div className="bg-muted/50 p-4 rounded-xl text-center border border-border">
                        <div className="text-muted-foreground text-xs uppercase mb-1">{t('currentBalance')}</div>
                        <div className={`text-2xl font-mono font-bold ${selectedSupplierForPayment?.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {formatCurrency(selectedSupplierForPayment?.balance || 0, currency)}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('payAmount')}</label>
                        <input
                            type="number"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="glass-input w-full text-xl font-bold"
                            placeholder={t('paymentPlaceholder')}
                            autoFocus
                        />
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={loading || !paymentAmount}
                        className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Check />}
                        {t('confirmPay')}
                    </button>
                </div>
            </GlassModal>
        </div>
    );
}
