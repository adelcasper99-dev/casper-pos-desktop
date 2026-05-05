"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Smartphone, 
  LogOut, 
  RefreshCw,
  QrCode,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type WhatsAppStatus =
  | 'INITIALIZING'
  | 'AWAITING_QR'
  | 'AUTHENTICATING'
  | 'READY'
  | 'DISCONNECTED'
  | 'DEGRADED'
  | 'FAILED'
  | 'STOPPED';

export default function WhatsAppConnection() {
    const [status, setStatus] = useState<WhatsAppStatus>('INITIALIZING');
    const [qr, setQr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [showLogs, setShowLogs] = useState(false);

    const addLog = (msg: string) => {
        setLogs(prev => [msg, ...prev].slice(0, 5));
    };

    useEffect(() => {
        if (typeof window === "undefined" || !window.electronAPI?.whatsapp) return;

        // 1. Initial Status Fetch
        window.electronAPI.whatsapp.getStatus().then((res) => {
            if (res.success) setStatus(res.data.status);
        });

        // 2. Listen for Live Updates
        const unsubs: (() => void)[] = [];

        unsubs.push(window.electronAPI.whatsapp.onQRUpdate((newQr) => {
            setQr(newQr);
            setStatus('AWAITING_QR');
            addLog("Received new QR code");
        }));

        unsubs.push(window.electronAPI.whatsapp.onStatusChange((newStatus) => {
            setStatus(newStatus);
            if (newStatus === 'READY') setQr(null);
            addLog(`Status changed to: ${newStatus}`);
        }));

        return () => unsubs.forEach(fn => fn());
    }, []);

    const handleLogout = async () => {
        if (!window.electronAPI?.whatsapp) return;
        setLoading(true);
        try {
            const res = await window.electronAPI.whatsapp.logout();
            if (res.success) {
                toast.success("تم تسجيل الخروج بنجاح");
                setStatus('DISCONNECTED');
                setQr(null);
            } else {
                toast.error(res.error || "فشل تسجيل الخروج");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        if (!window.electronAPI?.whatsapp) return;
        setLoading(true);
        try {
            // If disconnected or failed, attempt a full initialization
            if (status === 'DISCONNECTED' || status === 'FAILED' || status === 'STOPPED') {
                addLog("Manual initialization triggered via Refresh");
                const res = await window.electronAPI.whatsapp.initialize();
                if (!res.success) toast.error(res.error || "فشلت عملية التهيئة");
            } else {
                addLog("Checking status...");
                const res = await window.electronAPI.whatsapp.getStatus();
                if (res.success) setStatus(res.data.status);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-[2.5rem] p-6 sm:p-10 shadow-xl overflow-hidden group/conn mb-10">
            <div className="flex flex-col md:flex-row items-center gap-10">
                
                {/* Left: QR / Status Visual */}
                <div className="relative">
                    <div className={cn(
                        "w-48 h-48 rounded-3xl border-2 flex items-center justify-center transition-all duration-500 overflow-hidden",
                        status === 'READY' ? "border-green-500/50 bg-green-500/5 shadow-2xl shadow-green-500/20" : 
                        status === 'AWAITING_QR' ? "border-primary/50 bg-primary/5" :
                        "border-muted bg-muted/20"
                    )}>
                        {status === 'AWAITING_QR' && qr ? (
                            <div className="p-4 bg-white rounded-xl">
                                <QRCodeSVG value={qr} size={150} level="H" />
                            </div>
                        ) : status === 'READY' ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="p-4 bg-green-500/20 rounded-full">
                                    <ShieldCheck className="w-12 h-12 text-green-500 animate-in zoom-in" />
                                </div>
                                <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">Active Connection</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span className="text-[10px] font-bold uppercase tracking-tighter">{status}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Info & Actions */}
                <div className="flex-1 space-y-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight text-right">بوابة واتساب الذكية</h3>
                            {status === 'READY' ? (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-[10px] font-black uppercase border border-green-500/20 animate-pulse">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    متصل الآن
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-rose-500 rounded-full text-[10px] font-black uppercase border border-rose-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    غير متصل
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-bold text-muted-foreground leading-relaxed text-right">
                            {status === 'READY' 
                                ? "النظام متصل حالياً ويقوم بإرسال الإشعارات التلقائية للعملاء بنجاح."
                                : status === 'AWAITING_QR' 
                                ? "يرجى مسح كود QR من خلال تطبيق واتساب (Linked Devices) لتفعيل الخدمة."
                                : "جارِ تهيئة محرك الإشعارات الذكي... يرجى الانتظار."
                            }
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3 justify-end">
                        {status !== 'INITIALIZING' && (
                            <>
                                <button
                                    onClick={handleRefresh}
                                    disabled={loading}
                                    className="px-6 py-2.5 bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                                >
                                    <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                                    تحديث الحالة
                                </button>
                                
                                <button
                                    onClick={handleLogout}
                                    disabled={loading}
                                    className="px-6 py-2.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                    {status === 'READY' ? 'فصل الخدمة (Logout)' : 'إعادة ضبط الجلسة (Force Reset)'}
                                </button>
                            </>
                        )}
                        
                        <div className="px-6 py-2.5 bg-muted/30 border border-border/40 rounded-2xl text-[10px] font-bold text-muted-foreground flex items-center gap-2">
                            <Smartphone className="w-3.5 h-3.5" />
                            Native Engine (baileys)
                        </div>
                    </div>

                    {/* Security Tip */}
                    <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex gap-3 dir-rtl">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <p className="text-[10px] font-bold text-amber-600/80 leading-normal text-right">
                            تنبيه: سيتم إرسال الرسائل من خلال رقم الهاتف الذي ستقوم بمسح الكود الخاص به. تأكد من استمرارية اتصال الهاتف بالإنترنت.
                        </p>
                    </div>
                </div>
            </div>

            {/* Technical Logs Collapsible */}
            <div className="mt-8 pt-6 border-t border-border/40">
                <button 
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 mx-auto"
                >
                    <div className={cn("w-1 h-1 rounded-full", status === 'READY' ? "bg-green-500" : "bg-amber-500")} />
                    {showLogs ? 'Hide Technical Logs' : 'Show Technical Logs'}
                </button>
                
                {showLogs && (
                    <div className="mt-4 p-4 rounded-xl bg-black/10 dark:bg-black/40 font-mono text-[9px] text-muted-foreground space-y-1 animate-in fade-in slide-in-from-top-2">
                        {logs.length > 0 ? logs.map((log, i) => (
                            <div key={i} className="flex gap-3">
                                <span className="opacity-30">[{5-i}]</span>
                                <span>{log}</span>
                            </div>
                        )) : (
                            <div className="text-center italic opacity-50">No recent events logged</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
