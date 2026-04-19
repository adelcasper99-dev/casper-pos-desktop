"use client";

import { useState, useMemo } from "react";
import GlassModal from "@/components/ui/GlassModal";
import { Loader2, Zap, Smartphone, Wallet, Info, ArrowLeftRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { processWalletTransaction } from "@/actions/wallet-actions";
import { generateIdempotencyKey } from "@/lib/offline-transaction-helper";

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

import { Treasury } from "@/types/treasury";

interface WalletTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    treasuries: Treasury[];
}

export function WalletTransactionModal({ isOpen, onClose, treasuries }: WalletTransactionModalProps) {
    const [operationType, setOperationType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
    const [digitalTreasuryId, setDigitalTreasuryId] = useState("");
    const [physicalTreasuryId, setPhysicalTreasuryId] = useState("");
    const [baseAmount, setBaseAmount] = useState("");
    const [commission, setCommission] = useState("");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);

    // Filter treasuries by type
    const digitalTreasuries = useMemo(() => 
        treasuries.filter(t => ['WALLET', 'VODAFONE_CASH', 'INSTAPAY'].includes(t.paymentMethod ?? '')),
        [treasuries]
    );

    const physicalTreasuries = useMemo(() => 
        treasuries.filter(t => t.paymentMethod === 'CASH'),
        [treasuries]
    );

    // Initial selections
    useMemo(() => {
        if (!digitalTreasuryId && digitalTreasuries.length > 0) setDigitalTreasuryId(digitalTreasuries[0].id);
        if (!physicalTreasuryId && physicalTreasuries.length > 0) setPhysicalTreasuryId(physicalTreasuries[0].id);
    }, [digitalTreasuries, physicalTreasuries]);

    const digitalSafe = digitalTreasuries.find(t => t.id === digitalTreasuryId);
    const physicalSafe = physicalTreasuries.find(t => t.id === physicalTreasuryId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!baseAmount || !digitalTreasuryId || !physicalTreasuryId) {
            toast.error("يرجى إكمال جميع الحقول المطلوبة");
            return;
        }

        setLoading(true);
        try {
            const idempotencyKey = generateIdempotencyKey('WALLET');
            const res = await processWalletTransaction({
                operationType,
                digitalTreasuryId,
                physicalTreasuryId,
                baseAmount: parseFloat(baseAmount),
                commission: parseFloat(commission || "0"),
                notes,
                idempotencyKey
            });

            if (res.success) {
                toast.success(res.message);
                onClose();
                setBaseAmount("");
                setCommission("");
                setNotes("");
            } else {
                toast.error(res.error || "فشلت العملية");
            }
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ غير متوقع");
        } finally {
            setLoading(false);
        }
    };

    const calculatedTotal = useMemo(() => {
        const base = parseFloat(baseAmount) || 0;
        const comm = parseFloat(commission) || 0;
        return operationType === 'DEPOSIT' ? base + comm : base - comm;
    }, [baseAmount, commission, operationType]);

    return (
        <GlassModal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl">
                        <Smartphone className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-black text-xl tracking-tight uppercase">عملية محفظة إلكترونية</span>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-6 font-cairo" dir="rtl">
                
                {/* ── Operation Type Toggle ── */}
                <div className="grid grid-cols-2 gap-3 p-1 bg-zinc-100 dark:bg-white/5 rounded-[1.5rem] border border-zinc-200 dark:border-white/10">
                    <button
                        type="button"
                        onClick={() => setOperationType('DEPOSIT')}
                        className={cn(
                            "h-12 rounded-[1.25rem] text-xs font-black transition-all flex items-center justify-center gap-2",
                            operationType === 'DEPOSIT' 
                                ? "bg-white dark:bg-zinc-800 text-emerald-600 shadow-md border border-zinc-200 dark:border-white/10" 
                                : "text-zinc-500 hover:text-emerald-500"
                        )}
                    >
                        <Wallet className="w-4 h-4" />
                        إيداع للعميل
                    </button>
                    <button
                        type="button"
                        onClick={() => setOperationType('WITHDRAWAL')}
                        className={cn(
                            "h-12 rounded-[1.25rem] text-xs font-black transition-all flex items-center justify-center gap-2",
                            operationType === 'WITHDRAWAL' 
                                ? "bg-white dark:bg-zinc-800 text-amber-600 shadow-md border border-zinc-200 dark:border-white/10" 
                                : "text-zinc-500 hover:text-amber-500"
                        )}
                    >
                        <Zap className="w-4 h-4" />
                        سحب من العميل
                    </button>
                </div>

                {/* ── Safes Selection ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] text-zinc-500 font-black tracking-widest px-1 uppercase">المحفظة الرقمية</label>
                        <select
                            className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none"
                            value={digitalTreasuryId}
                            onChange={e => setDigitalTreasuryId(e.target.value)}
                            required
                        >
                            {digitalTreasuries.map(t => (
                                <option key={t.id} value={t.id} className="bg-white dark:bg-zinc-950 font-bold">
                                    {t.name} ({t.balance.toLocaleString()} EGP)
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-zinc-500 font-black tracking-widest px-1 uppercase">الخزنة النقدية</label>
                        <select
                            className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none"
                            value={physicalTreasuryId}
                            onChange={e => setPhysicalTreasuryId(e.target.value)}
                            required
                        >
                            {physicalTreasuries.map(t => (
                                <option key={t.id} value={t.id} className="bg-white dark:bg-zinc-950 font-bold">
                                    {t.name} ({t.balance.toLocaleString()} EGP)
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* ── Amounts ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <label className="text-[10px] text-zinc-500 font-black tracking-widest px-1 uppercase">المبلغ الأساسي</label>
                        <input
                            type="number"
                            className="w-full bg-zinc-100 dark:bg-zinc-950 border-none rounded-2xl h-14 px-5 text-xl font-black font-mono text-center outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder="0.00"
                            value={baseAmount}
                            onChange={e => setBaseAmount(e.target.value)}
                            required
                        />
                        <div className="flex flex-wrap gap-2 justify-center">
                            {QUICK_AMOUNTS.map(amt => (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => setBaseAmount(amt.toString())}
                                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[10px] font-black hover:bg-primary hover:text-white transition-all active:scale-95"
                                >
                                    {amt} ج.م
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-zinc-500 font-black tracking-widest px-1 uppercase">العمولة (Store Profit)</label>
                        <input
                            type="number"
                            className="w-full bg-zinc-100 dark:bg-zinc-950 border-none rounded-2xl h-14 px-5 text-xl font-black font-mono text-center text-emerald-500 outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder="0.00"
                            value={commission}
                            onChange={e => setCommission(e.target.value)}
                        />
                    </div>
                </div>

                {/* ── Dynamic Instructions ── */}
                <div className={cn(
                    "p-4 rounded-2xl border-2 flex items-start gap-4 transition-all animate-in fade-in zoom-in duration-300",
                    operationType === 'DEPOSIT' 
                        ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" 
                        : "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400"
                )}>
                    <Info className="w-6 h-6 shrink-0 mt-1" />
                    <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-widest opacity-60">التوجيهات المالية:</p>
                        <p className="text-sm font-bold leading-relaxed">
                            {operationType === 'DEPOSIT' 
                                ? `استلم من العميل مبلغ (${calculatedTotal.toLocaleString()} ج.م) وضعها في [${physicalSafe?.name || 'الخزنة'}]. سنقوم بإرسال (${parseFloat(baseAmount || "0").toLocaleString()} ج.م) من محفظتك الرقمية.`
                                : `سيقوم العميل بإرسال (${parseFloat(baseAmount || "0").toLocaleString()} ج.م) لمحفظتك الرقمية. سلم العميل من [${physicalSafe?.name || 'الخزنة'}] مبلغ (${calculatedTotal.toLocaleString()} ج.م) فقط.`
                            }
                        </p>
                    </div>
                </div>

                {/* ── Notes ── */}
                <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 font-black tracking-widest px-1 uppercase">ملاحظات إضافية</label>
                    <input
                        className="w-full bg-zinc-50 dark:bg-white/[0.03] border-none rounded-2xl h-14 px-5 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        placeholder="اسم العميل أو رقم العملية..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                    />
                </div>

                {/* ── Action ── */}
                <button
                    type="submit"
                    disabled={loading || !baseAmount}
                    className={cn(
                        "w-full h-16 rounded-[2rem] font-black uppercase tracking-[0.2rem] text-sm flex justify-center items-center gap-3 shadow-xl transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:translate-y-0",
                        operationType === 'DEPOSIT' 
                            ? "bg-emerald-600 text-white shadow-emerald-500/20 hover:bg-emerald-500" 
                            : "bg-amber-600 text-white shadow-amber-500/20 hover:bg-amber-500"
                    )}
                >
                    {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <ArrowLeftRight className="w-6 h-6" />}
                    تأكيد العملية
                </button>
            </form>
        </GlassModal>
    );
}
