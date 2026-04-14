"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { casperClock } from "@/lib/CasperClock";

export function TimeSyncWarning() {
    const [isDrifting, setIsDrifting] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Initial check
        const checkDrift = () => {
            if (casperClock.isClockDrifting()) {
                setIsDrifting(true);
            } else {
                setIsDrifting(false);
            }
        };

        checkDrift();

        // Check periodically in case a sync updates the offset
        const interval = setInterval(checkDrift, 60000); // Check every minute
        
        // Also listen for re-syncs when online
        const handleOnline = () => {
            // Trigger a minor delay to allow CasperClock to sync first if it has its own listeners,
            // or just rely on the interval. Better to just check on interval for robustness.
            setTimeout(checkDrift, 5000);
        };
        window.addEventListener('online', handleOnline);

        return () => {
            clearInterval(interval);
            window.removeEventListener('online', handleOnline);
        };
    }, []);

    if (!isDrifting || dismissed) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-100 dark:bg-orange-950/80 border-b border-orange-200 dark:border-orange-800 backdrop-blur-md shadow-sm">
            <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-orange-200 dark:bg-orange-800/50 p-1.5 rounded-full shrink-0">
                        <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                        <p className="text-orange-900 dark:text-orange-100 font-bold text-sm">
                            تنبيه: توقيت هذا الجهاز غير دقيق.
                        </p>
                        <p className="text-orange-700 dark:text-orange-300 text-xs mt-0.5 font-medium">
                            يرجى ضبط ساعة الويندوز لضمان دقة الفواتير والورديات.
                        </p>
                    </div>
                </div>
                <button 
                    onClick={() => setDismissed(true)}
                    className="p-1.5 hover:bg-orange-200 dark:hover:bg-orange-800 rounded-full transition-colors"
                >
                    <X className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </button>
            </div>
        </div>
    );
}
