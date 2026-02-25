"use client";

import React, { useState, useEffect } from 'react';
import {
    Database,
    Save,
    Download,
    Wand2,
    Wifi,
    WifiOff,
    RefreshCw
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LocalPersistenceService } from '@/lib/local-persistence';

export const DesktopStatus: React.FC = () => {
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [lastBackup, setLastBackup] = useState<string | null>(null);
    const [isActionInProgress, setIsActionInProgress] = useState(false);
    const [updateReady, setUpdateReady] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const stored = localStorage.getItem('casper_last_fs_backup');
        if (stored) setLastBackup(stored);

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
            unsubProgress();
            unsubDownloaded();
        };
    }, []);

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
        <div className="flex items-center gap-4 bg-muted/30 px-3 py-1.5 rounded-full border border-border text-xs">
            {/* Network Status */}
            <div className="flex items-center gap-1.5 px-1">
                {isOnline ? (
                    <>
                        <Wifi className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-muted-foreground font-medium">Online</span>
                    </>
                ) : (
                    <>
                        <WifiOff className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-orange-600 font-bold">Offline Mode</span>
                    </>
                )}
            </div>

            <div className="w-px h-3 bg-border" />

            {/* Database Info */}
            <div
                className="flex items-center gap-1.5 cursor-pointer hover:text-blue-400 transition-colors"
                title="Configure Backups in Settings"
                onClick={() => window.location.hash = '#/settings'}
            >
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-muted-foreground font-medium border-b border-dashed border-blue-500/50">
                    {lastBackup ? `Backed up: ${lastBackup}` : 'No local backup'}
                </span>
            </div>

            <div className="w-px h-3 bg-border" />

            {/* Maintenance Actions */}
            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleManualBackup}
                    disabled={isActionInProgress}
                    title="Manual Backup to Filesystem"
                >
                    <Save className="w-3.5 h-3.5" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleVacuum}
                    disabled={isActionInProgress}
                    title="Optimize Database (Vacuum)"
                >
                    <Wand2 className="w-3.5 h-3.5" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleExportBundle}
                    disabled={isActionInProgress}
                    title="Export Support Bundle"
                >
                    <Download className="w-3.5 h-3.5" />
                </Button>
            </div>

            {/* Update Status */}
            {(updateReady || downloadProgress !== null) && (
                <>
                    <div className="w-px h-3 bg-border" />
                    <div className="flex items-center gap-1.5 px-1">
                        {updateReady ? (
                            <Button
                                variant="default"
                                size="sm"
                                className="h-6 text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white leading-none px-2"
                                onClick={() => window.electronAPI?.updater?.installUpdate()}
                            >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Restart to Update
                            </Button>
                        ) : (
                            <span className="text-muted-foreground animate-pulse whitespace-nowrap">
                                Downloading Update: {downloadProgress}%
                            </span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
