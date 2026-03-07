"use client";

import { useState } from "react";
import { openShift, closeShift } from "@/actions/shift-management-actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface ShiftManagerProps {
    currentShift?: any;
    registers?: Array<{ id: string; name: string }>;
}

export default function ShiftManager({ currentShift, registers = [] }: ShiftManagerProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);

    // Form states
    const [startCash, setStartCash] = useState("");
    const [actualCash, setActualCash] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedRegister, setSelectedRegister] = useState(registers[0]?.id || null);

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
                registerName: registers.find(r => r.id === selectedRegister)?.name
            });

            if (result.success) {
                toast.success(result.message || "Shift opened successfully!");
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

        if (!currentShift?.id) {
            toast.error("No active shift to close");
            return;
        }

        setIsLoading(true);
        try {
            const result = await closeShift({
                shiftId: currentShift.id,
                actualCash: parseFloat(actualCash),
                notes: notes || undefined
            });

            if (result.success) {
                toast.success(result.message || "Shift closed successfully!");
                setShowCloseModal(false);
                setActualCash("");
                setNotes("");
                router.refresh();
            } else {
                toast.error(result.error || result.message || "Failed to close shift");
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to close shift");
        } finally {
            setIsLoading(false);
        }
    };

    // Compact floating button design
    return (
        <>
            {/* Compact Shift Button - Only shows if no shift */}
            {!currentShift && (
                <button
                    onClick={() => setShowOpenModal(true)}
                    className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 z-50 transition-all hover:scale-105"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Open Shift
                </button>
            )}

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
                                <h3 className="text-xl font-bold text-white">Open New Shift</h3>
                                <p className="text-sm text-gray-400">Start your daily operations</p>
                            </div>
                        </div>

                        {registers.length > 1 && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2 text-gray-300">
                                    Select Register
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

                        <div className="mb-6">
                            <label className="block text-sm font-medium mb-2 text-gray-300">
                                Starting Cash Amount
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
                                {isLoading ? "Opening..." : "Open Shift"}
                            </button>
                            <button
                                onClick={() => {
                                    setShowOpenModal(false);
                                    setStartCash("");
                                }}
                                disabled={isLoading}
                                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-semibold transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Shift Modal */}
            {showCloseModal && currentShift && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-700">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="flex-1 flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold text-white">Close Shift</h3>
                                    <p className="text-sm text-gray-400">End of day reconciliation</p>
                                </div>
                                <div className="text-right bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-600">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Expected Cash</p>
                                    <p className="text-lg font-bold text-green-400">
                                        ${(
                                            Number(currentShift.startCash) +
                                            Number(currentShift.totalCashSales || 0) -
                                            Number(currentShift.totalExpenses || 0)
                                        ).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mb-4 p-4 bg-blue-500 bg-opacity-20 rounded-lg border border-blue-500 border-opacity-30">
                            <div className="flex justify-between items-center text-blue-300 mb-2">
                                <span className="text-sm font-medium">Expected Cash</span>
                                <span className="text-2xl font-bold">
                                    ${(
                                        Number(currentShift.startCash) +
                                        Number(currentShift.totalCashSales || 0) -
                                        Number(currentShift.totalExpenses || 0)
                                    ).toFixed(2)}
                                </span>
                            </div>
                            <div className="text-xs text-gray-400">
                                Start: ${Number(currentShift.startCash).toFixed(2)} +
                                Sales: ${Number(currentShift.totalCashSales || 0).toFixed(2)} -
                                Expenses: ${Number(currentShift.totalExpenses || 0).toFixed(2)}
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2 text-gray-300">
                                Actual Cash Counted
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
                                Notes (Optional)
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
                                {isLoading ? "Closing..." : "Close Shift"}
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
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Close Shift Button - Shows when shift is active */}
            {currentShift && (
                <button
                    onClick={() => setShowCloseModal(true)}
                    className="fixed bottom-6 right-6 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 z-50 transition-all hover:scale-105"
                    title="Close Shift"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Close Shift
                </button>
            )}
        </>
    );
}
