"use client";

import { useState, useEffect } from "react";
import { CasperLogo } from "@/components/ui/CasperLogo";
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft, Sparkles, Building2, User, Lock, Mail, Phone } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugReason, setSlugReason] = useState("");

  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Helper to slugify store name
  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  // Auto-generate slug when store name changes (if user hasn't manually edited slug)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slugAvailable) {
      setError("يرجى اختيار معرف نصوص إنجليزية متاح لشركتك");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          slug,
          adminUsername,
          adminPassword,
          email,
          phone
        })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "فشل تسجيل الحساب");
        setLoading(false);
      } else {
        router.refresh();
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err?.message || "حدث خطأ غير متوقع في الشبكة");
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
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <CasperLogo width={80} height={80} className="shadow-2xl ring-4 ring-emerald-500/20 rounded-2xl" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>تجربة مجانية كاملة لمدة 14 يوماً</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white mb-2">
            ابدأ حساب نشاطك التجاري فوراً
          </h1>
          <p className="text-slate-400 text-sm font-semibold">
            نظام Casper ERP & POS المتكامل لإدارة المبيعات، المخزون، والحسابات
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-xl text-sm mb-6 text-center font-bold flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-6 md:p-8 rounded-2xl shadow-2xl">
          
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

          {/* Contact Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
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

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>رقم الهاتف (اختياري)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01000000000"
                className="w-full bg-slate-950 border border-slate-800 h-12 px-4 rounded-xl text-white font-bold placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || slugAvailable === false}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-14 rounded-xl mt-4 flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 uppercase tracking-wider text-base disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>إنشاء الحساب وتدشين المتجر</span>
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

      </div>
    </div>
  );
}
