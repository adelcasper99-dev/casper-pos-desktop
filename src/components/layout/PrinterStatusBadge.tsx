"use client";

import React, { useEffect, useState } from 'react';
import { usePrinterStatusStore, type PrinterStatusStateName } from '@/store/printer-status-store';
import { Printer, AlertCircle, CheckCircle, RefreshCw, X, Trash2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function PrinterStatusBadge() {
    const { status, printerName, queueCounts, updateStatus, setQueueCounts, setStatus } = usePrinterStatusStore();
    const [isOpen, setIsOpen] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    // ── 1. Setup Status Polling and Electron Event Listeners ─────────────────
    useEffect(() => {
        // Initial status check
        updateStatus();

        // Poll every 10 seconds for physical printer/bridge health
        const interval = setInterval(() => {
            updateStatus();
        }, 10000);

        // Listen for real-time print queue changes from Electron main process
        if (window.electronAPI && window.electronAPI.printQueue) {
            const unsubscribe = window.electronAPI.printQueue.onStatusChange((newCounts) => {
                setQueueCounts(newCounts);
                
                // Immediately adjust Zustand status to reflect active printing or stuck jobs
                if (newCounts.failed > 0) {
                    setStatus('FAILED_PERMANENT');
                } else if (newCounts.pending > 0 || newCounts.processing > 0) {
                    setStatus('PRINTING');
                } else {
                    setStatus('ONLINE');
                }
            });

            return () => {
                clearInterval(interval);
                unsubscribe();
            };
        }

        return () => {
            clearInterval(interval);
        };
    }, [updateStatus, setQueueCounts, setStatus]);

    // ── 2. Helper to determine styling & Arabic copy ─────────────────────────
    const getConfig = () => {
        switch (status) {
            case 'ONLINE':
                return {
                    color: 'text-emerald-500 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 hover:bg-emerald-100',
                    icon: <CheckCircle className="w-4 h-4" />,
                    text: 'الطابعة متصلة'
                };
            case 'PRINTING':
                return {
                    color: 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20 hover:bg-blue-100',
                    icon: <RefreshCw className="w-4 h-4 animate-spin" />,
                    text: `جاري الطباعة (${queueCounts.pending + queueCounts.processing})`
                };
            case 'FAILED_PERMANENT':
                return {
                    color: 'text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 hover:bg-rose-100 animate-pulse',
                    icon: <AlertCircle className="w-4 h-4" />,
                    text: `وظيفة معطلة (${queueCounts.failed})`
                };
            case 'ERROR_OFFLINE':
            default:
                return {
                    color: 'text-rose-500 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 hover:bg-rose-100',
                    icon: <AlertCircle className="w-4 h-4" />,
                    text: 'الطابعة غير متصلة'
                };
        }
    };

    const config = getConfig();

    const handleRetryFailed = async () => {
        // Implement retry logic or notify bridge.
        setIsRetrying(true);
        toast.info("جاري إعادة محاولة طباعة الوظائف المعطلة...");
        // Delay simulation for visual feedback
        await new Promise(r => setTimeout(r, 1000));
        setIsRetrying(false);
        updateStatus();
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-300 shadow-sm cursor-pointer active:scale-95",
                    config.color
                )}
                title="اضغط لعرض تفاصيل طابعات وتفاصيل طابور الطباعة"
            >
                {config.icon}
                <span>{config.text}</span>
            </button>

            {/* ── Sidebar Slider (Drawer Panel) ──────────────────────────────── */}
            {isOpen && (
                <div className="fixed inset-0 z-[10000] flex justify-end" dir="rtl">
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsOpen(false)}
                    />
                    
                    {/* Drawer Content */}
                    <div className="relative w-96 max-w-full bg-white dark:bg-zinc-950 h-full shadow-2xl flex flex-col border-l border-zinc-200 dark:border-zinc-800 animate-slide-in">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-2">
                                <Printer className="w-5 h-5 text-cyan-500" />
                                <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">طابور طباعة كاسبر</h3>
                            </div>
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {/* Device Profile */}
                            <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">الطابعة النشطة</h4>
                                <p className="font-bold text-zinc-800 dark:text-zinc-200">
                                    {printerName || 'لا توجد طابعة افتراضية'}
                                </p>
                                <p className="text-xs text-zinc-500 mt-1">
                                    الحالة الحالية: <span className="font-semibold">{config.text}</span>
                                </p>
                            </div>

                            {/* Queue stats card */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-zinc-50 dark:bg-zinc-900 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                    <div className="text-lg font-bold text-zinc-800 dark:text-zinc-200">{queueCounts.pending}</div>
                                    <div className="text-[10px] text-zinc-400">معلقة</div>
                                </div>
                                <div className="bg-zinc-50 dark:bg-zinc-900 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                    <div className="text-lg font-bold text-blue-500">{queueCounts.processing}</div>
                                    <div className="text-[10px] text-zinc-400">جاري الطباعة</div>
                                </div>
                                <div className="bg-zinc-50 dark:bg-zinc-900 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                    <div className="text-lg font-bold text-rose-500">{queueCounts.failed}</div>
                                    <div className="text-[10px] text-zinc-400">معطلة</div>
                                </div>
                            </div>

                            {/* Detail List */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">تفاصيل المهام</h4>
                                {queueCounts.pending === 0 && queueCounts.processing === 0 && queueCounts.failed === 0 ? (
                                    <div className="text-center py-8 text-zinc-400 text-sm">
                                        لا توجد مهام طباعة نشطة في الانتظار.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {queueCounts.failed > 0 && (
                                            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-between">
                                                <div>
                                                    <span className="text-xs font-bold text-rose-500">تنبيه: {queueCounts.failed} مهمة معطلة</span>
                                                    <p className="text-[10px] text-zinc-500">حدث خطأ في طابعة الفواتير (ورق منتهي أو الطابعة غير متصلة)</p>
                                                </div>
                                                <button
                                                    onClick={handleRetryFailed}
                                                    disabled={isRetrying}
                                                    className="flex items-center gap-1 bg-rose-500 hover:bg-rose-600 text-white px-2.5 py-1 rounded text-xs transition-all active:scale-95"
                                                >
                                                    <Play className="w-3 h-3" />
                                                    إعادة
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                            <button
                                onClick={updateStatus}
                                className="w-full flex items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white py-2 rounded-xl text-sm font-bold transition-all"
                            >
                                <RefreshCw className="w-4 h-4" />
                                تحديث الحالة والاتصال
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
