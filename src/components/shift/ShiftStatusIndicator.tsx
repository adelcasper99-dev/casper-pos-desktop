"use client";

import { useState, useCallback, useEffect } from "react";
import { openShift, closeShift } from "@/actions/shift-management-actions";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { printZReport } from "@/lib/print-zreport";
import { toast } from "sonner";

interface ShiftStatusIndicatorProps {
    shift?: any;
    registers?: Array<{ id: string; name: string }>;
    csrfToken?: string;
}

export default function ShiftStatusIndicator({ shift, registers = [], csrfToken }: ShiftStatusIndicatorProps) {
    const t = useTranslations('Shift');
    const tVal = useTranslations('Validation');
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);

    // Form states
    const [startCash, setStartCash] = useState("");
    const [actualCash, setActualCash] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedRegister, setSelectedRegister] = useState(registers[0]?.id || null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

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
                <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 text-white px-6 py-3 rounded-lg flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3">
                        {/* Open Shift Button on far left */}
                        <button
                            onClick={() => setShowOpenModal(true)}
                            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all hover:scale-105 font-semibold"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            {t('openShift')}
                        </button>
                        <div className="h-6 w-px bg-yellow-300/50"></div>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        <div>
                            <span className="font-semibold">{t('noActiveShift')}</span>
                        </div>
                    </div>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                {/* Open Shift Modal */}
                {showOpenModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-700">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">{t('openModalTitle')}</h3>
                                    <p className="text-sm text-gray-400">{t('openModalSubtitle')}</p>
                                </div>
                            </div>

                            {registers.length > 1 && (
                                <div className="mb-4">
                                    <label className="block text-sm font-medium mb-2 text-gray-300">
                                        {t('selectRegister')}
                                    </label>
                                    <select
                                        value={selectedRegister || ""}
                                        onChange={(e) => setSelectedRegister(e.target.value)}
                                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        {registers.map(reg => (
                                            <option key={reg.id} value={reg.id}>
                                                {reg.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2 text-gray-300">
                                    المبلغ العهدة (Start Cash)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400 text-lg">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={startCash}
                                        onChange={(e) => setStartCash(e.target.value)}
                                        className="w-full p-3 pl-10 bg-gray-700 border border-gray-600 rounded-lg text-white text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="0.00"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleOpenShift}
                                    disabled={isLoading}
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {isLoading ? tVal('required') : t('confirmOpen')}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowOpenModal(false);
                                        setStartCash("");
                                    }}
                                    disabled={isLoading}
                                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-semibold transition-all"
                                >
                                    {t('cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
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
        <div className="flex flex-col md:flex-row gap-3 items-stretch">
            {/* Close Shift Button - Far Left & Large */}
            <div className="shrink-0 flex flex-col gap-1.5">
                <button
                    onClick={() => setShowCloseModal(true)}
                    className="flex-1 bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black text-sm px-4 py-2 rounded-xl shadow-lg border border-red-500/50 transition-all flex flex-col items-center justify-center gap-1 min-w-[100px]"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>إغلاق الوردية</span>
                </button>
                <div className="bg-slate-800/50 rounded-lg px-2 py-1 flex items-center justify-center gap-2 border border-slate-700">
                    <span className="text-[10px] font-bold text-slate-300">{shift.cashierName}</span>
                    <span className="w-px h-2 bg-slate-600" />
                    <span className="text-[10px] font-bold text-cyan-400">{isMounted && `${hours}س ${mins}د`}</span>
                </div>
            </div>

            {/* Main Shift Summary Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">

                {/* BOX 1: Cash & Card (Ordinary Flow) */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-500 text-white p-3 rounded-xl shadow-lg border border-emerald-400 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-1 opacity-10">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z" /></svg>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-white/20 p-1 rounded-lg text-sm">💵</span>
                        <h4 className="font-bold text-xs tracking-wide">المبيعات والدرج</h4>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                        <div className="text-center">
                            <div className="text-[9px] text-emerald-100 mb-0.5">كاش</div>
                            <div className="font-bold text-sm">${Number(shift.totalCashSales || 0).toFixed(2)}</div>
                        </div>
                        <div className="text-center border-x border-white/20">
                            <div className="text-[9px] text-emerald-100 mb-0.5">فيزا</div>
                            <div className="font-bold text-sm">${Number(shift.totalCardSales || 0).toFixed(2)}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[9px] text-emerald-100 mb-0.5">الصافي</div>
                            <div className="font-bold text-sm text-yellow-300">
                                ${(Number(shift.totalCashSales || 0) + Number(shift.totalCardSales || 0) + Number(shift.totalWalletSales || 0) + Number(shift.totalInstapay || 0) - totalCashRefunds).toFixed(2)}
                            </div>
                        </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-white/20 flex justify-between items-center bg-black/10 -mx-3 px-3 py-1.5">
                        <div className="text-[10px] text-emerald-100 font-medium">العهدة المتوقعة بالدرج</div>
                        <div className="text-lg font-black text-white drop-shadow-sm">${expectedCashValue.toFixed(2)}</div>
                    </div>
                </div>

                {/* BOX 2: Credit & Returns (Audit/Credit Zone) */}
                <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-3 rounded-xl shadow-lg border border-slate-600 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-1 opacity-10 font-bold text-3xl">!</div>

                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-white/10 p-1 rounded-lg text-sm">📝</span>
                        <h4 className="font-bold text-xs tracking-wide">الآجل والمرتجع</h4>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                        <div className="text-center">
                            <div className="text-[9px] text-slate-400 mb-0.5">بيع آجل</div>
                            <div className="font-bold text-sm text-blue-300">${totalAccountSales.toFixed(2)}</div>
                        </div>
                        <div className="text-center border-l border-white/10">
                            <div className="text-[9px] text-slate-400 mb-0.5">مرتجع كاش</div>
                            <div className="font-bold text-sm text-orange-400">-${totalCashRefunds.toFixed(2)}</div>
                        </div>
                        <div className="text-center border-l border-white/10">
                            <div className="text-[9px] text-slate-400 mb-0.5">مرتجع آجل</div>
                            <div className="font-bold text-sm text-purple-400">-${totalAccountRefunds.toFixed(2)}</div>
                        </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center bg-black/20 -mx-3 px-3 py-1.5">
                        <div className="text-[9px] text-slate-500 font-medium">إجمالي المرتجعات</div>
                        <div className="text-sm font-bold text-white italic">${(totalCashRefunds + totalAccountRefunds).toFixed(2)}</div>
                    </div>
                </div>

            </div>

            {/* Close Shift Modal */}
            {showCloseModal && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-700">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">{t('closeModalTitle') || "إغلاق الوردية"}</h3>
                                <p className="text-sm text-gray-400">{t('closeModalSubtitle') || "مراجعة العهدة وإغلاق اليومية"}</p>
                            </div>
                        </div>

                        {/* Live Reconciliation Display */}
                        <div className="mb-6 bg-gray-800/80 p-4 rounded-xl border border-gray-700 shadow-inner">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">الرصيد المتوقع بالدرج (Expected):</span>
                                <span className="text-white font-medium">${expectedCashValue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">الرصيد الفعلي المدخل (Actual):</span>
                                <span className="text-white font-medium">${actualCash === "" ? "0.00" : actualCashNum.toFixed(2)}</span>
                            </div>
                            <div className="w-full h-px bg-gray-600/50 my-3"></div>
                            <div className="flex justify-between font-bold text-lg">
                                <span className={varianceValue < 0 ? "text-red-400" : varianceValue > 0 ? "text-green-400" : "text-gray-300"}>
                                    {varianceValue < 0 ? "عجز بالدرج (Shortage):" : varianceValue > 0 ? "زيادة بالدرج (Surplus):" : "متطابق (Matched):"}
                                </span>
                                <span className={varianceValue < 0 ? "text-red-400" : varianceValue > 0 ? "text-green-400" : "text-white"}>
                                    {varianceValue > 0 ? "+" : ""}{varianceValue.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2 text-gray-300">
                                المبلغ الفعلي (Actual Amount in Drawer)
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-gray-400 text-lg">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={actualCash}
                                    onChange={(e) => setActualCash(e.target.value)}
                                    className="w-full p-3 pl-10 bg-gray-700 border border-gray-600 rounded-lg text-white text-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium mb-2 text-gray-300">
                                {t('notes')}
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                                rows={3}
                                placeholder="Any notes about discrepancies..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleCloseShift}
                                disabled={isLoading}
                                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105"
                            >
                                {isLoading ? tVal('required') : "إنهاء الوردية (Close Shift)"}
                            </button>
                            <button
                                onClick={() => {
                                    setShowCloseModal(false);
                                    setActualCash("");
                                    setNotes("");
                                }}
                                disabled={isLoading}
                                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-semibold transition-all"
                            >
                                {t('cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
