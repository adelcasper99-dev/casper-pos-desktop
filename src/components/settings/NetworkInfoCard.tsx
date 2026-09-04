'use client';

import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, Copy, Check, RefreshCw, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { getServerNetworkInfo } from '@/actions/settings';

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

    type ElectronWithConfig = {
        electronAPI?: {
            config?: {
                getNetworkInfo?: () => Promise<{ success?: boolean; data?: NetworkInfo }>;
            };
        };
    };

    const fetchInfo = useCallback(async () => {
        setLoading(true);
        try {
            const electronWithConfig = typeof window !== 'undefined' ? (window as unknown as ElectronWithConfig) : undefined;
            const api = electronWithConfig?.electronAPI;
            
            if (api?.config?.getNetworkInfo) {
                const result = await api.config.getNetworkInfo();
                if (result?.success !== false && result?.data) {
                    setInfo(result.data);
                    return;
                }
            }

            // Fallback for Web browser or when Electron IPC is not wired:
            const res = await getServerNetworkInfo();
            if (res.success && res.data) {
                setInfo(res.data);
            }
        } catch {
            // non-fatal — component just stays empty
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchInfo(); }, [fetchInfo]);

    const copyToClipboard = async (text: string, key: CopiedKey) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        } catch { /* ignore */ }
    };

    return (
        <Card className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-xl overflow-hidden shadow-sm relative group p-3">
            <CardHeader className="p-0 pb-2.5">
                <CardTitle className="flex items-center gap-2 font-black text-xs">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/30 shrink-0">
                        <Wifi className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                        <span className="uppercase tracking-tight text-xs font-black text-foreground">شبكة الفرع — Sub PC Access</span>
                        <p className="text-muted-foreground font-medium text-[10px] leading-none mt-0.5">
                            افتح أي متصفح على أجهزة الفرع واكتب الرابط أو امسح QR Code
                        </p>
                    </div>
                </CardTitle>
            </CardHeader>

            <CardContent className="p-0 space-y-2">
                {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        جاري تحميل معلومات الشبكة...
                    </div>
                ) : !info ? (
                    <div className="text-xs text-destructive font-bold py-1">
                        تعذّر الحصول على معلومات الشبكة. تأكد من تشغيل التطبيق على جهاز الماستر.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                        {/* URL List */}
                        <div className="space-y-1.5">
                            {/* Direct IP URL */}
                            <div className="p-2 bg-background/40 rounded-lg border border-border/20 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                                        الرابط المباشر (IP)
                                    </span>
                                    <Badge variant="outline" className="text-[8px] font-black uppercase border-emerald-500/40 text-emerald-400 py-0 px-1.5 h-4">
                                        موصى به
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <code className="flex-1 text-xs font-mono font-bold text-foreground break-all">
                                        {info.lanUrl}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 hover:text-emerald-400"
                                        onClick={() => copyToClipboard(info.lanUrl, 'lanUrl')}
                                        title="Copy"
                                    >
                                        {copied === 'lanUrl'
                                            ? <Check className="w-3 h-3 text-emerald-400" />
                                            : <Copy className="w-3 h-3" />}
                                    </Button>
                                </div>
                            </div>

                            {/* mDNS Hostname */}
                            <div className="p-2 bg-background/40 rounded-lg border border-border/20 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                                        الاسم الثابت (mDNS)
                                    </span>
                                    <Badge variant="outline" className="text-[8px] font-black uppercase border-sky-500/40 text-sky-400 py-0 px-1.5 h-4">
                                        .local
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <code className="flex-1 text-xs font-mono font-bold text-foreground break-all">
                                        {info.localUrl}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 hover:text-sky-400"
                                        onClick={() => copyToClipboard(info.localUrl, 'localUrl')}
                                        title="Copy"
                                    >
                                        {copied === 'localUrl'
                                            ? <Check className="w-3 h-3 text-sky-400" />
                                            : <Copy className="w-3 h-3" />}
                                    </Button>
                                </div>
                            </div>

                            {/* Machine info & Refresh */}
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                                    <Monitor className="w-3 h-3 shrink-0" />
                                    <span>IP: <strong className="text-foreground">{info.lanIp}</strong>:{info.port}</span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] font-bold px-2 rounded-lg border-border/40 gap-1"
                                    onClick={fetchInfo}
                                >
                                    <RefreshCw className="w-2.5 h-2.5" /> تحديث
                                </Button>
                            </div>
                        </div>

                        {/* QR Code */}
                        <div className="flex flex-col items-center gap-1.5">
                            <div className="p-2 bg-white rounded-xl shadow-sm ring-1 ring-border/20">
                                <QRCodeSVG
                                    value={info.lanUrl}
                                    size={96}
                                    bgColor="#ffffff"
                                    fgColor="#0f172a"
                                    level="M"
                                />
                            </div>
                            <p className="text-[9px] text-center text-muted-foreground font-bold uppercase tracking-wider">
                                امسح بكاميرا الجهاز
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
