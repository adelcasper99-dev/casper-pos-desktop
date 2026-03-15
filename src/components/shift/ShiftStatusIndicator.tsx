"use client";

import { useState, useCallback, useEffect } from "react";
import { openShift, closeShift } from "@/actions/shift-management-actions";
import { getEffectiveStoreSettings } from "@/actions/settings";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import CashCounter from "./CashCounter";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { printZReport } from "@/lib/print-zreport";
import { toast } from "sonner";
import GlassModal from "../ui/GlassModal";
import CashInOutModal from "./CashInOutModal";

interface ShiftStatusIndicatorProps {
    shift?: any;
    registers?: Array<{ id: string; name: string }>;
    csrfToken?: string;
}

export default function ShiftStatusIndicator({ shift, registers = [], csrfToken }: ShiftStatusIndicatorProps) {
    const { handleKeyDown, getNavProps } = useKeyboardNavigation();
    const t = useTranslations('Shift');
    const tVal = useTranslations('Validation');
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [showCashInOutModal, setShowCashInOutModal] = useState(false);

    // Form states
    const [startCash, setStartCash] = useState("");
    const [actualCash, setActualCash] = useState("");
    const [cashBreakdown, setCashBreakdown] = useState<Record<string, number>>({});
    const [notes, setNotes] = useState("");
    const [selectedRegister, setSelectedRegister] = useState(registers[0]?.id || null);
    const [isMounted, setIsMounted] = useState(false);
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
        setIsMounted(true);
        const fetchSettings = async () => {
            const res = await getEffectiveStoreSettings();
            if (res.data) {
                setSettings(res.data);
            }
        };
        fetchSettings();
    }, []);

    const isBlindClose = settings?.blindCloseEnabled !== false;

    const handleOpenShift = async () => {
        const cashValue = startCash === "" ? 0 : parseFloat(startCash);

        if (isNaN(cashValue) || cashValue < 0) {
            toast.error("Please enter valid starting cash amount");
            return;
        }

        setIsLoading(true);
        try {
            const result = await openShift({
                startCash: cashValue,
                registerId: selectedRegister || undefined,
                registerName: registers.find(r => r.id === selectedRegister)?.name,
                csrfToken
            });

            if (result.success) {
                setShowOpenModal(false);
                setStartCash("");
                router.refresh();
            } else {
                toast.error(result.error || result.message || "Failed to open shift");
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to open shift");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCloseShift = async () => {
        if (!actualCash || parseFloat(actualCash) < 0) {
            toast.error("Please enter valid actual cash amount");
            return;
        }

        if (!shift?.id) {
            toast.error("No active shift to close");
            return;
        }

        setIsLoading(true);
        try {
            const result = await closeShift({
                shiftId: shift.id,
                actualCash: parseFloat(actualCash),
                cashBreakdown,
                notes: notes || undefined,
                csrfToken // Added CSRF token
            });

            if (result.success) {
                setShowCloseModal(false);
                setActualCash("");
                setNotes("");

                // Auto Print Z-Report
                if (result.shift) {
                    toast.info("Generating Z-Report...");
                    const printSuccess = await printZReport(result.shift);
                    if (printSuccess) {
                        toast.success("Z-Report printed successfully!");
                    } else {
                        toast.error("Failed to print Z-Report. Please check printer.");
                    }
                }

                router.refresh();
            } else {
                // Display the actual error message
                toast.error(result.message || result.error || "Failed to close shift");
            }
        } catch (error: any) {
            console.error('[ERROR] Close shift failed:', error);
            toast.error(error.message || "Failed to close shift");
        } finally {
            setIsLoading(false);
        }
    };

    if (!shift) {
        return (
            <>
                <div className="glass-card bg-black/40 text-white px-6 py-4 flex items-center justify-between shadow-2xl border border-white/5 backdrop-blur-3xl transition-all duration-500">
                    <div className="flex items-center gap-4">
                        {/* Open Shift Button on far left */}
                        <button
                            onClick={() => setShowOpenModal(true)}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 font-black shadow-[0_0_20px_rgba(0,242,255,0.3)] group"
                        >
                            <div className="bg-black/10 p-1 rounded-lg group-hover:scale-110 transition-transform">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                            </div>
                            <span className="tracking-tight uppercase">{t('openShift')}</span>
                        </button>
                        <div className="h-10 w-px bg-white/10 mx-2"></div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-0.5">
                                <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(250,204,21,0.5)]"></div>
                                <span className="font-black text-sm tracking-wide uppercase text-yellow-500/90">{t('noActiveShift')}</span>
                            </div>
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none px-4.5">System Ready for Session</span>
                        </div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-full border border-white/10 text-white/30">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                </div>

                {/* Open Shift Modal */}
                <GlassModal 
                    isOpen={showOpenModal} 
                    onClose={() => {
                        setShowOpenModal(false);
                        setStartCash("");
                    }} 
                    title={t('openModalTitle')}
                >
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center border border-blue-500/30">
                                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-sm text-blue-100/70 flex-1">{t('openModalSubtitle')}</p>
                        </div>

                        {registers.length > 1 && (
                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 px-1">
                                    {t('selectRegister')}
                                </label>
                                <select
                                    id="open-shift-register-select"
                                    {...getNavProps(0)}
                                    value={selectedRegister || ""}
                                    onChange={(e) => setSelectedRegister(e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, 0, 2, undefined)}
                                    className="w-full glass-input"
                                >
                                    {registers.map(reg => (
                                        <option key={reg.id} value={reg.id} className="bg-zinc-900">
                                            {reg.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 px-1">
                                المبلغ العهدة (Start Cash)
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-500 font-bold">$</span>
                                <input
                                    id="open-shift-start-cash"
                                    {...getNavProps(1)}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={startCash}
                                    onChange={(e) => setStartCash(e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, 1, 2, handleOpenShift)}
                                    className="w-full glass-input pl-10 text-xl font-bold"
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleOpenShift}
                            disabled={isLoading}
                            className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(0,242,255,0.2)]"
                        >
                            {isLoading ? tVal('required') : t('confirmOpen')}
                        </button>
                    </div>
                </GlassModal>
            </>
        );
    }



    const duration = Math.floor((Date.now() - new Date(shift.openedAt).getTime()) / 1000 / 60);
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;

    const expectedCashValue = (
        Number(shift.startCash) +
        Number(shift.totalCashSales || 0) -
        Number(shift.totalExpenses || 0) -
        // @ts-ignore
        Number(shift.totalCashRefunds || 0)
    );
    const actualCashNum = actualCash !== "" ? Number(actualCash) : 0;
    const varianceValue = actualCashNum - expectedCashValue;

    // @ts-ignore
    const totalCashRefunds = Number(shift.totalCashRefunds || 0);
    // @ts-ignore
    const totalAccountRefunds = Number(shift.totalAccountRefunds || 0);
    // @ts-ignore
    const totalAccountSales = Number(shift.totalAccountSales || 0);

    return (
        <>
            <header className="w-full h-16 border-b border-white/5 bg-black/40 backdrop-blur-3xl px-6 flex items-center justify-between sticky top-0 z-[60] shadow-2xl transition-all duration-500">
                {/* RIGHT SECTION: Identity & Status */}
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-white/40 tracking-widest uppercase">{shift.cashierName}</span>
                            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                        </div>
                        <span className="text-[10px] font-black text-cyan-400 tracking-wider uppercase leading-none mt-0.5">{isMounted && `${hours}س ${mins}د`}</span>
                    </div>
                </div>

                {/* CENTER SECTION: Horizontal Counters */}
                <div className="flex items-center gap-8 divide-x divide-x-reverse divide-white/5 h-full py-3">
                    {/* Opening Cash */}
                    <div className="flex flex-col items-center px-6">
                        <span className="text-[9px] font-black text-white/30 tracking-[0.2em] uppercase mb-1">افتتاحي</span>
                        <span className="text-sm font-black text-emerald-400/80 tabular-nums">${Number(shift.startCash || 0).toFixed(2)}</span>
                    </div>

                    {/* Cash Sales */}
                    <div className="flex flex-col items-center px-6">
                        <span className="text-[9px] font-black text-white/30 tracking-[0.2em] uppercase mb-1">كاش</span>
                        <span className="text-sm font-black text-emerald-400 tabular-nums">${Number(shift.totalCashSales || 0).toFixed(2)}</span>
                    </div>

                    {/* Visa/Network */}
                    <div className="flex flex-col items-center px-6">
                        <span className="text-[9px] font-black text-white/30 tracking-[0.2em] uppercase mb-1">فيزا/شبكة</span>
                        <span className="text-sm font-black text-cyan-400 tabular-nums">${Number(shift.totalCardSales || 0).toFixed(2)}</span>
                    </div>

                    {/* Credit/Ajel */}
                    <div className="flex flex-col items-center px-6">
                        <span className="text-[9px] font-black text-white/30 tracking-[0.2em] uppercase mb-1">آجل</span>
                        <span className="text-sm font-black text-amber-400 tabular-nums">${totalAccountSales.toFixed(2)}</span>
                    </div>

                    {/* Returns */}
                    <div className="flex flex-col items-center px-6">
                        <span className="text-[9px] font-black text-white/30 tracking-[0.2em] uppercase mb-1">مرتجع</span>
                        <span className="text-sm font-black text-rose-400 tabular-nums">-${(totalCashRefunds + totalAccountRefunds).toFixed(2)}</span>
                    </div>
                </div>

                {/* LEFT SECTION: Actions */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowCashInOutModal(true)}
                        className="h-10 px-4 glass-card bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/5 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all duration-300"
                    >
                        سحب / إيداع
                    </button>
                    <button
                        onClick={() => setShowCloseModal(true)}
                        className="h-10 px-6 bg-red-600/20 hover:bg-red-600/40 text-red-500 hover:text-red-400 border border-red-500/20 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all duration-300 shadow-[0_0_20px_rgba(220,38,38,0.1)] hover:shadow-[0_0_25px_rgba(220,38,38,0.2)]"
                    >
                        إغلاق الوردية
                    </button>
                </div>
            </header>

            <GlassModal 
                isOpen={showCloseModal} 
                onClose={() => {
                    setShowCloseModal(false);
                    setActualCash("");
                    setNotes("");
                }} 
                title={t('closeModalTitle') || "إغلاق الوردية"}
            >
                <div className="space-y-5 flex flex-col">
                    <div className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/30">
                            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-sm text-red-100/70 flex-1">{t('closeModalSubtitle') || "مراجعة العهدة وإغلاق اليومية"}</p>
                    </div>

                    <CashCounter 
                        onChange={(total, breakdown) => {
                            setActualCash(total.toString());
                            setCashBreakdown(breakdown);
                        }}
                        onEnterAtEnd={() => {
                            const notesEl = document.getElementById('shift-notes-input');
                            if (notesEl) notesEl.focus();
                        }}
                    />

                    <div className="glass-card bg-white/5 p-4 space-y-2">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center">
                            Actual Cash Counted (رصيد الدرج النهائي)
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-500 font-bold">$</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={actualCash}
                                onChange={(e) => setActualCash(e.target.value)}
                                className="w-full glass-input pl-10 text-2xl font-black text-center"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {!isBlindClose && (
                        <div className="glass-card bg-black/40 p-4 space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">الرصيد المتوقع (Expected):</span>
                                <span className="text-white font-bold">${expectedCashValue.toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-white/5" />
                            <div className="flex justify-between font-bold text-lg">
                                <span className={varianceValue < 0 ? "text-red-400" : varianceValue > 0 ? "text-green-400" : "text-zinc-400"}>
                                    {varianceValue < 0 ? "عجز:" : varianceValue > 0 ? "زيادة:" : "متطابق"}
                                </span>
                                <span className={varianceValue < 0 ? "text-red-400" : varianceValue > 0 ? "text-green-400" : "text-white"}>
                                    {varianceValue > 0 ? "+" : ""}{varianceValue.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 px-1">
                            {t('notes')}
                        </label>
                        <textarea
                            id="shift-notes-input"
                            {...getNavProps(1)}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, 1, 2, handleCloseShift)}
                            className="w-full glass-input resize-none h-20"
                            placeholder="Any notes..."
                        />
                    </div>

                    <button
                        onClick={handleCloseShift}
                        disabled={isLoading}
                        className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(220,38,38,0.2)]"
                    >
                        {isLoading ? tVal('required') : "إنهاء الوردية (Close Shift)"}
                    </button>
                </div>
            </GlassModal>

            <CashInOutModal 
                isOpen={showCashInOutModal}
                onClose={() => setShowCashInOutModal(false)}
                currentShiftId={shift.id}
                treasuryId={shift.registerId} // Link to register treasury if possible
            />
        </>
    );
}
