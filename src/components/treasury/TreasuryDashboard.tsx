"use client";

import { useState } from "react";
import {
    Plus, Minus, Landmark, CreditCard, Smartphone, Banknote,
    ArrowUpCircle, ArrowDownCircle, Loader2, Edit, Trash2,
    Filter, X, Calendar, PlusCircle, RefreshCw, ArrowLeftRight,
    Calendar as CalendarIcon
} from "lucide-react";
import {
    startOfDay, endOfDay, subDays, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth
} from 'date-fns';
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import GlassModal from "@/components/ui/GlassModal";
import {
    addTreasuryTransaction,
    updateTreasuryTransaction,
    deleteTreasuryTransaction,
    deleteTreasury,
    createTreasury,
    getTreasuryData,
    transferBetweenTreasuries,
} from "@/actions/treasury";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Transaction {
    id: string;
    type: string;
    description: string | null;
    amount: number;
    paymentMethod: string;
    treasuryId?: string | null;
    treasuryName?: string;
    createdAt: string;
}

interface Treasury {
    id: string;
    name: string;
    balance: number;
    isDefault: boolean;
    paymentMethod?: string | null;
}

interface TreasuryData {
    byMethod: Record<string, number>;
    transactions: Transaction[];
    treasuries: Treasury[];
}

