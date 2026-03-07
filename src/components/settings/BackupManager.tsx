"use client";

import { useState, useEffect } from "react";
import { Database, FolderOpen, Save, RefreshCw, AlertTriangle, Clock, Trash, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { LocalPersistenceService } from "@/lib/local-persistence";
import { resetDatabase } from "@/actions/database-reset";

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
                if (config.backupPath) {
                    setBackupPath(config.backupPath);
                }
                if (config.backupInterval) {
                    setBackupInterval(config.backupInterval.toString());
                }
                if (config.maxBackups) {
                    setMaxBackups(config.maxBackups.toString());
                }
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
                if (result.success) {
                    setBackups(result.backups || []);
                } else {
                    toast.error(`Failed to load backups: ${result.error}`);
                }
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
        if (folder) {
            setBackupPath(folder);
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
                toast.success("Backup settings saved and applied.");
                fetchBackups();
                // Restart the timer immediately with new interval
                LocalPersistenceService.startAutoBackup();
            } else {
                toast.error(`Error saving limit: ${result.error}`);
            }
        } catch (error) {
            toast.error("An unexpected error occurred.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualBackup = async () => {
        setIsSaving(true);
        const toastId = toast.loading("Creating manual backup...");
        try {
            await LocalPersistenceService.backupToFilesystem(true);
            toast.success("Backup created successfully.", { id: toastId });
            fetchBackups();
        } catch (error: any) {
            toast.error(error.message || "Manual backup failed.", { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (backupFilePath: string) => {
        if (!window.electronAPI?.storage?.deleteBackup) return;
        if (!confirm("Are you sure you want to delete this backup file? This cannot be undone.")) {
            return;
        }

        setIsSaving(true);
        try {
            const result = await window.electronAPI.storage.deleteBackup(backupFilePath);
            if (result.success) {
                toast.success("Backup deleted successfully.");
                fetchBackups();
            } else {
                toast.error(`Failed to delete backup: ${result.error}`);
            }
        } catch (error) {
            toast.error("An unexpected error occurred while deleting.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleRestore = async (backupFilePath: string) => {
        if (!window.electronAPI?.storage?.restoreFromBackup) return;
        if (!confirm("CRITICAL WARNING: Restoring this backup will overwrite ALL current data created AFTER this backup Date/Time. The application will restart immediately. Are you absolutely sure?")) {
            return;
        }

        setIsRestoring(true);
        try {
            const result = await window.electronAPI.storage.restoreFromBackup(backupFilePath);
            if (!result.success) {
                toast.error(`Restore failed: ${result.error}`);
                setIsRestoring(false);
            }
            // If success, the app restarts
        } catch (error) {
            toast.error("Restore failed unexpectedly.");
            setIsRestoring(false);
        }
    };

    const handleDatabaseReset = async () => {
        if (resetConfirmText !== 'RESET') {
            toast.error("Please type 'RESET' to confirm.");
            return;
        }

        if (!confirm(t('resetConfirm1') || "هل أنت متأكد من مسح جميع البيانات؟")) {
            return;
        }

        setIsResetting(true);
        const toastId = toast.loading(t('resetting') || "Resetting database...");
        try {
            const result = await resetDatabase();
            if (result.success) {
                toast.success(result.message || t('resetSuccess'), { id: toastId });
                setResetConfirmText('');
                // Optional: redirect or reload
                setTimeout(() => window.location.reload(), 2000);
            } else {
                toast.error(result.error || t('resetError'), { id: toastId });
            }
        } catch (error: any) {
            toast.error(error.message || t('resetError'), { id: toastId });
        } finally {
            setIsResetting(false);
        }
    };

    const formatSize = (bytes: number) => {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">

            {/* CONFIGURATION CARD */}
            <Card className="glass-card bg-transparent border-white/10 text-white">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-blue-400" />
                        Local Fast Backups
                    </CardTitle>
                    <CardDescription className="text-zinc-400">
                        Configure automated data safety. Casper POS can automatically backup your data at regular intervals.
                        Select an external USB drive or a synced folder (like Dropbox) below.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Frequency */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">
                                Backup Frequency
                            </label>
                            <select
                                value={backupInterval}
                                onChange={(e) => setBackupInterval(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-cyan-500/50"
                            >
                                <option value="15" className="bg-zinc-900">Every 15 Minutes</option>
                                <option value="60" className="bg-zinc-900">Every 1 Hour</option>
                                <option value="360" className="bg-zinc-900">Every 6 Hours</option>
                                <option value="1440" className="bg-zinc-900">Daily</option>
                            </select>
                        </div>

                        {/* Max Backups */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">
                                Keep Local Backups
                            </label>
                            <select
                                value={maxBackups}
                                onChange={(e) => setMaxBackups(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-cyan-500/50"
                            >
                                <option value="10" className="bg-zinc-900">10 Most Recent</option>
                                <option value="30" className="bg-zinc-900">30 Most Recent</option>
                                <option value="50" className="bg-zinc-900">50 Most Recent</option>
                                <option value="100" className="bg-zinc-900">100 Most Recent</option>
                            </select>
                        </div>

                    </div>

                    {/* Destination */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">
                            Backup Destination
                        </label>
                        <div className="flex gap-2">
                            <Input
                                readOnly
                                value={backupPath || 'Internal Storage'}
                                className="bg-black/20 border-white/10 font-mono text-sm text-zinc-300 flex-1 truncate"
                            />
                            <Button variant="secondary" onClick={handleSelectFolder} disabled={isLoading || isSaving}>
                                <FolderOpen className="w-4 h-4 mr-2" />
                                Browse
                            </Button>
                        </div>
                    </div>

                    <p className="text-xs text-zinc-500">
                        A folder named "Casper Backups" will be created at the destination. Old backups are automatically pruned based on your retention limit to save disk space.
                    </p>

                    <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                        <Button
                            variant="outline"
                            onClick={handleManualBackup}
                            disabled={isSaving || !backupPath}
                            className="border-cyan-600/50 text-cyan-400 hover:bg-cyan-600/10 hover:text-cyan-300"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? '...' : 'Create Backup Now'}
                        </Button>
                        <Button
                            onClick={handleSaveConfig}
                            disabled={isSaving || !backupPath}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? 'Saving...' : 'Apply Configuration'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* RESTORE CARD */}
            <Card className="glass-card bg-transparent border-white/10 text-white">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-400">
                        <AlertTriangle className="w-5 h-5" />
                        Disaster Recovery
                    </CardTitle>
                    <CardDescription className="text-orange-200/70">
                        Restoring a backup will instantly replace your current active database with the historical version.
                        <strong> All changes made after the backup's timestamp will be permanently lost.</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-white/10 bg-black/20 overflow-hidden">
                        <div className="grid grid-cols-12 gap-4 border-b border-white/10 bg-black/40 p-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            <div className="col-span-6">Backup Timestamp</div>
                            <div className="col-span-3 text-center">Size</div>
                            <div className="col-span-3 text-right">Action</div>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto">
                            {!backupPath && (
                                <div className="p-8 text-center text-zinc-500 flex flex-col items-center justify-center">
                                    <Database className="w-8 h-8 opacity-20 mb-2" />
                                    <p>No custom backup destination configured.</p>
                                </div>
                            )}
                            {backupPath && backups.length === 0 && (
                                <div className="p-8 text-center text-zinc-500">
                                    No backups found in the configured destination.
                                </div>
                            )}
                            {backups.map((backup, index) => (
                                <div key={backup.filename} className="grid grid-cols-12 gap-4 p-3 border-b border-white/5 items-center hover:bg-white/5 transition-colors">
                                    <div className="col-span-6 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                                            <Clock className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-zinc-200">
                                                {format(new Date(backup.createdAt), "MMM d, yyyy")}
                                            </span>
                                            <span className="text-xs text-zinc-500">
                                                {format(new Date(backup.createdAt), "hh:mm:ss a")}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="col-span-3 text-center text-zinc-400 font-mono text-sm">
                                        {formatSize(backup.sizeBytes)}
                                    </div>
                                    <div className="col-span-3 text-right flex items-center justify-end gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(backup.path)}
                                            disabled={isRestoring || isSaving}
                                            className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
                                            title="Delete Backup"
                                            type="button"
                                        >
                                            <Trash className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => handleRestore(backup.path)}
                                            disabled={isRestoring || isSaving}
                                            className="bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-900 hover:border-red-600 h-8 text-xs"
                                        >
                                            <RefreshCw className={`w-3 h-3 mr-2 ${isRestoring ? 'animate-spin' : ''}`} />
                                            {isRestoring ? '...' : 'Restore'}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* DANGER ZONE CARD */}
            <Card className="glass-card bg-transparent border-red-500/20 text-white overflow-hidden">
                <div className="bg-red-500/10 border-b border-red-500/20 p-4">
                    <CardTitle className="flex items-center gap-2 text-red-500">
                        <AlertTriangle className="w-5 h-5" />
                        {t('dangerZone') || "منطقة الخطر"}
                    </CardTitle>
                    <CardDescription className="text-red-200/50 mt-1">
                        {t('factoryResetDesc') || "سيتم حذف جميع المبيعات والمشتريات والمصروفات وحركات المخزون والورديات. سيتم تصفير الأرصدة وكميات المخزون. سيتم الاحتفاظ بالمنتجات والعملاء والموردين والإعدادات."}
                    </CardDescription>
                </div>
                <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">
                            {t('resetConfirm2') || "يرجى كتابة 'RESET' للتأكيد:"}
                        </label>
                        <div className="flex gap-2">
                            <Input
                                value={resetConfirmText}
                                onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                                placeholder="RESET"
                                className="bg-black/20 border-red-500/20 focus:border-red-500/50 text-red-400 font-bold tracking-widest"
                            />
                            <Button
                                variant="destructive"
                                onClick={handleDatabaseReset}
                                disabled={isResetting || resetConfirmText !== 'RESET'}
                                className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20"
                            >
                                <RotateCcw className={`w-4 h-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
                                {isResetting ? (t('resetting') || 'Resetting...') : (t('resetButton') || 'تنفيذ إعادة الضبط')}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div >
    );
}
