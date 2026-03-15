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
                type === "IN" ? category : undefined
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
                <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5">
                    <button
                        onClick={() => { setType("OUT"); setCategory(""); }}
                        className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${type === "OUT" ? "bg-red-500/20 text-red-500 shadow-lg" : "text-white/40 hover:text-white"}`}
                    >
                        سحب / مصروف
                    </button>
                    <button
                        onClick={() => { setType("IN"); setCategory(""); }}
                        className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${type === "IN" ? "bg-emerald-500/20 text-emerald-500 shadow-lg" : "text-white/40 hover:text-white"}`}
                    >
                        إيداع نقدي
                    </button>
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 px-1">التصنيف</label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full glass-input text-sm font-bold"
                    >
                        <option value="" disabled className="bg-zinc-900">اختر التصنيف...</option>
                        {type === "IN" ? (
                            INCOMING_CATEGORIES.map(cat => (
                                <option key={cat.id} value={cat.id} className="bg-zinc-900">{cat.uiLabel}</option>
                            ))
                        ) : (
                            Object.entries(EXPENSE_CATEGORY_MAP).map(([id, cat]) => (
                                <option key={id} value={id} className="bg-zinc-900">{cat.labelAr}</option>
                            ))
                        )}
                    </select>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 px-1">المبلغ</label>
                    <div className="relative">
                        <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black ${type === "IN" ? "text-emerald-500" : "text-red-500"}`}>$</span>
                        <input
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full glass-input pl-10 text-2xl font-black text-center"
                            placeholder="0.00"
                        />
                    </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 px-1">ملاحظات / بيان</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full glass-input h-20 resize-none text-sm"
                        placeholder="اكتب تفاصيل العملية هنا..."
                    />
                </div>

                {/* Action Button */}
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className={`w-full py-4 rounded-2xl font-black transition-all shadow-2xl ${
                        type === "IN" 
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20" 
                        : "bg-red-600 hover:bg-red-500 text-white shadow-red-500/20"
                    }`}
                >
                    {isLoading ? "جاري الحفظ..." : "تأكيد العملية"}
                </button>
            </div>
        </GlassModal>
    );
}
