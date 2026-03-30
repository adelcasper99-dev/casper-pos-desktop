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
        } finally {
            setIsLoading(false);
        }
    };

    const fetchBackups = async () => {
        try {
            if (window.electronAPI?.storage?.getAvailableBackups) {
                const result = await window.electronAPI.storage.getAvailableBackups();
                if (result.success) setBackups(result.backups || []);
                else toast.error(`Failed to load backups: ${result.error}`);
            }
        } catch (error) {
            console.error("Failed to fetch backups", error);
        }
    };

    const handleSelectFolder = async () => {
        if (!window.electronAPI?.config?.selectBackupFolder) {
            toast.error("This feature is only available in the Desktop App.");
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
                toast.success("Backup settings saved and applied.");
                fetchBackups();
                LocalPersistenceService.startAutoBackup();
            } else {
                toast.error(`Error saving: ${result.error}`);
            }
        } catch (error) {
            toast.error("An unexpected error occurred.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualBackup = async () => {
        setIsSaving(true);
        const tid = toast.loading("Creating manual backup...");
        try {
            await LocalPersistenceService.backupToFilesystem(true);
            toast.success("Backup created successfully.", { id: tid });
            fetchBackups();
        } catch (error: any) {
            toast.error(error.message || "Manual backup failed.", { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (backupFilePath: string) => {
        if (!window.electronAPI?.storage?.deleteBackup) return;
        if (!confirm("Confirm removal of this historical node?")) return;
        setIsSaving(true);
        try {
            const result = await window.electronAPI.storage.deleteBackup(backupFilePath);
            if (result.success) {
                toast.success("Backup deleted successfully.");
                fetchBackups();
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleRestore = async (backupFilePath: string) => {
        if (!window.electronAPI?.storage?.restoreFromBackup) return;
        if (!confirm("CRITICAL WARNING: Restoring will overwrite all current data. App will restart. Proceed?")) return;
        setIsRestoring(true);
        try {
            const result = await window.electronAPI.storage.restoreFromBackup(backupFilePath);
            if (!result.success) {
                toast.error(`Restore failed: ${result.error}`);
                setIsRestoring(false);
            }
        } catch (error) {
            toast.error("Restore failed unexpectedly.");
            setIsRestoring(false);
        }
    };

    const handleDatabaseReset = async () => {
        if (resetConfirmText !== 'RESET') {
            toast.error("Type 'RESET' to confirm factory purge.");
            return;
        }
        if (!confirm(t('resetConfirm1') || "Purge all operational data?")) return;
        setIsResetting(true);
        const tid = toast.loading(t('resetting') || "Resetting database...");
        try {
            const result = await resetDatabase();
            if (result.success) {
                toast.success(result.message || t('resetSuccess'), { id: tid });
                setTimeout(() => window.location.reload(), 2000);
            } else toast.error(result.error || t('resetError'), { id: tid });
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
                            Autonomous Persistence
                        </h3>
                        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-9 opacity-60">Architectural data safety and automated local snapshots</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Sequence Frequency</label>
                            <select
                                value={backupInterval}
                                onChange={(e) => setBackupInterval(e.target.value)}
                                className="w-full bg-background/40 border border-border/40 rounded-2xl p-4 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                            >
                                <option value="15" className="bg-card font-black">15 Minute Intervals</option>
                                <option value="60" className="bg-card font-black">60 Minute Intervals</option>
                                <option value="360" className="bg-card font-black">6 Hour Intervals</option>
                                <option value="1440" className="bg-card font-black">24 Hour Intervals</option>
                            </select>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Retention Depth</label>
                            <select
                                value={maxBackups}
                                onChange={(e) => setMaxBackups(e.target.value)}
                                className="w-full bg-background/40 border border-border/40 rounded-2xl p-4 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                            >
                                <option value="10" className="bg-card font-black">10 Historical Nodes</option>
                                <option value="30" className="bg-card font-black">30 Historical Nodes</option>
                                <option value="50" className="bg-card font-black">50 Historical Nodes</option>
                                <option value="100" className="bg-card font-black">100 Historical Nodes</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-3 pt-4">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Target Endpoint Destination</label>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1 relative group/input">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-40">
                                    <HardDrive size={14} />
                                </div>
                                <input
                                    readOnly
                                    value={backupPath || 'INTERNAL_STORAGE_EMULATED'}
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
                                Browse Targets
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
                            Trigger Force Snapshot
                        </Button>
                        <Button
                            onClick={handleSaveConfig}
                            disabled={isSaving || !backupPath}
                            className="h-14 px-12 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Commit Integrity Policy
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
                                Timeline Reconstruction
                            </h3>
                            <div className="px-3 py-1 bg-orange-500/10 border border-orange-500/30 rounded-full text-[8px] font-black uppercase text-orange-400 tracking-widest animate-pulse">
                                State Critical
                            </div>
                        </div>
                        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-9 opacity-60">Rollback environment to prior verified state nodes</p>
                    </div>

                    <div className="rounded-[2rem] border border-border/40 bg-background/20 overflow-hidden shadow-inner">
                        <div className="grid grid-cols-12 gap-4 bg-muted/40 p-5 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border/20">
                            <div className="col-span-6 ml-2">Temporal Marker</div>
                            <div className="col-span-3 text-center">Payload Size</div>
                            <div className="col-span-3 text-right mr-4">Protocols</div>
                        </div>

                        <div className="max-h-[500px] overflow-y-auto custom-scrollbar divide-y divide-border/10">
                            {!backupPath && (
                                <div className="p-20 text-center text-muted-foreground/30 flex flex-col items-center justify-center grayscale scale-75">
                                    <Database className="w-16 h-16 mb-4 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Target Endpoint Undefined</p>
                                </div>
                            )}
                            {backupPath && backups.length === 0 && (
                                <div className="p-20 text-center text-muted-foreground/30 flex flex-col items-center justify-center grayscale scale-75">
                                    <RotateCcw className="w-16 h-16 mb-4 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No Historical Nodes Cached</p>
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
                                                {format(new Date(backup.createdAt), "HH:mm:ss [UTC]")}
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
                                            title="Purge Node"
                                        >
                                            <Trash className="w-4 h-4" />
                                        </button>
                                        <Button
                                            onClick={() => handleRestore(backup.path)}
                                            disabled={isRestoring || isSaving}
                                            className="h-10 px-8 rounded-xl bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-900/50 hover:border-orange-500 font-black text-[10px] uppercase tracking-widest shadow-lg transition-all"
                                        >
                                            {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                            Restore Node
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
                                Factory Purge Protocols
                            </h3>
                            <p className="text-[10px] uppercase font-black tracking-widest text-rose-400 opacity-60 ml-9">Absolute operational data wipe – Irreversible destruction</p>
                         </div>
                         <AlertTriangle className="w-10 h-10 text-rose-500/20" />
                    </div>
                </div>
                <div className="p-8 space-y-8">
                    <div className="p-6 rounded-3xl bg-background/40 border border-rose-500/20 text-[10px] font-medium text-rose-100/60 leading-relaxed uppercase tracking-widest space-y-2">
                        <p>• All transaction logs, purchasing history, and expense audits will be destroyed.</p>
                        <p>• Inventory quantities and treasury balances reset to null.</p>
                        <p>• Master data (Products/Clients) and core system settings will be preserved.</p>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest ml-1">Authenticate Identity (Enter 'RESET')</label>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Input
                                value={resetConfirmText}
                                onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                                placeholder="TYPE_PURGE_COMMAND"
                                className="h-14 bg-background/40 border-rose-500/20 focus:border-rose-500/60 text-rose-500 font-black tracking-[0.3em] rounded-2xl placeholder:opacity-20 flex-1"
                            />
                            <Button
                                variant="destructive"
                                onClick={handleDatabaseReset}
                                disabled={isResetting || resetConfirmText !== 'RESET'}
                                className="h-14 px-12 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-rose-900/50 hover:scale-[1.05] active:scale-95 transition-all gap-3"
                            >
                                {isResetting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                                Initialize Reset
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
