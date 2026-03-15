"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Truck, Phone, Mail, MapPin, Check, Search, Filter, ChevronDown, X, Clock } from "lucide-react";
import { createSupplier, updateSupplier, deleteSupplier, paySupplier } from "@/actions/inventory";
import { formatCurrency } from "@/lib/utils";
import GlassModal from "../ui/GlassModal";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { getEmployeesForLink } from "@/actions/customer-actions";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
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

    // Form State (Uncontrolled via FormData usually better for actions, but controlled for pre-filling edit)
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
        // Search Filter
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             s.phone?.includes(searchTerm);
        if (!matchesSearch) return false;

        // Balance Status Filter
        if (statusFilter === 'inDebt' && s.balance <= 0) return false;
        if (statusFilter === 'credit' && s.balance >= 0) return false;

        // Date Filter
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
            data.linkedEmployeeId = null; // Clear if toggled off
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

            if (res?.success) {
                // Success - data will refresh automatically via revalidation
            } else {
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
        <div className="space-y-4 animate-fly-in" dir="rtl">
            {/* ... Header & Search ... */}

            {/* List */}
            {/* HEADER AND SEARCH CODE IS UNCHANGED - INSERTED HERE FOR CONTEXT ONLY IF NEEDED, BUT WE ARE REPLACING WHOLE FILE CONTENT BLOCK FOR SIMPLICITY IF CHUNKED, OR JUST APPENDING MODAL */}
            {/* ACTUALLY, I NEED TO INJECT THE MODAL AT THE END AND THE BUTTON IN THE TABLE */}

            {/* Header */}
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl border border-border">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Truck className="w-5 h-5 text-indigo-400" />
                        {t('title')}
                    </h2>
                    <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
                </div>
                <button
                    onClick={() => setIsAddMode(true)}
                    className="bg-cyan-500 text-black font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-cyan-400 ml-24"
                >
                    <Plus className="w-4 h-4" />
                    {t('new')}
                </button>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4 flex flex-col items-center justify-center border-b-2 border-b-red-500/50 bg-red-500/5">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold mb-1">{t('stats.totalDebt')}</span>
                    <span className="text-xl font-mono font-bold text-red-500">{formatCurrency(stats.totalDebt, currency)}</span>
                </div>
                <div className="glass-card p-4 flex flex-col items-center justify-center border-b-2 border-b-indigo-500/50 bg-indigo-500/5">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold mb-1">{t('stats.suppliersCount')}</span>
                    <span className="text-xl font-bold text-indigo-400">{filteredSuppliers.length}</span>
                </div>
                <div className="glass-card p-4 flex flex-col items-center justify-center border-b-2 border-b-emerald-500/50 bg-emerald-500/5">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold mb-1">إجمالي لنا (دائن)</span>
                    <span className="text-xl font-mono font-bold text-emerald-500">{formatCurrency(stats.totalCredit, currency)}</span>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="flex gap-4 items-center flex-wrap">
                <div className="relative flex-1 min-w-[300px] group/search">
                    <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within/search:text-cyan-400 transition-all pointer-events-none" />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={t('search')}
                        className="w-full solid-input h-10 ps-12 bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500/50 transition-all font-medium rounded-xl"
                    />
                </div>

                <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-white/10 flex-wrap">
                    <Button
                        variant={dateFilter === "today" ? "default" : "ghost"}
                        size="sm"
                        className={clsx("h-8 text-[11px] font-bold px-3 rounded-md", dateFilter === "today" ? "bg-cyan-500 text-black shadow-lg" : "text-zinc-400 hover:bg-white/5")}
                        onClick={() => {
                            setDateFilter("today");
                            setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
                        }}
                    >
                        اليوم
                    </Button>
                    <button
                        onClick={() => {
                            const yesterday = subDays(new Date(), 1);
                            setDateFilter("yesterday");
                            setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
                        }}
                        className={clsx("h-8 text-[11px] font-bold px-3 rounded-md transition-all", dateFilter === "yesterday" ? "bg-cyan-500 text-black shadow-lg" : "text-zinc-400 hover:bg-white/5")}
                    >
                        أمس
                    </button>
                    <button
                        onClick={() => {
                            setDateFilter("week");
                            setDateRange({ from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) });
                        }}
                        className={clsx("h-8 text-[11px] font-bold px-3 rounded-md transition-all", dateFilter === "week" ? "bg-cyan-500 text-black shadow-lg" : "text-zinc-400 hover:bg-white/5")}
                    >
                        الأسبوع
                    </button>
                    <button
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                        className={clsx("h-8 text-[11px] font-bold px-3 rounded-md transition-all", dateFilter === "month" ? "bg-cyan-500 text-black shadow-lg" : "text-zinc-400 hover:bg-white/5")}
                    >
                        الشهر
                    </button>

                    <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />

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
                        className="w-48 bg-transparent border-0 text-xs h-8 text-zinc-300 placeholder:text-zinc-600"
                    />
                </div>

                <div className="flex gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-white/10 gap-2 h-10 px-4 bg-zinc-900/50">
                                <Filter className="w-4 h-4 text-muted-foreground" />
                                <span className="font-bold">
                                    {statusFilter === 'all' ? t('filters.all') : 
                                     statusFilter === 'inDebt' ? t('filters.inDebt') : 
                                     t('filters.credit')}
                                </span>
                                <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border-white/10 text-white">
                            <DropdownMenuLabel className="text-xs uppercase tracking-widest text-zinc-500">
                                {t('filters.status')}
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setStatusFilter('all')} className={statusFilter === 'all' ? "bg-white/10" : ""}>
                                {t('filters.all')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('inDebt')} className={statusFilter === 'inDebt' ? "bg-white/10" : ""}>
                                {t('filters.inDebt')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('credit')} className={statusFilter === 'credit' ? "bg-white/10" : ""}>
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
                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 h-10 px-3 font-bold gap-2"
                        >
                            <X className="w-4 h-4" /> {tCommon('clearFilters') || "مسح الفلاتر"}
                        </Button>
                    )}
                </div>
            </div>

            <div className="glass-card overflow-hidden bg-card border border-border">
                <table className="w-full text-start">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                        <tr>
                            <th className="p-3 text-start">{t('table.supplier')}</th>
                            <th className="p-3 text-start">{t('table.contact')}</th>
                            <th className="p-3 text-start">{t('table.address')}</th>
                            <th className="p-3 text-end">{t('table.balance')}</th>
                            <th className="p-3 text-end">{t('table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                        {filteredSuppliers.map((s) => (
                            <tr key={s.id} className="hover:bg-muted/50 transition-colors group cursor-pointer" onClick={() => router.push(`/inventory/suppliers/${s.id}`)}>
                                <td>
                                    <div className="flex items-center gap-2 px-3 py-2">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0">
                                            {s.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-foreground">{s.name}</span>
                                                {s.linkedEmployeeId && (
                                                    <span className="text-[9px] bg-cyan-900/60 text-cyan-200 border border-cyan-500/40 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                        موظف داخلي
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-3 text-muted-foreground">
                                    <div className="flex flex-col gap-0.5 text-xs">
                                        <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {s.phone || "-"}</span>
                                        <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {s.email || "-"}</span>
                                    </div>
                                </td>
                                <td className="p-3 text-muted-foreground max-w-[180px] truncate text-xs">
                                    {s.address ? <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {s.address}</span> : "-"}
                                </td>
                                <td className="p-3 text-end font-mono font-bold text-sm">
                                    <div className="flex flex-col items-end">
                                        <span className={s.balance > 0 ? 'text-rose-500' : 'text-emerald-500'}>
                                            {formatCurrency(Math.abs(s.balance), currency)}
                                        </span>
                                        {s.balance < 0 && <span className="text-[10px] text-emerald-500/70 font-bold">دائن لنا</span>}
                                        {s.balance > 0 && <span className="text-[10px] text-rose-500/70 font-bold">مديونية</span>}
                                    </div>
                                </td>
                                <td className="p-3 text-end">
                                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => startEdit(s)} className="p-1.5 hover:bg-muted rounded-lg text-cyan-500">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-muted rounded-lg text-red-500">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredSuppliers.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                        {t('empty')}
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
