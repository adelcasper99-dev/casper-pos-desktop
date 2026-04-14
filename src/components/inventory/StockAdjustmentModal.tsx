"use client";

import { useState, useMemo } from "react";
import { Loader2, Save, X, Calculator, AlertTriangle, ArrowRightLeft } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { toast } from "sonner";
import { submitStockReconciliation } from "@/actions/inventory-reconciliation";
import { useTranslations } from "@/lib/i18n-mock";
import clsx from "clsx";

interface Product {
    id: string;
    sku: string;
    name: string;
    stock: number;
    costPrice: number;
}

interface StockAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    warehouseId: string;
    csrfToken: string;
    onSuccess?: () => void;
}

const REASON_CODES = [
    { value: "COUNT_MISMATCH", label: "عجز/زيادة في الجرد" },
    { value: "DAMAGE", label: "تالف / هالك" },
    { value: "EXPIRED", label: "إعدام صلاحية" },
    { value: "THEFT", label: "سرقة / فقدان" },
    { value: "OTHER", label: "أخرى" }
];

export default function StockAdjustmentModal({
    isOpen,
    onClose,
    product,
    warehouseId,
    csrfToken,
    onSuccess
}: StockAdjustmentModalProps) {
    const tCommon = useTranslations('Common');
    const [actualCount, setActualCount] = useState<number | ''>('');
    const [reasonCode, setReasonCode] = useState("COUNT_MISMATCH");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const variance = useMemo(() => {
        if (product && typeof actualCount === 'number') {
            return actualCount - Number(product.stock);
        }
        return 0;
    }, [product, actualCount]);

    const financialImpact = useMemo(() => {
        if (!product) return 0;
        return variance * Number(product.costPrice);
    }, [variance, product]);

    const handleClose = () => {
        setActualCount('');
        setReasonCode("COUNT_MISMATCH");
        setNotes("");
        setError(null);
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!product) return;
        if (typeof actualCount !== 'number') {
            setError("يرجى إدخال الكمية الفعلية بشكل صحيح.");
            return;
        }

        if (variance === 0) {
            setError("لا يوجد أي عجز أو زيادة للتسوية.");
            return;
        }

        if (!reasonCode) {
            setError("يرجى اختيار سبب التسوية.");
            return;
        }

        setLoading(true);
        try {
            const res = await submitStockReconciliation({
                productId: product.id,
                warehouseId,
                actualCount,
                reasonCode,
                notes: notes.trim(),
                csrfToken
            });

            if (res.success) {
                toast.success("تمت التسوية الجردية بنجاح.");
                onSuccess?.();
                handleClose();
            } else {
                setError(res.message || "حدث خطأ أثناء حفظ التسوية.");
            }
        } catch (err: any) {
            setError(err.message || "حدث خطأ في الاتصال بالخادم.");
        } finally {
            setLoading(false);
        }
    };

    if (!product) return null;

    const isLoss = variance < 0;
    const isGain = variance > 0;

    return (
        <GlassModal isOpen={isOpen} onClose={handleClose} title="إذن تسوية جردية">
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Product Info Header */}
                <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col gap-2 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-xs font-black text-cyan-600 dark:text-cyan-400 font-mono mb-1">{product.sku}</div>
                            <div className="text-base font-black text-slate-900 dark:text-white leading-tight">{product.name}</div>
                        </div>
                        <div className="text-end">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-black">التكلفة للوحدة</div>
                            <div className="text-sm font-black text-slate-700 dark:text-zinc-300 font-mono">{Number(product.costPrice).toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                {/* Counts Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">
                            رصيد النظام الحالي
                        </label>
                        <div className="glass-input w-full bg-slate-100 dark:bg-white/5 flex items-center px-4 font-black text-slate-600 dark:text-zinc-400 text-lg">
                            {Number(product.stock)}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-amber-600 dark:text-amber-500 uppercase font-black mb-1.5 block tracking-widest">
                            الكمية الفعلية (الجرد)
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            className="glass-input w-full font-black text-slate-900 dark:text-white text-lg ring-2 focus:ring-amber-500/50 border-amber-200 dark:border-amber-500/30"
                            value={actualCount === '' ? '' : actualCount}
                            onChange={e => {
                                const val = e.target.value;
                                setActualCount(val === '' ? '' : Number(val));
                            }}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Live Impact Preview */}
                <div className={clsx(
                    "p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between",
                    typeof actualCount !== 'number' || variance === 0 ? "bg-slate-50 border-slate-200 text-slate-400 dark:bg-white/5 dark:border-white/10 dark:text-zinc-600" :
                    isLoss ? "bg-rose-50 border-rose-200 shadow-[0_4px_20px_-5px_rgba(244,63,94,0.3)] dark:bg-rose-500/10 dark:border-rose-500/20" :
                    "bg-emerald-50 border-emerald-200 shadow-[0_4px_20px_-5px_rgba(16,185,129,0.3)] dark:bg-emerald-500/10 dark:border-emerald-500/20"
                )}>
                    <div>
                        <div className="text-[10px] uppercase tracking-widest font-black mb-1 opacity-70">
                            الفرق (العجز/الزيادة)
                        </div>
                        <div className={clsx(
                            "text-3xl font-black font-mono tracking-tighter",
                            typeof actualCount !== 'number' || variance === 0 ? "text-slate-400 dark:text-zinc-500" :
                            isLoss ? "text-rose-600 dark:text-rose-400" :
                            "text-emerald-600 dark:text-emerald-400"
                        )}>
                            {variance > 0 ? '+' : ''}{variance}
                        </div>
                    </div>

                    <ArrowRightLeft className={clsx(
                        "w-6 h-6 shrink-0 mx-4 opacity-20",
                        isLoss && "text-rose-500",
                        isGain && "text-emerald-500"
                    )} />

                    <div className="text-end">
                        <div className="text-[10px] uppercase tracking-widest font-black mb-1 opacity-70 flex items-center justify-end gap-1">
                            {isLoss ? <AlertTriangle className="w-3 h-3" /> : <Calculator className="w-3 h-3" />}
                            الأثر المالي
                        </div>
                        <div className={clsx(
                            "text-3xl font-black font-mono tracking-tighter",
                            typeof actualCount !== 'number' || variance === 0 ? "text-slate-400 dark:text-zinc-500" :
                            isLoss ? "text-rose-600 dark:text-rose-400" :
                            "text-emerald-600 dark:text-emerald-400"
                        )}>
                            {financialImpact > 0 ? '+' : ''}{financialImpact.toFixed(2)}
                        </div>
                        <div className="text-[9px] font-black uppercase mt-1 opacity-50 tracking-widest">
                            {isLoss ? "خسارة مخزون (مصروف)" : isGain ? "زيادة مخزون (إيراد)" : "لا يوجد أثر"}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">
                            سبب التسوية
                        </label>
                        <select
                            className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                            value={reasonCode}
                            onChange={e => setReasonCode(e.target.value)}
                        >
                            {REASON_CODES.map(rc => (
                                <option key={rc.value} value={rc.value}>{rc.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-span-2">
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">
                            ملاحظات تفصيلية
                        </label>
                        <textarea
                            className="glass-input w-full min-h-[80px] font-black text-slate-900 dark:text-white placeholder:text-slate-400/50"
                            placeholder="اذكر تفاصيل سبب العجز أو الزيادة هنا..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl text-rose-600 dark:text-rose-400 text-sm font-black flex items-center gap-3 animate-in shake duration-300">
                        <X className="w-5 h-5 shrink-0" />
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-white/5">
                    <button type="button" onClick={handleClose}
                        className="px-6 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-muted-foreground font-black transition-all active:scale-95">
                        إلغاء
                    </button>
                    <button type="submit" disabled={loading || variance === 0 || typeof actualCount !== 'number'}
                        className="flex items-center gap-3 px-8 py-3 rounded-xl font-black transition-all bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:shadow-none">
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                        اعتماد التسوية الجردية
                    </button>
                </div>
            </form>
        </GlassModal>
    );
}
