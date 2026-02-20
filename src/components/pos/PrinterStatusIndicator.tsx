'use client';

import { useState, useEffect } from "react";
import { Printer, RefreshCw, AlertCircle, CheckCircle, ZapOff } from "lucide-react";
import { qzTrayService } from "@/lib/qz-tray-service";
import { useTranslations } from "@/lib/i18n-mock";
import clsx from "clsx";

export default function PrinterStatusIndicator() {
    const t = useTranslations('Common');
    const [status, setStatus] = useState<'connected' | 'offline' | 'checking'>('checking');
    const [version, setVersion] = useState<string | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);

    const checkStatus = async () => {
        try {
            const isConnected = await qzTrayService.isIdeallyConnected();
            if (isConnected) {
                setStatus('connected');
                // Optionally get version if not cached
                if (!version) {
                    const v = await qzTrayService.getVersion().catch(() => null);
                    if (v) setVersion(v);
                }
            } else {
                setStatus('offline');
            }
        } catch (error) {
            setStatus('offline');
        }
    };

    useEffect(() => {
        checkStatus();
        // Poll every 10 seconds for robustness
        const interval = setInterval(checkStatus, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleReconnect = async () => {
        setIsRetrying(true);
        setStatus('checking');
        try {
            await qzTrayService.connect();
            await checkStatus();
        } catch (error) {
            setStatus('offline');
        } finally {
            setIsRetrying(false);
        }
    };

    return (
        <div className={clsx(
            "flex items-center gap-3 px-4 py-2 rounded-xl border transition-all duration-300",
            status === 'connected' ? "bg-green-500/10 border-green-500/30" :
                status === 'offline' ? "bg-red-500/10 border-red-500/30" :
                    "bg-zinc-500/10 border-zinc-500/30"
        )}>
            <div className="relative">
                <Printer className={clsx(
                    "w-5 h-5",
                    status === 'connected' ? "text-green-400" :
                        status === 'offline' ? "text-red-400" :
                            "text-zinc-400"
                )} />
                {status === 'connected' ? (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-zinc-950 animate-pulse" />
                ) : status === 'offline' ? (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-zinc-950" />
                ) : null}
            </div>

            <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                        {status === 'connected' ? (t('printerOnline') || "Printer Online") :
                            status === 'offline' ? (t('printerOffline') || "Printer Offline") :
                                (t('checking') || "Checking...")}
                    </span>
                    {status === 'connected' && version && (
                        <span className="text-[10px] text-green-400/70 font-mono">v{version}</span>
                    )}
                </div>
                <span className="text-[10px] text-zinc-400 leading-none">
                    {status === 'connected' ? "Direct Silent Printing Enabled" :
                        status === 'offline' ? "Fallback Iframe Printing Active" : "Initializing connection..."}
                </span>
            </div>

            {status === 'offline' && (
                <button
                    onClick={handleReconnect}
                    disabled={isRetrying}
                    className="ml-auto p-1.5 hover:bg-white/10 rounded-lg transition-colors group"
                    title="Try to reconnect"
                >
                    <RefreshCw className={clsx(
                        "w-4 h-4 text-zinc-400 group-hover:text-white transition-all",
                        isRetrying && "animate-spin"
                    )} />
                </button>
            )}

            {status === 'connected' && (
                <div className="ml-auto">
                    <CheckCircle className="w-4 h-4 text-green-500/50" />
                </div>
            )}
        </div>
    );
}
