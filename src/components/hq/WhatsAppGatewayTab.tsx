"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  getWhatsAppGatewayStatus, 
  resetWhatsAppGateway, 
  sendWhatsAppTestMessage 
} from "@/actions/hq-whatsapp-actions";
import { 
  CheckCircle2, 
  Loader2, 
  Smartphone, 
  RefreshCw, 
  Send, 
  QrCode, 
  ShieldCheck, 
  AlertTriangle,
  LogOut,
  MessageSquare,
  Copy,
  Check
} from "lucide-react";
import { toast } from "sonner";
import { generateCSRFToken } from "@/lib/csrf-client";

type WhatsAppStatus = "CONNECTED" | "SCAN_QR" | "DISCONNECTED" | "UNKNOWN";

export function WhatsAppGatewayTab() {
  const [status, setStatus] = useState<WhatsAppStatus>("UNKNOWN");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("مرحباً بك في كاسبر ERP! رمز التحقق التجريبي هو: 589234");
  const [sendingTest, setSendingTest] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [copied, setCopied] = useState(false);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);

  const statusRef = useRef<WhatsAppStatus>(status);
  statusRef.current = status;

  const fetchStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await getWhatsAppGatewayStatus();
      if (res.success && res.status) {
        setStatus(res.status);
        setQrCode(res.qrCode || null);
        setPhoneNumber(res.phoneNumber || null);
        setLastCheck(new Date());
      } else {
        setStatus("DISCONNECTED");
        setPhoneNumber(null);
      }
    } catch {
      setStatus("DISCONNECTED");
      setPhoneNumber(null);
    } finally {
      if (!isSilent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Fast polling (every 2s) when waiting for QR scan, otherwise poll every 8s
    const interval = setInterval(() => {
      fetchStatus(true);
    }, status === "SCAN_QR" ? 2000 : 8000);

    return () => clearInterval(interval);
  }, [fetchStatus, status]);

  const handleResetOrDisconnect = async () => {
    setLoading(true);
    setShowConfirmDisconnect(false);
    try {
      const res = await resetWhatsAppGateway();
      if (res.success) {
        toast.info("تمت إعادة تعيين الجلسة. جارٍ توليد رمز QR جديد...");
        setStatus("SCAN_QR");
        setQrCode(null);
        setPhoneNumber(null);
        // Wait 2.5 seconds for Baileys to boot socket and produce new QR
        setTimeout(() => {
          fetchStatus();
        }, 2500);
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

  const handleCopyPhone = () => {
    if (!phoneNumber) return;
    navigator.clipboard.writeText(phoneNumber);
    setCopied(true);
    toast.success("تم نسخ الرقم إلى الحافظة");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error("يرجى إدخال رقم هاتف صحيح مع كود الدولة");
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
      {/* Top Banner: Status & Global Actions */}
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
                    بانتظار مسح رمز QR
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
            
            {status === "CONNECTED" ? (
              <button
                onClick={() => setShowConfirmDisconnect(true)}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                فصل الرقم وربط حساب جديد
              </button>
            ) : (
              <button
                onClick={handleResetOrDisconnect}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                توليد رمز QR جديد
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Disconnect */}
      {showConfirmDisconnect && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="font-black text-lg">تأكيد فصل حساب الواتساب</h4>
            </div>
            <p className="text-slate-600 dark:text-zinc-300 text-sm leading-relaxed">
              هل أنت متأكد من رغبتك في فصل الحساب المرتبط حالياً 
              {phoneNumber ? <strong className="font-mono text-rose-600 dark:text-rose-400 mx-1">({phoneNumber})</strong> : ""}?
              سيتم مسح الجلسة فوراً وتوليد رمز QR جديد لربط رقم آخر.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirmDisconnect(false)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 font-bold text-xs"
              >
                إلغاء
              </button>
              <button
                onClick={handleResetOrDisconnect}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                نعم، افصل الحساب الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid Section: QR / Connection Card + Test Dispatcher */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Card 1: Connection & QR Scanner */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-500" />
                حالة الجلسة والربط (Baileys Session)
              </h4>
              {status === "SCAN_QR" && (
                <span className="text-[11px] font-bold text-amber-500 flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  استطلاع حي مستمر...
                </span>
              )}
            </div>

            {/* View 1: CONNECTED */}
            {status === "CONNECTED" && (
              <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/30">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h5 className="font-black text-lg text-emerald-700 dark:text-emerald-400">واتساب متصل وجاهز للعمل</h5>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    السيرفر متصل بنجاح ويرسل رسائل الـ OTP والفواتير بشكل فوري.
                  </p>
                </div>

                {/* Connected Phone Number Badge */}
                {phoneNumber && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 shadow-sm">
                    <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">الرقم المربوط:</span>
                    <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400 dir-ltr">
                      +{phoneNumber}
                    </span>
                    <button
                      onClick={handleCopyPhone}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                      title="نسخ الرقم"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => setShowConfirmDisconnect(true)}
                    className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    تغيير الرقم أو ربط حساب واتساب آخر
                  </button>
                </div>
              </div>
            )}

            {/* View 2: SCAN_QR (Live QR Stream) */}
            {status === "SCAN_QR" && qrImageUrl && (
              <div className="flex flex-col items-center justify-center text-center space-y-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                <div className="p-3 bg-white rounded-2xl shadow-xl border border-slate-200 inline-block">
                  <img src={qrImageUrl} alt="WhatsApp QR" className="w-60 h-60 object-contain" />
                </div>
                <div>
                  <h5 className="text-base font-black text-amber-800 dark:text-amber-300">
                    امسح رمز QR من هاتفك الآن
                  </h5>
                  <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 max-w-sm">
                    افتح واتساب على هاتفك &larr; الإعدادات &larr; الأجهزة المرتبطة &larr; ربط جهاز &larr; وجه الكاميرا نحو الشاشة.
                  </p>
                  <p className="text-[11px] text-amber-600/80 font-bold mt-2">
                    ⚡ سيتحول النظام تلقائياً إلى الحالة الخضراء فور مسح الرمز.
                  </p>
                </div>
              </div>
            )}

            {/* View 3: DISCONNECTED or Generating QR */}
            {(status === "DISCONNECTED" || (status === "SCAN_QR" && !qrImageUrl)) && (
              <div className="p-8 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-400 flex items-center justify-center">
                  {loading ? <Loader2 className="w-8 h-8 animate-spin text-blue-500" /> : <Smartphone className="w-8 h-8" />}
                </div>
                <div>
                  <h5 className="font-black text-slate-800 dark:text-zinc-200">
                    {loading ? "جارٍ إعداد الجلسة وتوليد رمز QR..." : "لا توجد جلسة واتساب نشطة"}
                  </h5>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm">
                    اضغط على الزر أدناه لتوليد رمز الاستجابة السريعة (QR) وربط حساب الواتساب الخاص بالمنظومة.
                  </p>
                </div>

                {!loading && (
                  <button
                    onClick={handleResetOrDisconnect}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    توليد رمز QR للربط
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>المنفذ الداخلي: <code>Port 3005</code></span>
            <span>آخر فحص: <code>{lastCheck.toLocaleTimeString("ar-EG")}</code></span>
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
                  رقم الهاتف التجريبي (مع كود الدولة)
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
