"use client";

import { useState, useEffect } from "react";
import { Database, FolderOpen, Save, RefreshCw, AlertTriangle, Clock, Trash, RotateCcw, CloudBackup, HardDrive, ShieldAlert, Zap, History, Download, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { LocalPersistenceService } from "@/lib/local-persistence";
import { resetDatabase } from "@/actions/database-reset";
import { cn } from "@/lib/utils";
import { extractIpcData } from "@/lib/ipc-utils";

interface BackupFileItem {
    filename: string;
    path: string;
    sizeBytes: number;
    createdAt: string | number | Date;
    [key: string]: unknown;
}

export default function BackupManager() {
    const [backupPath, setBackupPath] = useState<string>('');
    const [backupInterval, setBackupInterval] = useState<string>('15');
    const [maxBackups, setMaxBackups] = useState<string>('30');
    const [backups, setBackups] = useState<BackupFileItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [resetConfirmText, setResetConfirmText] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    const { useTranslations } = require('@/lib/i18n-mock');
    const t = useTranslations('BackupManager');

    useEffect(() => {
        loadConfig();
        fetchBackups();
    }, []);

    const loadConfig = async () => {
        setIsLoading(true);
        try {
            if (window.electronAPI?.config?.getConfig) {
                const res = await window.electronAPI.config.getConfig();
                const config = extractIpcData(res, 'app:get-config');
                if (config) {
                    if (config.backupPath) setBackupPath(config.backupPath);
                    if (config.backupInterval) setBackupInterval(config.backupInterval.toString());
                    if (config.maxBackups) setMaxBackups(config.maxBackups.toString());
                }
            }
        } catch (error) {
            console.error("Failed to load config", error);
            toast.error(t('messages.loadConfigError'));
        } finally {
            setIsLoading(false);
        }
    };

    const fetchBackups = async () => {
        try {
            if (window.electronAPI?.storage?.getAvailableBackups) {
                const result = await window.electronAPI.storage.getAvailableBackups();
                if (result.success) setBackups(result.backups || []);
                else toast.error(t('messages.loadBackupsError'));
            }
        } catch (error) {
            console.error("Failed to fetch backups", error);
            toast.error(t('messages.loadBackupsError'));
        }
    };

    const handleSelectFolder = async () => {
        if (!window.electronAPI?.config?.selectBackupFolder) {
            toast.error(t('messages.selectFolderError'));
            return;
        }
        try {
            const res = await window.electronAPI.config.selectBackupFolder();
            const folder = extractIpcData(res, 'dialog:showBackupFolderDialog');
            if (folder) setBackupPath(folder);
        } catch {
            toast.error(t('messages.selectFolderError'));
        }
    };

    const handleSaveConfig = async () => {
        if (!window.electronAPI?.config?.saveBackupConfig) return;
        setIsSaving(true);
        try {
            const result = await window.electronAPI.config.saveBackupConfig({
                backupPath,
                backupInterval: parseInt(backupInterval),
                maxBackups: parseInt(maxBackups)
            });
            if (result.success) {
                toast.success(t('messages.saveSuccess'));
                fetchBackups();
                LocalPersistenceService.startAutoBackup();
            } else {
                toast.error(t('messages.saveError', { error: result.error }));
            }
        } catch (error) {
            toast.error(t('messages.saveError', { error: 'Unknown' }));
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualBackup = async () => {
        setIsSaving(true);
        const tid = toast.loading(t('messages.manualBackupStart'));
        try {
            await LocalPersistenceService.backupToFilesystem(true);
            toast.success(t('messages.manualBackupSuccess'), { id: tid });
            fetchBackups();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            toast.error(t('messages.manualBackupError', { error: msg }), { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (backupFilePath: string) => {
        if (!window.electronAPI?.storage?.deleteBackup) return;
        if (!confirm(t('deleteConfirm'))) return;
        setIsSaving(true);
        try {
            const result = await window.electronAPI.storage.deleteBackup(backupFilePath);
            if (result.success) {
                toast.success(t('messages.deleteSuccess'));
                fetchBackups();
            } else {
                toast.error(t('messages.deleteError', { error: result.error }));
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            toast.error(t('messages.deleteError', { error: msg }));
        } finally {
            setIsSaving(false);
        }
    };

    const handleRestore = async (backupFilePath: string) => {
        if (!window.electronAPI?.storage?.restoreFromBackup) return;
        if (!confirm(t('restoreConfirm'))) return;
        setIsRestoring(true);
        try {
            const result = await window.electronAPI.storage.restoreFromBackup(backupFilePath);
            if (!result.success) {
                toast.error(t('messages.restoreError', { error: result.error }));
                setIsRestoring(false);
            }
        } catch (error) {
            toast.error(t('messages.restoreError', { error: 'Unknown' }));
            setIsRestoring(false);
        }
    };

    const handleExternalRestore = async () => {
        if (!window.electronAPI?.storage?.showOpenDbFileDialog) return;
        
        try {
            // 1. Show file picker
            const res = await window.electronAPI.storage.showOpenDbFileDialog();
            const filePath = extractIpcData(res, 'dialog:showOpenDbFileDialog');
            if (!filePath) return; // Canceled

            // 2. Confirm
            if (!confirm(t('restoreExternalConfirm', 'Warning: This will replace your current database with the selected file and restart the application. All current unsaved data will be lost. Continue?'))) return;

            setIsRestoring(true);
            const tid = toast.loading(t('messages.restoring', 'Restoring database...'));

            // 3. Perform restore
            const result = await window.electronAPI.storage.restoreFromExternalFile(filePath);
            if (!result.success) {
                toast.error(t('messages.restoreError', { error: result.error }), { id: tid });
                setIsRestoring(false);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            toast.error(t('messages.restoreError', { error: msg }));
            setIsRestoring(false);
        }
    };

    const handleDatabaseReset = async () => {
        if (resetConfirmText !== 'RESET') {
            toast.error(t('messages.resetConfirmError'));
            return;
        }
        if (!confirm(t('messages.resetConfirmPrompt'))) return;
        setIsResetting(true);
        const tid = toast.loading(t('messages.resetting'));
        try {
            const result = await resetDatabase();
            if (result.success) {
                toast.success(t('messages.resetSuccess'), { id: tid });
                setTimeout(() => window.location.reload(), 2000);
            } else toast.error(t('messages.saveError', { error: result.error || 'Unknown' }), { id: tid });
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto pb-20">
    return (
        <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300 pb-14">
            {/* Automated Persistence Configuration */}
            <div className="glass-card bg-card/40 backdrop-blur-xl p-3.5 rounded-xl border border-border/40 shadow-sm relative overflow-hidden group/auto space-y-3">
                <div className="flex items-center gap-2.5 relative z-10">
                    <div className="w-7 h-7 bg-cyan-500/10 rounded-lg border border-cyan-500/20 flex items-center justify-center">
                        <Database className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-tight text-foreground leading-none">
                            {t('autonomousPersistence')}
                        </h3>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground opacity-70 mt-0.5">{t('autonomousPersistenceDesc')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">{t('sequenceFrequency')}</label>
                        <select
                            value={backupInterval}
                            onChange={(e) => setBackupInterval(e.target.value)}
                            className="w-full bg-background/50 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
                        >
                            <option value="5" className="bg-card font-black">{t('intervalTitles.5')}</option>
                            <option value="15" className="bg-card font-black">{t('intervalTitles.15')}</option>
                            <option value="60" className="bg-card font-black">{t('intervalTitles.60')}</option>
                            <option value="360" className="bg-card font-black">{t('intervalTitles.360')}</option>
                            <option value="1440" className="bg-card font-black">{t('intervalTitles.1440')}</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">{t('retentionDepth')}</label>
                        <select
                            value={maxBackups}
                            onChange={(e) => setMaxBackups(e.target.value)}
                            className="w-full bg-background/50 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
                        >
                            <option value="10" className="bg-card font-black">{t('nodeTitles.10')}</option>
                            <option value="30" className="bg-card font-black">{t('nodeTitles.30')}</option>
                            <option value="50" className="bg-card font-black">{t('nodeTitles.50')}</option>
                            <option value="100" className="bg-card font-black">{t('nodeTitles.100')}</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-1 relative z-10">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">{t('targetEndpoint')}</label>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <input
                                readOnly
                                value={backupPath || t('emulatedStorage')}
                                className="w-full bg-background/50 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold font-mono text-cyan-400"
                            />
                        </div>
                        <Button 
                            variant="outline" 
                            onClick={handleSelectFolder} 
                            disabled={isLoading || isSaving}
                            className="h-8 rounded-xl px-3 border-border/40 font-bold text-xs gap-1.5 shrink-0"
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                            {t('browseTargets')}
                        </Button>
                    </div>
                </div>

                <div className="flex justify-end items-center gap-2 pt-2 border-t border-border/20 relative z-10">
                     <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleManualBackup}
                        disabled={isSaving || !backupPath}
                        className={cn(
                            "h-8 px-3 rounded-xl font-bold text-xs gap-1.5",
                            isSaving ? "animate-pulse" : "text-muted-foreground hover:text-primary"
                        )}
                    >
                        <Zap className="w-3.5 h-3.5" />
                        {t('forceSnapshot')}
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSaveConfig}
                        disabled={isSaving || !backupPath}
                        className="h-8 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-primary/20 gap-1.5"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {t('commitPolicy')}
                    </Button>
                </div>
            </div>

            {/* Disaster Recovery Interface */}
            <div className="glass-card bg-card/40 backdrop-blur-xl p-3.5 rounded-xl border border-border/40 shadow-sm relative overflow-hidden group/recovery space-y-2.5">
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-orange-500/10 rounded-lg border border-orange-500/20 flex items-center justify-center">
                            <History className="w-3.5 h-3.5 text-orange-400" />
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-tight text-foreground leading-none">
                                {t('recoveryTitle')}
                            </h3>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground opacity-70 mt-0.5">{t('recoveryDesc')}</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExternalRestore}
                        disabled={isRestoring || isSaving}
                        className="h-7 rounded-lg px-2.5 border-orange-500/30 hover:bg-orange-500/10 hover:border-orange-500 font-bold text-[10px] uppercase tracking-wider"
                    >
                        <FolderOpen className="w-3 h-3 mr-1 text-orange-400" />
                        {t('restoreFromExternal', 'Restore from External File')}
                    </Button>
                </div>

                <div className="rounded-xl border border-border/40 bg-background/20 overflow-hidden shadow-inner relative z-10">
                    <div className="grid grid-cols-12 gap-2 bg-muted/40 py-1.5 px-3 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border/20">
                        <div className="col-span-6">{t('temporalMarker')}</div>
                        <div className="col-span-3 text-center">{t('payloadSize')}</div>
                        <div className="col-span-3 text-right">{t('protocols')}</div>
                    </div>

                    <div className="max-h-[180px] overflow-y-auto custom-scrollbar divide-y divide-border/10">
                        {!backupPath && (
                            <div className="py-8 text-center text-muted-foreground/40 flex flex-col items-center justify-center">
                                <Database className="w-8 h-8 mb-1.5 opacity-30" />
                                <p className="text-[10px] font-bold uppercase tracking-wider">{t('undefinedEndpoint')}</p>
                            </div>
                        )}
                        {backupPath && backups.length === 0 && (
                            <div className="py-8 text-center text-muted-foreground/40 flex flex-col items-center justify-center">
                                <RotateCcw className="w-8 h-8 mb-1.5 opacity-30" />
                                <p className="text-[10px] font-bold uppercase tracking-wider">{t('noNodes')}</p>
                            </div>
                        )}
                        {backups.map((backup) => (
                            <div key={backup.filename} className="grid grid-cols-12 gap-2 py-1.5 px-3 items-center hover:bg-orange-500/5 transition-all text-xs">
                                <div className="col-span-6 flex items-center gap-2 min-w-0">
                                    <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                    <div className="flex items-center gap-2 truncate">
                                        <span className="font-bold text-foreground text-xs truncate">
                                            {format(new Date(backup.createdAt), "MMM d, yyyy")}
                                        </span>
                                        <span className="text-[9px] font-mono text-muted-foreground opacity-70">
                                            {format(new Date(backup.createdAt), "HH:mm")}
                                        </span>
                                    </div>
                                </div>
                                <div className="col-span-3 text-center">
                                    <span className="text-[11px] font-bold font-mono text-muted-foreground">
                                        {(backup.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                                    </span>
                                </div>
                                <div className="col-span-3 flex items-center justify-end gap-1.5">
                                    <button
                                        onClick={() => handleDelete(backup.path)}
                                        className="w-6 h-6 rounded-md bg-card/60 border border-border/40 text-rose-400 hover:bg-rose-500/10 flex items-center justify-center"
                                        title={t('purgeNode')}
                                    >
                                        <Trash className="w-3 h-3" />
                                    </button>
                                    <Button
                                        size="sm"
                                        onClick={() => handleRestore(backup.path)}
                                        disabled={isRestoring || isSaving}
                                        className="h-6 px-2.5 rounded-md bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 text-[10px] font-bold"
                                    >
                                        {isRestoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                        {t('restoreNode')}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Critical Danger Infrastructure */}
            <div className="glass-card bg-rose-500/5 backdrop-blur-xl rounded-xl border border-rose-500/30 overflow-hidden shadow-sm p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-tight text-rose-500 leading-none">
                                {t('resetTitle')}
                            </h3>
                            <p className="text-[9px] uppercase font-bold text-rose-400/80 mt-0.5">{t('resetDesc')}</p>
                        </div>
                     </div>
                     <AlertTriangle className="w-4 h-4 text-rose-500/40" />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 items-center">
                    <Input
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                        placeholder={t('resetPlaceholder')}
                        className="h-8 bg-background/50 border-rose-500/30 focus:border-rose-500 text-rose-500 font-bold text-xs rounded-xl placeholder:opacity-40 flex-1"
                    />
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDatabaseReset}
                        disabled={isResetting || resetConfirmText !== 'RESET'}
                        className="h-8 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider shadow-sm gap-1.5 shrink-0"
                    >
                        {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        {t('initializeReset')}
                    </Button>
                </div>
            </div>
        </div>
        </div >
    );
}
