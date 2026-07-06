"use client";

import { useEffect, useState } from "react";
import { getCurrentShift } from "@/actions/shift-management-actions";
import { toast } from "sonner";
import GlassModal from "@/components/ui/GlassModal";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function AutoUpdateListener() {
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [checkingShift, setCheckingShift] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.electronAPI?.updater) return;

        const updater = window.electronAPI.updater;

        // Listen for downloaded updates
        const unsubDownloaded = updater.onUpdateDownloaded((info) => {
            console.log("[AutoUpdateListener] Update downloaded:", info);
            setUpdateInfo(info);
            checkShiftAndPrompt(info);
        });

        // Periodic check in case an update was already downloaded and is pending
        const interval = setInterval(() => {
            if (updateInfo) {
                checkShiftAndPrompt(updateInfo);
            }
        }, 30000);

        return () => {
            unsubDownloaded();
            clearInterval(interval);
        };
    }, [updateInfo]);

    const checkShiftAndPrompt = async (info: any) => {
        if (checkingShift) return;
        setCheckingShift(true);

        try {
            const result = await getCurrentShift();
            const hasActiveShift = result?.success && !!result.shift;

            if (hasActiveShift) {
                console.log("[AutoUpdateListener] Active shift detected. Blocking update prompt.");
                localStorage.setItem("pending_app_update", "true");
            } else {
                console.log("[AutoUpdateListener] No active shift. Showing update prompt.");
                setShowPrompt(true);
            }
        } catch (error) {
            console.error("[AutoUpdateListener] Failed to check shift status:", error);
        } finally {
            setCheckingShift(false);
        }
    };

    const handleInstallNow = async () => {
        if (!window.electronAPI?.updater) return;
        toast.info("جاري إغلاق التطبيق وتثبيت التحديث...");
        setTimeout(() => {
            window.electronAPI?.updater?.installUpdate();
        }, 1000);
    };

    if (!showPrompt) return null;

    return (
        <GlassModal
            isOpen={showPrompt}
            onClose={() => setShowPrompt(false)}
            title="تحديث جديد متوفر"
            className="max-w-md"
        >
            <div className="flex flex-col items-center space-y-4 py-4 text-center" dir="rtl">
                <div className="p-3 bg-cyan-500/10 rounded-full text-cyan-500 animate-bounce">
                    <Download className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">مستعد للتحديث؟</h3>
                <p className="text-sm text-zinc-500 max-w-xs">
                    تم تنزيل نسخة جديدة من التطبيق بنجاح وهي جاهزة للتثبيت الآن.
                </p>
                
                <div className="flex gap-3 w-full mt-4">
                    <Button
                        onClick={handleInstallNow}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold"
                    >
                        تحديث وإعادة تشغيل
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowPrompt(false)}
                        className="flex-1 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                    >
                        تثبيت لاحقاً
                    </Button>
                </div>
            </div>
        </GlassModal>
    );
}
