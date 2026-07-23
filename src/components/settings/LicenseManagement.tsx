'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Copy, Check, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function LicenseManagement() {
    const [licenses, setLicenses] = useState<any[]>([]);
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
        <Card className="glass-card bg-card/40 border-border/40 shadow-md animate-in fade-in">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-500">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <CardTitle className="text-xl">Client Licenses</CardTitle>
                            <CardDescription>Manage, revoke, and renew client activations globally.</CardDescription>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchLicenses}>
                        Refresh
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border bg-background/50">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Client</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Expiration</TableHead>
                                <TableHead>Machine ID</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {licenses.map((tenant) => {
                                const primaryLicense = tenant.licenses?.[0];
                                const isExpired = primaryLicense ? new Date(primaryLicense.expiresAt) < new Date() : false;
                                const isSuspended = !tenant.isActive;
                                const isActive = !isExpired && !isSuspended;

                                return (
                                    <TableRow key={tenant.id}>
                                        <TableCell className="font-medium">{tenant.name || 'Unknown'}</TableCell>
                                        <TableCell className="capitalize">Pro</TableCell>
                                        <TableCell>
                                            {isSuspended ? (
                                                <Badge variant="destructive" className="flex w-max items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3" /> Suspended
                                                </Badge>
                                            ) : isExpired ? (
                                                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                                    Expired
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">
                                                    Active
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-3 h-3 text-muted-foreground" />
                                                {primaryLicense ? format(new Date(primaryLicense.expiresAt), 'PP') : "N/A"}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px] block" title={primaryLicense?.macAddress || 'Not activated yet'}>
                                                {primaryLicense?.macAddress || 'Pending Activation...'}
                                            </span>
                                            {primaryLicense?.key && !primaryLicense?.macAddress && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-6 mt-1 text-[10px] px-2 text-violet-500 hover:text-violet-600"
                                                    onClick={() => handleCopy(primaryLicense.key, tenant.id)}
                                                >
                                                    {copiedId === tenant.id ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                                    Copy Code
                                                </Button>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            {actionLoading === tenant.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin inline-block" />
                                            ) : (
                                                <>
                                                    <div className="inline-flex gap-1">
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-8 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                                                            onClick={() => handleRenew(tenant.id, 30)}
                                                            title="Renew for 30 Days"
                                                        >
                                                            +30d
                                                        </Button>
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-8 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hidden md:inline-flex"
                                                            onClick={() => handleRenew(tenant.id, 365)}
                                                            title="Renew for 1 Year"
                                                        >
                                                            +1y
                                                        </Button>
                                                    </div>
                                                    
                                                    {!isSuspended && (
                                                        <Button 
                                                            variant="destructive" 
                                                            size="sm" 
                                                            className="h-8 ml-2"
                                                            onClick={() => handleRevoke(tenant.id)}
                                                        >
                                                            Revoke
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
                                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                        No licenses found. Generate one in Cloud Settings.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
