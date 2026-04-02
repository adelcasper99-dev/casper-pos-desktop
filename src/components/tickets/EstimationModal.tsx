"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GlassModal from "@/components/ui/GlassModal";
import { Loader2, Clock, DollarSign, ChevronRight, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { updateTicketDetails, updateTicketStatus } from "@/actions/ticket-actions";
import { useCSRF } from "@/contexts/CSRFContext";
import { Decimal } from "decimal.js";

interface EstimationModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: {
        id: string;
        barcode: string;
        repairPrice?: number;
        expectedDuration?: number;
    };
    onSuccess: () => void;
}

// Quick-select duration presets (in minutes)
const DURATION_PRESETS = [
    { label: "٣٠ د", value: 30 },
    { label: "١ س", value: 60 },
    { label: "٢ س", value: 120 },
    { label: "٦ س", value: 360 },
    { label: "يوم", value: 24 * 60 },
    { label: "٣ أيام", value: 3 * 24 * 60 },
];

// Quick-select price presets (EGP)
const PRICE_PRESETS = [100, 200, 300, 500, 750, 1000];

export default function EstimationModal({
    isOpen,
    onClose,
    ticket,
    onSuccess,
}: EstimationModalProps) {
    const { token: csrfToken } = useCSRF();
    const [price, setPrice] = useState("");
    const [duration, setDuration] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setPrice(ticket.repairPrice ? ticket.repairPrice.toString() : "");
            setDuration(ticket.expectedDuration ?? null);
        }
    }, [isOpen, ticket]);

    const priceDecimal = new Decimal(price || 0);
    const priceNum = priceDecimal.toNumber();
    const isValid = priceDecimal.gt(0) && duration !== null;

    const handleConfirm = async () => {
        if (!isValid) {
            toast.error("يرجى إدخال التكلفة التقريبية ومدة الإصلاح");
            return;
        }

        setIsLoading(true);
        try {
            // 1. Save price & duration
            const detailsRes = await updateTicketDetails(ticket.id, {
                repairPrice: priceNum,
                expectedDuration: duration!,
                csrfToken: csrfToken ?? undefined,
            });

            if (!detailsRes.success) {
                toast.error("فشل تحديث التقدير");
                return;
            }

            // 2. Transition status: NEW → DIAGNOSING
            const statusRes = await updateTicketStatus({
                ticketId: ticket.id,
                status: "DIAGNOSING",
                repairPrice: priceNum,
                csrfToken: csrfToken ?? undefined,
            });

            if (statusRes.success) {
                toast.success("✅ تم تحديد التكلفة — التذكرة في مرحلة الفحص");
                onSuccess();
                onClose();
            } else {
                toast.error((statusRes as any).error || "فشل تحديث الحالة");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex flex-col gap-0.5" dir="rtl">
                    <span className="text-[10px] font-black uppercase text-primary tracking-[0.2em]">
                        #{ticket.barcode}
                    </span>
                    <span className="text-xl font-black text-foreground">تحديد التكلفة والوقت</span>
                </div>
            }
            className="max-w-md"
        >
            <div className="space-y-7 pt-2" dir="rtl">

                {/* ── Cost Input ─────────────────────────────── */}
                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                        <Calculator className="w-3.5 h-3.5 text-primary" />
                        التكلفة التقريبية (EGP)
                    </label>
                    <div className="relative group">
                        <Input
                            type="number"
                            inputMode="numeric"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0"
                            className="h-20 text-4xl font-black text-center bg-secondary/30 dark:bg-zinc-900/50 border-border dark:border-white/5 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all pr-12 tabular-nums"
                        />
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground/50 group-focus-within:text-primary transition-colors">
                            EGP
                        </span>
                    </div>
                    {/* Quick price buttons */}
                    <div className="grid grid-cols-6 gap-2">
                        {PRICE_PRESETS.map((p) => (
                            <button
                                key={p}
                                onClick={() => setPrice(p.toString())}
                                className={cn(
                                    "h-11 rounded-xl text-[11px] font-black border transition-all active:scale-95",
                                    priceNum === p
                                        ? "bg-primary border-primary text-primary-foreground shadow-[0_4px_12px_rgba(8,145,178,0.2)]"
                                        : "bg-secondary/40 border-border/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                )}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Duration Picker ─────────────────────────── */}
                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        موعد التسليم المتوقع
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {DURATION_PRESETS.map((d) => (
                            <button
                                key={d.value}
                                onClick={() => setDuration(d.value)}
                                className={cn(
                                    "h-14 rounded-xl text-sm font-black border transition-all flex items-center justify-center gap-2 active:scale-95",
                                    duration === d.value
                                        ? "bg-amber-500 border-amber-500 text-white shadow-[0_4px_15px_rgba(245,158,11,0.3)]"
                                        : "bg-secondary/40 border-border/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                )}
                            >
                                <Clock className="w-3.5 h-3.5 opacity-60" />
                                {d.label}
                            </button>
                        ))}
                    </div>
                    {/* Custom duration in minutes */}
                    <div className="flex items-center gap-3 bg-secondary/30 dark:bg-zinc-900/30 border border-border dark:border-white/5 rounded-2xl p-4 transition-all focus-within:border-amber-500/50">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                            أو أدخل بالدقائق
                        </span>
                        <Input
                            type="number"
                            inputMode="numeric"
                            value={duration?.toString() ?? ""}
                            onChange={(e) => setDuration(Number(e.target.value) || null)}
                            placeholder="مثال: 90"
                            className="h-10 text-sm font-bold text-center bg-background/50 border-border/50 rounded-lg focus:border-amber-500 transition-all"
                        />
                        {duration && (
                            <div className="bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20 shrink-0">
                                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                    {duration >= 1440
                                        ? `${Math.floor(duration / 1440)} يوم`
                                        : duration >= 60
                                        ? `${Math.floor(duration / 60)} س ${duration % 60 > 0 ? duration % 60 + " د" : ""}`
                                        : `${duration} د`}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Summary Banner ──────────────────────────── */}
                {isValid && (
                    <div className="p-5 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-3xl flex items-center justify-between shadow-sm">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">إجمالي التقدير</span>
                            <span className="text-2xl font-black text-foreground tabular-nums">
                                {priceNum.toLocaleString("ar-EG")} <span className="text-xs font-bold text-primary">EGP</span>
                            </span>
                        </div>
                        <div className="h-10 w-[1px] bg-primary/20 mx-4" />
                        <div className="flex flex-col gap-1 text-right">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">موعد التسليم</span>
                            <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                                {duration! >= 1440
                                    ? `${Math.floor(duration! / 1440)} يوم`
                                    : duration! >= 60
                                    ? `${Math.floor(duration! / 60)} ساعة`
                                    : `${duration} دقيقة`}
                            </span>
                        </div>
                    </div>
                )}

                {/* ── CTA Buttons ─────────────────────────────── */}
                <div className="flex gap-4 pt-4">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 h-14 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-2xl font-bold transition-all"
                    >
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!isValid || isLoading}
                        className={cn(
                            "flex-[2.5] h-14 font-black text-base rounded-2xl transition-all flex items-center justify-center gap-3 relative overflow-hidden group",
                            isValid
                                ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_8px_25px_-5px_rgba(8,145,178,0.4)] active:scale-[0.98]"
                                : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                <span>تأكيد وبدء الفحص</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </GlassModal>
    );
}
