'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cloud, CheckCircle2, XCircle, Loader2, DownloadCloud, KeyRound, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { CloudConfigManager, CloudConfig } from "@/utils/cloudConfigManager";

export default function CloudSettings() {
    const [config, setConfig] = useState<CloudConfig>({
        enabled: false,
        cloudUrl: '',
        branchId: '',
        syncSecret: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    
    // Auto-fetch branches state
    const [availableBranches, setAvailableBranches] = useState<{ id: string, name: string, code: string }[]>([]);
    const [fetchingBranches, setFetchingBranches] = useState(false);

    // License Generator State
    const [licenseLoading, setLicenseLoading] = useState(false);
    const [licenseCode, setLicenseCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [clientName, setClientName] = useState('');
    const [durationDays, setDurationDays] = useState(30);
    const [planType, setPlanType] = useState('trial');

    const handleGenerateLicense = async (e: React.FormEvent) => {
        e.preventDefault();
        setLicenseLoading(true);
        setLicenseCode(null);
        try {
            const res = await fetch('/api/admin/license/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientName, durationDays, planType })
            });
            const data = await res.json();
            if (data.success) {
                setLicenseCode(data.activationCode);
                toast.success('License activation code generated successfully!');
            } else {
                toast.error(data.error || 'Failed to generate code.');
            }
        } catch (error: unknown) {
            toast.error((error as Error)?.message || 'An error occurred.');
        } finally {
            setLicenseLoading(false);
        }
    };

    const handleCopy = () => {
        if (licenseCode) {
            navigator.clipboard.writeText(licenseCode);
            setCopied(true);
            toast.success('Activation code copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    useEffect(() => {
        CloudConfigManager.getCloudConfig().then(c => {
            setConfig(c);
            setLoading(false);
        });

        const unsub = CloudConfigManager.onConfigUpdated((newConfig) => {
            setConfig(newConfig);
        });
        return () => unsub();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await CloudConfigManager.saveCloudConfig(config);
            if (res.success) {
                toast.success('Cloud settings saved successfully. Sync worker restarted.');
            } else {
                toast.error(`Failed to save: ${res.error}`);
            }
        } catch (error: unknown) {
            toast.error((error as Error)?.message || 'An error occurred while saving.');
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        if (!config.cloudUrl) {
            toast.error('Please enter a Cloud URL first.');
            return;
        }

        setTesting(true);
        try {
            const res = await fetch(`${config.cloudUrl}/api/health`, {
                method: 'GET',
            });
            
            if (res.ok) {
                toast.success('Connection successful! Cloud server is reachable.');
            } else {
                toast.error(`Connected but returned status: ${res.status}`);
            }
        } catch (error: unknown) {
            toast.error(`Connection failed: ${(error as Error)?.message}. Please check the URL and your network.`);
        } finally {
            setTesting(false);
        }
    };

    const handleFetchBranches = async () => {
        if (!config.cloudUrl || !config.syncSecret) {
            toast.error('Please enter both Cloud URL and Sync Secret first.');
            return;
        }

        setFetchingBranches(true);
        try {
            const res = await fetch('/api/proxy/branches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cloudUrl: config.cloudUrl, syncSecret: config.syncSecret })
            });
            const data = await res.json();
            if (data.success && data.branches) {
                setAvailableBranches(data.branches);
                toast.success(`Found ${data.branches.length} active branches.`);
                // If we don't have a branch ID set, auto-select the first one
                if (data.branches.length > 0 && !config.branchId) {
                    setConfig({ ...config, branchId: data.branches[0].id });
                }
            } else {
                toast.error(`Failed to fetch branches: ${data.error || 'Unknown error'}`);
            }
        } catch (error: unknown) {
            toast.error(`Error fetching branches: ${(error as Error)?.message}`);
        } finally {
            setFetchingBranches(false);
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
                {/* Cloud Connection Card */}
                <Card className="glass-card bg-card/40 border-border/40 overflow-hidden relative shadow-md rounded-2xl">
                    <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/50" />
                    <CardHeader className="p-3 pb-2 border-b border-border/20">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500">
                                <Cloud className="w-4 h-4" />
                            </div>
                            <div>
                                <CardTitle className="text-sm font-bold">إعدادات الربط السحابي (Cloud Connection)</CardTitle>
                                <CardDescription className="text-[11px] text-muted-foreground">
                                    ربط المحطة بنظام Casper Cloud المركزي. اتركه معطلاً للعمل دون اتصال محلياً فقط.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-background/50 border border-border/50">
                            <div className="space-y-0.5">
                                <Label className="text-xs font-bold">تفعيل المزامنة السحابية (Enable Cloud Sync)</Label>
                                <p className="text-[10px] text-muted-foreground">تشغيل خدمة المزامنة الخلفية لنقل المبيعات والعمليات تلقائياً</p>
                            </div>
                            <Switch 
                                className="scale-90"
                                checked={config.enabled}
                                onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                            />
                        </div>

                        <div className={`space-y-2.5 transition-all duration-300 ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                <div className="space-y-1">
                                    <Label htmlFor="cloudUrl" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">رابط السيرفر السحابي (URL)</Label>
                                    <Input 
                                        id="cloudUrl"
                                        placeholder="https://cloud.casper-erp.com"
                                        value={config.cloudUrl}
                                        onChange={(e) => setConfig({ ...config, cloudUrl: e.target.value })}
                                        className="h-8 text-xs bg-background/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="syncSecret" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">مفتاح المزامنة السري (Sync Secret)</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            id="syncSecret"
                                            type="password"
                                            placeholder="super-secret-key"
                                            value={config.syncSecret}
                                            onChange={(e) => setConfig({ ...config, syncSecret: e.target.value })}
                                            className="h-8 text-xs bg-background/50 font-mono flex-1"
                                        />
                                        <Button 
                                            type="button"
                                            variant="secondary"
                                            onClick={handleFetchBranches}
                                            disabled={!config.cloudUrl || !config.syncSecret || fetchingBranches}
                                            className="h-8 px-2.5 text-[10px] font-bold bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20"
                                        >
                                            {fetchingBranches ? <Loader2 className="w-3 h-3 animate-spin" /> : <DownloadCloud className="w-3 h-3 mr-1" />}
                                            الفروع
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <Label htmlFor="branchId" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">تعيين الفرع (Branch Assignment)</Label>
                                    {availableBranches.length > 0 ? (
                                        <Select 
                                            value={config.branchId} 
                                            onValueChange={(val) => setConfig({ ...config, branchId: val })}
                                        >
                                            <SelectTrigger className="h-8 text-xs bg-background/50 font-mono">
                                                <SelectValue placeholder="اختر الفرع..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableBranches.map(b => (
                                                    <SelectItem key={b.id} value={b.id} className="text-xs">
                                                        {b.name} ({b.code})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input 
                                            id="branchId"
                                            placeholder="معرّف الفرع branch-uuid"
                                            value={config.branchId}
                                            onChange={(e) => setConfig({ ...config, branchId: e.target.value })}
                                            className="h-8 text-xs bg-background/50 font-mono"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/20 flex items-center justify-between border-t border-border/20 p-2.5 px-3">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleTestConnection}
                            disabled={!config.cloudUrl || testing || !config.enabled}
                            className="h-8 text-xs bg-background/50 border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-600 cursor-pointer"
                        >
                            {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5 mr-1.5" />}
                            اختبار الاتصال
                        </Button>

                        <Button 
                            size="sm"
                            onClick={handleSave} 
                            disabled={saving}
                            className="h-8 text-xs bg-cyan-500 hover:bg-cyan-600 text-white shadow-xs cursor-pointer"
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                            حفظ إعدادات السحاب
                        </Button>
                    </CardFooter>
                </Card>

                {/* License Generator Card */}
                <Card className="glass-card bg-card/40 border-border/40 overflow-hidden relative shadow-md rounded-2xl">
                    <div className="absolute top-0 left-0 w-1 h-full bg-violet-500/50" />
                    <CardHeader className="p-3 pb-2 border-b border-border/20">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                                <KeyRound className="w-4 h-4" />
                            </div>
                            <div>
                                <CardTitle className="text-sm font-bold">توليد أكواد التفعيل (Generate License Activation Code)</CardTitle>
                                <CardDescription className="text-[11px] text-muted-foreground">
                                    إنشاء أكواد تفعيل للاستخدام لمرة واحدة لمحطات العملاء، ترتبط برقم اللوحة الأم للجهاز.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <form onSubmit={handleGenerateLicense}>
                        <CardContent className="p-3 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                <div className="space-y-1">
                                    <Label htmlFor="clientName" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">اسم العميل / الفرع</Label>
                                    <Input 
                                        id="clientName"
                                        placeholder="مثال: فرع الرياض الرئيسي"
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        className="h-8 text-xs bg-background/50"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="planType" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">نوع الباقة</Label>
                                    <select 
                                        id="planType"
                                        value={planType}
                                        onChange={(e) => setPlanType(e.target.value)}
                                        className="w-full h-8 rounded-md border border-input bg-background/50 px-2.5 py-1 text-xs ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="trial">تجريبية (Trial)</option>
                                        <option value="basic">أساسية (Basic)</option>
                                        <option value="premium">متقدمة (Premium)</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="durationDays" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">المدة (أيام)</Label>
                                    <Input 
                                        id="durationDays"
                                        type="number"
                                        value={durationDays}
                                        onChange={(e) => setDurationDays(Number(e.target.value))}
                                        className="h-8 text-xs bg-background/50"
                                        min={1}
                                        required
                                    />
                                </div>
                            </div>

                            {licenseCode && (
                                <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 flex flex-col sm:flex-row items-center justify-between gap-2 animate-in zoom-in duration-200">
                                    <div className="space-y-0.5">
                                        <p className="text-[9px] uppercase font-bold tracking-wider text-violet-400">تم توليد كود التفعيل</p>
                                        <p className="text-base font-mono font-black tracking-wider text-violet-600 dark:text-violet-400">{licenseCode}</p>
                                    </div>
                                    <Button 
                                        type="button"
                                        size="sm"
                                        variant="outline" 
                                        onClick={handleCopy}
                                        className="h-7 text-xs border-violet-500/30 bg-background/50 hover:bg-violet-500/10 hover:text-violet-600 cursor-pointer"
                                    >
                                        {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                                        {copied ? 'تم النسخ' : 'نسخ الكود'}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="bg-muted/20 border-t border-border/20 p-2.5 px-3 flex justify-end">
                            <Button 
                                type="submit" 
                                size="sm"
                                disabled={licenseLoading || !clientName}
                                className="h-8 text-xs bg-violet-500 hover:bg-violet-600 text-white shadow-xs cursor-pointer"
                            >
                                {licenseLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                                توليد الكود
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
