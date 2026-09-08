'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    ShieldCheck, 
    Clock, 
    Monitor, 
    KeyRound, 
    MessageCircle, 
    Loader2, 
    AlertTriangle, 
    CheckCircle2, 
    RefreshCw,
    ExternalLink,
    Copy,
    Check
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface TenantLicenseData {
    tenantId: string;
    name: string;
    plan: string;
    status: 'active' | 'expired' | 'suspended';
    expiresAt: string | null;
    remainingDays: number | null;
    isExpired: boolean;
    isSuspended: boolean;
    devicesCount: number;
    devices: Array<{
        id: string;
        index: number;
        machineId: string;
        expiresAt: string;
    }>;
}

export default function TenantLicenseInfo() {
    const [license, setLicense] = useState<TenantLicenseData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activationKey, setActivationKey] = useState('');
    const [activating, setActivating] = useState(false);
    const [copiedMachineId, setCopiedMachineId] = useState<string | null>(null);

    const fetchLicenseInfo = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/tenant/license-info');
            if (res.ok) {
                const json = await res.json();
                setLicense(json.data || null);
            } else {
                toast.error("فشل جلب بيانات الترخيص");
            }
        } catch (e) {
            toast.error("خطأ في الاتصال بالخادم");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLicenseInfo();
    }, []);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedMachineId(id);
        toast.success("تم نسخ معرّف الجهاز");
        setTimeout(() => setCopiedMachineId(null), 2000);
    };

    const handleActivateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activationKey.trim()) return;

        setActivating(true);
        try {
            const res = await fetch('/api/license/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: activationKey.trim() })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                toast.success("تم تفعيل الترخيص بنجاح!");
                setActivationKey('');
                fetchLicenseInfo();
            } else {
                toast.error(data.error || "مفتاح الترخيص غير صالح أو منتهي");
            }
        } catch (e) {
            toast.error("فشل تفعيل الترخيص. يرجى التأكد من الاتصال بالإنترنت.");
        } finally {
            setActivating(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-48 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
                <p className="text-xs text-muted-foreground font-medium">جاري فحص حالة الترخيص والاشتراك...</p>
            </div>
        );
    }

    const isActive = license?.status === 'active';
    const isExpired = license?.status === 'expired';
    const isSuspended = license?.status === 'suspended';

    return (
        <div className="max-w-5xl space-y-4 animate-in fade-in duration-500">
            {/* Header Title */}
            <div className="flex items-center justify-between pb-2 border-b border-border/30">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-foreground">بيانات ترخيص واشتراك المتجر</h3>
                        <p className="text-[11px] text-muted-foreground">حالة الخطة، تاريخ الانتهاء، ومعرّفات الأجهزة المعتمدة</p>
                    </div>
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchLicenseInfo} 
                    className="h-8 text-xs gap-1.5 border-border/40 hover:bg-muted/40 cursor-pointer"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تحديث الحالة</span>
                </Button>
            </div>

            {/* Bento Grid: Subscription Status + Key Activation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Subscription Status (Spans 2 cols on desktop) */}
                <Card className="md:col-span-2 glass-card bg-card/50 border-border/40 rounded-2xl shadow-sm overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-48 h-48 bg-teal-500/5 blur-3xl rounded-full pointer-events-none" />
                    <CardHeader className="p-4 pb-2 border-b border-border/20 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">باقة الاشتراك</span>
                            <Badge className="bg-primary/20 text-primary border-primary/30 font-black text-[10px] px-2 py-0.5">
                                {license?.plan || 'Casper ERP Pro'}
                            </Badge>
                        </div>
                        {isActive && (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 flex items-center gap-1 font-bold text-xs px-2.5 py-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> نشط وفعّال
                            </Badge>
                        )}
                        {isExpired && (
                            <Badge variant="destructive" className="flex items-center gap-1 font-bold text-xs px-2.5 py-0.5">
                                <Clock className="w-3.5 h-3.5" /> منتهي الصلاحية
                            </Badge>
                        )}
                        {isSuspended && (
                            <Badge variant="destructive" className="flex items-center gap-1 font-bold text-xs px-2.5 py-0.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> موقوف مؤقتاً
                            </Badge>
                        )}
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="p-3 rounded-xl bg-background/50 border border-border/30 space-y-1">
                                <span className="text-[10px] font-semibold text-muted-foreground block">تاريخ انتهاء الترخيص</span>
                                <span className="text-xs font-black text-foreground block">
                                    {license?.expiresAt 
                                        ? format(new Date(license.expiresAt), 'dd MMMM yyyy', { locale: ar })
                                        : 'اشتراك سنوي نشط'}
                                </span>
                            </div>

                            <div className="p-3 rounded-xl bg-background/50 border border-border/30 space-y-1">
                                <span className="text-[10px] font-semibold text-muted-foreground block">الأيام المتبقية</span>
                                <span className="text-xs font-black text-teal-400 block">
                                    {license && license.remainingDays !== null && license.remainingDays !== undefined ? `${license.remainingDays} يوم` : 'غير محدود'}
                                </span>
                            </div>

                            <div className="p-3 rounded-xl bg-background/50 border border-border/30 space-y-1">
                                <span className="text-[10px] font-semibold text-muted-foreground block">الأجهزة المسجلة</span>
                                <span className="text-xs font-black text-foreground block">
                                    {license?.devicesCount || 1} جهاز طرفي
                                </span>
                            </div>
                        </div>

                        {/* Renewal Banner */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="text-xs font-medium text-emerald-300">
                                    هل ترغب في ترقية باقتك أو إضافة أجهزة طرفية جديدة لمتجرك؟
                                </span>
                            </div>
                            <a 
                                href="https://wa.me/201091232471" 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shrink-0"
                            >
                                <span>تواصل مع الدعم</span>
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </CardContent>
                </Card>

                {/* Card 2: Manual Key Activation */}
                <Card className="glass-card bg-card/50 border-border/40 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
                    <CardHeader className="p-4 pb-2 border-b border-border/20">
                        <div className="flex items-center gap-2">
                            <KeyRound className="w-4 h-4 text-amber-400" />
                            <CardTitle className="text-xs font-bold text-foreground">تفعيل مفتاح ترخيص</CardTitle>
                        </div>
                        <CardDescription className="text-[10px] text-muted-foreground">
                            أدخل كود التفعيل الممنوح من إدارة كاسبر
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-3 flex-1 flex flex-col justify-between">
                        <form onSubmit={handleActivateKey} className="space-y-3">
                            <Input 
                                placeholder="CASPER-XXXX-XXXX-XXXX" 
                                value={activationKey}
                                onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
                                className="font-mono text-center text-xs h-9 uppercase tracking-wider bg-background/60 border-border/50 focus:border-primary"
                            />
                            <Button 
                                type="submit" 
                                disabled={activating || !activationKey.trim()}
                                className="w-full h-8 text-xs font-bold bg-primary hover:bg-primary/90 text-white gap-1.5 cursor-pointer"
                            >
                                {activating ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>جاري التحقق...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>تفعيل الترخيص</span>
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* Registered Devices List for this Tenant */}
            <Card className="glass-card bg-card/40 border-border/40 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader className="p-3 px-4 border-b border-border/20 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-sky-400" />
                        <span className="text-xs font-bold text-foreground">الأجهزة الطرفية المعتمدة لهذا المتجر</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                        {license?.devices?.length || 0} جهاز مسجل
                    </span>
                </CardHeader>
                <CardContent className="p-0">
                    {license?.devices && license.devices.length > 0 ? (
                        <div className="divide-y divide-border/20">
                            {license.devices.map((device) => (
                                <div key={device.id} className="p-3 px-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold text-[10px]">
                                            {device.index}
                                        </div>
                                        <div>
                                            <span className="text-xs font-bold text-foreground block font-mono">
                                                {device.machineId}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
                                                جهاز طرفي معتمد لفرع المتجر
                                            </span>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleCopy(device.machineId, device.id)}
                                        className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                                    >
                                        {copiedMachineId === device.id ? (
                                            <>
                                                <Check className="w-3 h-3 text-emerald-400" />
                                                <span className="text-emerald-400">تم النسخ</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-3 h-3" />
                                                <span>نسخ المعرّف</span>
                                            </>
                                        )}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-6 text-center text-muted-foreground text-xs">
                            لا توجد أجهزة طرفية مسجلة حتى الآن. سيتم تسجيل الجهاز تلقائياً عند أول عملية تسجيل دخول من التطبيق المكتبي.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
