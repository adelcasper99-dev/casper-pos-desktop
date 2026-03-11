"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GlassModal from "@/components/ui/GlassModal";
import { Loader2, Clock, DollarSign, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { updateTicketDetails, updateTicketStatus } from "@/actions/ticket-actions";
import { useCSRF } from "@/contexts/CSRFContext";

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

    const priceNum = parseFloat(price) || 0;
    const isValid = priceNum > 0 && duration !== null;

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
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black uppercase text-cyan-500 tracking-[0.2em]">
                        #{ticket.barcode}
                    </span>
                    <span className="text-lg font-black text-white">تحديد التكلفة والوقت</span>
                </div>
            }
            className="max-w-lg"
        >
            <div className="space-y-7 pt-2" dir="rtl">

                {/* ── Cost Input ─────────────────────────────── */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                        <DollarSign className="w-3.5 h-3.5 text-cyan-500" />
                        التكلفة التقريبية (EGP)
                    </label>
                    <div className="relative">
                        <Input
                            type="number"
                            inputMode="numeric"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0"
                            className="h-16 text-3xl font-black text-center bg-zinc-950 border-white/10 rounded-2xl focus:border-cyan-500 transition-all pr-12 tabular-nums"
                        />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-600">
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
                                    "h-10 rounded-xl text-[11px] font-black border transition-all",
                                    priceNum === p
                                        ? "bg-cyan-500 border-cyan-500 text-black"
                                        : "bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Duration Picker ─────────────────────────── */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-orange-400" />
                        موعد التسليم المتوقع
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {DURATION_PRESETS.map((d) => (
                            <button
                                key={d.value}
                                onClick={() => setDuration(d.value)}
                                className={cn(
                                    "h-12 rounded-xl text-sm font-black border transition-all flex items-center justify-center gap-2",
                                    duration === d.value
                                        ? "bg-orange-500 border-orange-500 text-black shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                                        : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                <Clock className="w-3.5 h-3.5 opacity-60" />
                                {d.label}
                            </button>
                        ))}
                    </div>
                    {/* Custom duration in minutes */}
                    <div className="flex items-center gap-3 bg-zinc-950 border border-white/10 rounded-xl p-3">
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest whitespace-nowrap">
                            أو أدخل بالدقائق
                        </span>
                        <Input
                            type="number"
                            inputMode="numeric"
                            value={duration?.toString() ?? ""}
                            onChange={(e) => setDuration(Number(e.target.value) || null)}
                            placeholder="مثال: 90"
                            className="h-9 text-sm font-bold text-center bg-transparent border-white/10 rounded-lg focus:border-orange-500 transition-all"
                        />
                        {duration && (
                            <span className="text-[10px] font-black text-orange-400 whitespace-nowrap shrink-0">
                                {duration >= 1440
                                    ? `${Math.floor(duration / 1440)} يوم`
                                    : duration >= 60
                                    ? `${Math.floor(duration / 60)} س ${duration % 60 > 0 ? duration % 60 + " د" : ""}`
                                    : `${duration} د`}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Summary Banner ──────────────────────────── */}
                {isValid && (
                    <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">التقدير</span>
                            <span className="text-2xl font-black text-white tabular-nums">
                                {priceNum.toLocaleString("ar-EG")} <span className="text-xs text-cyan-400">EGP</span>
                            </span>
                        </div>
                        <div className="h-8 w-[1px] bg-white/10" />
                        <div className="flex flex-col gap-1 text-right">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">موعد التسليم</span>
                            <span className="text-sm font-black text-orange-400">
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
                <div className="flex gap-3 pt-2">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 h-14 text-zinc-500 hover:text-white rounded-2xl font-bold"
                    >
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!isValid || isLoading}
                        className={cn(
                            "flex-[2] h-14 font-black text-base rounded-2xl transition-all flex items-center justify-center gap-3",
                            isValid
                                ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_30px_rgba(34,211,238,0.25)] active:scale-[0.98]"
                                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <ChevronRight className="w-5 h-5" />
                                تأكيد وبدء الفحص
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </GlassModal>
    );
}
