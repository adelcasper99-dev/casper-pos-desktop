"use client";

import { login } from "@/actions/auth";
import { useState, useEffect, useRef } from "react";
import { CasperLogo } from "@/components/ui/CasperLogo";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { useRouter } from "next/navigation";

export default function LoginForm() {
    const t = useTranslations('Auth');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [username, setUsername] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const quotes = [
        { text: "إن الله يحب إذا عمل أحدكم عملاً أن يتقنه", author: "حديث شريف" },
        { text: "التاجر الصدوق الأمين مع النبيين والصديقين", author: "حديث شريف" },
        { text: "تسعة أعشار الرزق في التجارة", author: "أثر مأثور" },
        { text: "اللهم بارك لأمتي في بُكورها", author: "حديث شريف" },
        { text: "رحم الله رجلاً سمحاً إذا باع وإذا اشترى", author: "حديث شريف" },
        { text: "أعطوا الأجير أجره قبل أن يجف عرقه", author: "حديث شريف" },
        { text: "ما فاز باللذات إلا الجسور", author: "حكمة عربية" },
        { text: "المسلمون على شروطهم", author: "قاعدة نبوية" },
        { text: "وفي السعيِ كسبٌ وفي الحركةِ بركة", author: "مثل عربي" },
        { text: "استنزلوا الرزق بالصدقة", author: "قول مأثور" },
        { text: "السماء لا تمطر ذهباً ولا فضة", author: "عمر بن الخطاب" },
        { text: "نعم المال الصالح للرجل الصالح", author: "حديث شريف" },
        { text: "القناعة كنزٌ لا يفنى", author: "علي بن أبي طالب" },
        { text: "من بات كالاً من عمل يده بات مغفوراً له", author: "أثر مأثور" },
        { text: "الأمانة تجلب الرزق، والخيانة تجلب الفقر", author: "حكمة" },
        { text: "فإن صدقا وبينا بُورك لهما في بيعهما", author: "حديث شريف" },
        { text: "ما نقصت صدقة من مال.. بل تزيده", author: "حديث شريف" },
        { text: "اليد العليا خير من اليد السفلى", author: "حديث شريف" },
        { text: "أطب مطعمك تكن مستجاب الدعوة", author: "حديث شريف" },
        { text: "التجارة شجاعة، والربح رزق، والصدق بركة", author: "حكمة قديمة" },
        { text: "من غش فليس منا", author: "حديث شريف" },
        { text: "لا يقعدن أحدكم عن طلب الرزق", author: "عمر بن الخطاب" },
        { text: "كنت أرفع الحجر فأتوقع أن أجد تحته ذهباً", author: "عبد الرحمن بن عوف" },
        { text: "الرزق يحب السعي والمثابرة", author: "حكمة" },
        { text: "ما أكل أحد طعاماً قط خيراً من عمل يده", author: "حديث شريف" }
    ];

    const [currentQuote, setCurrentQuote] = useState<{ text: string, author: string } | null>(null);

    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        setCurrentQuote(quotes[Math.floor(Math.random() * quotes.length)]);

        const storedUsername = localStorage.getItem('rememberedAccount');
        const storedRememberMe = localStorage.getItem('rememberMe') === 'true';
        if (storedUsername && storedRememberMe) {
            setUsername(storedUsername);
            setRememberMe(storedRememberMe);
        }

        usernameRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleUsernameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            passwordRef.current?.focus();
        }
    };

    const handleSubmit = async (formData: FormData) => {
        setLoading(true);
        setError("");

        try {
            const res = await login(formData);

            if (res?.success === false) {
                setError(res.message);
                setLoading(false);
            } else {
                localStorage.setItem('rememberMe', rememberMe.toString());
                localStorage.setItem('sessionStart', Date.now().toString());
                if (rememberMe) {
                    localStorage.setItem('rememberedAccount', formData.get('username') as string);
                } else {
                    localStorage.removeItem('rememberedAccount');
                }
                router.refresh();
                router.push('/dashboard');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred");
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-[var(--login-bg)] dark:bg-[#0d0d0d] transition-all duration-700 font-cairo overflow-hidden" dir="rtl">

            {/* ══ RIGHT PANEL: Brand + Quote ══════════════════════════════ */}
            <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden items-center justify-center bg-[var(--login-split-bg)] dark:bg-[#111214] transition-colors duration-700">

                {/* Subtle grid overlay */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)",
                    backgroundSize: "48px 48px"
                }} />

                {/* Glow orbs */}
                <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-[#3B6978]/15 blur-[140px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-[#DDAF4C]/10 blur-[140px] rounded-full animate-pulse delay-1000" />

                {/* Large Logo Watermark */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                        className="rounded-full bg-slate-200/50 dark:bg-white/[0.03] flex items-center justify-center"
                        style={{
                            width: 380,
                            height: 380,
                            border: "3px solid var(--primary)",
                            borderTop: "3px solid transparent",
                            boxShadow: "0 0 120px rgba(59,105,120,0.12)",
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/assets/casper-light.png"
                            alt=""
                            className="w-[60%] h-[60%] object-contain opacity-10 dark:opacity-5"
                        />
                    </div>
                </div>

                {/* Quote content */}
                <div className="relative z-10 flex flex-col items-center text-center max-w-xl px-10">
                    <div className="text-[120px] leading-none text-slate-300 dark:text-white/20 font-serif mb-[-20px] select-none">"</div>
                    <p className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white/90 leading-relaxed mb-8 drop-shadow-sm">
                        {currentQuote?.text}
                    </p>
                    <div className="flex items-center gap-4">
                        <div className="h-px w-14 bg-[var(--primary)]/50 rounded-full" />
                        <span className="text-sm font-bold text-slate-500 dark:text-zinc-400 tracking-widest uppercase">
                            {currentQuote?.author}
                        </span>
                        <div className="h-px w-14 bg-[var(--primary)]/50 rounded-full" />
                    </div>
                    <div className="h-1 bg-gradient-to-r from-primary to-accent rounded-full mb-4 self-center animate-shimmer" style={{ width: '40px' }}></div>
                </div>

                {/* Bottom stamp */}
                <div className="absolute bottom-8 left-10 opacity-20 text-left">
                    <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.3em]">CASPER ERP</p>
                    <p className="text-[10px] text-slate-500 dark:text-white/50 tracking-widest">Enterprise Platform</p>
                </div>
            </div>

            {/* ══ LEFT PANEL: Login Form ═══════════════════════════════════ */}
            <div className="w-full lg:w-2/5 flex flex-col items-center justify-center p-8 md:p-14 bg-white dark:bg-zinc-950 z-20 transition-colors duration-700 shadow-[-30px_0_60px_rgba(0,0,0,0.06)] dark:shadow-[-30px_0_60px_rgba(0,0,0,0.4)]">
                <div className="w-full max-w-sm">

                    {/* Header */}
                    <div className="mb-10 text-center">
                        <div className="mb-6 flex justify-center">
                            <CasperLogo width={96} height={96} className="shadow-2xl ring-4 ring-[var(--primary)]/10" />
                        </div>
                        <h2 className="text-xs font-black text-[var(--primary)] uppercase tracking-[0.4em] mb-3">
                            Casper Pro
                        </h2>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                            بسم الله توكلنا على الله
                        </h1>
                        <p className="text-slate-400 dark:text-zinc-500 text-sm font-semibold">
                            {t('subtitle')}
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-500/10 border-2 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-300 p-4 rounded-2xl text-sm mb-6 text-center font-black">
                            {error}
                        </div>
                    )}

                    {/* Form */}
                    <form action={handleSubmit} className="space-y-5">

                        {/* Username */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-black tracking-[0.25em] block px-1">
                                {t('username')}
                            </label>
                            <input
                                ref={usernameRef}
                                name="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyDown={handleUsernameKeyDown}
                                className="w-full bg-slate-50 dark:bg-zinc-900/60 border-2 border-slate-100 dark:border-white/5 h-14 text-base font-black px-5 focus:bg-white dark:focus:bg-zinc-900 focus:border-[var(--primary)] dark:focus:border-[var(--primary)] outline-none transition-all rounded-xl text-slate-900 dark:text-white"
                                required
                                autoComplete="username"
                                placeholder="..."
                            />
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-end px-1">
                                <label className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-black tracking-[0.25em] block">
                                    {t('password')}
                                </label>
                                <button type="button" className="text-[10px] font-black text-slate-400 hover:text-[var(--primary)] transition-colors uppercase tracking-wider">
                                    نسيت كلمة المرور؟
                                </button>
                            </div>
                            <input
                                ref={passwordRef}
                                type="password"
                                name="password"
                                className="w-full bg-slate-50 dark:bg-zinc-900/60 border-2 border-slate-100 dark:border-white/5 h-14 text-base font-black px-5 focus:bg-white dark:focus:bg-zinc-900 focus:border-[var(--primary)] dark:focus:border-[var(--primary)] outline-none transition-all rounded-xl text-slate-900 dark:text-white"
                                required
                                autoComplete="off"
                                placeholder="••••••••"
                            />
                        </div>

                        {/* Remember Me */}
                        <div className="flex items-center gap-3 py-1 group cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
                            <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center flex-shrink-0 ${rememberMe ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900'}`}>
                                {rememberMe && <div className="w-2 h-2 bg-white rounded-sm" />}
                            </div>
                            <span className="text-sm font-bold text-slate-500 dark:text-zinc-400 group-hover:text-[var(--primary)] transition-colors">
                                {t('rememberMe')}
                            </span>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-black py-4 rounded-xl mt-2 flex justify-center items-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-[var(--primary)]/20 text-base uppercase tracking-widest group overflow-hidden relative disabled:opacity-60"
                        >
                            <div className="absolute inset-0 bg-primary/40 backdrop-blur-3xl animate-pulse" />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                            {loading ? (
                                <Loader2 className="animate-spin w-5 h-5" />
                            ) : (
                                <span>{t('login')}</span>
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-12 text-center border-t border-slate-100 dark:border-white/5 pt-6">
                        <p className="text-[9px] text-slate-300 dark:text-zinc-700 font-black uppercase tracking-[0.4em]">
                            © 2026 CASPER ERP • PLATFORM PRO
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}
