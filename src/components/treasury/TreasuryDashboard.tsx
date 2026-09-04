"use client";

import { useState } from "react";
import { generateIdempotencyKey, saveTreasuryTransactionOffline, isOnline } from "@/lib/offline-transaction-helper";
import {
    Plus, Minus, Landmark, CreditCard, Smartphone, Banknote,
    ArrowUpCircle, ArrowDownCircle, Loader2, Edit, Trash2,
    Filter, X, Calendar, PlusCircle, RefreshCw, ArrowLeftRight,
    Calendar as CalendarIcon, Printer, FileDown, Download, History
} from "lucide-react";
import Link from "next/link";
import {
    startOfDay, endOfDay, subDays, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, format
} from 'date-fns';
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import GlassModal from "@/components/ui/GlassModal";
import { TreasuryLogFilters } from "@/features/treasury/types";
import { TreasuryFilterBar } from "@/features/treasury/ui/TreasuryFilterBar";
import { DepositModal } from "@/components/treasury/DepositModal";
import {
    addTreasuryTransaction,
    updateTreasuryTransaction,
    deleteTreasuryTransaction,
    deleteTreasury,
    createTreasury,
    getTreasuryData,
    transferBetweenTreasuries,
    getCashCategories,
} from "@/actions/treasury";
import { WalletTransactionModal } from "@/components/treasury/WalletTransactionModal";
import { EXPENSE_CATEGORY_MAP } from "@/shared/constants/accounting-mappings";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";
import { cn } from "@/lib/utils";

import { 
    Treasury, 
    TreasuryTransaction as Transaction, 
    TreasuryData, 
    CashCategory 
} from "@/types/treasury";

