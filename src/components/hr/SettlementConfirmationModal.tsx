"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle, Loader2, X } from "lucide-react"

interface SettlementConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (treasuryId: string) => void;
    technicianName: string;
    totalAmount: number;
    isLoading: boolean;
    error: string | null;
    treasuries: { id: string, name: string, balance: number }[];
}

export default function SettlementConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    technicianName,
    totalAmount,
    isLoading,
    error,
    treasuries
}: SettlementConfirmationModalProps) {
    const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>(treasuries.length > 0 ? treasuries[0].id : "");

    if (!isOpen) return null;

    const selectedTreasury = treasuries.find(t => t.id === selectedTreasuryId);
    const hasInsufficientFunds = selectedTreasury ? selectedTreasury.balance < totalAmount : true;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-cairo" dir="rtl">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800/50">
                    <h2 className="text-xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                        تأكيد صرف الرواتب
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-bold rounded-2xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    <div className="text-center space-y-2">
                        <p className="text-zinc-500 dark:text-zinc-400 font-bold">هل أنت متأكد من صرف مستحقات الفني؟</p>
                        <p className="text-2xl font-black text-zinc-900 dark:text-white">
                            {technicianName}
                        </p>
                    </div>

                    <div className="p-5 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 flex flex-col items-center justify-center">
                        <span className="text-sm text-zinc-500 dark:text-zinc-400 font-bold mb-1">إجمالي المبلغ للصرف</span>
                        <span className="text-3xl font-black text-primary font-mono tabular-nums">
                            {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-sm ml-1 font-cairo text-zinc-500">ج.م</span>
                        </span>
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">الخزنة (يُسحب منها المبلغ)</label>
                        <select
                            value={selectedTreasuryId}
                            onChange={(e) => setSelectedTreasuryId(e.target.value)}
                            disabled={isLoading}
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                        >
                            <option value="" disabled>-- اختر الخزنة --</option>
                            {treasuries.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.name} (رصيد: {t.balance.toLocaleString()} ج.م)
                                </option>
                            ))}
                        </select>
                        {hasInsufficientFunds && selectedTreasuryId && (
                            <p className="text-xs font-bold text-red-500 flex items-center gap-1.5 mt-2">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                رصيد الخزنة لا يغطي المبلغ المطلوب.
                            </p>
                        )}
                    </div>

                    <p className="text-xs text-center text-amber-600 dark:text-amber-500 font-bold bg-amber-50 dark:bg-amber-500/10 p-3 rounded-xl border border-amber-200 dark:border-amber-500/20">
                        تحذير: هذه العملية ستُنشئ فاتورة مصروفات وتغلق التذاكر المحسوبة للفني، ولا يمكن التراجع عنها.
                    </p>
                </div>

                <div className="p-6 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-6 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                    >
                        إلغاء
                    </button>
                    <button
                        onClick={() => onConfirm(selectedTreasuryId)}
                        disabled={isLoading || !selectedTreasuryId || hasInsufficientFunds}
                        className="flex items-center gap-2 px-6 py-2.5 text-sm font-black text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-95"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                جاري الصرف...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                تأكيد الصرف
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
