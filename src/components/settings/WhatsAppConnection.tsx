"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  AlertTriangle,
  Monitor,
  Sparkles
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
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
    const [demoMode, setDemoMode] = useState(false);
    const initTimerRef = useRef<NodeJS.Timeout | null>(null);

    const addLog = useCallback((msg: string) => {
        setLogs(prev => [msg, ...prev].slice(0, 5));
    }, []);

    const checkAndInit = useCallback(async () => {
        if (typeof window === "undefined") return;
        const desktop = Boolean(window.electronAPI?.whatsapp);
        setIsDesktop(desktop);

        if (!desktop) {
            setStatus('DISCONNECTED');
            addLog("متصفح الويب: محرك البث المباشر متاح عبر تطبيق Casper POS Desktop");
            return;
        }

        try {
            setLoading(true);
            addLog("فحص حالة المحرك...");
            const res = await window.electronAPI!.whatsapp!.getStatus();
            if (res?.success && res.data?.status) {
                setStatus(res.data.status);
                addLog(`الحالة الحالية: ${res.data.status}`);
                
                // If stopped or disconnected, trigger initialize immediately so QR generates
                if (res.data.status === 'STOPPED' || res.data.status === 'DISCONNECTED') {
                    addLog("بدء تشغيل محرك واتساب وتوليد كود QR...");
                    setStatus('INITIALIZING');
                    const initRes = await window.electronAPI!.whatsapp!.initialize();
                    if (!initRes?.success) {
                        toast.error(initRes?.error || "فشل تشغيل محرك واتساب");
                        setStatus('DISCONNECTED');
                    }
                }
            } else {
                setStatus('DISCONNECTED');
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`خطأ فحص المحرك: ${msg}`);
            setStatus('DISCONNECTED');
        } finally {
            setLoading(false);
        }
    }, [addLog]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const desktop = Boolean(window.electronAPI?.whatsapp);
        setIsDesktop(desktop);

        if (!desktop) {
            setStatus('DISCONNECTED');
            return;
        }

        // 1. Initial Status Fetch & Auto-Start
        checkAndInit();

        // 2. Safety timeout: if stuck on INITIALIZING for > 10s, don't leave user hanging
        initTimerRef.current = setTimeout(() => {
            setStatus(prev => {
                if (prev === 'INITIALIZING') {
                    addLog("مهلة التهيئة انتهت، يرجى النقر على تحديث");
                    return 'DISCONNECTED';
                }
                return prev;
            });
        }, 12000);

        // 3. Listen for Live Updates from Electron
        const unsubs: (() => void)[] = [];

        if (window.electronAPI?.whatsapp?.onQRUpdate) {
            unsubs.push(window.electronAPI.whatsapp.onQRUpdate((newQr: string) => {
                setQr(newQr);
                setStatus('AWAITING_QR');
                addLog("تم استقبال كود QR جديد");
            }));
        }

        if (window.electronAPI?.whatsapp?.onStatusChange) {
            unsubs.push(window.electronAPI.whatsapp.onStatusChange((newStatus: WhatsAppStatus) => {
                setStatus(newStatus);
                if (newStatus === 'READY') setQr(null);
                addLog(`تغيرت الحالة إلى: ${newStatus}`);
            }));
        }

        return () => {
            if (initTimerRef.current) clearTimeout(initTimerRef.current);
            unsubs.forEach(fn => fn());
        };
    }, [checkAndInit, addLog]);

    const handleLogout = async () => {
        if (!window.electronAPI?.whatsapp) {
            setStatus('DISCONNECTED');
            setQr(null);
            setDemoMode(false);
            toast.success("تم إيقاف الخدمة");
            return;
        }
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
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "خطأ غير متوقع";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        if (!isDesktop) {
            setDemoMode(true);
            setStatus('AWAITING_QR');
            setQr("https://casper-pos.example/demo-pairing-qr-sample");
            toast.info("تم تفعيل وضع المعاينة التجريبي لكود QR");
            return;
        }

        setLoading(true);
        try {
            addLog("إعادة تشغيل المحرك وتوليد كود جديد...");
            setStatus('INITIALIZING');
            const res = await window.electronAPI!.whatsapp!.initialize();
            if (res?.success) {
                toast.success("تم بدء تهيئة محرك واتساب بنجاح");
            } else {
                toast.error(res?.error || "فشلت عملية التهيئة");
                setStatus('DISCONNECTED');
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "خطأ بالتهيئة";
            toast.error(msg);
            setStatus('DISCONNECTED');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-3 sm:p-4 shadow-xl overflow-hidden group/conn mb-3">
            <div className="flex flex-col sm:flex-row items-center gap-4">
                
                {/* Left: QR / Status Visual */}
                <div className="relative shrink-0">
                    <div className={cn(
                        "w-28 h-28 rounded-xl border-2 flex items-center justify-center transition-all duration-300 overflow-hidden shadow-inner",
                        status === 'READY' ? "border-green-500/50 bg-green-500/10 shadow-green-500/10" : 
                        status === 'AWAITING_QR' ? "border-primary/60 bg-white" :
                        status === 'INITIALIZING' ? "border-amber-500/40 bg-amber-500/5" :
                        "border-muted/50 bg-muted/20"
                    )}>
                        {status === 'AWAITING_QR' && (qr || demoMode) ? (
                            <div className="p-2 bg-white rounded-lg animate-in zoom-in-90 duration-300">
                                <QRCodeSVG value={qr || "https://casper-pos.example/wa"} size={96} level="M" />
                            </div>
                        ) : status === 'READY' ? (
                            <div className="flex flex-col items-center gap-1.5 text-center p-2">
                                <div className="p-2 bg-green-500/20 rounded-full">
                                    <ShieldCheck className="w-7 h-7 text-green-500 animate-in zoom-in" />
                                </div>
                                <span className="text-[9px] font-black text-green-500 uppercase tracking-wider">متصل وجاهز</span>
                            </div>
                        ) : status === 'INITIALIZING' ? (
                            <div className="flex flex-col items-center gap-1.5 text-center p-2 text-amber-500">
                                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                                <span className="text-[9px] font-black uppercase tracking-tight">جارِ التهيئة...</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1.5 text-center p-2 text-muted-foreground">
                                <div className="p-2 bg-muted/40 rounded-full">
                                    <QrCode className="w-6 h-6 opacity-60" />
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-tight">جاهز للربط</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Info & Actions */}
                <div className="flex-1 space-y-2 w-full">
                    <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-black text-foreground uppercase tracking-tight">بوابة واتساب الذكية</h3>
                                {isDesktop === false && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 font-bold flex items-center gap-1">
                                        <Monitor className="w-3 h-3" /> وضع الويب
                                    </span>
                                )}
                            </div>
                            
                            {status === 'READY' ? (
                                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-500/10 text-green-500 rounded-full text-[10px] font-bold uppercase border border-green-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    متصل الآن
                                </span>
                            ) : status === 'AWAITING_QR' ? (
                                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase border border-primary/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                                    امسح كود QR
                                </span>
                            ) : status === 'INITIALIZING' ? (
                                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/10 text-amber-500 rounded-full text-[10px] font-bold uppercase border border-amber-500/20">
                                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                                    توليد الكود...
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-500/10 text-rose-500 rounded-full text-[10px] font-bold uppercase border border-rose-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    غير متصل
                                </span>
                            )}
                        </div>

                        <p className="text-[11px] text-muted-foreground leading-snug">
                            {status === 'READY' 
                                ? "النظام متصل حالياً ويقوم بإرسال الإشعارات التلقائية للعملاء بنجاح."
                                : status === 'AWAITING_QR' 
                                ? "افتح تطبيق واتساب على هاتفك > الأجهزة المرتبطة (Linked Devices) > ثم امسح كود QR الظاهر."
                                : status === 'INITIALIZING'
                                ? "جارِ تشغيل محرك الاتصال السريع وتجهيز كود الاستجابة السريعة QR..."
                                : isDesktop === false
                                ? "تطبيق سطح المكتب Casper POS Desktop يرسل رسائل واتساب مباشرة للمشتركين دون الحاجة لسيرفر خارجي."
                                : "المحرك جاهز للاتصال. اضغط على 'توليد كود QR' للربط مع رقم هاتفك."
                            }
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center pt-0.5">
                        <button
                            onClick={handleRefresh}
                            disabled={loading}
                            className="h-7 px-3 bg-primary hover:bg-primary/90 text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs active:scale-95"
                        >
                            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                            {status === 'READY' ? 'فحص الاتصال' : status === 'AWAITING_QR' ? 'تجديد الكود' : 'توليد كود QR للربط'}
                        </button>
                        
                        {(status === 'READY' || status === 'AWAITING_QR' || demoMode) && (
                            <button
                                onClick={handleLogout}
                                disabled={loading}
                                className="h-7 px-3 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                            >
                                <LogOut className="w-3 h-3" />
                                {status === 'READY' ? 'فصل الخدمة' : 'إلغاء الربط'}
                            </button>
                        )}
                        
                        <div className="h-7 px-2.5 bg-muted/30 border border-border/40 rounded-lg text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5">
                            <Smartphone className="w-3 h-3 text-primary" />
                            baileys native socket
                        </div>
                    </div>

                    {/* Notice */}
                    <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/15 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 leading-tight">
                            تنبيه: سيتم إرسال الرسائل للعملاء تلقائياً من رقم الهاتف المرتبط فور تغيير حالة التذكرة.
                        </p>
                    </div>
                </div>
            </div>

            {/* Technical Logs Collapsible */}
            <div className="mt-2 pt-2 border-t border-border/30">
                <button 
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-[9px] font-semibold tracking-wider text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
                >
                    <div className={cn("w-1.5 h-1.5 rounded-full", status === 'READY' ? "bg-green-500" : "bg-amber-500")} />
                    {showLogs ? 'إخفاء السجلات التقنية' : 'عرض السجلات التقنية (Logs)'}
                </button>
                
                {showLogs && (
                    <div className="mt-2 p-2 rounded-lg bg-black/10 dark:bg-black/40 font-mono text-[9px] text-muted-foreground space-y-0.5 animate-in fade-in" dir="ltr">
                        {logs.length > 0 ? logs.map((logMsg, i) => (
                            <div key={i} className="flex gap-2">
                                <span className="opacity-30">[{5-i}]</span>
                                <span>{logMsg}</span>
                            </div>
                        )) : (
                            <div className="text-center italic opacity-50">No events logged yet</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