const POSITIVE_TYPES = ["IN", "CAPITAL", "SALE", "TICKET", "CUSTOMER_PAYMENT", "TRANSFER_IN"];
const TYPE_LABELS: Record<string, string> = {
    CAPITAL: "إيداع", OUT: "سحب", SALE: "مبيعات", TICKET: "تذكرة",
    TRANSFER_IN: "تحويل وارد", TRANSFER_OUT: "تحويل صادر",
    CUSTOMER_PAYMENT: "دفعة عميل", IN: "وارد", REFUND: "مرتجع",
};
// ─── Create Treasury Modal ────────────────────────────────────────────────────
function CreateTreasuryModal({
    isOpen,
    onClose,
    branches,
    onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    branches: { id: string; name: string }[];
    onSuccess: () => void;
}) {
    const t = useTranslations('Treasury');
    const [name, setName] = useState("");
    const [branchId, setBranchId] = useState(branches[0]?.id || "");
    const [paymentMethod, setPaymentMethod] = useState("CASH");
    const [isDefault, setIsDefault] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const res = await createTreasury({ name, branchId, isDefault, paymentMethod });
            if (res.success) {
                toast.success(t('treasuryCreated') || "تم إنشاء الخزنة بنجاح");
                setName(""); setIsDefault(false);
                onSuccess(); onClose();
            } else {
                toast.error(res.error || "فشل إنشاء الخزنة");
                setError(res.error || "فشل إنشاء الخزنة");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <GlassModal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={<span className="font-black text-xl tracking-tight uppercase">إنشاء خزنة جديدة</span>}
        >
            <form onSubmit={handleSubmit} className="space-y-6 font-cairo" dir="rtl">
                {error && (
                    <div className="text-rose-500 text-xs font-black bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20 animate-pulse">
                        {error}
                    </div>
                )}
                
                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block">اسم الخزنة</label>
                    <input 
                        className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all" 
                        placeholder="مثال: الخزنة الرئيسية" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        required 
                    />
                </div>

                {branches.length > 1 && (
                    <div className="space-y-2">
                        <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block">الفرع</label>
                        <select 
                            className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer" 
                            value={branchId} 
                            onChange={e => setBranchId(e.target.value)} 
                            required
                        >
                            {branches.map(b => <option key={b.id} value={b.id} className="bg-white dark:bg-zinc-950 font-black">{b.name}</option>)}
                        </select>
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block">نوع الخزنة / وسيلة الدفع</label>
                    <select 
                        className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer" 
                        value={paymentMethod} 
                        onChange={e => setPaymentMethod(e.target.value)} 
                        required
                    >
                        <option value="CASH" className="bg-white dark:bg-zinc-950 font-black">نقدية (CASH)</option>
                        <option value="WALLET" className="bg-white dark:bg-zinc-950 font-black">محفظة إلكترونية (WALLET)</option>
                        <option value="INSTAPAY" className="bg-white dark:bg-zinc-950 font-black">إنستا باي (INSTAPAY)</option>
                        <option value="CARD" className="bg-white dark:bg-zinc-950 font-black">بطاقة بنكية (CARD)</option>
                    </select>
                </div>

                <div className="flex items-center gap-4 p-5 bg-zinc-50 dark:bg-white/[0.02] rounded-[2rem] border border-zinc-100 dark:border-white/5 group transition-all hover:bg-zinc-100 dark:hover:bg-white/[0.04]">
                    <div className="relative flex items-center">
                        <input 
                            type="checkbox" 
                            id="isDefault" 
                            checked={isDefault} 
                            onChange={e => setIsDefault(e.target.checked)} 
                            className="w-6 h-6 rounded-lg border-2 border-zinc-200 dark:border-white/10 text-primary focus:ring-primary/50 cursor-pointer transition-all" 
                        />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="isDefault" className="text-sm font-black text-zinc-900 dark:text-white block cursor-pointer select-none">خزنة افتراضية</label>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">ستُستخدم هذه الخزنة تلقائياً للعمليات الجديدة</p>
                    </div>
                </div>

                <div className="flex gap-3 pt-4">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95"
                    >
                        إلغاء
                    </button>
                    <button 
                        type="submit" 
                        disabled={loading || !name || !branchId} 
                        className="flex-[2] h-14 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black text-xs uppercase tracking-[0.2rem] shadow-xl shadow-zinc-900/20 dark:shadow-white/10 flex items-center justify-center gap-3 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:translate-y-0"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                        إنشاء الخزنة
                    </button>
                </div>
            </form>
        </GlassModal>
    );
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────
function TransferModal({
    isOpen, onClose, treasuries, onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    treasuries: Treasury[];
    onSuccess: () => void;
}) {
    const t = useTranslations('Treasury');
    const [fromId, setFromId] = useState(treasuries.find(t => t.isDefault)?.id || "");
    const [toId, setToId] = useState("");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!fromId || !toId) { setError("اختر خزنة المصدر والوجهة"); return; }
        if (fromId === toId) { setError("لا يمكن التحويل من وإلى نفس الخزنة"); return; }
        setLoading(true);
        try {
            const res = await transferBetweenTreasuries({
                fromTreasuryId: fromId,
                toTreasuryId: toId,
                amount: parseFloat(amount),
                description: description || undefined,
            });
            if (res.success) {
                setAmount(""); setDescription(""); setError("");
                onSuccess(); onClose();
            } else {
                setError(res.error || "فشل التحويل");
            }
        } finally {
            setLoading(false);
        }
    };

    const fromTreasury = treasuries.find(t => t.id === fromId);

    return (
        <GlassModal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={<span className="font-black text-xl tracking-tight uppercase">تحويل رصيد بين الخزن</span>}
        >
            <form onSubmit={handleSubmit} className="space-y-6 font-cairo" dir="rtl">
                {error && (
                    <div className="text-rose-500 text-xs font-black bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 bg-zinc-50 dark:bg-white/[0.02] p-6 rounded-[2rem] border border-zinc-100 dark:border-white/5 shadow-inner">
                    <div className="space-y-2">
                        <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block">من خزنة</label>
                        <select 
                            className="w-full bg-white dark:bg-zinc-900 border-none rounded-2xl h-14 px-4 text-zinc-900 dark:text-white font-black text-xs outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer shadow-sm" 
                            value={fromId} 
                            onChange={e => setFromId(e.target.value)} 
                            required
                        >
                            <option value="" className="font-black italic text-zinc-400">اختر...</option>
                            {treasuries.map(t => (
                                <option key={t.id} value={t.id} className="bg-white dark:bg-zinc-950 font-black">
                                    {t.name}
                                </option>
                            ))}
                        </select>
                        {fromTreasury && (
                            <div className="text-[9px] font-black text-primary px-1 uppercase tracking-tighter">
                                {fromTreasury.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                            </div>
                        )}
                    </div>
                    
                    <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-500 shadow-lg shadow-indigo-500/10 border border-indigo-500/20">
                        <ArrowLeftRight className="w-5 h-5" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block">إلى خزنة</label>
                        <select 
                            className="w-full bg-white dark:bg-zinc-900 border-none rounded-2xl h-14 px-4 text-zinc-900 dark:text-white font-black text-xs outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer shadow-sm" 
                            value={toId} 
                            onChange={e => setToId(e.target.value)} 
                            required
                        >
                            <option value="" className="font-black italic text-zinc-400">اختر...</option>
                            {treasuries.filter(t => t.id !== fromId).map(t => (
                                <option key={t.id} value={t.id} className="bg-white dark:bg-zinc-950 font-black">
                                    {t.name}
                                </option>
                            ))}
                        </select>
                        <div className="h-3 md:h-[13px]" /> {/* Spacer to align with from balance */}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block">المبلغ المراد تحويله</label>
                    <div className="relative group">
                        <input 
                            type="number" 
                            step="0.01" 
                            min="0.01" 
                            className="w-full bg-zinc-100 dark:bg-zinc-950 border-2 border-transparent rounded-2xl h-20 px-6 text-3xl font-black font-mono tracking-tighter text-indigo-600 dark:text-indigo-400 outline-none focus:border-indigo-500/30 transition-all shadow-inner tabular-nums text-center" 
                            placeholder="0.00" 
                            value={amount} 
                            onChange={(e) => setAmount(e.target.value)} 
                            required 
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-400 tracking-[0.2em] pointer-events-none group-focus-within:text-indigo-500 transition-colors uppercase font-mono">EGP</div>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block">بيان التحويل (اختياري)</label>
                    <input 
                        className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-sm" 
                        placeholder="سبب التحويل..." 
                        value={description} 
                        onChange={e => setDescription(e.target.value)} 
                    />
                </div>

                <div className="flex gap-3 pt-4">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="flex-1 h-16 rounded-2xl font-black text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95"
                    >
                        إلغاء
                    </button>
                    <button 
                        type="submit" 
                        disabled={loading || !fromId || !toId || !amount} 
                        className="flex-[2] h-16 rounded-[2rem] bg-indigo-600 text-white font-black text-sm uppercase tracking-[0.2rem] shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 transition-all hover:bg-indigo-500 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:translate-y-0"
                    >
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowLeftRight className="w-6 h-6" />}
                        إتمام التحويل
                    </button>
                </div>
            </form>
        </GlassModal>
    );
}

// ─── Main Treasury Dashboard ──────────────────────────────────────────────────
export default function TreasuryDashboard({
    data: initialData,
    branches,
    categories = [],
}: {
    data: TreasuryData;
    branches: { id: string; name: string }[];
    categories?: CashCategory[];
}) {
    const t = useTranslations('Treasury');
    const [data, setData] = useState<TreasuryData>(initialData);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreateTreasuryOpen, setIsCreateTreasuryOpen] = useState(false);
    const [isTransferOpen, setIsTransferOpen] = useState(false);

    // Transaction form state
    const [transType, setTransType] = useState<"OUT">("OUT");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [method, setMethod] = useState("CASH");
    const [selectedTreasuryId, setSelectedTreasuryId] = useState("");
    const [selectedCategoryId, setSelectedCategoryId] = useState("");

    // Deposit Modal state
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

    // Edit / delete state
    const [reason, setReason] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [viewTreasuryId, setViewTreasuryId] = useState<string | null>(null);
    const [deletingTreasuryId, setDeletingTreasuryId] = useState<string | null>(null);

    // Filter state
    const [filters, setFilters] = useState<TreasuryLogFilters>({
        startDate: undefined,
        endDate: undefined,
        direction: 'ALL',
        search: '',
        category: 'ALL'
    });
    const [methodFilter, setMethodFilter] = useState("ALL");
    
    // 🆕 Format categories for the filter bar
    const dbCategories = [
        { value: 'ALL', label: 'كل التصنيفات' },
        ...categories.map(c => ({ value: c.name, label: c.name }))
    ];

    const refresh = async (currentFilters?: TreasuryLogFilters, meth?: string) => {
        setLoading(true);
        const activeFilters = currentFilters !== undefined ? currentFilters : filters;
        const activeMethod = meth !== undefined ? meth : methodFilter;

        const res = await getTreasuryData({
            startDate: activeFilters.startDate,
            endDate: activeFilters.endDate,
            paymentMethod: activeMethod !== "ALL" ? activeMethod : undefined,
        });
        if (res.success && res.data) setData(res.data as TreasuryData);
        setLoading(false);
    };

    const handleFilterChange = (newFilters: TreasuryLogFilters) => {
        setFilters(newFilters);
        if (newFilters.startDate !== filters.startDate || newFilters.endDate !== filters.endDate) {
            refresh(newFilters, methodFilter);
        }
    };

    const resetForm = () => {
        setAmount(""); setDescription(""); setMethod("CASH"); setSelectedCategoryId("");
        setEditingId(null); setReason("");
        const def = data.treasuries?.find(t => t.isDefault);
        setSelectedTreasuryId(def?.id || "");
    };

    const handleDepositSubmit = async (depositData: any) => {
        // 🛡️ Double-submit guard: generate key before touching the server
        const idempotencyKey = generateIdempotencyKey('DEPOSIT');
        setLoading(true);
        try {
            const offline = !isOnline();
            if (offline) {
                await saveTreasuryTransactionOffline(
                    'DEPOSIT',
                    depositData.amount,
                    depositData.description,
                    depositData.paymentMethod,
                    depositData.treasuryId,
                    undefined,
                    depositData.categoryId
                );
                toast.success('تم حفظ الإيداع محلياً — سيتم مزامنته عند استعادة الاتصال');
                // Optimistic balance update
                setData(prev => ({
                    ...prev,
                    treasuries: prev.treasuries.map(tr =>
                        tr.id === depositData.treasuryId
                            ? { ...tr, balance: tr.balance + depositData.amount }
                            : tr
                    ),
                }));
                return;
            }
            const res = await addTreasuryTransaction(
                "IN",
                depositData.amount,
                depositData.description,
                depositData.paymentMethod,
                depositData.treasuryId,
                undefined,
                undefined,
                undefined,
                depositData.categoryId,
                idempotencyKey // 🆕 replay-safe
            );
            if (!res.success) {
                toast.error(res.error || 'فشل الإيداع');
                return;
            }
            await refresh();
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // 🛡️ Double-submit guard: generate key before touching the server
        const idempotencyKey = generateIdempotencyKey('WITHDRAWAL');
        setLoading(true);
        try {
            if (editingId) {
                await updateTreasuryTransaction(
                    editingId,
                    { type: transType, amount: parseFloat(amount), description, paymentMethod: method },
                    reason
                );
            } else {
                const offline = !isOnline();
                if (offline) {
                    await saveTreasuryTransactionOffline(
                        'WITHDRAWAL',
                        parseFloat(amount),
                        description,
                        method,
                        selectedTreasuryId || undefined,
                        undefined,
                        selectedCategoryId || undefined
                    );
                    toast.success('تم حفظ السحب محلياً — سيتم مزامنته عند استعادة الاتصال');
                    // Optimistic balance update
                    setData(prev => ({
                        ...prev,
                        treasuries: prev.treasuries.map(tr =>
                            tr.id === selectedTreasuryId
                                ? { ...tr, balance: tr.balance - parseFloat(amount) }
                                : tr
                        ),
                    }));
                    setIsModalOpen(false);
                    resetForm();
                    return;
                }
                const res = await addTreasuryTransaction(
                    transType,
                    parseFloat(amount),
                    description,
                    method,
                    selectedTreasuryId || undefined,
                    undefined,
                    undefined,
                    undefined,
                    selectedCategoryId || undefined,
                    idempotencyKey // 🆕 replay-safe
                );
                if (!res.success) {
                    toast.error(res.error || 'فشل تنفيذ العملية');
                    return;
                }
            }
            setIsModalOpen(false);
            resetForm();
            await refresh();
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        setLoading(true);
        await deleteTreasuryTransaction(deletingId, reason);
        setLoading(false);
        setDeletingId(null); setReason("");
        await refresh();
    };

    const handleDeleteTreasury = async () => {
        if (!deletingTreasuryId) return;
        setLoading(true);
        const res = await deleteTreasury(deletingTreasuryId);
        setLoading(false);
        if (res.success) {
            setDeletingTreasuryId(null);
            if (viewTreasuryId === deletingTreasuryId) setViewTreasuryId(null);
            await refresh();
        } else {
            toast.error(res.error);
        }
    };

    const handleEditClick = (tx: Transaction) => {
        setAmount(tx.amount.toString());
        setDescription(tx.description || "");
        setMethod(tx.paymentMethod);
        if (tx.type !== "OUT") {
            // Basic handle for dynamic edits since old CAPITAL type might be fixed
            setTransType("OUT");
        } else {
            setTransType("OUT");
        }
        setEditingId(tx.id);
        setSelectedTreasuryId(tx.treasuryId || "");
        setReason("");
        setIsModalOpen(true);
    };

    const displayedTx = data.transactions.filter(t => {
        if (viewTreasuryId && t.treasuryId !== viewTreasuryId) return false;

        // Direction Filter
        const isPos = POSITIVE_TYPES.includes(t.type);
        if (filters.direction === 'IN' && !isPos) return false;
        if (filters.direction === 'OUT' && isPos) return false;

        // Search Filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const desc = t.description?.toLowerCase() || "";
            const ref = TYPE_LABELS[t.type]?.toLowerCase() || "";
            if (!desc.includes(searchLower) && !ref.includes(searchLower)) {
                return false;
            }
        }

        // Category Filter
        if (filters.category && filters.category !== 'ALL') {
            let cat = "متنوع";
            const desc = t.description || "";
            if (isPos) {
                if (t.type === "SALE") cat = "مبيعات";
                else if (t.type === "CUSTOMER_PAYMENT") cat = "سداد عميل";
                else if (t.type === "CAPITAL" || desc.includes("إيداع")) cat = "إيداع نقدي";
                else if (t.type === "TRANSFER_IN") cat = "تحويل وارد";
            } else {
                if (desc.includes("مشتريات") || t.type === "PURCHASE") cat = "مشتريات";
                else if (t.type === "OUT") cat = "مصاريف عامة";
                else if (t.type === "TRANSFER_OUT") cat = "تحويل صادر";
                else if (desc.includes("سحب")) cat = "سحب نقدي";
            }
            if (filters.category === "مصاريف عامة" && cat.startsWith("مصاريف")) {
                // allow
            } else if (cat !== filters.category) {
                return false;
            }
        }

        return true;
    });

    const METHODS = [
        { key: "CASH", label: "نقداً", icon: Banknote, color: "text-green-400 bg-green-500/10 border-green-500/30" },
        { key: "VISA", label: "فيزا / بطاقة", icon: CreditCard, color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
        { key: "WALLET", label: "محفظة", icon: Smartphone, color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
        { key: "INSTAPAY", label: "انستاباي", icon: RefreshCw, color: "text-pink-400 bg-pink-500/10 border-pink-500/30" },
    ];

    // Method treasury icon/color mapping
    const METHOD_STYLE: Record<string, { icon: React.ElementType; color: string; label: string }> = {
        CASH: { icon: Banknote, color: "text-green-400 bg-green-500/10 border-green-500/30", label: "نقداً" },
        VISA: { icon: CreditCard, color: "text-blue-400 bg-blue-500/10 border-blue-500/30", label: "فيزا / بطاقة" },
        WALLET: { icon: Smartphone, color: "text-purple-400 bg-purple-500/10 border-purple-500/30", label: "فودافون كاش" },
        INSTAPAY: { icon: RefreshCw, color: "text-pink-400 bg-pink-500/10 border-pink-500/30", label: "انستاباي" },
    };

    const handleExportCSV = () => {
        const headers = ["التاريخ", "النوع", "الخزنة", "طريقة الدفع", "البيان", "المبلغ"];
        const csvRows = [headers.join(",")];

        displayedTx.forEach(tx => {
            const dateStr = format(new Date(tx.createdAt), 'yyyy-MM-dd HH:mm');
            const typeStr = TYPE_LABELS[tx.type] || tx.type;
            const treasuryStr = tx.treasuryName || "-";
            const methodStr = METHODS.find(m => m.key === tx.paymentMethod)?.label || (tx.paymentMethod === 'ACCOUNT' ? 'آجل' : tx.paymentMethod);
            const descStr = (tx.description || "-").replace(/,/g, " "); // Basic CSV escaping
            const amountStr = (POSITIVE_TYPES.includes(tx.type) ? tx.amount : -tx.amount).toFixed(2);

            csvRows.push(`${dateStr},${typeStr},${treasuryStr},${methodStr},${descStr},${amountStr}`);
        });

        const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `treasury_ledger_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-8 animate-fade-in-up font-cairo">
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; color: black !important; }
                    .glass-card { background: transparent !important; border: 1px solid #ddd !important; box-shadow: none !important; color: black !important; font-family: 'Cairo', sans-serif !important; }
                    .text-muted-foreground { color: #666 !important; }
                    .text-zinc-900, .text-zinc-500 { color: black !important; }
                    .bg-muted, .bg-muted\/20, .bg-muted\/30, .bg-muted\/50 { background: transparent !important; }
                    table { border-collapse: collapse !important; width: 100% !important; }
                    th, td { border: 1px solid #ddd !important; color: black !important; padding: 12px !important; }
                    .print-only { display: block !important; }
                }
                .print-only { display: none; }
                .zebra-table tr:nth-child(even) { background-color: rgba(0,0,0,0.02); }
                .dark .zebra-table tr:nth-child(even) { background-color: rgba(255,255,255,0.02); }
            `}</style>

            {/* ── Treasury Accounts (Compact Cards) ────────────────────── */}
            {data.treasuries.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 no-print">
                    {data.treasuries.map(tr => {
                        const style = tr.paymentMethod ? METHOD_STYLE[tr.paymentMethod] : null;
                        const IconComp = style?.icon || Landmark;
                        const isDefault = tr.isDefault;
                        
                        return (
                            <div
                                key={tr.id}
                                onClick={() => setViewTreasuryId(tr.id === viewTreasuryId ? null : tr.id)}
                                className={cn(
                                    "relative group overflow-hidden bg-zinc-900/80 border rounded-2xl p-2.5 px-3.5 cursor-pointer transition-all shadow-xs hover:border-cyan-500/40",
                                    viewTreasuryId === tr.id 
                                        ? "border-primary ring-1 ring-primary/20 bg-primary/5 shadow-primary/10" 
                                        : "border-zinc-700/60 dark:border-white/10"
                                )}
                            >
                                {!tr.isDefault && (
                                    <button 
                                        onClick={e => { e.stopPropagation(); setDeletingTreasuryId(tr.id); }} 
                                        className="absolute top-2 left-2 p-1 text-zinc-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all z-10 hover:bg-rose-500/10 rounded-lg"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-xl text-white shrink-0 shadow-sm",
                                        tr.paymentMethod === 'VISA' ? "bg-blue-600 shadow-blue-500/20" :
                                        tr.paymentMethod === 'WALLET' ? "bg-purple-600 shadow-purple-500/20" :
                                        tr.paymentMethod === 'INSTAPAY' ? "bg-pink-600 shadow-pink-500/20" :
                                        "bg-emerald-600 shadow-emerald-500/20"
                                    )}>
                                        <IconComp className="w-4.5 h-4.5" />
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <p className="text-zinc-400 text-[10.5px] font-bold truncate">
                                                {tr.name}
                                            </p>
                                            {isDefault && (
                                                <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                    {t('default', "الافتراضي")}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-baseline gap-1.5">
                                            <h2 className={cn(
                                                "text-base sm:text-lg font-black font-mono tracking-tight tabular-nums",
                                                tr.balance >= 0 ? "text-white" : "text-rose-500"
                                            )}>
                                                {tr.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </h2>
                                            <span className="text-[9.5px] font-bold text-zinc-400 font-mono">EGP</span>
                                        </div>
                                    </div>
                                </div>

                                {viewTreasuryId === tr.id && (
                                    <div className="mt-2 pt-1.5 border-t border-primary/10 flex items-center gap-1.5 text-[9.5px] text-primary font-black uppercase tracking-widest">
                                        <Filter className="w-3 h-3" />
                                        {"عرض حركات هذه الخزنة"}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Toolbar (Compact) ──────────────────────────────── */}
            <div className="bg-white dark:bg-card/30 backdrop-blur-md p-2.5 rounded-2xl border border-zinc-200 dark:border-white/5 space-y-2 relative z-10 shadow-xs">
                <div className="flex flex-wrap gap-2 items-center justify-between no-print">
                    <div className="flex gap-1.5">
                        <button onClick={() => refresh()} disabled={loading} className="flex items-center justify-center w-8.5 h-8.5 rounded-xl bg-zinc-100 dark:bg-muted/50 hover:bg-zinc-200 dark:hover:bg-muted text-zinc-900 dark:text-foreground font-black text-xs transition-all active:scale-95 shadow-xs cursor-pointer">
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        </button>
                        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 h-8.5 rounded-xl bg-zinc-100 dark:bg-muted/50 hover:bg-zinc-200 dark:hover:bg-muted text-zinc-900 dark:text-foreground font-black text-xs transition-all active:scale-95 shadow-xs cursor-pointer" title="طباعة">
                            <Printer className="w-3.5 h-3.5" />
                            {"طباعة"}
                        </button>
                        <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 h-8.5 rounded-xl bg-zinc-100 dark:bg-muted/50 hover:bg-zinc-200 dark:hover:bg-muted text-zinc-900 dark:text-foreground font-black text-xs transition-all active:scale-95 shadow-xs cursor-pointer" title="تصدير CSV">
                            <FileDown className="w-3.5 h-3.5" />
                            {"تصدير"}
                        </button>
                        <Link href="/treasury/log">
                            <button className="flex items-center gap-1.5 px-3 h-8.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-black text-xs transition-all active:scale-95 shadow-xs cursor-pointer">
                                <History className="w-3.5 h-3.5" />
                                {"سجل الخزينة"}
                            </button>
                        </Link>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => setIsCreateTreasuryOpen(true)} className="flex items-center gap-1.5 px-3 h-8.5 rounded-xl bg-zinc-100 dark:bg-muted/50 hover:bg-zinc-200 dark:hover:bg-muted text-zinc-900 dark:text-foreground border border-zinc-200 dark:border-white/10 font-black text-xs transition-all active:scale-95 shadow-xs cursor-pointer">
                            <PlusCircle className="w-3.5 h-3.5" /> {"إضافة خزنة جديدة"}
                        </button>
                        <button 
                            onClick={() => setIsWalletModalOpen(true)} 
                            disabled={!data.treasuries?.some((t: any) => ['WALLET', 'VODAFONE_CASH', 'INSTAPAY'].includes(t.paymentMethod ?? '')) || !data.treasuries?.some((t: any) => t.paymentMethod === 'CASH')}
                            title={!data.treasuries?.some((t: any) => ['WALLET', 'VODAFONE_CASH', 'INSTAPAY'].includes(t.paymentMethod ?? '')) || !data.treasuries?.some((t: any) => t.paymentMethod === 'CASH') ? "يجب إضافة محفظة إلكترونية وخزنة نقدية أولاً" : undefined}
                            className="flex items-center gap-1.5 px-3 h-8.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-black text-xs transition-all active:scale-95 shadow-xs cursor-pointer disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed">
                            <Smartphone className="w-3.5 h-3.5" /> {"عملية محفظة"}
                        </button>
                        <button onClick={() => setIsTransferOpen(true)} className="flex items-center gap-1.5 px-3 h-8.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 border border-indigo-500/20 font-black text-xs transition-all active:scale-95 shadow-xs cursor-pointer">
                            <ArrowLeftRight className="w-3.5 h-3.5" /> {"تحويل"}
                        </button>
                        <button onClick={() => { resetForm(); setTransType("OUT"); setIsModalOpen(true); }} className="flex items-center gap-1.5 px-3 h-8.5 rounded-xl bg-rose-500 text-white font-black text-xs transition-all active:scale-95 shadow-sm shadow-rose-500/20 cursor-pointer">
                            <Minus className="w-3.5 h-3.5" /> {"سحب نقدية"}
                        </button>
                        <button onClick={() => setIsDepositModalOpen(true)} className="flex items-center gap-1.5 px-3.5 h-8.5 rounded-xl bg-primary text-primary-foreground font-black shadow-sm shadow-primary/20 text-xs transition-all active:scale-95 cursor-pointer">
                            <Plus className="w-3.5 h-3.5" /> {"إيداع نقدية"}
                        </button>
                    </div>
                </div>

                <div className="no-print space-y-2 pt-2 border-t border-zinc-100 dark:border-white/5">
                    <TreasuryFilterBar 
                        filters={filters} 
                        onFilterChange={handleFilterChange} 
                        dbCategories={dbCategories}
                    />

                    <div className="flex flex-wrap items-center gap-2 p-1 bg-zinc-50 dark:bg-white/[0.02] rounded-xl border border-zinc-100 dark:border-white/5 w-fit">
                        <div className="p-1 bg-white dark:bg-zinc-900 rounded-lg shadow-xs border border-zinc-200 dark:border-white/5">
                            <CreditCard className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <select
                            value={methodFilter}
                            onChange={e => {
                                setMethodFilter(e.target.value);
                                refresh(filters, e.target.value);
                            }}
                            className="bg-transparent h-7 text-xs font-black px-2 min-w-[140px] outline-none text-zinc-900 dark:text-white appearance-none cursor-pointer"
                        >
                            <option value="ALL" className="bg-white dark:bg-zinc-950 font-black">{"--- كل طرق الدفع ---"}</option>
                            {METHODS.map(m => <option key={m.key} value={m.key} className="bg-white dark:bg-zinc-950 font-black">{m.label}</option>)}
                        </select>

                        <div className="h-4 w-px bg-zinc-200 dark:bg-white/10 mx-0.5" />

                        <button
                            onClick={() => {
                                handleFilterChange({
                                    startDate: undefined,
                                    endDate: undefined,
                                    direction: 'ALL',
                                    search: '',
                                    category: 'ALL'
                                });
                                setMethodFilter("ALL");
                                refresh(undefined, "ALL");
                            }}
                            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
                        >
                            <X className="w-3 h-3" /> {"مسح الفلاتر"}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Transactions Table (Compact) ───────────────────── */}
            <div className="bg-white dark:bg-card/20 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm">
                <div className="p-2.5 px-3.5 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2.5 bg-zinc-50/50 dark:bg-white/[0.02]">
                    <div className="p-1.5 rounded-lg bg-primary text-zinc-900 shadow-xs">
                        <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-black text-xs uppercase tracking-widest text-zinc-900 dark:text-white leading-none">{"سجل الحركات المالية المفصل"}</h3>
                    </div>
                    {viewTreasuryId && (
                        <button onClick={() => setViewTreasuryId(null)} className="ms-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500 text-white hover:bg-rose-600 shadow-xs transition-all font-black text-xs cursor-pointer">
                            <X className="w-3.5 h-3.5" /> {"إلغاء الفلتر"}
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs border-collapse zebra-table">
                        <thead className="bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 text-[10px] font-black uppercase tracking-widest text-center">
                            <tr>
                                <th className="px-3.5 py-2 text-center">{t('table.date', "التاريخ والوقت")}</th>
                                <th className="px-3.5 py-2 text-center">{t('table.type', "نوع الحركة")}</th>
                                <th className="px-3.5 py-2 text-center">{t('table.method', "طريقة الدفع")}</th>
                                <th className="px-3.5 py-2 text-right w-full">{t('table.note', "البيان / ملاحظات")}</th>
                                <th className="px-3.5 py-2 text-end min-w-[120px]">{t('table.amount', "المبلغ")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5 border-t border-zinc-100 dark:border-white/5">
                            {displayedTx.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-zinc-300 dark:text-zinc-600">
                                        <div className="flex flex-col items-center gap-3">
                                            <History className="w-8 h-8 opacity-20" />
                                            <p className="font-black uppercase tracking-widest text-xs">{t('noTransactions', "لا توجد حركات مالية مسجلة لهذه الفترة")}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                displayedTx.map(tx => {
                                    const isPos = POSITIVE_TYPES.includes(tx.type);
                                    return (
                                        <tr key={tx.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-all duration-200 group border-none">
                                            <td className="px-3.5 py-2 text-center" suppressHydrationWarning>
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="font-mono text-[10.5px] font-black text-zinc-900 dark:text-zinc-200">{new Date(tx.createdAt).toLocaleDateString("ar-EG")}</span>
                                                    <span className="font-mono text-[9px] font-bold text-zinc-400">{new Date(tx.createdAt).toLocaleTimeString("ar-EG", { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </td>
                                            <td className="px-3.5 py-2">
                                                <div className="flex justify-center">
                                                    <div className={cn(
                                                        "px-2.5 py-1 rounded-xl text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap justify-center shadow-xs",
                                                        isPos ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-rose-500 text-white shadow-rose-500/20"
                                                    )}>
                                                        {isPos ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                                                        {TYPE_LABELS[tx.type] || tx.type}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3.5 py-2 text-center">
                                                <span className={cn(
                                                    "px-2.5 py-0.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider border shadow-inner",
                                                    (tx.paymentMethod === 'ACCOUNT' || tx.paymentMethod === 'DEFERRED')
                                                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20"
                                                        : "bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/5"
                                                )}>
                                                    {METHODS.find(m => m.key === tx.paymentMethod)?.label || (tx.paymentMethod === 'ACCOUNT' || tx.paymentMethod === 'DEFERRED' ? 'آجل' : tx.paymentMethod)}
                                                </span>
                                            </td>
                                            <td className="px-3.5 py-2">
                                                <div className="flex flex-col gap-0.5 text-right">
                                                    <span className="font-black text-zinc-900 dark:text-white text-xs group-hover:text-primary transition-colors leading-tight">{tx.description || "-"}</span>
                                                    {tx.treasuryName && (
                                                        <span className="flex items-center gap-1 text-[9px] font-black text-zinc-400 uppercase tracking-widest justify-end">
                                                            {tx.treasuryName} <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                        </span>
                                                    )}
                                                    {tx.categoryName && (
                                                        <span className="flex items-center gap-1 text-[9px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest justify-end">
                                                            {tx.categoryName} <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3.5 py-2 text-end">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className={cn(
                                                        "text-xs sm:text-sm font-black font-mono tracking-tight tabular-nums",
                                                        isPos ? "text-emerald-600 dark:text-emerald-500" : "text-rose-600 dark:text-rose-500"
                                                    )}>
                                                        {isPos ? "+" : "-"}{Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        <span className="text-[9px] font-bold text-zinc-400 font-mono ms-1">EGP</span>
                                                    </span>
                                                    
                                                    <div className="flex gap-1 no-print">
                                                        <button onClick={() => handleEditClick(tx)} className="p-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-900 dark:hover:bg-white hover:text-white dark:hover:text-black rounded-lg text-zinc-500 transition-all border border-zinc-200 dark:border-white/5 active:scale-95 cursor-pointer" title="تعديل">
                                                            <Edit className="w-3 h-3" />
                                                        </button>
                                                        <button onClick={() => { setDeletingId(tx.id); setReason(""); }} className="p-1 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg text-rose-500 transition-all border border-rose-500/20 active:scale-95 cursor-pointer" title="حذف">
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Add / Edit Transaction Modal ─────────── */}
            <div className="no-print">
                <DepositModal
                    isOpen={isDepositModalOpen}
                    onClose={() => setIsDepositModalOpen(false)}
                    treasuries={data.treasuries}
                    onSubmit={handleDepositSubmit}
                    categories={categories.filter(c => c.type === 'IN')}
                />

                <WalletTransactionModal 
                    isOpen={isWalletModalOpen}
                    onClose={() => {
                        setIsWalletModalOpen(false);
                        refresh();
                    }}
                    treasuries={data.treasuries}
                />

                <GlassModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={<span className="font-black text-xl tracking-tight uppercase">{editingId ? "تعديل الحركة" : "سحب / صرف"}</span>}
                >
                    <form onSubmit={handleSubmit} className="space-y-6 font-cairo" dir="rtl">
                        {editingId && transType === "OUT" && (
                            <div className="flex gap-2 p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                                <div className="flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-xl bg-rose-500 text-white flex items-center justify-center gap-2">
                                    <Minus className="w-4 h-4" />
                                    سحب
                                </div>
                            </div>
                        )}

                        {data.treasuries.length > 0 && (
                            <div>
                                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block mb-2">الخزنة</label>
                                <select className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-rose-500/50 transition-all appearance-none cursor-pointer" value={selectedTreasuryId} onChange={e => setSelectedTreasuryId(e.target.value)}>
                                    <option value="" className="bg-white dark:bg-zinc-950 font-black">الخزنة العامة</option>
                                    {data.treasuries.map(tr => (
                                        <option key={tr.id} value={tr.id} className="bg-white dark:bg-zinc-950 font-black">{tr.name} ({tr.balance.toFixed(2)})</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block mb-2">طريقة الدفع</label>
                            <div className="grid grid-cols-2 gap-3">
                                {METHODS.map(m => (
                                    <button key={m.key} type="button" onClick={() => setMethod(m.key)} className={`h-14 rounded-2xl text-xs font-black uppercase tracking-widest border-2 transition-all flex items-center justify-center gap-3 active:scale-95 shadow-sm ${method === m.key ? "bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/20" : "bg-white dark:bg-white/[0.02] text-zinc-400 border-zinc-100 dark:border-white/5 hover:border-zinc-200 dark:hover:border-white/10"}`}>
                                        <m.icon className={cn("w-5 h-5", method === m.key ? "text-white" : "text-zinc-300 dark:text-zinc-600")} />
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {transType === "OUT" && !editingId && (
                            <div>
                                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block mb-2">تصنيف المصروف</label>
                                <select 
                                    className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-rose-500/50 transition-all appearance-none cursor-pointer" 
                                    value={selectedCategoryId} 
                                    onChange={e => setSelectedCategoryId(e.target.value)}
                                >
                                    <option value="" className="bg-white dark:bg-zinc-950 font-black">عام / غير مصنف</option>
                                    {categories.filter(c => c.type === 'OUT').map(cat => (
                                        <option key={cat.id} value={cat.id} className="bg-white dark:bg-zinc-950 font-black">{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block mb-2">البيان</label>
                            <input className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-rose-500/50 transition-all" placeholder="مثال: مصاريف شراء..." value={description} onChange={e => setDescription(e.target.value)} required />
                        </div>

                        <div>
                            <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block mb-2">المبلغ</label>
                            <div className="relative group">
                                <input type="number" step="0.01" min="0.01" className="w-full bg-zinc-100 dark:bg-zinc-950 border-2 border-transparent rounded-2xl h-20 px-6 text-3xl font-black font-mono tracking-tighter text-rose-600 dark:text-rose-500 outline-none focus:border-rose-500/30 transition-all shadow-inner tabular-nums text-center" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-400 tracking-[0.2em] pointer-events-none group-focus-within:text-rose-500 transition-colors uppercase font-mono">EGP</div>
                            </div>
                        </div>

                        {editingId && (
                            <div>
                                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block mb-2">سبب التعديل</label>
                                <input className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-rose-500/50 transition-all" placeholder="أدخل سبب التعديل..." value={reason} onChange={e => setReason(e.target.value)} required />
                            </div>
                        )}

                        <button type="submit" disabled={loading} className="w-full h-16 rounded-[2rem] font-black uppercase tracking-[0.2rem] text-sm flex justify-center items-center gap-3 bg-rose-600 text-white shadow-xl shadow-rose-500/20 transition-all hover:bg-rose-500 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 mt-6">
                            {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <Minus className="w-6 h-6" />}
                            {editingId ? "حفظ التعديل" : "تأكيد السحب"}
                        </button>
                    </form>
                </GlassModal>

                <GlassModal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title={<span className="font-black text-xl tracking-tight uppercase text-rose-500">حذف الحركة</span>}>
                    <div className="space-y-6">
                        <div className="bg-rose-500/10 p-5 rounded-2xl border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-black tracking-widest leading-relaxed">
                            سيتم حذف الحركة من السجل (يُحفظ في سجل المراجعة). هذا الإجراء لا يرجع.
                        </div>
                        <div>
                            <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] px-1 block mb-2">سبب الحذف</label>
                            <input className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-rose-500/50 transition-all" placeholder="مثال: إدخال خاطئ" value={reason} onChange={e => setReason(e.target.value)} autoFocus />
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button onClick={() => setDeletingId(null)} className="flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95">إلغاء</button>
                            <button onClick={handleDelete} disabled={!reason.trim() || loading} className="flex-[2] h-14 rounded-[2rem] bg-rose-600 text-white font-black text-xs uppercase tracking-[0.2rem] shadow-xl shadow-rose-500/20 flex justify-center items-center gap-2 disabled:opacity-50 transition-all hover:-translate-y-1 active:scale-95 disabled:translate-y-0">
                                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
                               تأكيد الحذف
                            </button>
                        </div>
                    </div>
                </GlassModal>

                <GlassModal isOpen={!!deletingTreasuryId} onClose={() => setDeletingTreasuryId(null)} title={<span className="font-black text-xl tracking-tight uppercase text-rose-500">حذف الخزنة</span>}>
                    <div className="space-y-6">
                        <div className="bg-rose-500/10 p-5 rounded-2xl border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-black tracking-widest leading-relaxed">
                            سيتم حذف الخزنة نهائياً. يجب أن يكون الرصيد صفراً قبل الحذف.
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button onClick={() => setDeletingTreasuryId(null)} className="flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95">إلغاء</button>
                            <button onClick={handleDeleteTreasury} disabled={loading} className="flex-[2] h-14 rounded-[2rem] bg-rose-600 text-white font-black text-xs uppercase tracking-[0.2rem] shadow-xl shadow-rose-500/20 flex justify-center items-center gap-2 disabled:opacity-50 transition-all hover:-translate-y-1 active:scale-95 disabled:translate-y-0">
                                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Trash2 className="w-5 h-5" />} 
                                تأكيد الحذف
                            </button>
                        </div>
                    </div>
                </GlassModal>

                {/* ── Create Treasury Modal ────────────────── */}
                <CreateTreasuryModal
                    isOpen={isCreateTreasuryOpen}
                    onClose={() => setIsCreateTreasuryOpen(false)}
                    branches={branches}
                    onSuccess={refresh}
                />

                <TransferModal
                    isOpen={isTransferOpen}
                    onClose={() => setIsTransferOpen(false)}
                    treasuries={data.treasuries}
                    onSuccess={refresh}
                />
            </div>
        </div>
    );
}
