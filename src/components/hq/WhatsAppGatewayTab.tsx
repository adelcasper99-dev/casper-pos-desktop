"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  getWhatsAppGatewayStatus, 
  resetWhatsAppGateway, 
  sendWhatsAppTestMessage,
  testTelegramBotAction,
  sendTelegramTestMessageAction,
  getTelegramConfigAction
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
  Check,
  SendHorizontal,
  Bot,
  Key,
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import { generateCSRFToken } from "@/lib/csrf-client";

type WhatsAppStatus = "CONNECTED" | "SCAN_QR" | "DISCONNECTED" | "UNKNOWN";

export function WhatsAppGatewayTab() {
  // WhatsApp States
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

  // Telegram States
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("🔐 كود التحقق التجريبي في Casper ERP هو: [ 849201 ]");
  const [botStatus, setBotStatus] = useState<{ connected: boolean; username?: string; botName?: string }>({ connected: false });
  const [testingBot, setTestingBot] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);

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

  const fetchTelegramConfig = useCallback(async () => {
    try {
      const cfg = await getTelegramConfigAction();
      if (cfg.success) {
        if (cfg.configuredChatId) setChatId(cfg.configuredChatId);
        if (cfg.hasToken) {
          const testRes = await testTelegramBotAction();
          if (testRes.success) {
            setBotStatus({
              connected: true,
              username: testRes.username,
              botName: testRes.botName
            });
          }
        }
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchTelegramConfig();

    const interval = setInterval(() => {
      fetchStatus(true);
    }, status === "SCAN_QR" ? 2000 : 8000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchTelegramConfig, status]);

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

  const handleSendWhatsAppTest = async (e: React.FormEvent) => {
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

  const handleTestTelegramBot = async () => {
    setTestingBot(true);
    try {
      const res = await testTelegramBotAction(botToken.trim() || undefined);
      if (res.success) {
        setBotStatus({
          connected: true,
          username: res.username,
          botName: res.botName
        });
        toast.success(`تم الاتصال بالبوت بنجاح: @${res.username}`);
      } else {
        setBotStatus({ connected: false });
        toast.error(res.error || "فشل الاتصال بالبوت. تأكد من صحة الـ Token.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "خطأ أثناء اختبار البوت");
    } finally {
      setTestingBot(false);
    }
  };

  const handleSendTelegramTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId.trim()) {
      toast.error("يرجى إدخال Chat ID أو Group ID");
      return;
    }
    setSendingTelegram(true);
    try {
      const res = await sendTelegramTestMessageAction({
        botToken: botToken.trim() || undefined,
        chatId: chatId.trim(),
        message: telegramMessage.trim()
      });
      if (res.success) {
        toast.success(res.message || "تم إرسال رسالة تليجرام بنجاح!");
      } else {
        toast.error(res.error || "فشل إرسال رسالة تليجرام");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "حدث خطأ أثناء الإرسال");
    } finally {
      setSendingTelegram(false);
    }
  };

  const qrImageUrl = qrCode 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`
    : null;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner: Gateways Overview */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-indigo-500/10 text-emerald-500 border border-slate-200 dark:border-white/10">
              <MessageSquare className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">بوابات الرسائل والتحقق (Messaging Gateways)</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                  Dual-Channel (واتساب + تليجرام)
                </span>
              </div>
              <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1">
                إدارة القنوات الموحدة لإرسال أكواد التحقق (OTPs)، إشعارات الفواتير، والرد الآلي الذكي لكافة المستأجرين.
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
              تحديث القنوات
            </button>
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

      {/* Grid: WhatsApp Gateway & Telegram Bot Gateway */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ── CHANNEL 1: WhatsApp Gateway ── */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900 dark:text-white">بوابة واتساب (WhatsApp Socket)</h4>
                  <span className="text-[11px] text-slate-400">محرك Baileys المباشر</span>
                </div>
              </div>

              {status === "CONNECTED" && (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  متصل
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

            {/* View 1: CONNECTED */}
            {status === "CONNECTED" && (
              <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col items-center text-center space-y-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-black text-sm text-emerald-700 dark:text-emerald-400">الجلسة نشطة ومتصلة</h5>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    جاهز لإرسال الرسائل الفورية للأرقام المباشرة.
                  </p>
                </div>

                {phoneNumber && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 shadow-sm">
                    <span className="text-xs font-bold text-slate-600 dark:text-zinc-300">الرقم المربوط:</span>
                    <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 dir-ltr">
                      +{phoneNumber}
                    </span>
                    <button
                      onClick={handleCopyPhone}
                      className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      title="نسخ الرقم"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setShowConfirmDisconnect(true)}
                  className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 pt-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  فصل الرقم وربط حساب جديد
                </button>
              </div>
            )}

            {/* View 2: SCAN_QR */}
            {status === "SCAN_QR" && qrImageUrl && (
              <div className="flex flex-col items-center justify-center text-center space-y-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 mb-4">
                <div className="p-2 bg-white rounded-xl shadow-md border border-slate-200 inline-block">
                  <img src={qrImageUrl} alt="WhatsApp QR" className="w-48 h-48 object-contain" />
                </div>
                <div>
                  <h5 className="text-sm font-black text-amber-800 dark:text-amber-300">
                    امسح رمز QR من هاتفك الآن
                  </h5>
                  <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-0.5">
                    افتح واتساب &larr; الأجهزة المرتبطة &larr; ربط جهاز
                  </p>
                </div>
              </div>
            )}

            {/* View 3: DISCONNECTED */}
            {(status === "DISCONNECTED" || (status === "SCAN_QR" && !qrImageUrl)) && (
              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-white/5 flex flex-col items-center text-center space-y-3 mb-4">
                <Smartphone className="w-10 h-10 text-slate-400" />
                <div>
                  <h5 className="font-bold text-xs text-slate-700 dark:text-zinc-300">
                    لا توجد جلسة واتساب نشطة
                  </h5>
                </div>
                <button
                  onClick={handleResetOrDisconnect}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                  توليد رمز QR للربط
                </button>
              </div>
            )}

            {/* WhatsApp Test Sandbox */}
            <form onSubmit={handleSendWhatsAppTest} className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300">
                مختبر إرسال واتساب (رقم الهاتف مع كود الدولة)
              </label>
              <input
                type="tel"
                required
                placeholder="مثال: 201012345678"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                dir="ltr"
                className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-3 py-2 font-mono text-xs focus:border-emerald-500 outline-none text-left"
              />
              <textarea
                rows={2}
                required
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl p-2.5 text-xs focus:border-emerald-500 outline-none resize-none"
                placeholder="نص رسالة الواتساب..."
              />
              <button
                type="submit"
                disabled={sendingTest || status !== "CONNECTED"}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {sendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                إرسال واتساب تجريبي
              </button>
            </form>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
            <span>المنفذ: <code>Port 3005</code></span>
            <span>آخر فحص: <code>{lastCheck.toLocaleTimeString("ar-EG")}</code></span>
          </div>
        </div>

        {/* ── CHANNEL 2: Telegram Bot Gateway ── */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900 dark:text-white">بوابة تليجرام (Telegram Bot API)</h4>
                  <span className="text-[11px] text-slate-400">القناة الاحتياطية الرسمية السحابية</span>
                </div>
              </div>

              {botStatus.connected ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  @{botStatus.username}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400">
                  غير مربوط
                </span>
              )}
            </div>

            {/* Telegram Bot Token Input & Verification */}
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  رمز البوت (Telegram Bot Token):
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="password"
                      placeholder="مثال: 1234567890:ABCdefGHIjkl..."
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 font-mono text-xs focus:border-blue-500 outline-none dir-ltr"
                    />
                    <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                  <button
                    onClick={handleTestTelegramBot}
                    disabled={testingBot}
                    className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 whitespace-nowrap shadow-sm disabled:opacity-50"
                  >
                    {testingBot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                    فحص البوت
                  </button>
                </div>
              </div>

              {botStatus.connected && (
                <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-blue-500" />
                  <span>البوت نشط: <strong>{botStatus.botName}</strong> (@{botStatus.username})</span>
                </div>
              )}
            </div>

            {/* Telegram Test Sender Form */}
            <form onSubmit={handleSendTelegramTest} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  معرّف المحادثة (Chat ID / Group ID):
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 12345678 أو -1001234567890"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  dir="ltr"
                  className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-3 py-2 font-mono text-xs focus:border-blue-500 outline-none text-left"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  نص الرسالة:
                </label>
                <textarea
                  rows={2}
                  required
                  value={telegramMessage}
                  onChange={(e) => setTelegramMessage(e.target.value)}
                  className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl p-2.5 text-xs focus:border-blue-500 outline-none resize-none"
                  placeholder="نص رسالة تليجرام..."
                />
              </div>

              {/* Telegram Presets */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTelegramMessage("🔐 <b>كود تحقق جديد:</b> <code>[ 591820 ]</code>")}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 hover:bg-slate-200"
                >
                  كود OTP
                </button>
                <button
                  type="button"
                  onClick={() => setTelegramMessage("🚀 <b>تنبيه نظام:</b> مستأجر جديد قام بالتسجيل عبر الموقع الآن!")}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 hover:bg-slate-200"
                >
                  تنبيه تسجيل جديد
                </button>
              </div>

              <button
                type="submit"
                disabled={sendingTelegram}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-md shadow-blue-600/20"
              >
                {sendingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizontal className="w-3.5 h-3.5" />}
                إرسال تليجرام تجريبي الآن
              </button>
            </form>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
              قناة سحابية مباشرة (Uptime 100%)
            </span>
            <span className="text-[10px]">REST API v7.0</span>
          </div>
        </div>

      </div>
    </div>
  );
}
