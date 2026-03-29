"use client";

import { useState } from "react";
import { addTreasuryTransaction } from "@/actions/treasury";
import { INCOMING_CATEGORIES, EXPENSE_CATEGORY_MAP } from "@/shared/constants/accounting-mappings";
import GlassModal from "../ui/GlassModal";
import { toast } from "sonner";

interface CashInOutModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentShiftId: string;
    treasuryId?: string;
}

export default function CashInOutModal({ isOpen, onClose, currentShiftId, treasuryId }: CashInOutModalProps) {
    const [type, setType] = useState<"IN" | "OUT">("OUT");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSave = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error("يرجى إدخال مبلغ صحيح");
            return;
        }

        if (!category) {
            toast.error("يرجى اختيار التصنيف");
            return;
        }

        setIsLoading(true);
        try {
            const result = await addTreasuryTransaction(
                type,
                parseFloat(amount),
                `${type === "IN" ? "إيداع" : "سحب"}: ${description}`,
                "CASH",
                treasuryId,
                type === "OUT" ? category : undefined,
                type === "IN" ? category : undefined,
                currentShiftId // 🆕 Pass Shift ID for POS linkage
            );

            if (result.success) {
                toast.success("تم تسجيل العملية بنجاح");
                setAmount("");
                setDescription("");
                setCategory("");
                onClose();
            } else {
                toast.error(result.error || "فشل تسجيل العملية");
            }
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ غير متوقع");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={type === "IN" ? "إيداع نقدي (Cash In)" : "سحب / مصروف (Cash Out)"}
        >
            <div className="space-y-5">
                {/* Type Toggle */}
                <div className="flex p-1 bg-slate-100 dark:bg-black/20 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner">
                    <button
                        onClick={() => { setType("OUT"); setCategory(""); }}
                        className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${
                            type === "OUT" 
                            ? "bg-white dark:bg-red-500/20 text-red-600 dark:text-red-400 shadow-md border border-slate-200 dark:border-red-500/30" 
                            : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                        }`}
                    >
                        سحب / مصروف
                    </button>
                    <button
                        onClick={() => { setType("IN"); setCategory(""); }}
                        className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${
                            type === "IN" 
                            ? "bg-white dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-md border border-slate-200 dark:border-emerald-500/30" 
                            : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                        }`}
                    >
                        إيداع نقدي
                    </button>
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 px-1">التصنيف</label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full glass-input text-sm font-bold bg-white dark:bg-black/20 text-slate-900 dark:text-white border-slate-200 dark:border-white/10"
                    >
                        <option value="" disabled className="bg-white dark:bg-zinc-900">اختر التصنيف...</option>
                        {type === "IN" ? (
                            INCOMING_CATEGORIES.map(cat => (
                                <option key={cat.id} value={cat.id} className="bg-white dark:bg-zinc-900">{cat.uiLabel}</option>
                            ))
                        ) : (
                            Object.entries(EXPENSE_CATEGORY_MAP).map(([id, cat]) => (
                                <option key={id} value={id} className="bg-white dark:bg-zinc-900">{cat.labelAr}</option>
                            ))
                        )}
                    </select>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 px-1">المبلغ</label>
                    <div className="relative">
                        <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-lg ${type === "IN" ? "text-emerald-500" : "text-red-500"}`}>$</span>
                        <input
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full glass-input bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 pl-10 text-3xl font-black text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-pink-400/20 dark:focus:ring-cyan-500/20 outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-zinc-600"
                            placeholder="0.00"
                        />
                    </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 px-1">ملاحظات / بيان</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full glass-input bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 h-24 resize-none text-sm font-medium text-slate-800 dark:text-zinc-200 focus:ring-2 focus:ring-pink-400/20 dark:focus:ring-cyan-500/20 outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-zinc-600 p-4"
                        placeholder="اكتب تفاصيل العملية هنا..."
                    />
                </div>

                {/* Action Button */}
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className={`w-full py-5 rounded-2xl font-black transition-all shadow-xl active:scale-[0.98] ${
                        type === "IN" 
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 dark:shadow-emerald-500/10" 
                        : "bg-red-600 hover:bg-red-500 text-white shadow-red-500/20 dark:shadow-red-500/10"
                    }`}
                >
                    {isLoading ? "جاري الحفظ..." : "تأكيد العملية"}
                </button>
            </div>
        </GlassModal>
    );
}
