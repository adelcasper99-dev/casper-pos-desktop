"use client";

import { useState } from "react";
import GlassModal from "@/components/ui/GlassModal";
import { Loader2, Plus, Banknote, CreditCard, Smartphone, RefreshCw } from "lucide-react";
import { INCOMING_CATEGORIES } from "@/shared/constants/accounting-mappings";

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
        incomingCategoryId: string;
        description: string;
    }) => Promise<void>;
}

const METHODS = [
    { key: "CASH", label: "نقداً", icon: Banknote },
    { key: "VISA", label: "فيزا / بطاقة", icon: CreditCard },
    { key: "WALLET", label: "محفظة", icon: Smartphone },
    { key: "INSTAPAY", label: "انستاباي", icon: RefreshCw },
];

export function DepositModal({ isOpen, onClose, treasuries, onSubmit }: DepositModalProps) {
    const defaultTreasury = treasuries.find(t => t.isDefault)?.id || (treasuries.length > 0 ? treasuries[0].id : "");

    const [amount, setAmount] = useState("");
    const [treasuryId, setTreasuryId] = useState(defaultTreasury);
    const [paymentMethod, setPaymentMethod] = useState("CASH");
    const [incomingCategoryId, setIncomingCategoryId] = useState(INCOMING_CATEGORIES[0].id);
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
                incomingCategoryId,
                description,
            });
            // Reset form
            setAmount("");
            setDescription("");
            setPaymentMethod("CASH");
            setIncomingCategoryId(INCOMING_CATEGORIES[0].id);
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title="إيداع / إضافة رصيد">
            <form onSubmit={handleSubmit} className="space-y-4">

                {/* ── Treasury Selection ── */}
                {treasuries.length > 0 && (
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">الخزنة المستلمة</label>
                        <select
                            className="glass-input w-full"
                            value={treasuryId}
                            onChange={e => setTreasuryId(e.target.value)}
                            required
                        >
                            {treasuries.map(tr => (
                                <option key={tr.id} value={tr.id} className="text-black">
                                    {tr.name} ({tr.balance.toFixed(2)})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* ── Payment Method ── */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">طريقة الدفع</label>
                    <div className="grid grid-cols-2 gap-2">
                        {METHODS.map(m => (
                            <button
                                key={m.key}
                                type="button"
                                onClick={() => setPaymentMethod(m.key)}
                                className={`py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${paymentMethod === m.key
                                        ? "bg-cyan-500 text-black border-cyan-500 shadow-md shadow-cyan-500/20"
                                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                                    }`}
                            >
                                <m.icon className="w-4 h-4" />
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Source of Deposit ── */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">مصدر الإيداع</label>
                    <select
                        className="glass-input w-full"
                        value={incomingCategoryId}
                        onChange={e => setIncomingCategoryId(e.target.value)}
                        required
                    >
                        {INCOMING_CATEGORIES.map(category => (
                            <option key={category.id} value={category.id} className="text-black">
                                {category.uiLabel}
                            </option>
                        ))}
                    </select>
                </div>

                {/* ── Amount ── */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">مبلغ الإيداع</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="glass-input w-full text-xl font-mono"
                        placeholder="0.00"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        required
                    />
                </div>

                {/* ── Notes ── */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">ملاحظات (اختياري)</label>
                    <input
                        className="glass-input w-full"
                        placeholder="أضف تفاصيل أو اسم العميل..."
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                </div>

                {/* ── Submit ── */}
                <button
                    type="submit"
                    disabled={loading || !amount}
                    className="w-full font-bold py-3 rounded-xl mt-4 flex justify-center items-center gap-2 bg-green-500 hover:bg-green-400 text-black shadow-[0_0_15px_rgba(34,197,94,0.35)] transition-all disabled:opacity-50 disabled:shadow-none"
                >
                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    تأكيد الإيداع
                </button>
            </form>
        </GlassModal>
    );
}
