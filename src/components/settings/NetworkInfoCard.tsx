'use client';

import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, Copy, Check, RefreshCw, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface NetworkInfo {
    lanIp: string;
    port: number;
    lanUrl: string;
    localUrl: string;
    isElectronMaster: boolean;
}

type CopiedKey = 'lanUrl' | 'localUrl' | null;

export default function NetworkInfoCard() {
    const [info, setInfo] = useState<NetworkInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState<CopiedKey>(null);

    // Only renders inside Electron — bail out entirely in a browser context.
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

    const fetchInfo = useCallback(async () => {
        if (!isElectron) return;
        setLoading(true);
        try {
            const result = await (window as any).electronAPI.config.getNetworkInfo();
            if (result?.success !== false) {
                setInfo(result?.data ?? result);
            }
        } catch {
            // non-fatal — component just stays empty
        } finally {
            setLoading(false);
        }
    }, [isElectron]);

    useEffect(() => { fetchInfo(); }, [fetchInfo]);

    const copyToClipboard = async (text: string, key: CopiedKey) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        } catch { /* ignore */ }
    };

    // Not inside Electron — render nothing.
    if (!isElectron) return null;

    return (
        <Card className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-3xl overflow-hidden shadow-xl relative group">
            {/* Glow accent */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 font-black text-lg">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/30">
                        <Wifi className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                    </div>
                    <span className="uppercase tracking-tight">شبكة الفرع — Sub PC Access</span>
                </CardTitle>
                <CardDescription className="text-muted-foreground font-bold text-xs ms-12">
                    افتح أي متصفح على أجهزة الفرع واكتب الرابط أو امسح QR Code
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
                {loading ? (
                    <div className="flex items-center gap-3 text-muted-foreground text-sm animate-pulse py-4">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        جاري تحميل معلومات الشبكة...
                    </div>
                ) : !info ? (
                    <div className="text-sm text-destructive font-bold py-2">
                        تعذّر الحصول على معلومات الشبكة. تأكد من تشغيل التطبيق على جهاز الماستر.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                        {/* URL List */}
                        <div className="space-y-3">
                            {/* Direct IP URL */}
                            <div className="group/url p-4 bg-background/40 rounded-2xl border border-border/20 hover:border-emerald-500/40 transition-colors space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        الرابط المباشر (IP)
                                    </span>
                                    <Badge variant="outline" className="text-[9px] font-black uppercase border-emerald-500/40 text-emerald-400">
                                        موصى به
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-sm font-mono font-bold text-foreground break-all">
                                        {info.lanUrl}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 hover:bg-emerald-500/10 hover:text-emerald-400"
                                        onClick={() => copyToClipboard(info.lanUrl, 'lanUrl')}
                                    >
                                        {copied === 'lanUrl'
                                            ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            : <Copy className="w-3.5 h-3.5" />}
                                    </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium">
                                    يعمل دائماً على نفس الشبكة
                                </p>
                            </div>

                            {/* mDNS Hostname */}
                            <div className="group/url p-4 bg-background/40 rounded-2xl border border-border/20 hover:border-sky-500/40 transition-colors space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        الاسم الثابت (mDNS)
                                    </span>
                                    <Badge variant="outline" className="text-[9px] font-black uppercase border-sky-500/40 text-sky-400">
                                        .local
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-sm font-mono font-bold text-foreground break-all">
                                        {info.localUrl}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 hover:bg-sky-500/10 hover:text-sky-400"
                                        onClick={() => copyToClipboard(info.localUrl, 'localUrl')}
                                    >
                                        {copied === 'localUrl'
                                            ? <Check className="w-3.5 h-3.5 text-sky-400" />
                                            : <Copy className="w-3.5 h-3.5" />}
                                    </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium">
                                    يعمل حتى لو تغيّر الـ IP — يحتاج Windows Network: Private
                                </p>
                            </div>

                            {/* Machine info */}
                            <div className="flex items-center gap-2 p-3 bg-background/30 rounded-xl border border-border/10 text-xs text-muted-foreground">
                                <Monitor className="w-3.5 h-3.5 shrink-0" />
                                <span>IP الجهاز الحالي: <strong className="text-foreground">{info.lanIp}</strong> — Port: <strong className="text-foreground">{info.port}</strong></span>
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs font-black uppercase tracking-widest gap-2 hover:border-emerald-500/40 hover:text-emerald-400"
                                onClick={fetchInfo}
                            >
                                <RefreshCw className="w-3 h-3" /> تحديث
                            </Button>
                        </div>

                        {/* QR Code */}
                        <div className="flex flex-col items-center gap-3">
                            <div className="p-4 bg-white rounded-2xl shadow-lg ring-1 ring-border/20">
                                <QRCodeSVG
                                    value={info.lanUrl}
                                    size={140}
                                    bgColor="#ffffff"
                                    fgColor="#0f172a"
                                    level="M"
                                />
                            </div>
                            <p className="text-[10px] text-center text-muted-foreground font-bold uppercase tracking-widest">
                                امسح بكاميرا الجهاز أو المتصفح
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
