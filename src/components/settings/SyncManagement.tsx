'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Trash2, AlertCircle, CheckCircle2, CloudSync, History, AlertTriangle } from "lucide-react";
import { SyncService } from "@/lib/sync-service";
import { toast } from "sonner";
import { format } from "date-fns";

interface QueueStatus {
    total?: number;
    salesCount?: number;
    ticketsCount?: number;
    treasuryCount?: number;
    inventoryCount?: number;
    returnsCount?: number;
}

interface DeadLetterItem {
    id: string;
    type: string;
    createdAt?: string | Date | number;
    syncError?: string;
    syncRetries?: number;
}

export default function SyncManagement() {
    const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
    const [dlq, setDlq] = useState<DeadLetterItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    const loadData = async () => {
        try {
            setLoading(true);
            const [status, deadItems] = await Promise.all([
                SyncService.getQueueStatus(),
                SyncService.getDeadLetterQueue()
            ]);
            setQueueStatus(status);
            setDlq(deadItems);
        } catch (error) {
            console.error('[SyncManagement] Failed to load sync data:', error);
            toast.error("Failed to load sync status");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleRetry = async (type: string, id: string) => {
        try {
            await SyncService.retryItem(type, id);
            toast.success("Item marked for retry");
            loadData();
        } catch (error) {
            toast.error("Retry failed");
        }
    };

    const handleRemove = async (type: string, id: string) => {
        if (!confirm("Are you sure you want to permanently remove this transaction from the local queue? It will NOT be synced to the cloud.")) return;
        try {
            await SyncService.removeItem(type, id);
            toast.success("Transaction dismissed");
            loadData();
        } catch (error) {
            toast.error("Dismiss failed");
        }
    };

    const runManualSync = async () => {
        try {
            setSyncing(true);
            toast.promise(SyncService.manualSync(), {
                loading: 'Triggering universal sync...',
                success: (res) => {
                    loadData();
                    return `Sync complete: ${res.failures?.length || 0} failures remaining.`;
                },
                error: 'Manual sync failed'
            });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="max-w-5xl space-y-3 animate-in fade-in duration-500">
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1 custom-scrollbar space-y-3">
                {/* Quick Status Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                    {[
                        { label: 'المبيعات (Sales)', count: queueStatus?.salesCount ?? 0, color: 'text-cyan-400' },
                        { label: 'الصيانة (Tickets)', count: queueStatus?.ticketsCount ?? 0, color: 'text-amber-400' },
                        { label: 'الخزينة (Treasury)', count: queueStatus?.treasuryCount ?? 0, color: 'text-emerald-400' },
                        { label: 'المخزون (Inventory)', count: queueStatus?.inventoryCount ?? 0, color: 'text-blue-400' },
                        { label: 'المرتجعات (Returns)', count: queueStatus?.returnsCount ?? 0, color: 'text-rose-400' },
                    ].map((stat) => (
                        <Card key={stat.label} className="glass-card bg-card/40 border-border/40 overflow-hidden relative group transition-all hover:scale-[1.01] rounded-xl">
                            <div className={`absolute top-0 left-0 w-1 h-full bg-current ${stat.color} opacity-50`} />
                            <CardHeader className="p-2.5 pb-1">
                                <CardTitle className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
                                    {stat.label}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-2.5 pt-0 flex items-center justify-between">
                                <span className={`text-xl font-black ${stat.color}`}>{stat.count}</span>
                                <Badge variant="outline" className="border-border/20 text-[9px] px-1.5 py-0 bg-background/20 font-semibold">
                                    PENDING
                                </Badge>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Main Action Bar */}
                <div className="flex items-center justify-between bg-card/40 backdrop-blur-xl p-2.5 px-3 rounded-xl border border-border/40 shadow-sm">
                    <div className="space-y-0.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                            <CloudSync className="w-4 h-4 text-primary animate-pulse" />
                            حالة مزامنة المعاملات (Synchronization Health)
                        </h3>
                        <p className="text-[10px] text-muted-foreground font-medium">إجمالي المعاملات المعلقة في الطابور: {queueStatus?.total ?? 0}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={loadData}
                            className="h-8 rounded-lg hover:bg-white/5 font-bold text-xs cursor-pointer"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                            تحديث
                        </Button>
                        <Button 
                            size="sm" 
                            onClick={runManualSync}
                            disabled={syncing}
                            className="h-8 rounded-lg bg-primary hover:bg-primary/80 font-bold text-xs px-4 cursor-pointer"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                            مزامنة شاملة الآن
                        </Button>
                    </div>
                </div>

                {/* DLQ Table */}
                <Card className="glass-card bg-card/60 dark:bg-card/30 backdrop-blur-3xl border-border/40 rounded-xl overflow-hidden shadow-sm">
                    <CardHeader className="border-b border-border/20 bg-white/5 p-2.5 px-3">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <CardTitle className="text-xs font-bold uppercase tracking-tight flex items-center gap-2 text-foreground">
                                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                                    طابور العمليات المتعثرة (Dead Letter Queue)
                                </CardTitle>
                                <CardDescription className="text-[10px] text-muted-foreground">
                                    سجلات فشلت مزامنتها بعد 5 محاولات متتالية. تتطلب تدخلاً يدوياً أو إعادة محاولة.
                                </CardDescription>
                            </div>
                            <Badge variant="destructive" className="rounded-md font-bold text-[10px] px-2 py-0.5">
                                {dlq.length} عناصر معلقة
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {dlq.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-8 space-y-2">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-xs text-foreground">طابور المزامنة سليم تماماً</p>
                                    <p className="text-[10px] text-muted-foreground">لا توجد أي معاملات متعثرة.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                <Table>
                                    <TableHeader className="bg-white/5 sticky top-0 z-10 backdrop-blur-md">
                                        <TableRow className="border-border/20 hover:bg-transparent">
                                            <TableHead className="font-bold text-[10px] uppercase text-muted-foreground py-2">التاريخ</TableHead>
                                            <TableHead className="font-bold text-[10px] uppercase text-muted-foreground">النوع</TableHead>
                                            <TableHead className="font-bold text-[10px] uppercase text-muted-foreground w-[40%]">سبب الفشل</TableHead>
                                            <TableHead className="font-bold text-[10px] uppercase text-muted-foreground">المحاولات</TableHead>
                                            <TableHead className="text-right font-bold text-[10px] uppercase text-muted-foreground pr-4">إجراءات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dlq.map((item) => (
                                            <TableRow key={item.id} className="border-border/10 hover:bg-white/5 transition-colors group">
                                                <TableCell className="font-medium text-xs py-2">
                                                    {item.createdAt ? format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm') : 'Unknown'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[9px] font-bold border-border/20 bg-background/50">
                                                        {item.type}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-start gap-2">
                                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                                                        <span className="text-[11px] text-rose-400/90 leading-tight italic truncate max-w-xs">
                                                            {item.syncError || "Unknown server error"}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-bold text-rose-500 text-xs">
                                                    {item.syncRetries ?? 0}
                                                </TableCell>
                                                <TableCell className="text-right pr-4">
                                                    <div className="flex justify-end gap-1.5">
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            onClick={() => handleRetry(item.type, item.id)}
                                                            className="h-7 px-2 rounded-md hover:bg-sky-500/20 hover:text-sky-400 font-bold text-[10px] cursor-pointer"
                                                        >
                                                            <RefreshCw className="w-3 h-3 mr-1" />
                                                            إعادة
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            onClick={() => handleRemove(item.type, item.id)}
                                                            className="h-7 px-2 rounded-md hover:bg-rose-500/20 hover:text-rose-400 font-bold text-[10px] cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3 h-3 mr-1" />
                                                            حذف
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="space-y-0.5">
                        <p className="font-bold text-amber-400 text-[10px] uppercase tracking-wider">ملاحظة هندسية</p>
                        <p className="text-[10px] text-amber-200/80 leading-normal font-medium">
                            تدخل المعاملات في طابور العمليات المتعثرة بعد 5 محاولات فاشلة متتالية بسبب أخطاء تحقق أو قيود قاعدة البيانات على السيرفر المركزي.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
