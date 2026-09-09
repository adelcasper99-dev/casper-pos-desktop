"use client";

import { useState, useEffect } from "react";
import { CasperLogo } from "@/components/ui/CasperLogo";
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight, 
  Sparkles, 
  Building2, 
  User, 
  Lock, 
  Mail, 
  Phone, 
  KeyRound, 
  ShieldCheck, 
  RefreshCw,
  MessageSquare,
  Send,
  Bot
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Step 1 State
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugReason, setSlugReason] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "telegram">("whatsapp");
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);

  // Step 2 State
  const [otpCode, setOtpCode] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Step 3 State (Success & Redirect)
  const [createdSubdomain, setCreatedSubdomain] = useState("");
  const [targetLoginUrl, setTargetLoginUrl] = useState("");
  const [redirectCountdown, setRedirectCountdown] = useState(6);

  // Helper to slugify store name
  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  // Auto-generate slug when store name changes
  useEffect(() => {
    if (!slugTouched && storeName) {
      const generated = slugify(storeName);
      if (generated.length >= 3) {
        setSlug(generated);
      }
    }
  }, [storeName, slugTouched]);

  // Live slug checking with debounce
  useEffect(() => {
    if (!slug || slug.trim().length < 3) {
      setSlugAvailable(null);
      setSlugReason("");
      return;
    }

    const timer = setTimeout(async () => {
      setSlugChecking(true);
      try {
        const res = await fetch(`/api/tenant/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        setSlugAvailable(data.available);
        setSlugReason(data.reason || "");
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  // Resend OTP Cooldown Timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Step 3 Auto-Redirect Countdown
  useEffect(() => {
    if (step !== 3 || !targetLoginUrl) return;
    if (redirectCountdown <= 0) {
      window.location.href = targetLoginUrl;
      return;
    }
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [step, targetLoginUrl, redirectCountdown]);

  // Step 1: Request OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slugAvailable) {
      setError("يرجى اختيار معرف نصوص إنجليزية متاح لشركتك");
      return;
    }
    if (!phone || phone.trim().length < 8) {
      setError("يرجى إدخال رقم هاتف صحيح لإرسال رمز التحقق");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phone, 
          channel, 
          email: email.trim() || undefined,
          storeName: storeName.trim() || undefined
        })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "فشل إرسال رمز التحقق");
      } else {
        if (data.deepLink) {
          setTelegramDeepLink(data.deepLink);
        }
        setSuccessMessage(data.message || (channel === "telegram" ? "تم تجهيز رمز التحقق عبر تليجرام" : "تم إرسال رمز التحقق"));
        setStep(2);
        setResendCooldown(60);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع في الشبكة";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Re-send OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phone, 
          channel, 
          email: email.trim() || undefined,
          storeName: storeName.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "فشل إعادة إرسال الرمز");
      } else {
        if (data.deepLink) {
          setTelegramDeepLink(data.deepLink);
        }
        setSuccessMessage(data.message || "تمت إعادة إرسال الرمز بنجاح");
        setResendCooldown(60);
      }
    } catch {
      setError("تعذر الاتصال بالخادم لإعادة الإرسال");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP and Provision Account
  const handleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.trim().length !== 6) {
      setError("يرجى إدخال رمز التحقق المكون من 6 أرقام");
      return;
    }
    if (!adminUsername || adminUsername.trim().length < 3) {
      setError("اسم المستخدم يجب أن يكون 3 أحرف على الأقل");
      return;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Verify OTP
      let token = verificationToken;
      if (!token) {
        const verifyRes = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, otp: otpCode.trim() })
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.verificationToken) {
          setError(verifyData.error || "رمز التحقق غير صحيح");
          setLoading(false);
          return;
        }
        token = verifyData.verificationToken;
        setVerificationToken(token);
      }

      // 2. Provision Tenant with Token
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          slug,
          adminUsername,
          adminPassword,
          email,
          phone,
          verificationToken: token
        })
      });

      const signupData = await signupRes.json();

      if (!signupRes.ok || signupData.error) {
        setError(signupData.error || "فشل تدشين الحساب");
        setLoading(false);
      } else {
        const subdomain = signupData.subdomain || slug;
        setCreatedSubdomain(subdomain);

        const isProdDomain = typeof window !== "undefined" && window.location.hostname.includes("casper-erp.com");
        const loginUrl = isProdDomain
          ? `https://${subdomain}.casper-erp.com/login`
          : `/login`;

        setTargetLoginUrl(loginUrl);
        setStep(3);
        setLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء إتمام التسجيل";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-white font-cairo overflow-hidden" dir="rtl">
      {/* Background Decorative Glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="w-full max-w-xl mx-auto flex flex-col justify-center p-6 md:p-10 z-10">
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <CasperLogo width={76} height={76} className="shadow-2xl ring-4 ring-emerald-500/20 rounded-2xl" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>تجربة مجانية كاملة لمدة 14 يوماً بدون بطاقة دفع</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-2">
            ابدأ حساب نشاطك التجاري فوراً
          </h1>
          <p className="text-slate-400 text-xs md:text-sm font-semibold">
            نظام Casper ERP & POS المتكامل لإدارة المبيعات، المخزون، والحسابات
          </p>

          {/* Stepper Indicator */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              step === 1 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-900 text-slate-400"
            }`}>
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">1</span>
              <span>بيانات المتجر والهاتف</span>
            </div>
            <span className="h-0.5 w-6 bg-slate-800" />
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              step === 2 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-900 text-slate-500"
            }`}>
              <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">2</span>
              <span>تأكيد الـ OTP</span>
            </div>
            <span className="h-0.5 w-6 bg-slate-800" />
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              step === 3 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-900 text-slate-500"
            }`}>
              <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">3</span>
              <span>الدخول للمتجر</span>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-xl text-sm mb-4 text-center font-bold flex items-center justify-center gap-2 animate-in fade-in">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && step !== 3 && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl text-xs mb-4 text-center font-bold flex items-center justify-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* STEP 1: Store Details & Phone */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} className="space-y-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-6 md:p-8 rounded-2xl shadow-2xl animate-in fade-in">
            
            {/* Store Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>اسم النشاط التجاري / الشركة</span>
              </label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثال: المتجر الذهبي للتجارة"
                className="w-full bg-slate-950 border border-slate-800 h-12 px-4 rounded-xl text-white font-bold placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            {/* Subdomain Slug */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">
                رابط النطاق الفرعي (Subdomain)
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    setSlugTouched(true);
                  }}
                  placeholder="golden-store"
                  className="w-full bg-slate-950 border border-slate-800 h-12 pl-36 pr-4 rounded-xl text-white font-mono font-bold placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all text-left dir-ltr"
                />
                <span className="absolute left-3 text-xs font-bold text-slate-500 dir-ltr select-none pointer-events-none">
                  .casper-erp.com
                </span>
              </div>

              {/* Slug status badge */}
              <div className="flex items-center gap-2 pt-1 text-xs">
                {slugChecking && (
                  <span className="text-slate-400 flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    جارٍ التحقق من التوفر...
                  </span>
                )}
                {!slugChecking && slugAvailable === true && (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    رابط متاح للإنشاء!
                  </span>
                )}
                {!slugChecking && slugAvailable === false && (
                  <span className="text-red-400 font-bold flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {slugReason}
                  </span>
                )}
              </div>
            </div>

            {/* Channel Selector */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-slate-300 block">
                طريقة استلام رمز التحقق (OTP Channel)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setChannel("whatsapp")}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border font-bold text-xs transition-all ${
                    channel === "whatsapp"
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/10"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                  }`}
                >
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>عبر واتساب</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChannel("telegram")}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border font-bold text-xs transition-all ${
                    channel === "telegram"
                      ? "bg-blue-500/20 border-blue-500 text-blue-400 shadow-md shadow-blue-500/10"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                  }`}
                >
                  <Send className="w-4 h-4 text-blue-400" />
                  <span>عبر تليجرام</span>
                </button>
              </div>
            </div>

            {/* Phone Number (Mandatory for OTP) */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>رقم الهاتف / {channel === "telegram" ? "التليجرام" : "الواتساب"}</span>
                </span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md font-bold">
                  {channel === "telegram" ? "يصلك الكود عبر تليجرام" : "يصلك كود التفعيل عليه"}
                </span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678 أو +201012345678"
                className="w-full bg-slate-950 border border-slate-800 h-12 px-4 rounded-xl text-white font-mono font-bold placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all dir-ltr text-right"
              />
            </div>

            {/* Optional Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 block flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-500" />
                <span>البريد الإلكتروني (اختياري)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-slate-950 border border-slate-800 h-12 px-4 rounded-xl text-white font-bold placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            {/* Send OTP Button */}
            <button
              type="submit"
              disabled={loading || slugAvailable === false || !phone}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-14 rounded-xl mt-4 flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 text-base disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>إرسال رمز التحقق ({channel === "telegram" ? "تليجرام" : "واتساب"})</span>
                  <ArrowLeft className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <a href="/login" className="text-xs font-bold text-slate-400 hover:text-white transition-colors">
                لديك حساب بالفعل؟ تسجيل الدخول
              </a>
            </div>
          </form>
        )}

        {/* STEP 2: Enter OTP & Admin Credentials */}
        {step === 2 && (
          <form onSubmit={handleCompleteSignup} className="space-y-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-6 md:p-8 rounded-2xl shadow-2xl animate-in fade-in">
            
            {/* Channel & Phone Info Pill */}
            <div className="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-400">إرسال الرمز ({channel === "telegram" ? "تليجرام" : "واتساب"}):</span>
                <span className="text-white font-mono font-bold">{phone}</span>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-bold text-cyan-400 hover:underline"
              >
                تعديل الرقم والقناة
              </button>
            </div>

            {/* Telegram 1-Click Action Button */}
            {channel === "telegram" && telegramDeepLink && (
              <div className="space-y-2">
                <a
                  href={telegramDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2.5 p-4 bg-gradient-to-r from-blue-600 via-sky-500 to-blue-600 hover:from-blue-500 hover:to-sky-400 text-white rounded-xl font-black text-sm shadow-xl shadow-blue-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] border border-blue-400/30"
                >
                  <Send className="w-5 h-5 animate-pulse" />
                  <span>📲 اضغط هنا لفتح تليجرام واستلام رمز التحقق فوراً</span>
                </a>
                <p className="text-[11px] text-center text-slate-400">
                  سيفتح التطبيق ويظهر لك كود التحقق في رسالة تلقائية بنقرة واحدة
                </p>
              </div>
            )}

            {/* OTP Code Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <span>رمز التحقق (6 أرقام)</span>
                </span>
                {resendCooldown > 0 ? (
                  <span className="text-[11px] text-slate-400 font-mono">
                    إعادة الإرسال بعد {resendCooldown} ثانية
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-[11px] text-emerald-400 hover:underline font-bold flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>إعادة إرسال الرمز</span>
                  </button>
                )}
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="123456"
                className="w-full bg-slate-950 border border-emerald-500/40 h-14 px-4 rounded-xl text-emerald-400 font-mono font-black text-2xl tracking-[0.5em] text-center focus:border-emerald-400 outline-none transition-all placeholder:tracking-normal placeholder:text-slate-700"
              />
            </div>

            {/* Admin Credentials Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span>اسم مستخدم المدير</span>
                </label>
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full bg-slate-950 border border-slate-800 h-12 px-4 rounded-xl text-white font-bold placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>كلمة المرور</span>
                </label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 h-12 px-4 rounded-xl text-white font-bold placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Complete Registration Button */}
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-14 rounded-xl mt-4 flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 text-base disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>تأكيد الحساب وبدء التجربة المجانية (14 يوماً)</span>
                  <ArrowLeft className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                رجوع للخطوة السابقة
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Store Provisioned Success Screen */}
        {step === 3 && (
          <div className="space-y-6 bg-slate-900/80 backdrop-blur-xl border border-emerald-500/30 p-8 rounded-2xl shadow-2xl animate-in zoom-in-95 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/10">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">
                🎉 تم إنشاء متجرك بنجاح!
              </h2>
              <p className="text-slate-300 text-sm font-semibold">
                تم تفعيل النسخة السحابية والفترة التجريبية المجانية (14 يوماً) لمتجرك:
              </p>
              <div className="inline-block px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-emerald-400 font-bold text-sm mt-1 dir-ltr">
                https://{createdSubdomain}.casper-erp.com
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl text-right space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300 font-bold">
                <span className="text-slate-500">اسم المستخدم:</span>
                <span className="font-mono text-white bg-slate-900 px-2 py-0.5 rounded">{adminUsername}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300 font-bold">
                <span className="text-slate-500">اسم المتجر:</span>
                <span className="text-white">{storeName}</span>
              </div>
              <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-900">
                يرجى تسجيل الدخول إلى لوحة تحكم متجرك باستخدام بيانات المدير أعلاه للبدء.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <a
                href={targetLoginUrl}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-14 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 text-base"
              >
                <span>الانتقال لصفحة تسجيل الدخول لمتجرك الآن</span>
                <ArrowLeft className="w-5 h-5" />
              </a>

              <p className="text-[11px] text-slate-500 font-bold flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                <span>سيتم تحويلك تلقائياً لصفحة الدخول خلال {redirectCountdown} ثوانٍ...</span>
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
