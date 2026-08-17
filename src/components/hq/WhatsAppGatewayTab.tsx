"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  getWhatsAppGatewayStatus, 
  resetWhatsAppGateway, 
  sendWhatsAppTestMessage 
} from "@/actions/hq-whatsapp-actions";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Smartphone, 
  RefreshCw, 
  Send, 
  QrCode, 
  ShieldCheck, 
  AlertTriangle,
  Radio,
  ExternalLink,
  MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import { generateCSRFToken } from "@/lib/csrf-client";

type WhatsAppStatus = "CONNECTED" | "SCAN_QR" | "DISCONNECTED" | "UNKNOWN";

export function WhatsAppGatewayTab() {
  const [status, setStatus] = useState<WhatsAppStatus>("UNKNOWN");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("مرحباً بك في كاسبر ERP! رمز التحقق التجريبي هو: 589234");
  const [sendingTest, setSendingTest] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  const fetchStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await getWhatsAppGatewayStatus();
      if (res.success && res.status) {
        setStatus(res.status);
        setQrCode(res.qrCode || null);
        setLastCheck(new Date());
      } else {
        setStatus("DISCONNECTED");
      }
    } catch {
      setStatus("DISCONNECTED");
    } finally {
      if (!isSilent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-poll every 5 seconds if waiting for QR scan
    const interval = setInterval(() => {
      fetchStatus(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await resetWhatsAppGateway();
      if (res.success) {
        toast.success(res.message || "تمت إعادة تشغيل الجلسة بنجاح");
        await fetchStatus();
      } else {
        toast.error(res.error || "فشلت إعادة تعيين الجلسة");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "حدث خطأ أثناء إعادة التعيين");
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error("يرجى إدخال رقم هاتف صحيح");
      return;
    }
    setSendingTest(true);
    try {
      const csrfToken = await generateCSRFToken();
      const res = await sendWhatsAppTestMessage({
        phone: testPhone.trim(),
        message: testMessage.trim(),
        csrfToken
      });
      if (res.success) {
        toast.success(res.message || "تم إرسال الرسالة بنجاح!");
      } else {
        toast.error(res.error || "فشل إرسال الرسالة التجريبية");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "حدث خطأ أثناء الإرسال");
    } finally {
      setSendingTest(false);
    }
  };

  const qrImageUrl = qrCode 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`
    : null;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner: Status & Actions */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              status === "CONNECTED"
                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                : status === "SCAN_QR"
                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
            }`}>
              <MessageSquare className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">بوابة واتساب المركزية (WhatsApp Gateway)</h3>
                {status === "CONNECTED" && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    متصل ونشط
                  </span>
                )}
                {status === "SCAN_QR" && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    بانتظار مسح الـ QR
                  </span>
                )}
                {status === "DISCONNECTED" && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    غير متصل
                  </span>
                )}
              </div>
              <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1">
                البوابة الموحدة لإرسال أكواد التحقق (OTPs)، إشعارات الفواتير، والرد الآلي الذكي لكافة المستأجرين.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchStatus()}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 font-bold text-xs transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              تحديث الحالة
            </button>
            <button
              onClick={handleReset}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              إعادة تعيين الجلسة
            </button>
          </div>
        </div>
      </div>

      {/* Grid Section: QR / Connection Card + Test Dispatcher */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Card 1: Connection & QR Scanner */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-blue-500" />
              حالة الجلسة والربط (Baileys Session)
            </h4>

            {status === "CONNECTED" && (
              <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/30">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h5 className="font-black text-lg text-emerald-700 dark:text-emerald-400">واتساب متصل ويعمل بنجاح</h5>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    السيرفر جاهز لإرسال واستقبال الرسائل والـ OTPs تلقائياً.
                  </p>
                </div>
                <div className="pt-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    آخر فحص: {lastCheck.toLocaleTimeString("ar-EG")}
                  </span>
                </div>
              </div>
            )}

            {status === "SCAN_QR" && qrImageUrl && (
              <div className="flex flex-col items-center justify-center text-center space-y-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200 inline-block">
                  <img src={qrImageUrl} alt="WhatsApp QR" className="w-56 h-56 object-contain" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                    امسح الرمز أعلاه من تطبيق واتساب (الأجهزة المرتبطة)
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    يتم تحديث الرمز تلقائياً كل 20 ثانية لضمان أمان الجلسة.
                  </p>
                </div>
              </div>
            )}

            {(status === "DISCONNECTED" || (status === "SCAN_QR" && !qrImageUrl)) && (
              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-400 flex items-center justify-center">
                  <Smartphone className="w-8 h-8" />
                </div>
                <div>
                  <h5 className="font-bold text-slate-700 dark:text-zinc-300">لا توجد جلسة نشطة حالياً</h5>
                  <p className="text-xs text-slate-400 mt-1">
                    اضغط على "إعادة تعيين الجلسة" لتوليد رمز QR جديد والربط.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>المنفذ الداخلي: <code>Port 3005</code></span>
            <span>المحرك: <code>Baileys Multi-Device</code></span>
          </div>
        </div>

        {/* Card 2: Live Test Message Dispatcher */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Send className="w-5 h-5 text-emerald-500" />
              مختبر إرسال الرسائل التجريبية (Test Sandbox)
            </h4>

            <form onSubmit={handleSendTest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  رقم الهاتف التجريبي (Phone Number with Country Code)
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    placeholder="مثال: 201012345678"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    dir="ltr"
                    className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-2.5 font-mono text-sm focus:border-emerald-500 outline-none text-left"
                  />
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  نص الرسالة (Message Content)
                </label>
                <textarea
                  rows={3}
                  required
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl p-3 text-sm focus:border-emerald-500 outline-none resize-none"
                  placeholder="اكتب نص الرسالة هنا..."
                />
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTestMessage("رمز التحقق الخاص بك في Casper ERP هو: [ 491823 ]\nصالح لمدة 10 دقائق.")}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                >
                  كود تحقق (OTP)
                </button>
                <button
                  type="button"
                  onClick={() => setTestMessage("مرحباً بك في Casper ERP! تم تفعيل اشتراكك التجريبي لمدة 14 يوماً بنجاح.")}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                >
                  رسالة ترحيب
                </button>
              </div>

              <button
                type="submit"
                disabled={sendingTest || status !== "CONNECTED"}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                إرسال الرسالة التجريبية الآن
              </button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 text-xs text-slate-400">
            {status !== "CONNECTED" && (
              <span className="text-amber-500 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                يجب أن تكون الجلسة متصلة لتتمكن من إرسال الرسائل.
              </span>
            )}
            {status === "CONNECTED" && (
              <span className="text-emerald-500 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                الخدمة جاهزة لإرسال الرسائل الفورية للأرقام المحلية والدولية.
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
