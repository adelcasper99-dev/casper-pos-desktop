"use client";

import { useState } from "react";
import GlassModal from "@/components/ui/GlassModal";
import { Loader2, Plus, Banknote, CreditCard, Smartphone, RefreshCw } from "lucide-react";
import { INCOMING_CATEGORIES } from "@/shared/constants/accounting-mappings";
import { cn } from "@/lib/utils";

interface CashCategory {
    id: string;
    name: string;
    type: string;
    glCode: string | null;
}

interface Treasury {
    id: string;
    name: string;
    balance: number;
    isDefault: boolean;
}

interface DepositModalProps {
    isOpen: boolean;
    onClose: () => void;
    treasuries: Treasury[];
    onSubmit: (data: {
        amount: number;
        treasuryId: string;
        paymentMethod: string;
        categoryId: string;
        description: string;
    }) => Promise<void>;
    categories: CashCategory[];
}

const METHODS = [
    { key: "CASH", label: "نقداً", icon: Banknote },
    { key: "VISA", label: "فيزا / بطاقة", icon: CreditCard },
    { key: "WALLET", label: "محفظة", icon: Smartphone },
    { key: "INSTAPAY", label: "انستاباي", icon: RefreshCw },
];

export function DepositModal({ isOpen, onClose, treasuries, onSubmit, categories }: DepositModalProps) {
    const defaultTreasury = treasuries.find(t => t.isDefault)?.id || (treasuries.length > 0 ? treasuries[0].id : "");

    const [amount, setAmount] = useState("");
    const [treasuryId, setTreasuryId] = useState(defaultTreasury);
    const [paymentMethod, setPaymentMethod] = useState("CASH");
    const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || Number(amount) <= 0) return;

        setLoading(true);
        try {
            await onSubmit({
                amount: parseFloat(amount),
                treasuryId,
                paymentMethod,
                categoryId,
                description,
            });
            // Reset form
            setAmount("");
            setDescription("");
            setPaymentMethod("CASH");
            setCategoryId(categories[0]?.id || "");
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <GlassModal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={<span className="font-black text-xl tracking-tight uppercase">إيداع / إضافة رصيد</span>}
        >
            <form onSubmit={handleSubmit} className="space-y-6 font-cairo" dir="rtl">

                {/* ── Treasury Selection ── */}
                {treasuries.length > 0 && (
                    <div className="space-y-2">
                        <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-black tracking-[0.2em] px-1 block">الخزنة المستلمة</label>
                        <select
                            className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer"
                            value={treasuryId}
                            onChange={e => setTreasuryId(e.target.value)}
                            required
                        >
                            {treasuries.map(tr => (
                                <option key={tr.id} value={tr.id} className="bg-white dark:bg-zinc-950 font-black">
                                    {tr.name} ({tr.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP)
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* ── Payment Method ── */}
                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-black tracking-[0.2em] px-1 block">طريقة الدفع</label>
                    <div className="grid grid-cols-2 gap-3">
                        {METHODS.map(m => (
                            <button
                                key={m.key}
                                type="button"
                                onClick={() => setPaymentMethod(m.key)}
                                className={cn(
                                    "h-14 rounded-2xl text-xs font-black uppercase tracking-widest border-2 transition-all flex items-center justify-center gap-3 active:scale-95 shadow-sm",
                                    paymentMethod === m.key
                                        ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white shadow-lg shadow-black/20"
                                        : "bg-white dark:bg-white/[0.02] text-zinc-400 border-zinc-100 dark:border-white/5 hover:border-zinc-200 dark:hover:border-white/10"
                                )}
                            >
                                <m.icon className={cn("w-5 h-5", paymentMethod === m.key ? "text-white dark:text-black" : "text-zinc-300 dark:text-zinc-600")} />
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Source of Deposit ── */}
                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-black tracking-[0.2em] px-1 block">مصدر الإيداع</label>
                    <select
                        className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer"
                        value={categoryId}
                        onChange={e => setCategoryId(e.target.value)}
                        required
                    >
                        {categories.map(category => (
                            <option key={category.id} value={category.id} className="bg-white dark:bg-zinc-950 font-black">
                                {category.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* ── Amount ── */}
                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-black tracking-[0.2em] px-1 block">مبلغ الإيداع</label>
                    <div className="relative group">
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="w-full bg-zinc-100 dark:bg-zinc-950 border-2 border-transparent rounded-2xl h-20 px-6 text-3xl font-black font-mono tracking-tighter text-emerald-600 dark:emerald-500 outline-none focus:border-emerald-500/30 transition-all shadow-inner tabular-nums text-center"
                            placeholder="0.00"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            required
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-400 tracking-[0.2em] pointer-events-none group-focus-within:text-emerald-500 transition-colors uppercase font-mono">EGP</div>
                    </div>
                </div>

                {/* ── Notes ── */}
                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-black tracking-[0.2em] px-1 block">ملاحظات (اختياري)</label>
                    <input
                        className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        placeholder="أضف تفاصيل أو اسم العميل..."
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                </div>

                {/* ── Submit ── */}
                <button
                    type="submit"
                    disabled={loading || !amount}
                    className="w-full h-16 rounded-[2rem] font-black uppercase tracking-[0.2rem] text-sm flex justify-center items-center gap-3 bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 transition-all hover:bg-emerald-500 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0"
                >
                    {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <Plus className="w-6 h-6" />}
                    تأكيد وإيداع
                </button>
            </form>
        </GlassModal>
    );
}
