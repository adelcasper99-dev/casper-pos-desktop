"use client";

import { useState, useCallback, useEffect } from "react";
import { openShift, closeShift } from "@/actions/shift-management-actions";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import MoneyCounter from "./MoneyCounter";

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
        if (!startCash || parseFloat(startCash) < 0) {
            alert("Please enter valid starting cash amount");
            return;
        }

        setIsLoading(true);
        try {
            const result = await openShift({
                startCash: parseFloat(startCash),
                registerId: selectedRegister || undefined,
                registerName: registers.find(r => r.id === selectedRegister)?.name,
                csrfToken
            });

            if (result.success) {
                setShowOpenModal(false);
                setStartCash("");
                router.refresh();
            } else {
                alert(result.error || result.message || "Failed to open shift");
            }
        } catch (error: any) {
            alert(error.message || "Failed to open shift");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCloseShift = async () => {
        if (!actualCash || parseFloat(actualCash) < 0) {
            alert("Please enter valid actual cash amount");
            return;
        }

        if (!shift?.id) {
            alert("No active shift to close");
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
                router.refresh();
            } else {
                // Display the actual error message
                alert(result.message || result.error || "Failed to close shift");
            }
        } catch (error: any) {
            console.error('[ERROR] Close shift failed:', error);
            alert(error.message || "Failed to close shift");
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
                                    {t('startCash')}
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

                            {/* Money Counter for Open Shift */}
                            <div className="mb-4">
                                <MoneyCounter />
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

    return (
        <>
            <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-3 rounded-lg flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-4">
                    {/* Close Shift Button on far left */}
                    <button
                        onClick={() => setShowCloseModal(true)}
                        className="bg-white/20 hover:bg-red-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all hover:scale-105 font-semibold"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t('closeShift')}
                    </button>
                    <div className="h-6 w-px bg-green-300/50"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        <span className="font-semibold">{t('activeShift')}</span>
                    </div>
                    <div className="h-5 w-px bg-green-300"></div>
                    <span className="text-green-100 text-sm">
                        {shift.cashierName} {isMounted && `• ${hours}h ${mins}m`}
                    </span>
                    {shift.registerName && (
                        <>
                            <div className="h-5 w-px bg-green-300"></div>
                            <span className="text-green-100 text-sm">{shift.registerName}</span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-xs text-green-100">{t('expectedCash')}</div>
                        <div className="font-bold text-lg text-white">
                            ${(
                                Number(shift.startCash) +
                                Number(shift.totalCashSales || 0) -
                                Number(shift.totalExpenses || 0)
                            ).toFixed(2)}
                        </div>
                    </div>
                    <div className="h-8 w-px bg-green-400/50"></div>
                    <div className="text-right opacity-80">
                        <div className="text-xs text-green-100">{t('startCash')}</div>
                        <div className="font-bold">${Number(shift.startCash).toFixed(2)}</div>
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
                                <h3 className="text-xl font-bold text-white">{t('closeModalTitle')}</h3>
                                <p className="text-sm text-gray-400">{t('closeModalSubtitle')}</p>
                            </div>
                        </div>

                        <div className="mb-4 p-4 bg-blue-500 bg-opacity-20 rounded-lg border border-blue-500 border-opacity-30">
                            <div className="flex justify-between items-center text-blue-300 mb-2">
                                <span className="text-sm font-medium">{t('expectedCash')}</span>
                                <span className="text-2xl font-bold">
                                    ${(
                                        Number(shift.startCash) +
                                        Number(shift.totalCashSales || 0) -
                                        Number(shift.totalExpenses || 0)
                                    ).toFixed(2)}
                                </span>
                            </div>
                            <div className="text-xs text-gray-400">
                                Start: ${Number(shift.startCash).toFixed(2)} +
                                Sales: ${Number(shift.totalCashSales || 0).toFixed(2)} -
                                Expenses: ${Number(shift.totalExpenses || 0).toFixed(2)}
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2 text-gray-300">
                                {t('actualCash')}
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

                        {/* Money Counter for Close Shift */}
                        <div className="mb-4">
                            <MoneyCounter />
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
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                {isLoading ? tVal('required') : t('confirmClose')}
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
        </>
    );
}
