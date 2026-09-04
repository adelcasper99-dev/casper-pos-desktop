'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Copy, Check, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface LicenseItem {
    id?: string;
    key?: string;
    expiresAt: string | Date;
    macAddress?: string;
}

interface LicenseTenant {
    id: string;
    name?: string;
    isActive?: boolean;
    licenses?: LicenseItem[];
}

export default function LicenseManagement() {
    const [licenses, setLicenses] = useState<LicenseTenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchLicenses = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/licenses');
            if (res.ok) {
                const data = await res.json();
                setLicenses(data.data || []);
            }
        } catch (error) {
            toast.error("Failed to fetch licenses");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLicenses();
    }, []);

    const handleCopy = (code: string, id: string) => {
        navigator.clipboard.writeText(code);
        setCopiedId(id);
        toast.success("Code copied!");
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleRevoke = async (id: string) => {
        if (!confirm("Are you sure you want to REVOKE this license? The client will be locked out within 6 hours.")) {
            return;
        }

        setActionLoading(id);
        try {
            const res = await fetch(`/api/admin/licenses/${id}/revoke`, { method: 'POST' });
            if (res.ok) {
                toast.success("License revoked successfully.");
                fetchLicenses();
            } else {
                toast.error("Failed to revoke license.");
            }
        } catch (error) {
            toast.error("Network error.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRenew = async (id: string, days: number) => {
        setActionLoading(id);
        try {
            const res = await fetch(`/api/admin/licenses/${id}/renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ durationDays: days })
            });

            if (res.ok) {
                toast.success(`License renewed by ${days} days.`);
                fetchLicenses();
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to renew license.");
            }
        } catch (error) {
            toast.error("Network error.");
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl space-y-3 animate-in fade-in duration-500">
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1 custom-scrollbar space-y-3">
                <Card className="glass-card bg-card/40 border-border/40 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="p-2.5 px-3 border-b border-border/20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                                    <ShieldCheck className="w-4 h-4" />
                                </div>
                                <div>
                                    <CardTitle className="text-sm font-bold">تراخيص العملاء (Client Licenses)</CardTitle>
                                    <CardDescription className="text-[10px] text-muted-foreground">إدارة وتجديد وإلغاء تراخيص الأجهزة الطرفية للمشتركين.</CardDescription>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={fetchLicenses} className="h-7 text-xs px-3 cursor-pointer">
                                تحديث
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/20">
                                    <TableRow className="border-border/20">
                                        <TableHead className="py-2 text-[10px] font-bold">العميل / الفرع</TableHead>
                                        <TableHead className="py-2 text-[10px] font-bold">الباقة</TableHead>
                                        <TableHead className="py-2 text-[10px] font-bold">الحالة</TableHead>
                                        <TableHead className="py-2 text-[10px] font-bold">تاريخ الانتهاء</TableHead>
                                        <TableHead className="py-2 text-[10px] font-bold">معرّف الجهاز (Machine ID)</TableHead>
                                        <TableHead className="py-2 text-right text-[10px] font-bold pr-4">إجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {licenses.map((tenant) => {
                                        const primaryLicense = tenant.licenses?.[0];
                                        const isExpired = primaryLicense ? new Date(primaryLicense.expiresAt) < new Date() : false;
                                        const isSuspended = !tenant.isActive;
                                        const isActive = !isExpired && !isSuspended;

                                        return (
                                            <TableRow key={tenant.id} className="border-border/10 hover:bg-muted/10">
                                                <TableCell className="font-bold text-xs py-2">{tenant.name || 'Unknown'}</TableCell>
                                                <TableCell className="capitalize text-xs py-2">Pro</TableCell>
                                                <TableCell className="py-2">
                                                    {isSuspended ? (
                                                        <Badge variant="destructive" className="flex w-max items-center gap-1 text-[9px] px-1.5 py-0">
                                                            <AlertTriangle className="w-3 h-3" /> معطل
                                                        </Badge>
                                                    ) : isExpired ? (
                                                        <Badge variant="secondary" className="bg-muted text-muted-foreground text-[9px] px-1.5 py-0">
                                                            منتهي
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[9px] px-1.5 py-0">
                                                            نشط
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-2 text-xs">
                                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                                        <Clock className="w-3 h-3" />
                                                        {primaryLicense ? format(new Date(primaryLicense.expiresAt), 'PP') : "N/A"}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2">
                                                    <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[120px] block" title={primaryLicense?.macAddress || 'Not activated yet'}>
                                                        {primaryLicense?.macAddress || 'بانتظار التفعيل...'}
                                                    </span>
                                                    {primaryLicense?.key && !primaryLicense?.macAddress && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="h-5 text-[9px] px-1.5 text-violet-500 hover:text-violet-600 cursor-pointer"
                                                            onClick={() => handleCopy(primaryLicense.key!, tenant.id)}
                                                        >
                                                            {copiedId === tenant.id ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                                            نسخ الكود
                                                        </Button>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right py-2 pr-4 space-x-1">
                                                    {actionLoading === tenant.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin inline-block" />
                                                    ) : (
                                                        <>
                                                            <div className="inline-flex gap-1">
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="h-7 text-[10px] px-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                                                                    onClick={() => handleRenew(tenant.id, 30)}
                                                                    title="تجديد لمدة 30 يوماً"
                                                                >
                                                                    +30 يوم
                                                                </Button>
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="h-7 text-[10px] px-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hidden md:inline-flex cursor-pointer"
                                                                    onClick={() => handleRenew(tenant.id, 365)}
                                                                    title="تجديد لمدة سنة"
                                                                >
                                                                    +سنة
                                                                </Button>
                                                            </div>
                                                            
                                                            {!isSuspended && (
                                                                <Button 
                                                                    variant="destructive" 
                                                                    size="sm" 
                                                                    className="h-7 text-[10px] px-2 ml-1 cursor-pointer"
                                                                    onClick={() => handleRevoke(tenant.id)}
                                                                >
                                                                    إلغاء
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    
                                    {licenses.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-16 text-xs text-muted-foreground">
                                                لا توجد تراخيص مسجلة حالياً.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
