"use client";

import { useState, useEffect, useCallback } from "react";
import { openShift } from "@/actions/shift-management-actions";
import { generateCSRFToken } from "@/lib/csrf-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Clock, X, ChevronRight, Banknote, AlertCircle,
    ShieldCheck, Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SESSION_KEY = "shift_prompt_dismissed";

interface ShiftPromptModalProps {
    open: boolean;
    onClose: () => void;
    registers?: Array<{ id: string; name: string }>;
}

export default function ShiftPromptModal({
    open,
    onClose,
    registers = [],
}: ShiftPromptModalProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [startCash, setStartCash] = useState("");
    const [selectedRegister, setSelectedRegister] = useState(registers[0]?.id || "");
    const [visible, setVisible] = useState(false);

    // Animate in
    useEffect(() => {
        if (open) {
            // Small delay for mount transition
            const t = setTimeout(() => setVisible(true), 10);
            return () => clearTimeout(t);
        } else {
            setVisible(false);
        }
    }, [open]);

    const dismiss = useCallback(() => {
        sessionStorage.setItem(SESSION_KEY, "1");
        setVisible(false);
        setTimeout(onClose, 300); // let close animation finish
    }, [onClose]);

    const handleOpenShift = async () => {
        const cashValue = startCash === "" ? 0 : parseFloat(startCash);
        if (isNaN(cashValue) || cashValue < 0) {
            toast.error("أدخل رصيد بداية صحيح");
            return;
        }

        setIsLoading(true);
        try {
            // 🛡️ Get CSRF token for the action
            const csrfToken = await generateCSRFToken();

            const result = await openShift({
                startCash: cashValue,
                registerId: selectedRegister || undefined,
                registerName: registers.find(r => r.id === selectedRegister)?.name,
                csrfToken, // 🔑 Inject CSRF token
            });

            if (result.success) {
                toast.success("تم فتح الوردية بنجاح ✓");
                setVisible(false);
                setTimeout(() => {
                    onClose();
                    router.refresh();
                }, 300);
            } else {
                toast.error(result.error || result.message || "فشل فتح الوردية");
            }
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ أثناء فتح الوردية");
        } finally {
            setIsLoading(false);
        }
    };

    if (!open) return null;

    return (
        /* Backdrop */
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
                visible ? "bg-black/60 backdrop-blur-sm" : "bg-transparent"
            }`}
            onClick={(e) => e.target === e.currentTarget && dismiss()}
        >
            {/* Modal Panel */}
            <div
                className={`relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden transition-all duration-300 ${
                    visible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"
                }`}
            >
                {/* Gradient top glow */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-32 bg-cyan-500/10 blur-3xl pointer-events-none" />

                {/* Header */}
                <div className="relative flex items-start justify-between p-7 pb-0">
                    <div className="flex flex-col gap-1">
                        {/* Icon badge */}
                        <div className="inline-flex items-center gap-2 bg-cyan-500/15 border border-cyan-500/25 rounded-2xl px-3 py-1.5 w-fit mb-3">
                            <div className="relative w-2 h-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                                لا توجد وردية مفتوحة
                            </span>
                        </div>
                        <h2 className="text-xl font-black text-white leading-tight">
                            فتح وردية جديدة
                        </h2>
                        <p className="text-zinc-400 text-sm font-medium leading-snug mt-0.5">
                            يجب فتح وردية لتسجيل المبيعات والعمليات. يمكنك التخطي إذا كنت هنا فقط للمراجعة.
                        </p>
                    </div>

                    {/* Close button */}
                    <button
                        onClick={dismiss}
                        className="mt-1 ml-1 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                        aria-label="تخطي"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Info tiles */}
                <div className="relative grid grid-cols-3 gap-2 px-7 pt-5">
                    {[
                        { icon: ShieldCheck, label: "أمان كامل", color: "text-emerald-400" },
                        { icon: Timer, label: "وقت فعلي", color: "text-cyan-400" },
                        { icon: Banknote, label: "تتبع مالي", color: "text-violet-400" },
                    ].map(({ icon: Icon, label, color }) => (
                        <div key={label} className="flex flex-col items-center gap-1.5 p-3 bg-white/5 rounded-2xl border border-white/5">
                            <Icon className={`w-4 h-4 ${color}`} />
                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-wider">{label}</span>
                        </div>
                    ))}
                </div>

                {/* Form */}
                <div className="relative px-7 pt-5 pb-2 space-y-4">
                    {/* Register selector */}
                    {registers.length > 1 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                اختر الكاشيير
                            </label>
                            <select
                                value={selectedRegister}
                                onChange={(e) => setSelectedRegister(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold focus:outline-none focus:border-cyan-500/50 transition-colors"
                            >
                                {registers.map((r) => (
                                    <option key={r.id} value={r.id} className="bg-zinc-800">
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Starting Cash */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            رصيد البداية
                        </label>
                        <div className="relative">
                            <Banknote className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <Input
                                type="number"
                                min={0}
                                placeholder="0.00"
                                value={startCash}
                                onChange={(e) => setStartCash(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleOpenShift()}
                                className="pr-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 rounded-2xl h-12 font-black tabular-nums focus-visible:ring-cyan-500/30 focus-visible:border-cyan-500/50 text-base"
                                dir="ltr"
                                autoFocus
                            />
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-500 uppercase">EGP</span>
                        </div>
                    </div>

                    {/* Zero cash notice */}
                    {(startCash === "" || parseFloat(startCash) === 0) && (
                        <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-2xl p-3">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-[10px] text-amber-400 font-bold leading-relaxed">
                                سيتم فتح الوردية برصيد صفر. يمكنك إضافة مبلغ البداية للمحاسبة الدقيقة.
                            </p>
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div className="relative flex flex-col gap-3 px-7 pb-7 pt-4">
                    <Button
                        onClick={handleOpenShift}
                        disabled={isLoading}
                        className="w-full h-14 rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white font-black text-base shadow-lg shadow-cyan-500/20 transition-all border-0 flex items-center justify-center gap-2 group"
                    >
                        {isLoading ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>جارٍ فتح الوردية...</span>
                            </div>
                        ) : (
                            <>
                                <Clock className="w-5 h-5" />
                                <span>فتح الوردية الآن</span>
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </>
                        )}
                    </Button>

                    <button
                        onClick={dismiss}
                        className="w-full h-11 rounded-2xl bg-transparent border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-zinc-200 font-bold text-sm transition-all"
                    >
                        ليس الآن — تخطي
                    </button>
                </div>

                {/* Bottom glow line */}
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
        </div>
    );
}
