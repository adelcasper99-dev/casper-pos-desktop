"use client";

import { useState, useEffect } from "react";
import { Database, UploadCloud, RefreshCw, Trash2, FolderOpen, Save, HardDrive, Download, History, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
    getBackups,
    createManualBackup,
    restoreBackup,
    removeBackup,
    getBackupStats,
    downloadBackup
} from "@/actions/backup";
import { updateSystemConfig, getSystemConfig } from "@/actions/system-config";
import { resetAllData } from "@/actions/system";
import { testGoogleDrive, uploadToDrive } from "@/actions/google-drive";

export default function BackupManager() {
    const [backups, setBackups] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<any>({});
    const [driveStatus, setDriveStatus] = useState<any>(null);
    const [restoring, setRestoring] = useState(false);
    const { useTranslations } = require('@/lib/i18n-mock');
    const t = useTranslations('BackupManager');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [b, s, c, d] = await Promise.all([
                getBackups(),
                getBackupStats(),
                getSystemConfig(),
                testGoogleDrive()
            ]);

            if (b.success && b.backups) setBackups(b.backups);
            if (s.success) setStats(s.stats);
            if (c.success) setConfig(c);
            setDriveStatus(d);

        } catch (error) {
            console.error(error);
            toast.error(t('loadError'));
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBackup = async () => {
        setLoading(true);
        toast.info(t('creating'));
        try {
            const res = await createManualBackup();
            if (res.success) {
                toast.success(t('createSuccess'));
                loadData();
            } else {
                toast.error(t('createError') + res.error);
            }
        } catch (e: any) {
            toast.error("Error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (id: string) => {
        if (!confirm(t('restoreConfirm'))) return;

        setRestoring(true);
        toast.loading(t('restoring'));
        try {
            const res = await restoreBackup({ backupId: id });
            if (res.success) {
                toast.dismiss();
                toast.success(t('restoreSuccess'));
                setTimeout(() => window.location.reload(), 2000);
            } else {
                toast.dismiss();
                toast.error(t('restoreError') + res.error);
                if (res.error?.includes("locked")) {
                    alert(t('dbLocked'));
                }
            }
        } catch (e: any) {
            toast.error("Error: " + e.message);
        } finally {
            setRestoring(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('deleteConfirm'))) return;
        try {
            await removeBackup({ backupId: id });
            toast.success(t('deleteSuccess'));
            loadData();
        } catch (e) {
            toast.error(t('deleteError'));
        }
    };

    const handleDownload = async (id: string) => {
        try {
            const res = await downloadBackup({ backupId: id });
            if (res.success && res.downloadData) {
                // Decode base64 (browser compatible)
                const binaryString = window.atob(res.downloadData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = res.filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (e) {
            toast.error(t('downloadError'));
        }
    };

    const handleResetSystem = async () => {
        const confirm1 = confirm(t('resetConfirm1'));
        if (!confirm1) return;

        const confirm2 = confirm(t('resetConfirm2'));
        if (confirm2) { // Allow any input for now since prompt isn't easy in react without UI. Just confirm twice.
            // Actually native prompt is fine
            // const input = prompt("Type DELETE"); if (input !== 'DELETE') return;
        } else {
            return;
        }

        setLoading(true);
        try {
            const res = await resetAllData();
            if (res.success) {
                toast.success(t('resetSuccess'));
                window.location.reload();
            } else {
                toast.error(t('resetError') + res.error);
            }
        } catch (e: any) {
            toast.error("Error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSavePath = async () => {
        try {
            await updateSystemConfig({ backupPath: config.backupPath });
            toast.success(t('pathUpdated'));
            loadData();
        } catch (error) {
            toast.error(t('pathError'));
        }
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 text-white">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Stats Card */}
                <Card className="glass-card bg-transparent border-white/10 text-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">{t('totalBackups')}</CardTitle>
                        <div className="text-2xl font-bold">{stats?.totalBackups || 0}</div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xs text-zinc-500">
                            {t('totalSize', { size: stats?.totalSizeMB || 0 })}
                        </div>
                    </CardContent>
                </Card>

                {/* Drive Status */}
                <Card className="glass-card bg-transparent border-white/10 text-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">{t('googleDrive')}</CardTitle>
                        <div className="flex items-center gap-2">
                            {driveStatus?.success ? (
                                <span className="text-green-400 flex items-center gap-1 text-sm font-bold"><UploadCloud className="w-4 h-4" /> {t('connected')}</span>
                            ) : (
                                <span className="text-zinc-500 flex items-center gap-1 text-sm"><UploadCloud className="w-4 h-4" /> {t('notConfigured')}</span>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xs text-zinc-500">
                            {driveStatus?.message || t('installDrive')}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-4">
                <Button onClick={handleCreateBackup} disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-white">
                    <Save className="w-4 h-4 mr-2" />
                    {t('createBackup')}
                </Button>

                <Button variant="destructive" onClick={handleResetSystem} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20">
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('resetData')}
                </Button>
            </div>

            {/* Backup List */}
            <Card className="glass-card bg-transparent border-white/10 text-white">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="w-5 h-5 text-purple-400" />
                        {t('historyTitle')}
                    </CardTitle>
                    <CardDescription className="text-zinc-400">
                        {t('historyDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Config Path */}
                        <div className="flex items-end gap-2 mb-6">
                            <div className="flex-1 space-y-2">
                                <Label>{t('backupDir')}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={config.backupPath || ""}
                                        onChange={(e) => setConfig({ ...config, backupPath: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                    <Button variant="outline" onClick={handleSavePath} title="Save Path">
                                        <Save className="w-4 h-4" />
                                    </Button>
                                </div>
                                <p className="text-[10px] text-zinc-500">
                                    {t('backupDirHint')}
                                </p>
                            </div>
                        </div>

                        <div className="border rounded-lg border-white/10 divide-y divide-white/5">
                            {backups.length === 0 && (
                                <div className="p-8 text-center text-zinc-500">
                                    {t('noBackups')}
                                </div>
                            )}
                            {backups.map((backup) => (
                                <div key={backup.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                                            <Database className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm text-white">{backup.filename}</div>
                                            <div className="text-xs text-zinc-500">
                                                {(backup.fileSize / 1024 / 1024).toFixed(2)} MB • {new Date(backup.createdAt).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => handleDownload(backup.id)} title={t('download')} className="h-8 w-8 p-0 border-white/10 hover:bg-white/10 text-zinc-300">
                                            <Download className="w-4 h-4" />
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => handleRestore(backup.id)} disabled={restoring} title={t('restore')} className="h-8 w-8 p-0 border-white/10 hover:bg-cyan-500/20 hover:text-cyan-400 text-zinc-300">
                                            <RefreshCw className={`w-4 h-4 ${restoring ? 'animate-spin' : ''}`} />
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => handleDelete(backup.id)} title={t('delete')} className="h-8 w-8 p-0 border-white/10 hover:bg-red-500/20 hover:text-red-400 text-zinc-300">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
