"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldCheck, Copy, Check, Clock, AlertTriangle, KeyRound, Server, User, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function LicenseManagerPage() {
    const [licenses, setLicenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Generate Form state
    const [clientName, setClientName] = useState("");
    const [durationDays, setDurationDays] = useState("30");
    const [planType, setPlanType] = useState("standard");
    const [genLoading, setGenLoading] = useState(false);
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [copiedCode, setCopiedCode] = useState(false);

    // Staff Override generator state
    const [overrideChallenge, setOverrideChallenge] = useState("");
    const [overrideMachineId, setOverrideMachineId] = useState("");
    const [overrideToken, setOverrideToken] = useState<string | null>(null);
    const [overrideLoading, setOverrideLoading] = useState(false);
    const [copiedOverride, setCopiedOverride] = useState(false);

    // Search state
    const [searchTerm, setSearchTerm] = useState("");

    const fetchLicenses = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/licenses");
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
        toast.success("Activation Code copied!");
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleRevoke = async (id: string) => {
        if (!confirm("Are you sure you want to REVOKE this license? The client will be locked out within 6 hours.")) {
            return;
        }

        setActionLoading(id);
        try {
            const res = await fetch(`/api/admin/licenses/${id}/revoke`, { method: "POST" });
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
                method: "POST",
                headers: { "Content-Type": "application/json" },
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

    const handleGenerateLicense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientName.trim()) {
            toast.error("Please enter a Client Name");
            return;
        }

        setGenLoading(true);
        setGeneratedCode(null);
        try {
            const res = await fetch("/api/admin/license/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientName: clientName.trim(),
                    durationDays: parseInt(durationDays),
                    planType
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setGeneratedCode(data.activationCode);
                toast.success("Activation code generated successfully!");
                setClientName(""); // Clear input
                fetchLicenses(); // Refresh table
            } else {
                toast.error(data.error || "Failed to generate activation code");
            }
        } catch (error) {
            toast.error("Network error generating code");
        } finally {
            setGenLoading(false);
        }
    };

    const handleGenerateOverride = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!overrideChallenge.trim() || !overrideMachineId.trim()) {
            toast.error("Challenge Code and Machine ID are required.");
            return;
        }

        setOverrideLoading(true);
        setOverrideToken(null);
        try {
            const res = await fetch("/api/admin/license/staff-generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    challenge: overrideChallenge.trim().toUpperCase(),
                    machineId: overrideMachineId.trim().toUpperCase()
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setOverrideToken(data.token);
                toast.success("Override token signed successfully!");
            } else {
                toast.error(data.error || "Failed to sign override token");
            }
        } catch (error) {
            toast.error("Network error signing token");
        } finally {
            setOverrideLoading(false);
        }
    };

    const handleCopyGenCode = () => {
        if (!generatedCode) return;
        navigator.clipboard.writeText(generatedCode);
        setCopiedCode(true);
        toast.success("Copied to clipboard!");
        setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleCopyOverrideToken = () => {
        if (!overrideToken) return;
        navigator.clipboard.writeText(overrideToken);
        setCopiedOverride(true);
        toast.success("Override token copied to clipboard!");
        setTimeout(() => setCopiedOverride(false), 2000);
    };

    const filteredLicenses = licenses.filter(tenant => 
        tenant.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.activationCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.machineId?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-tight">License Manager</h1>
                        <p className="text-slate-400 text-sm">Generate, renew, and revoke client node activations local-first.</p>
                    </div>
                </div>
                <Button variant="outline" className="border-slate-800 text-slate-200" onClick={fetchLicenses}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </Button>
            </div>

            {/* Twin Form Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Panel 1: Generate Client Activation */}
                <Card className="glass-card bg-slate-900/40 border-slate-800/80 shadow-xl backdrop-blur-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
                    <CardHeader className="border-b border-slate-800/50 pb-4">
                        <CardTitle className="text-white flex items-center gap-2">
                            <KeyRound className="w-5 h-5 text-cyan-400" />
                            Generate New Client License
                        </CardTitle>
                        <CardDescription className="text-slate-400">Generate a new activation code for a client node.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleGenerateLicense} className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Client / Tenant Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                    <Input 
                                        placeholder="e.g., Cairo Retail Store" 
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white pl-10 focus:border-cyan-500 text-sm"
                                        disabled={genLoading}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Duration</label>
                                    <Select value={durationDays} onValueChange={setDurationDays} disabled={genLoading}>
                                        <SelectTrigger className="bg-slate-950 border-slate-800 text-white text-sm">
                                            <SelectValue placeholder="Select duration" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                                            <SelectItem value="14">14 Days (Trial)</SelectItem>
                                            <SelectItem value="30">30 Days</SelectItem>
                                            <SelectItem value="90">90 Days</SelectItem>
                                            <SelectItem value="365">365 Days (1 Year)</SelectItem>
                                            <SelectItem value="3650">3650 Days (10 Years)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Plan Type</label>
                                    <Select value={planType} onValueChange={setPlanType} disabled={genLoading}>
                                        <SelectTrigger className="bg-slate-950 border-slate-800 text-white text-sm">
                                            <SelectValue placeholder="Select plan" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                                            <SelectItem value="trial">Trial</SelectItem>
                                            <SelectItem value="standard">Standard</SelectItem>
                                            <SelectItem value="premium">Premium (All Features)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <Button 
                                type="submit" 
                                disabled={genLoading || !clientName.trim()} 
                                className="w-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold"
                            >
                                {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate Activation Code"}
                            </Button>
                        </form>

                        {/* Generated Result */}
                        {generatedCode && (
                            <div className="mt-6 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 flex flex-col gap-2 animate-in slide-in-from-bottom-3 duration-300">
                                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Activation Code Generated</span>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-xl font-mono font-black text-white tracking-widest">{generatedCode}</span>
                                    <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10"
                                        onClick={handleCopyGenCode}
                                    >
                                        {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                </div>
                                <span className="text-[10px] text-slate-400">Share this code with the technician to activate the local node.</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Panel 2: Staff Override Response Key Generator */}
                <Card className="glass-card bg-slate-900/40 border-slate-800/80 shadow-xl backdrop-blur-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>
                    <CardHeader className="border-b border-slate-800/50 pb-4">
                        <CardTitle className="text-white flex items-center gap-2">
                            <Server className="w-5 h-5 text-rose-400" />
                            Staff Override Token Generator
                        </CardTitle>
                        <CardDescription className="text-slate-400">Verify technician sessions and issue a 5-minute override key.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleGenerateOverride} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Challenge Code</label>
                                    <Input 
                                        placeholder="e.g., CF7A-3B91" 
                                        value={overrideChallenge}
                                        onChange={(e) => setOverrideChallenge(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white focus:border-rose-500 font-mono text-sm"
                                        disabled={overrideLoading}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Machine ID (Client)</label>
                                    <Input 
                                        placeholder="e.g., F12A-99B7..." 
                                        value={overrideMachineId}
                                        onChange={(e) => setOverrideMachineId(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white focus:border-rose-500 font-mono text-sm"
                                        disabled={overrideLoading}
                                    />
                                </div>
                            </div>
                            <Button 
                                type="submit" 
                                disabled={overrideLoading || !overrideChallenge.trim() || !overrideMachineId.trim()} 
                                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold"
                            >
                                {overrideLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign Staff Override Key"}
                            </Button>
                        </form>

                        {/* Signed JWT Result */}
                        {overrideToken && (
                            <div className="mt-4 p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col gap-2 animate-in slide-in-from-bottom-3 duration-300">
                                <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Override Token (Valid 5 Mins)</span>
                                <div className="flex items-center gap-2">
                                    <textarea 
                                        readOnly 
                                        value={overrideToken} 
                                        rows={3}
                                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 font-mono text-[9px] text-slate-300 resize-none outline-none"
                                    />
                                    <Button 
                                        size="icon" 
                                        variant="outline" 
                                        className="border-rose-500/20 text-rose-400 hover:bg-rose-500/10 shrink-0 h-16"
                                        onClick={handleCopyOverrideToken}
                                    >
                                        {copiedOverride ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                </div>
                                <span className="text-[10px] text-slate-400">Copy this long token and send it to the on-site technician.</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* List and search section */}
            <Card className="glass-card bg-slate-900/40 border-slate-800/80 shadow-xl backdrop-blur-xl">
                <CardHeader className="border-b border-slate-800/50 pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-white">Active Client Licenses</CardTitle>
                            <CardDescription className="text-slate-400">List of database-linked clients and verification details.</CardDescription>
                        </div>
                        {/* Search Input */}
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                            <Input 
                                placeholder="Search client, code or machine..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-slate-950 border-slate-800 text-white pl-10 focus:border-cyan-500 text-sm"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="rounded-md border border-slate-800/80 bg-slate-950/20 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-950/40">
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-400">Client</TableHead>
                                    <TableHead className="text-slate-400">Plan</TableHead>
                                    <TableHead className="text-slate-400">Status</TableHead>
                                    <TableHead className="text-slate-400">Expiration</TableHead>
                                    <TableHead className="text-slate-400">Machine ID</TableHead>
                                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLicenses.map((tenant) => {
                                    const isExpired = new Date(tenant.trialEndsAt) < new Date();
                                    const isSuspended = tenant.status === "suspended";

                                    return (
                                        <TableRow key={tenant.id} className="border-slate-800/50 hover:bg-slate-900/10">
                                            <TableCell className="font-semibold text-slate-200">{tenant.clientName || "Unknown"}</TableCell>
                                            <TableCell className="capitalize text-slate-400">{tenant.planType}</TableCell>
                                            <TableCell>
                                                {isSuspended ? (
                                                    <Badge variant="destructive" className="flex w-max items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" /> Suspended
                                                    </Badge>
                                                ) : isExpired ? (
                                                    <Badge variant="secondary" className="bg-slate-800 text-slate-400 border-slate-700">
                                                        Expired
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">
                                                        Active
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-slate-300">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                                                    {format(new Date(tenant.trialEndsAt), "PP")}
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-[150px]">
                                                <span className="text-xs font-mono text-slate-500 truncate block" title={tenant.machineId || "Not bound yet"}>
                                                    {tenant.machineId || "Pending Activation..."}
                                                </span>
                                                {tenant.activationCode && !tenant.machineId && (
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-6 mt-1 text-[10px] px-2 text-cyan-400 hover:text-cyan-300"
                                                        onClick={() => handleCopy(tenant.activationCode, tenant.id)}
                                                    >
                                                        {copiedId === tenant.id ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                                        {tenant.activationCode}
                                                    </Button>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                {actionLoading === tenant.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin inline-block text-cyan-500" />
                                                ) : (
                                                    <>
                                                        <div className="inline-flex gap-1">
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-8 border-slate-800 text-cyan-400 hover:bg-cyan-500/10"
                                                                onClick={() => handleRenew(tenant.id, 30)}
                                                                title="Renew for 30 Days"
                                                            >
                                                                +30d
                                                            </Button>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-8 border-slate-800 text-cyan-400 hover:bg-cyan-500/10 hidden md:inline-flex"
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
                                                                className="h-8 ml-2 bg-rose-950/20 text-rose-500 border border-rose-500/30 hover:bg-rose-500/25"
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
                                
                                {filteredLicenses.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center h-24 text-slate-500">
                                            {searchTerm ? "No matching licenses found." : "No licenses configured yet."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
