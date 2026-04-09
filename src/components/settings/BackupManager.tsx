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

export default function BackupManager() {
    const [backupPath, setBackupPath] = useState<string>('');
    const [backupInterval, setBackupInterval] = useState<string>('15');
    const [maxBackups, setMaxBackups] = useState<string>('30');
    const [backups, setBackups] = useState<any[]>([]);
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
                const config = await window.electronAPI.config.getConfig();
                if (config.backupPath) setBackupPath(config.backupPath);
                if (config.backupInterval) setBackupInterval(config.backupInterval.toString());
                if (config.maxBackups) setMaxBackups(config.maxBackups.toString());
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
        const folder = await window.electronAPI.config.selectBackupFolder();
        if (folder) setBackupPath(folder);
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
        } catch (error: any) {
            toast.error(t('messages.manualBackupError', { error: error.message }), { id: tid });
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
            }
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
            {/* Automated Persistence Configuration */}
            <div className="glass-card bg-card/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-border/40 shadow-2xl relative overflow-hidden group/auto">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/auto:bg-cyan-500/10 transition-colors" />
                
                <div className="space-y-8 relative z-10">
                    <div className="space-y-2">
                        <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                            <Database className="w-6 h-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                            {t('autonomousPersistence')}
                        </h3>
                        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-9 opacity-60">{t('autonomousPersistenceDesc')}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{t('sequenceFrequency')}</label>
                            <select
                                value={backupInterval}
                                onChange={(e) => setBackupInterval(e.target.value)}
                                className="w-full bg-background/40 border border-border/40 rounded-2xl p-4 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                            >
                                <option value="15" className="bg-card font-black">{t('intervalTitles.15')}</option>
                                <option value="60" className="bg-card font-black">{t('intervalTitles.60')}</option>
                                <option value="360" className="bg-card font-black">{t('intervalTitles.360')}</option>
                                <option value="1440" className="bg-card font-black">{t('intervalTitles.1440')}</option>
                            </select>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{t('retentionDepth')}</label>
                            <select
                                value={maxBackups}
                                onChange={(e) => setMaxBackups(e.target.value)}
                                className="w-full bg-background/40 border border-border/40 rounded-2xl p-4 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                            >
                                <option value="10" className="bg-card font-black">{t('nodeTitles.10')}</option>
                                <option value="30" className="bg-card font-black">{t('nodeTitles.30')}</option>
                                <option value="50" className="bg-card font-black">{t('nodeTitles.50')}</option>
                                <option value="100" className="bg-card font-black">{t('nodeTitles.100')}</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-3 pt-4">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{t('targetEndpoint')}</label>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1 relative group/input">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-40">
                                    <HardDrive size={14} />
                                </div>
                                <input
                                    readOnly
                                    value={backupPath || t('emulatedStorage')}
                                    className="w-full bg-background/40 border border-border/40 rounded-2xl py-4 pl-12 pr-6 text-[10px] font-black font-mono text-cyan-400 group-hover/input:border-cyan-500/30 transition-all"
                                />
                            </div>
                            <Button 
                                variant="outline" 
                                onClick={handleSelectFolder} 
                                disabled={isLoading || isSaving}
                                className="h-14 rounded-2xl px-8 border-border/40 hover:bg-card hover:border-cyan-500/40 font-black text-[10px] uppercase tracking-widest transition-all"
                            >
                                <FolderOpen className="w-4 h-4 mr-2" />
                                {t('browseTargets')}
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-10 border-t border-border/20">
                         <Button
                            variant="ghost"
                            onClick={handleManualBackup}
                            disabled={isSaving || !backupPath}
                            className={cn(
                                "h-14 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all gap-3",
                                isSaving ? "animate-pulse" : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                            )}
                        >
                            <Zap className="w-4 h-4" />
                            {t('forceSnapshot')}
                        </Button>
                        <Button
                            onClick={handleSaveConfig}
                            disabled={isSaving || !backupPath}
                            className="h-14 px-12 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {t('commitPolicy')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Disaster Recovery Interface */}
            <div className="glass-card bg-card/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-border/40 shadow-2xl relative overflow-hidden group/recovery">
                <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/recovery:bg-orange-500/10 transition-colors" />
                
                <div className="space-y-8 relative z-10">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                                <History className="w-6 h-6 text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
                                {t('recoveryTitle')}
                            </h3>
                            <div className="px-3 py-1 bg-orange-500/10 border border-orange-500/30 rounded-full text-[8px] font-black uppercase text-orange-400 tracking-widest animate-pulse">
                                {t('stateCritical')}
                            </div>
                        </div>
                        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-9 opacity-60">{t('recoveryDesc')}</p>
                    </div>

                    <div className="rounded-[2rem] border border-border/40 bg-background/20 overflow-hidden shadow-inner">
                        <div className="grid grid-cols-12 gap-4 bg-muted/40 p-5 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border/20">
                            <div className="col-span-6 ml-2">{t('temporalMarker')}</div>
                            <div className="col-span-3 text-center">{t('payloadSize')}</div>
                            <div className="col-span-3 text-right mr-4">{t('protocols')}</div>
                        </div>

                        <div className="max-h-[500px] overflow-y-auto custom-scrollbar divide-y divide-border/10">
                            {!backupPath && (
                                <div className="p-20 text-center text-muted-foreground/30 flex flex-col items-center justify-center grayscale scale-75">
                                    <Database className="w-16 h-16 mb-4 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">{t('undefinedEndpoint')}</p>
                                </div>
                            )}
                            {backupPath && backups.length === 0 && (
                                <div className="p-20 text-center text-muted-foreground/30 flex flex-col items-center justify-center grayscale scale-75">
                                    <RotateCcw className="w-16 h-16 mb-4 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">{t('noNodes')}</p>
                                </div>
                            )}
                            {backups.map((backup) => (
                                <div key={backup.filename} className="grid grid-cols-12 gap-4 p-5 items-center hover:bg-orange-500/5 even:bg-white/[0.02] group/item transition-all duration-300">
                                    <div className="col-span-6 flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-400 border border-orange-500/20 group-hover/item:scale-110 transition-transform shadow-lg shadow-orange-500/5">
                                            <Clock className="w-5 h-5" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-black text-foreground uppercase tracking-tight text-sm">
                                                {format(new Date(backup.createdAt), "MMM d, yyyy")}
                                            </span>
                                            <span className="text-[10px] font-black font-mono text-muted-foreground uppercase opacity-40">
                                                {format(new Date(backup.createdAt), "HH:mm:ss 'UTC'")}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="col-span-3 text-center">
                                        <span className="text-xs font-black font-mono text-muted-foreground group-hover/item:text-orange-400 transition-colors">
                                            {(backup.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                                        </span>
                                    </div>
                                    <div className="col-span-3 flex items-center justify-end gap-3 pr-2">
                                        <button
                                            onClick={() => handleDelete(backup.path)}
                                            className="w-10 h-10 rounded-xl bg-card/40 border border-border/40 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all flex items-center justify-center shadow-lg"
                                            title={t('purgeNode')}
                                        >
                                            <Trash className="w-4 h-4" />
                                        </button>
                                        <Button
                                            onClick={() => handleRestore(backup.path)}
                                            disabled={isRestoring || isSaving}
                                            className="h-10 px-8 rounded-xl bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-900/50 hover:border-orange-500 font-black text-[10px] uppercase tracking-widest shadow-lg transition-all"
                                        >
                                            {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                            {t('restoreNode')}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Critical Danger Infrastructure */}
            <div className="glass-card bg-rose-500/5 backdrop-blur-xl rounded-[2.5rem] border border-rose-500/30 overflow-hidden shadow-2xl group/danger">
                <div className="bg-rose-500/10 p-8 border-b border-rose-500/30">
                    <div className="flex items-center justify-between">
                         <div className="space-y-2">
                            <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3 text-rose-500">
                                <ShieldAlert className="w-6 h-6 animate-pulse" />
                                {t('resetTitle')}
                            </h3>
                            <p className="text-[10px] uppercase font-black tracking-widest text-rose-400 opacity-60 ml-9">{t('resetDesc')}</p>
                         </div>
                         <AlertTriangle className="w-10 h-10 text-rose-500/20" />
                    </div>
                </div>
                <div className="p-8 space-y-8">
                    <div className="p-6 rounded-3xl bg-background/40 border border-rose-500/20 text-[10px] font-medium text-rose-100/60 leading-relaxed uppercase tracking-widest space-y-2">
                        <p>• {t('resetAlert1')}</p>
                        <p>• {t('resetAlert2')}</p>
                        <p>• {t('resetAlert3')}</p>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest ml-1">{t('resetAuth')}</label>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Input
                                value={resetConfirmText}
                                onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                                placeholder={t('resetPlaceholder')}
                                className="h-14 bg-background/40 border-rose-500/20 focus:border-rose-500/60 text-rose-500 font-black tracking-[0.3em] rounded-2xl placeholder:opacity-20 flex-1"
                            />
                            <Button
                                variant="destructive"
                                onClick={handleDatabaseReset}
                                disabled={isResetting || resetConfirmText !== 'RESET'}
                                className="h-14 px-12 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-rose-900/50 hover:scale-[1.05] active:scale-95 transition-all gap-3"
                            >
                                {isResetting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                                {t('initializeReset')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
