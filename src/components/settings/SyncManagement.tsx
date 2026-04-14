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

export default function SyncManagement() {
    const [queueStatus, setQueueStatus] = useState<any>(null);
    const [dlq, setDlq] = useState<any[]>([]);
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
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Quick Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {[
                    { label: 'Sales', count: queueStatus?.salesCount ?? 0, color: 'text-cyan-400' },
                    { label: 'Tickets', count: queueStatus?.ticketsCount ?? 0, color: 'text-amber-400' },
                    { label: 'Treasury', count: queueStatus?.treasuryCount ?? 0, color: 'text-emerald-400' },
                    { label: 'Inventory', count: queueStatus?.inventoryCount ?? 0, color: 'text-blue-400' },
                    { label: 'Returns', count: queueStatus?.returnsCount ?? 0, color: 'text-rose-400' },
                ].map((stat) => (
                    <Card key={stat.label} className="glass-card bg-card/40 border-border/40 overflow-hidden relative group transition-all hover:scale-[1.02]">
                        <div className={`absolute top-0 left-0 w-1 h-full bg-current ${stat.color} opacity-50`} />
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground">
                                {stat.label}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 flex items-center justify-between">
                            <span className={`text-2xl font-black ${stat.color}`}>{stat.count}</span>
                            <Badge variant="outline" className="border-border/20 text-[10px] bg-background/20">
                                PENDING
                            </Badge>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Main Action Bar */}
            <div className="flex items-center justify-between bg-card/30 backdrop-blur-xl p-4 rounded-3xl border border-white/5 shadow-2xl">
                <div className="space-y-0.5">
                    <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                        <CloudSync className="w-5 h-5 text-primary animate-pulse" />
                        Synchronization Health
                    </h3>
                    <p className="text-[10px] text-muted-foreground font-bold">Total queued transactions: {queueStatus?.total ?? 0}</p>
                </div>
                <div className="flex gap-3">
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={loadData}
                        className="rounded-xl hover:bg-white/5 font-black text-[10px] uppercase tracking-widest"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button 
                        size="sm" 
                        onClick={runManualSync}
                        disabled={syncing}
                        className="rounded-xl bg-primary hover:bg-primary/80 font-black text-[10px] uppercase tracking-widest px-6"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                        Force Universal Sync
                    </Button>
                </div>
            </div>

            {/* DLQ Table */}
            <Card className="glass-card bg-card/60 dark:bg-card/30 backdrop-blur-3xl border-border/40 rounded-3xl overflow-hidden shadow-2xl">
                <CardHeader className="border-b border-border/20 bg-white/5">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce" />
                                Dead Letter Queue
                            </CardTitle>
                            <CardDescription className="text-xs font-bold text-muted-foreground">
                                Records that failed to sync after 5+ attempts. Manual intervention required.
                            </CardDescription>
                        </div>
                        <Badge variant="destructive" className="rounded-lg font-black px-3 py-1">
                            {dlq.length} BLOCKED ITEMS
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {dlq.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-20 space-y-4">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                            </div>
                            <div className="text-center">
                                <p className="font-black text-foreground uppercase tracking-widest">Queue is Healthy</p>
                                <p className="text-xs font-bold text-muted-foreground mt-1">No dead-letter transactions found.</p>
                            </div>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="border-border/20 hover:bg-transparent">
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-muted-foreground py-4">Original Date</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-muted-foreground">Type</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-muted-foreground w-[40%]">Error Reason</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-muted-foreground">Retry Count</TableHead>
                                    <TableHead className="text-right font-black text-[10px] uppercase tracking-widest text-muted-foreground pr-6">Resolver Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dlq.map((item) => (
                                    <TableRow key={item.id} className="border-border/10 hover:bg-white/5 transition-colors group">
                                        <TableCell className="font-bold text-xs py-5">
                                            {item.createdAt ? format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm') : 'Unknown'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[10px] font-black border-border/20 bg-background/50">
                                                {item.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-start gap-3">
                                                <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                                                <span className="text-xs font-bold text-rose-400/90 leading-relaxed italic">
                                                    {item.syncError || "Unknown server error"}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-black text-rose-500 text-sm">
                                            {item.syncRetries ?? 0}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-2 opacity-100 xl:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    onClick={() => handleRetry(item.type, item.id)}
                                                    className="h-8 rounded-lg hover:bg-sky-500/20 hover:text-sky-400 font-black text-[10px] uppercase tracking-widest"
                                                >
                                                    <RefreshCw className="w-3 h-3 mr-2" />
                                                    Retry
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    onClick={() => handleRemove(item.type, item.id)}
                                                    className="h-8 rounded-lg hover:bg-rose-500/20 hover:text-rose-400 font-black text-[10px] uppercase tracking-widest"
                                                >
                                                    <Trash2 className="w-3 h-3 mr-2" />
                                                    Dismiss
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-1" />
                <div className="space-y-1">
                    <p className="font-black text-amber-400 uppercase tracking-widest text-xs">Architectural Note</p>
                    <p className="text-xs text-amber-200/70 leading-relaxed max-w-2xl font-medium">
                        Transactions enter the Dead Letter Queue only after 5 consecutive failed sync attempts. 
                        Usually, this indicates a data validation error or a conflict that requires manual database correction on the server OR dismissal if the transaction was recorded in error.
                    </p>
                </div>
            </div>
        </div>
    );
}
