"use client";

import React, { useState, useEffect } from 'react';
import {
    Database,
    Save,
    Download,
    Wand2,
    Wifi,
    WifiOff,
    RefreshCw,
    Printer,
    AlertCircle
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LocalPersistenceService } from '@/lib/local-persistence';
import { qzTrayService } from "@/lib/qz-tray-service";
import clsx from "clsx";

export const DesktopStatus: React.FC = () => {
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [lastBackup, setLastBackup] = useState<string | null>(null);
    const [isActionInProgress, setIsActionInProgress] = useState(false);
    const [updateReady, setUpdateReady] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

    // Printer Status State
    const [printerStatus, setPrinterStatus] = useState<'connected' | 'offline' | 'checking'>('checking');
    const [isRetryingPrinter, setIsRetryingPrinter] = useState(false);

    const checkPrinterStatus = async () => {
        try {
            const isConnected = await qzTrayService.isIdeallyConnected();
            setPrinterStatus(isConnected ? 'connected' : 'offline');
        } catch (error) {
            setPrinterStatus('offline');
        }
    };

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const stored = localStorage.getItem('casper_last_fs_backup');
        if (stored) setLastBackup(stored);

        // Initial Printer Check
        checkPrinterStatus();
        const printerInterval = setInterval(checkPrinterStatus, 10000);

        // Auto Updater Listeners
        let unsubProgress = () => { };
        let unsubDownloaded = () => { };
        if (window.electronAPI?.updater) {
            unsubProgress = window.electronAPI.updater.onDownloadProgress((progress: any) => {
                setDownloadProgress(Math.round(progress.percent));
            });
            unsubDownloaded = window.electronAPI.updater.onUpdateDownloaded(() => {
                setDownloadProgress(null);
                setUpdateReady(true);
                toast.success('Update ready to install!');
            });
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(printerInterval);
            unsubProgress();
            unsubDownloaded();
        };
    }, []);

    const handleReconnectPrinter = async () => {
        setIsRetryingPrinter(true);
        setPrinterStatus('checking');
        try {
            await qzTrayService.connect();
            await checkPrinterStatus();
            if (await qzTrayService.isIdeallyConnected()) {
                toast.success("تم الاتصال بالطابعة بنجاح");
            } else {
                toast.error("فشل الاتصال بالطابعة");
            }
        } catch (error) {
            setPrinterStatus('offline');
            toast.error("خطأ في الاتصال بالطابعة");
        } finally {
            setIsRetryingPrinter(false);
        }
    };

    const handleManualBackup = async () => {
        setIsActionInProgress(true);
        try {
            await LocalPersistenceService.backupToFilesystem();
            const now = new Date().toLocaleTimeString();
            setLastBackup(now);
            localStorage.setItem('casper_last_fs_backup', now);
            toast.success("Local backup saved to filesystem");
        } catch (error) {
            toast.error("Backup failed");
        } finally {
            setIsActionInProgress(false);
        }
    };

    const handleVacuum = async () => {
        if (!window.electronAPI?.storage?.vacuumDatabase) {
            toast.error("Database maintenance only available in Desktop version");
            return;
        }

        setIsActionInProgress(true);
        try {
            const result = await window.electronAPI.storage.vacuumDatabase();
            if (result.success) {
                toast.success('Database optimized successfully');
            } else {
                toast.error(`Optimization failed: ${result.error}`);
            }
        } catch (error) {
            toast.error('Optimization failed');
        } finally {
            setIsActionInProgress(false);
        }
    };

    const handleExportBundle = async () => {
        if (!window.electronAPI?.storage?.exportSupportBundle) {
            toast.error("Support export only available in Desktop version");
            return;
        }

        setIsActionInProgress(true);
        try {
            const result = await window.electronAPI.storage.exportSupportBundle();
            if (result?.success) {
                toast.success(`Support bundle exported to: ${result.path}`);
            } else if (result) {
                toast.error(`Export failed: ${result.error}`);
            }
        } catch (error) {
            toast.error("Export failed");
        } finally {
            setIsActionInProgress(false);
        }
    };

    return (
        <div className="flex items-center gap-3 bg-muted/20 px-3 py-1.5 rounded-full border border-border shadow-sm">
            {/* Network Status */}
            <div className="flex items-center gap-1.5 px-1 shrink-0">
                {isOnline ? (
                    <>
                        <Wifi className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-500 font-bold text-[10px] uppercase">Online</span>
                    </>
                ) : (
                    <>
                        <WifiOff className="w-3 h-3 text-red-500" />
                        <span className="text-red-500 font-bold text-[10px] uppercase">Offline</span>
                    </>
                )}
            </div>

            <div className="w-px h-3 bg-border" />

            {/* Printer Status - Compact */}
            <div
                className={clsx(
                    "flex items-center gap-1.5 px-1 cursor-pointer transition-colors group shrink-0",
                    printerStatus === 'connected' ? "text-emerald-500" : "text-red-500"
                )}
                onClick={printerStatus === 'offline' ? handleReconnectPrinter : undefined}
                title={printerStatus === 'connected' ? "الطابعة متصلة" : "الطابعة غير متصلة - اضغط لإعادة الاتصال"}
            >
                <Printer className={clsx("w-3 h-3", isRetryingPrinter && "animate-spin")} />
                <span className="font-bold text-[10px] uppercase">
                    {printerStatus === 'connected' ? "Printer" : "Offline"}
                </span>
                {printerStatus === 'offline' && (lastBackup || true) && (
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                )}
            </div>

            <div className="w-px h-3 bg-border" />

            {/* Database Info */}
            <div
                className="flex items-center gap-1.5 cursor-pointer hover:text-blue-400 transition-colors shrink-0"
                title="Configure Backups in Settings"
                onClick={() => window.location.hash = '#/settings'}
            >
                <Database className="w-3 h-3 text-blue-500" />
                <span className="text-muted-foreground font-bold text-[10px] uppercase">
                    {lastBackup ? `Backup OK` : 'No Backup'}
                </span>
            </div>

            <div className="w-px h-3 bg-border" />

            {/* Maintenance Actions */}
            <div className="flex items-center gap-0.5">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 hover:bg-white/10"
                    onClick={handleManualBackup}
                    disabled={isActionInProgress}
                    title="Manual Backup"
                >
                    <Save className="w-3 h-3 text-zinc-400" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 hover:bg-white/10"
                    onClick={handleVacuum}
                    disabled={isActionInProgress}
                    title="Optimize"
                >
                    <Wand2 className="w-3 h-3 text-zinc-400" />
                </Button>
            </div>

            {/* Update Status */}
            {(updateReady || downloadProgress !== null) && (
                <>
                    <div className="w-px h-3 bg-border" />
                    <div className="flex items-center gap-1.5 px-1">
                        {updateReady ? (
                            <button
                                className="h-5 text-[9px] bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-2 rounded-full flex items-center gap-1 transition-all"
                                onClick={() => window.electronAPI?.updater?.installUpdate()}
                            >
                                <RefreshCw className="w-2.5 h-2.5 animate-spin-slow" />
                                UPDATE
                            </button>
                        ) : (
                            <span className="text-muted-foreground text-[9px] font-bold animate-pulse whitespace-nowrap uppercase">
                                DL: {downloadProgress}%
                            </span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