const POSITIVE_TYPES = ["IN", "CAPITAL", "SALE", "TICKET", "CUSTOMER_PAYMENT", "TRANSFER_IN"];
const TYPE_LABELS: Record<string, string> = {
    CAPITAL: "إيداع", OUT: "سحب", SALE: "مبيعات", TICKET: "تذكرة",
    TRANSFER_IN: "تحويل وارد", TRANSFER_OUT: "تحويل صادر",
    CUSTOMER_PAYMENT: "دفعة عميل", IN: "وارد",
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
    const [name, setName] = useState("");
    const [branchId, setBranchId] = useState(branches[0]?.id || "");
    const [isDefault, setIsDefault] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const res = await createTreasury({ name, branchId, isDefault });
            if (res.success) {
                setName(""); setIsDefault(false);
                onSuccess(); onClose();
            } else {
                setError(res.error || "فشل إنشاء الخزنة");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title="إنشاء خزنة جديدة">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="text-red-400 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">اسم الخزنة</label>
                    <input className="glass-input w-full" placeholder="مثال: الخزنة الرئيسية" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                {branches.length > 1 && (
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">الفرع</label>
                        <select className="glass-input w-full" value={branchId} onChange={e => setBranchId(e.target.value)} required>
                            {branches.map(b => <option key={b.id} value={b.id} className="text-black">{b.name}</option>)}
                        </select>
                    </div>
                )}
                <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-border/50">
                    <input type="checkbox" id="isDefault" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="w-5 h-5 rounded" />
                    <div>
                        <label htmlFor="isDefault" className="text-sm font-bold block cursor-pointer">خزنة افتراضية</label>
                        <p className="text-xs text-muted-foreground">ستُستخدم هذه الخزنة تلقائياً للعمليات الجديدة</p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-muted-foreground hover:text-foreground">إلغاء</button>
                    <button type="submit" disabled={loading || !name || !branchId} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-6 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        إنشاء
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
        <GlassModal isOpen={isOpen} onClose={onClose} title="تحويل رصيد بين الخزن">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}

                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">من خزنة</label>
                        <select className="glass-input w-full" value={fromId} onChange={e => setFromId(e.target.value)} required>
                            <option value="">اختر...</option>
                            {treasuries.map(t => <option key={t.id} value={t.id} className="text-black">{t.name} ({t.balance.toFixed(2)})</option>)}
                        </select>
                    </div>
                    <div className="pb-2"><ArrowLeftRight className="w-5 h-5 text-muted-foreground" /></div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">إلى خزنة</label>
                        <select className="glass-input w-full" value={toId} onChange={e => setToId(e.target.value)} required>
                            <option value="">اختر...</option>
                            {treasuries.filter(t => t.id !== fromId).map(t => <option key={t.id} value={t.id} className="text-black">{t.name} ({t.balance.toFixed(2)})</option>)}
                        </select>
                    </div>
                </div>

                {fromTreasury && (
                    <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded-lg">
                        الرصيد المتاح: <span className="font-mono font-bold text-cyan-400">{fromTreasury.balance.toFixed(2)}</span>
                    </div>
                )}

                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">المبلغ</label>
                    <input type="number" step="0.01" min="0.01" className="glass-input w-full text-xl font-mono" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>

                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">بيان (اختياري)</label>
                    <input className="glass-input w-full" placeholder="سبب التحويل..." value={description} onChange={e => setDescription(e.target.value)} />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-muted-foreground hover:text-foreground">إلغاء</button>
                    <button type="submit" disabled={loading || !fromId || !toId || !amount} className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-6 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                        تحويل
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
}: {
    data: TreasuryData;
    branches: { id: string; name: string }[];
}) {
    const [data, setData] = useState<TreasuryData>(initialData);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreateTreasuryOpen, setIsCreateTreasuryOpen] = useState(false);
    const [isTransferOpen, setIsTransferOpen] = useState(false);

    // Transaction form state
    const [transType, setTransType] = useState<"CAPITAL" | "OUT">("CAPITAL");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [method, setMethod] = useState("CASH");
    const [selectedTreasuryId, setSelectedTreasuryId] = useState("");

    // Edit / delete state
    const [reason, setReason] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [viewTreasuryId, setViewTreasuryId] = useState<string | null>(null);
    const [deletingTreasuryId, setDeletingTreasuryId] = useState<string | null>(null);

    // Filter state
    const [showFilters, setShowFilters] = useState(false);
    const [dateFilter, setDateFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);
    const [methodFilter, setMethodFilter] = useState("ALL");

    const refresh = async (range?: typeof dateRange, meth?: string) => {
        setLoading(true);
        const activeRange = range !== undefined ? range : dateRange;
        const activeMethod = meth !== undefined ? meth : methodFilter;

        const res = await getTreasuryData({
            startDate: activeRange?.from?.toISOString(),
            endDate: activeRange?.to?.toISOString(),
            paymentMethod: activeMethod !== "ALL" ? activeMethod : undefined,
        });
        if (res.success && res.data) setData(res.data as TreasuryData);
        setLoading(false);
    };

    const resetForm = () => {
        setAmount(""); setDescription(""); setMethod("CASH");
        setEditingId(null); setReason("");
        const def = data.treasuries?.find(t => t.isDefault);
        setSelectedTreasuryId(def?.id || "");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        if (editingId) {
            await updateTreasuryTransaction(editingId, { type: transType, amount: parseFloat(amount), description, paymentMethod: method }, reason);
        } else {
            await addTreasuryTransaction(transType, parseFloat(amount), description, method, selectedTreasuryId || undefined);
        }
        setLoading(false);
        setIsModalOpen(false);
        resetForm();
        await refresh();
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
            alert(res.error);
        }
    };

    const handleEditClick = (tx: Transaction) => {
        setAmount(tx.amount.toString());
        setDescription(tx.description || "");
        setMethod(tx.paymentMethod);
        setTransType(tx.type as "CAPITAL" | "OUT");
        setEditingId(tx.id);
        setSelectedTreasuryId(tx.treasuryId || "");
        setReason("");
        setIsModalOpen(true);
    };

    const displayedTx = viewTreasuryId
        ? data.transactions.filter(t => t.treasuryId === viewTreasuryId)
        : data.transactions;

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

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* ── Treasury Accounts ────────────────────── */}
            {data.treasuries.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {data.treasuries.map(tr => {
                        const style = tr.paymentMethod ? METHOD_STYLE[tr.paymentMethod] : null;
                        const IconComp = style?.icon || Landmark;
                        const colorCls = style?.color || "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
                        const iconColor = colorCls.split(" ")[0];
                        return (
                            <div
                                key={tr.id}
                                onClick={() => setViewTreasuryId(tr.id === viewTreasuryId ? null : tr.id)}
                                className={`relative glass-card p-5 rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] group ${viewTreasuryId === tr.id ? "ring-2 ring-cyan-400 bg-cyan-500/10 border-cyan-500/40" : "border-border"}`}
                            >
                                {!tr.isDefault && (
                                    <button onClick={e => { e.stopPropagation(); setDeletingTreasuryId(tr.id); }} className="absolute top-2 left-2 p-1 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <p className="text-muted-foreground text-xs uppercase font-bold truncate">{tr.name}</p>
                                            {tr.isDefault && (
                                                <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30 whitespace-nowrap">الافتراضي</span>
                                            )}
                                        </div>
                                        <h2 className={`text-2xl font-mono font-bold ${tr.balance >= 0 ? iconColor : "text-red-500"}`}>{tr.balance.toFixed(2)}</h2>
                                    </div>
                                    <div className={`p-3 rounded-full border shrink-0 ${colorCls}`}>
                                        <IconComp className={`w-5 h-5 ${iconColor}`} />
                                    </div>
                                </div>
                                {viewTreasuryId === tr.id && (
                                    <p className="mt-2 text-[10px] text-cyan-300 font-bold flex items-center gap-1"><Filter className="w-3 h-3" /> عرض حركات هذه الخزنة</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Toolbar ──────────────────────────────── */}
            <div className="glass-card p-4 rounded-2xl space-y-4">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="flex gap-2">
                        <button onClick={() => setShowFilters(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-medium text-sm">
                            <Filter className="w-4 h-4" />
                            {showFilters ? "إخفاء الفلاتر" : "فلتر"}
                        </button>
                        <button onClick={() => refresh()} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-medium text-sm">
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setIsCreateTreasuryOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 font-bold text-sm">
                            <PlusCircle className="w-4 h-4" /> خزنة جديدة
                        </button>
                        <button onClick={() => setIsTransferOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/50 font-bold text-sm">
                            <ArrowLeftRight className="w-4 h-4" /> تحويل
                        </button>
                        <button onClick={() => { resetForm(); setTransType("OUT"); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 font-bold text-sm">
                            <Minus className="w-4 h-4" /> سحب / صرف
                        </button>
                        <button onClick={() => { resetForm(); setTransType("CAPITAL"); setIsModalOpen(true); }} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-[0_0_15px_rgba(6,182,212,0.35)] text-sm">
                            <Plus className="w-4 h-4" /> إيداع
                        </button>
                    </div>
                </div>

                {showFilters && (
                    <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border/50">
                                <button
                                    onClick={() => {
                                        setDateFilter("today");
                                        const range = { from: startOfDay(new Date()), to: endOfDay(new Date()) };
                                        setDateRange(range);
                                        refresh(range);
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dateFilter === "today" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" : "text-muted-foreground hover:bg-white/5"}`}
                                >
                                    اليوم
                                </button>
                                <button
                                    onClick={() => {
                                        const yesterday = subDays(new Date(), 1);
                                        setDateFilter("yesterday");
                                        const range = { from: startOfDay(yesterday), to: endOfDay(yesterday) };
                                        setDateRange(range);
                                        refresh(range);
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dateFilter === "yesterday" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" : "text-muted-foreground hover:bg-white/5"}`}
                                >
                                    أمس
                                </button>
                                <button
                                    onClick={() => {
                                        setDateFilter("week");
                                        const range = { from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) };
                                        setDateRange(range);
                                        refresh(range);
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dateFilter === "week" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" : "text-muted-foreground hover:bg-white/5"}`}
                                >
                                    الأسبوع
                                </button>
                                <button
                                    onClick={() => {
                                        setDateFilter("month");
                                        const range = { from: startOfMonth(new Date()), to: endOfMonth(new Date()) };
                                        setDateRange(range);
                                        refresh(range);
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dateFilter === "month" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" : "text-muted-foreground hover:bg-white/5"}`}
                                >
                                    الشهر
                                </button>
                            </div>

                            <div className="h-4 w-px bg-white/10" />

                            <FlatpickrRangePicker
                                onRangeChange={(dates) => {
                                    if (dates.length === 2) {
                                        const range = { from: dates[0], to: dates[1] };
                                        setDateRange(range);
                                        setDateFilter("custom");
                                        refresh(range);
                                    } else if (dates.length === 0) {
                                        setDateRange(undefined);
                                        setDateFilter("all");
                                        refresh(undefined);
                                    }
                                }}
                                onClear={() => {
                                    setDateRange(undefined);
                                    setDateFilter("all");
                                    refresh(undefined);
                                }}
                                initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                                className="w-64"
                            />

                            <div className="h-4 w-px bg-white/10" />

                            <div className="flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-muted-foreground" />
                                <select
                                    value={methodFilter}
                                    onChange={e => {
                                        setMethodFilter(e.target.value);
                                        refresh(dateRange, e.target.value);
                                    }}
                                    className="glass-input h-9 text-xs py-0 min-w-[120px] [&>option]:text-black"
                                >
                                    <option value="ALL">كل طرق الدفع</option>
                                    {METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                                </select>
                            </div>

                            <button
                                onClick={() => {
                                    setDateRange(undefined);
                                    setDateFilter("all");
                                    setMethodFilter("ALL");
                                    refresh(undefined, "ALL");
                                }}
                                className="ms-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-bold text-xs transition-all"
                            >
                                <X className="w-3 h-3" /> مسح الفلاتر
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Transactions Table ───────────────────── */}
            <div className="glass-card overflow-hidden rounded-2xl">
                <div className="p-4 border-b border-border flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-bold text-sm">سجل الحركات</h3>
                    {viewTreasuryId && (
                        <button onClick={() => setViewTreasuryId(null)} className="ms-auto flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                            <X className="w-3 h-3" /> إلغاء الفلتر
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                            <tr>
                                <th className="p-4 text-start">التاريخ</th>
                                <th className="p-4 text-start">النوع</th>
                                <th className="p-4 text-start">طريقة الدفع</th>
                                <th className="p-4 text-start">البيان</th>
                                <th className="p-4 text-end">المبلغ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {displayedTx.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-muted-foreground">لا توجد حركات</td>
                                </tr>
                            ) : (
                                displayedTx.map(tx => {
                                    const isPos = POSITIVE_TYPES.includes(tx.type);
                                    return (
                                        <tr key={tx.id} className="hover:bg-muted/30 transition-colors group">
                                            <td className="p-4 font-mono text-xs text-muted-foreground" suppressHydrationWarning>
                                                {new Date(tx.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "medium" })}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold flex w-fit items-center gap-1 ${isPos ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                                                    {isPos ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                                                    {TYPE_LABELS[tx.type] || tx.type}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className="px-2 py-1 rounded bg-muted text-xs font-mono border border-border">
                                                    {tx.paymentMethod}
                                                </span>
                                            </td>
                                            <td className="p-4 font-medium text-foreground">
                                                {tx.description || "-"}
                                                {tx.treasuryName && (
                                                    <span className="block text-xs text-muted-foreground pt-0.5 flex items-center gap-1">
                                                        <Landmark className="w-3 h-3" /> {tx.treasuryName}
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`p-4 text-end font-mono font-bold ${isPos ? "text-green-400" : "text-red-400"}`}>
                                                {isPos ? "+" : "-"}{Math.abs(tx.amount).toFixed(2)}
                                                <div className="flex gap-1 justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditClick(tx)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="تعديل">
                                                        <Edit className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={() => { setDeletingId(tx.id); setReason(""); }} className="p-1 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-400" title="حذف">
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
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
            <GlassModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? "تعديل الحركة" : transType === "CAPITAL" ? "إيداع / إضافة رصيد" : "سحب / صرف"}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {editingId && (
                        <div className="flex gap-2 p-2 bg-muted/30 rounded-xl">
                            {(["CAPITAL", "OUT"] as const).map(tp => (
                                <button key={tp} type="button" onClick={() => setTransType(tp)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${transType === tp ? (tp === "CAPITAL" ? "bg-green-500 text-black" : "bg-red-500 text-white") : "text-muted-foreground hover:bg-muted"}`}>
                                    {tp === "CAPITAL" ? "إيداع" : "سحب"}
                                </button>
                            ))}
                        </div>
                    )}

                    {data.treasuries.length > 0 && (
                        <div>
                            <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">الخزنة</label>
                            <select className="glass-input w-full" value={selectedTreasuryId} onChange={e => setSelectedTreasuryId(e.target.value)}>
                                <option value="">الخزنة العامة</option>
                                {data.treasuries.map(tr => (
                                    <option key={tr.id} value={tr.id} className="text-black">{tr.name} ({tr.balance.toFixed(2)})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">طريقة الدفع</label>
                        <div className="grid grid-cols-2 gap-2">
                            {METHODS.map(m => (
                                <button key={m.key} type="button" onClick={() => setMethod(m.key)} className={`py-2 rounded-xl text-xs font-bold border transition-all ${method === m.key ? "bg-cyan-500 text-black border-cyan-500" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">البيان</label>
                        <input className="glass-input w-full" placeholder={transType === "CAPITAL" ? "مثال: رأس مال أولي..." : "مثال: مصاريف شراء..."} value={description} onChange={e => setDescription(e.target.value)} required />
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">المبلغ</label>
                        <input type="number" step="0.01" min="0.01" className="glass-input w-full text-xl font-mono" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                    </div>

                    {editingId && (
                        <div>
                            <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">سبب التعديل</label>
                            <input className="glass-input w-full" placeholder="أدخل سبب التعديل..." value={reason} onChange={e => setReason(e.target.value)} required />
                        </div>
                    )}

                    <button type="submit" disabled={loading} className={`w-full font-bold py-3 rounded-xl mt-2 flex justify-center items-center gap-2 ${transType === "CAPITAL" ? "bg-green-500 hover:bg-green-400 text-black" : "bg-red-500 hover:bg-red-400 text-white"}`}>
                        {loading ? <Loader2 className="animate-spin w-4 h-4" /> : transType === "CAPITAL" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                        {editingId ? "حفظ التعديل" : transType === "CAPITAL" ? "تأكيد الإيداع" : "تأكيد السحب"}
                    </button>
                </form>
            </GlassModal>

            {/* ── Delete Transaction Modal ─────────────── */}
            <GlassModal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="حذف الحركة">
                <div className="space-y-4">
                    <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 text-red-200 text-sm">
                        سيتم حذف الحركة من السجل (يُحفظ في سجل المراجعة). هذا الإجراء لا يرجع.
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">سبب الحذف</label>
                        <input className="glass-input w-full" placeholder="مثال: إدخال خاطئ" value={reason} onChange={e => setReason(e.target.value)} autoFocus />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setDeletingId(null)} className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground">إلغاء</button>
                        <button onClick={handleDelete} disabled={!reason.trim() || loading} className="bg-red-500 hover:bg-red-400 text-white font-bold px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
                            {loading && <Loader2 className="animate-spin w-4 h-4" />} حذف
                        </button>
                    </div>
                </div>
            </GlassModal>

            {/* ── Delete Treasury Modal ────────────────── */}
            <GlassModal isOpen={!!deletingTreasuryId} onClose={() => setDeletingTreasuryId(null)} title="حذف الخزنة">
                <div className="space-y-4">
                    <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 text-red-200 text-sm">
                        سيتم حذف الخزنة نهائياً. يجب أن يكون الرصيد صفراً قبل الحذف.
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setDeletingTreasuryId(null)} className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground">إلغاء</button>
                        <button onClick={handleDeleteTreasury} disabled={loading} className="bg-red-500 hover:bg-red-400 text-white font-bold px-6 py-2 rounded-lg flex items-center gap-2">
                            {loading && <Loader2 className="animate-spin w-4 h-4" />} حذف
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
    );
}
