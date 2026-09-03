"use client";

import { useState, useCallback, useEffect } from "react";
import { openShift, closeShift } from "@/actions/shift-management-actions";
import { getEffectiveStoreSettings } from "@/actions/settings";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { clsx } from "clsx";
import CashCounter from "./CashCounter";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { printZReport } from "@/lib/print-zreport";
import { toast } from "sonner";
import GlassModal from "../ui/GlassModal";
import CashInOutModal from "./CashInOutModal";
import Decimal from "decimal.js";

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
    const [cardTerminalSettlement, setCardTerminalSettlement] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedRegister, setSelectedRegister] = useState(registers[0]?.id || null);
    const [isMounted, setIsMounted] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [acceptDiscrepancy, setAcceptDiscrepancy] = useState(false);
    const [discrepancyMessage, setDiscrepancyMessage] = useState("");
    const [discrepancyDetails, setDiscrepancyDetails] = useState<{ cashVariance: string; cardVariance: string; expectedCash: string; expectedCard: string; notes: string[] } | null>(null);

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
        let cashValue = 0;
        try {
            // ponytail: openShift.startCash should accept string to avoid Decimal->float conversion loss
            cashValue = startCash === "" ? 0 : new Decimal(startCash).toNumber();
        } catch {
            toast.error("Please enter valid starting cash amount");
            return;
        }

        if (cashValue < 0) {
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
        if (isLoading) return; // Prevent double submission
        
        let parsedActualCash = 0;
        try {
            // ponytail: closeShift.actualCash should accept string to avoid Decimal->float conversion loss
            parsedActualCash = new Decimal(actualCash).toNumber();
        } catch {
            toast.error("Please enter valid actual cash amount");
            return;
        }

        if (!actualCash || parsedActualCash < 0) {
            toast.error("Please enter valid actual cash amount");
            return;
        }

        if (!shift?.id) {
            toast.error("No active shift to close");
            return;
        }

        if (isBlindClose && cardTerminalSettlement === "") {
            toast.error("Please enter the total card terminal settlement");
            return;
        }

        let parsedCard: number | undefined;
        try {
            parsedCard = cardTerminalSettlement ? new Decimal(cardTerminalSettlement).toNumber() : undefined;
        } catch {
            toast.error("Please enter a valid card terminal settlement");
            return;
        }

        if (isBlindClose && parsedCard !== undefined && parsedCard < 0) {
            toast.error("Card settlement cannot be negative");
            return;
        }

        setIsLoading(true);
        try {

            const result = await closeShift({
                shiftId: shift.id,
                actualCash: parsedActualCash,
                cashBreakdown,
                cardTerminalSettlement: parsedCard,
                notes: notes || undefined,
                csrfToken,
                acceptDiscrepancy
            });

            if (result.success) {
                setShowCloseModal(false);
                setActualCash("");
                setCardTerminalSettlement("");
                setNotes("");
                setAcceptDiscrepancy(false);
                setDiscrepancyMessage("");
                setDiscrepancyDetails(null);

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
            } else if (result.code === "DISCREPANCY_DETECTED") {
                setDiscrepancyMessage(result.message || "");
                setDiscrepancyDetails({
                    cashVariance: result.cashVariance || "0",
                    cardVariance: result.cardVariance || "0",
                    expectedCash: result.expectedCash,
                    expectedCard: result.expectedCard,
                    notes: result.notes || []
                });
                toast.warning(result.message);
            } else {
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
                <div className="bg-white dark:bg-black/40 dark:backdrop-blur-3xl border-b border-slate-100 dark:border-white/5 shadow-sm dark:shadow-2xl text-slate-800 dark:text-white px-6 py-4 flex items-center justify-between transition-all duration-500">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowOpenModal(true)}
                            className="bg-slate-900 hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-black px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all font-bold shadow-sm dark:shadow-[0_0_20px_rgba(0,242,255,0.3)] group"
                        >
                            <div className="p-1 rounded-lg group-hover:scale-110 transition-transform">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                            </div>
                            <span className="tracking-tight">{t('openShift')}</span>
                        </button>
                        <div className="h-10 w-px bg-slate-200 dark:bg-white/10 mx-2"></div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-0.5">
                                <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse"></div>
                                <span className="font-bold text-sm tracking-wide text-yellow-500">{t('noActiveShift')}</span>
                            </div>
                            <span className="text-[10px] font-medium text-slate-400 dark:text-white/40 uppercase tracking-widest leading-none px-4.5">System Ready for Session</span>
                        </div>
                    </div>
                    <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/10 text-slate-400 dark:text-white/30">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
                                        <option key={reg.id} value={reg.id} className="bg-white text-slate-800">
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
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
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
                            className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-sm"
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
        new Decimal(shift.startCash || 0)
            .plus(shift.totalCashSales || 0)
            .minus(shift.totalExpenses || 0)
            .minus(shift.totalCashRefunds || 0)
    ).toNumber();

    let actualCashNum = 0;
    try {
        actualCashNum = actualCash !== "" ? new Decimal(actualCash).toNumber() : 0;
    } catch {}
    
    const varianceValue = actualCashNum - expectedCashValue;

    const totalCashRefunds = new Decimal(shift.totalCashRefunds || 0).toNumber();
    const totalAccountRefunds = new Decimal(shift.totalAccountRefunds || 0).toNumber();
    const totalAccountSales = new Decimal(shift.totalAccountSales || 0).toNumber();

    return (
        <>
            <header className="w-full h-11 border-b border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-zinc-950/90 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-[60] shadow-sm transition-all">
                {/* RIGHT SECTION: Identity & Status (in RTL, this appears on the right) */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span className="text-[11px] font-black text-slate-700 dark:text-zinc-200 uppercase">{shift.cashierName}</span>
                    </div>
                    <span className="text-[10px] font-bold font-mono bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-white/5">
                        {isMounted && `${hours}س ${mins}د`}
                    </span>
                </div>

                {/* CENTER SECTION: Distinct Shift Metric Cards */}
                <div className="flex items-center gap-2 h-full py-1">
                    {/* Opening Cash Card */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100/90 dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 rounded-lg shadow-sm">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">افتتاحي:</span>
                        <span className="text-xs font-black text-slate-800 dark:text-zinc-100 tabular-nums font-mono">
                            {new Decimal(shift.startCash || 0).toNumber().toFixed(2)}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500">ج.م</span>
                    </div>

                    {/* Cash Sales Card */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 dark:bg-emerald-500/[0.08] border border-emerald-500/20 dark:border-emerald-500/25 rounded-lg shadow-sm">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">كاش:</span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums font-mono">
                            {new Decimal(shift.totalCashSales || 0).toNumber().toFixed(2)}
                        </span>
                        <span className="text-[9px] font-bold text-emerald-600/70 dark:text-emerald-400/70">ج.م</span>
                    </div>

                    {/* Visa/Network Card */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/10 dark:bg-cyan-500/[0.08] border border-cyan-500/20 dark:border-cyan-500/25 rounded-lg shadow-sm">
                        <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400">فيزا/شبكة:</span>
                        <span className="text-xs font-black text-cyan-600 dark:text-cyan-400 tabular-nums font-mono">
                            {new Decimal(shift.totalCardSales || 0).toNumber().toFixed(2)}
                        </span>
                        <span className="text-[9px] font-bold text-cyan-600/70 dark:text-cyan-400/70">ج.م</span>
                    </div>

                    {/* Credit/Ajel Card */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 dark:bg-amber-500/[0.08] border border-amber-500/20 dark:border-amber-500/25 rounded-lg shadow-sm">
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">آجل:</span>
                        <span className="text-xs font-black text-amber-600 dark:text-amber-400 tabular-nums font-mono">
                            {totalAccountSales.toFixed(2)}
                        </span>
                        <span className="text-[9px] font-bold text-amber-600/70 dark:text-amber-400/70">ج.م</span>
                    </div>

                    {/* Returns Card */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 dark:bg-rose-500/[0.08] border border-rose-500/20 dark:border-rose-500/25 rounded-lg shadow-sm">
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">مرتجع:</span>
                        <span className="text-xs font-black text-rose-600 dark:text-rose-400 tabular-nums font-mono">
                            -{(totalCashRefunds + totalAccountRefunds).toFixed(2)}
                        </span>
                        <span className="text-[9px] font-bold text-rose-600/70 dark:text-rose-400/70">ج.م</span>
                    </div>
                </div>

                {/* LEFT SECTION: Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowCashInOutModal(true)}
                        className="h-7.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-200 rounded-lg border border-slate-200/80 dark:border-white/10 text-[11px] font-bold transition-all"
                    >
                        سحب / إيداع
                    </button>
                    <button
                        onClick={() => setShowCloseModal(true)}
                        className="h-7.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg border border-red-500/20 text-[11px] font-bold transition-all flex items-center gap-1.5"
                    >
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                        <span>إغلاق الوردية</span>
                    </button>
                </div>
            </header>

            <GlassModal 
                isOpen={showCloseModal} 
                onClose={() => {
                    setShowCloseModal(false);
                    setActualCash("");
                    setCardTerminalSettlement("");
                    setNotes("");
                    setAcceptDiscrepancy(false);
                    setDiscrepancyMessage("");
                    setDiscrepancyDetails(null);
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

                    {discrepancyDetails && (
                        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 font-bold mb-2">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                <span>{discrepancyMessage}</span>
                            </div>
                            <div className="space-y-2 text-sm text-red-800 dark:text-red-200">
                                {discrepancyDetails.expectedCash !== undefined ? (
                                    <>
                                        {new Decimal(discrepancyDetails.cashVariance).abs().gt(0) && (
                                            <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                                                <span>فارق النقد (Cash): المتوقع ${discrepancyDetails.expectedCash}</span>
                                                <span className="font-bold font-mono dir-ltr">{new Decimal(discrepancyDetails.cashVariance).gt(0) ? '+' : ''}{discrepancyDetails.cashVariance}</span>
                                            </div>
                                        )}
                                        {new Decimal(discrepancyDetails.cardVariance).abs().gt(0) && (
                                            <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                                                <span>فارق البطاقة (Card): المتوقع ${discrepancyDetails.expectedCard}</span>
                                                <span className="font-bold font-mono dir-ltr">{new Decimal(discrepancyDetails.cardVariance).gt(0) ? '+' : ''}{discrepancyDetails.cardVariance}</span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                                        <span>اتجاه الفارق: غير معلوم (مخفي للسرية)</span>
                                    </div>
                                )}
                            </div>
                            <label className="flex items-start gap-3 mt-4 p-3 bg-white/60 dark:bg-black/40 rounded-xl cursor-pointer hover:bg-white dark:hover:bg-black/60 transition-colors border border-red-200 dark:border-red-500/30">
                                <input type="checkbox" className="mt-1 w-5 h-5 accent-red-600 rounded" checked={acceptDiscrepancy} onChange={(e) => setAcceptDiscrepancy(e.target.checked)} />
                                <span className="text-sm font-bold text-red-900 dark:text-red-100">أقر بوجود عجز/زيادة وأوافق على إغلاق الوردية (I acknowledge the discrepancy)</span>
                            </label>
                        </div>
                    )}

                    <CashCounter 
                        onChange={(total, breakdown) => {
                            setActualCash(total.toString());
                            setCashBreakdown(breakdown);
                            if (discrepancyDetails) {
                                setDiscrepancyDetails(null);
                                setAcceptDiscrepancy(false);
                            }
                        }}
                        onEnterAtEnd={() => {
                            const notesEl = document.getElementById('shift-notes-input');
                            if (notesEl) notesEl.focus();
                        }}
                    />

                    <div className="bg-slate-50 dark:bg-black/20 p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner space-y-3">
                        <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-center">
                            ACTUAL CASH COUNTED (رصيد الدرج النهائي)
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-600 font-black text-lg">$</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                readOnly={isBlindClose}
                                value={actualCash}
                                onChange={(e) => {
                                    setActualCash(e.target.value);
                                    if (discrepancyDetails) {
                                        setDiscrepancyDetails(null);
                                        setAcceptDiscrepancy(false);
                                    }
                                }}
                                className={clsx(
                                    "w-full rounded-xl py-4 pl-10 text-3xl font-black text-center text-slate-900 dark:text-white transition-all outline-none border",
                                    isBlindClose ? "bg-slate-100 dark:bg-black/60 border-transparent text-slate-600 cursor-not-allowed" : "bg-white dark:bg-black/40 border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-pink-400/20 dark:focus:ring-cyan-500/20"
                                )}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {isBlindClose && (
                        <div className="bg-slate-50 dark:bg-black/20 p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner space-y-3">
                            <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-center">
                                TOTAL CARD TERMINAL SETTLEMENT (إجمالي تسوية بطاقات الدفع)
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-600 font-black text-lg">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={cardTerminalSettlement}
                                    onChange={(e) => {
                                        setCardTerminalSettlement(e.target.value);
                                        if (discrepancyDetails) {
                                            setDiscrepancyDetails(null);
                                            setAcceptDiscrepancy(false);
                                        }
                                    }}
                                    className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-4 pl-10 text-3xl font-black text-center text-slate-900 dark:text-white transition-all focus:ring-2 focus:ring-pink-400/20 dark:focus:ring-cyan-500/20 outline-none"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    )}

                    {!isBlindClose && (
                        <div className="bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl p-5 space-y-3">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                                <span className="text-slate-400 dark:text-zinc-500">الرصيد المتوقع (Expected):</span>
                                <span className="text-slate-700 dark:text-zinc-300 font-mono">${expectedCashValue.toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-slate-200/50 dark:bg-white/5" />
                            <div className="flex justify-between items-baseline pt-1">
                                <span className={clsx(
                                    "text-xs font-black uppercase tracking-widest",
                                    varianceValue < 0 ? "text-red-500" : varianceValue > 0 ? "text-emerald-500" : "text-slate-400 dark:text-zinc-500"
                                )}>
                                    {varianceValue < 0 ? "عجز (Shortage):" : varianceValue > 0 ? "زيادة (Surplus):" : "متطابق (Matched)"}
                                </span>
                                <div className={clsx(
                                    "text-2xl font-black font-mono",
                                    varianceValue < 0 ? "text-red-500" : varianceValue > 0 ? "text-emerald-500" : "text-white"
                                )}>
                                    {varianceValue > 0 ? "+" : ""}{varianceValue.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest px-1">
                            {t('notes')}
                        </label>
                        <textarea
                            id="shift-notes-input"
                            {...getNavProps(1)}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, 1, 2, handleCloseShift)}
                            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-slate-800 dark:text-white text-sm font-medium resize-none h-24 focus:ring-2 focus:ring-pink-400/20 dark:focus:ring-cyan-500/20 outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-zinc-600"
                            placeholder="Add any shift notes here..."
                        />
                    </div>

                    <button
                        onClick={handleCloseShift}
                        disabled={isLoading || (!!discrepancyDetails && !acceptDiscrepancy)}
                        className="w-full py-5 bg-red-600 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(220,38,38,0.3)] hover:shadow-[0_0_40px_rgba(220,38,38,0.5)] active:scale-[0.98] disabled:opacity-50"
                    >
                        {isLoading ? tVal('required') : (discrepancyDetails && acceptDiscrepancy ? (
                            <div className="flex flex-col items-center justify-center leading-none">
                                <span dir="rtl">تأكيد الإغلاق رغم الفارق</span>
                                <span dir="ltr" className="text-xs opacity-70 mt-1">(Confirm Close with Variance)</span>
                            </div>
                        ) : "إنهاء الوردية (CLOSE SHIFT)")}
                    </button>
                </div>
            </GlassModal>

            <CashInOutModal 
                isOpen={showCashInOutModal}
                onClose={() => setShowCashInOutModal(false)}
                currentShiftId={shift.id}
                // Treasury resolved automatically in backend from shift context
            />
        </>
    );
}
