"use client";

import { login } from "@/actions/auth";
import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { useRouter } from "next/navigation";

export default function LoginForm() {
    const t = useTranslations('Auth');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [username, setUsername] = useState("");
    const [rememberMe, setRememberMe] = useState(false);

    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    const router = useRouter();

    useEffect(() => {
        const storedUsername = localStorage.getItem('rememberedAccount');
        const storedRememberMe = localStorage.getItem('rememberMe') === 'true';
        if (storedUsername && storedRememberMe) {
            setUsername(storedUsername);
            setRememberMe(storedRememberMe);
        }
        
        // Auto focus username on mount
        usernameRef.current?.focus();
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
                // Store rememberMe preference for session monitoring
                localStorage.setItem('rememberMe', rememberMe.toString());
                localStorage.setItem('sessionStart', Date.now().toString());
                if (rememberMe) {
                    localStorage.setItem('rememberedAccount', formData.get('username') as string);
                } else {
                    localStorage.removeItem('rememberedAccount');
                }

                // V-08: Success! Redirect immediately
                // We refresh first to ensure the new auth cookie is picked up by middleware/layouts
                router.refresh();
                router.push('/dashboard');
            }
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred");
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--login-bg)] dark:bg-black text-foreground dark:text-white p-6 md:p-12 transition-all duration-700 font-cairo" dir="rtl">
            <div className="glass-card p-10 md:p-16 w-full max-w-xl animate-fly-in relative overflow-hidden group border-slate-200 dark:border-white/10 shadow-2xl">
                {/* Visual Accent - Light Theme only */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-80" />
                
                <div className="text-center mb-12 relative z-10">
                    <div className="flex justify-center mb-10">
                        <div className="relative p-2 rounded-[32px] bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 shadow-inner">
                            <div className="absolute inset-0 bg-cyan-500/10 blur-2xl rounded-full scale-110" />
                            <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-6 shadow-sm relative z-10">
                                <img
                                    src="/assets/casper-icon.png"
                                    alt="Casper ERP"
                                    className="w-24 h-24 object-contain transition-transform group-hover:scale-105 duration-500"
                                />
                            </div>
                        </div>
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white mb-2">
                        {t('title')}
                    </h1>
                    <p className="text-slate-500 dark:text-zinc-400 text-sm font-bold max-w-[280px] mx-auto leading-relaxed">
                        {t('subtitle')}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-500/10 border-2 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-200 p-4 rounded-2xl text-sm mb-8 text-center animate-bounce-in font-black">
                        {error}
                    </div>
                )}

                <form action={handleSubmit} className="space-y-8 relative z-10">
                    <div className="space-y-3">
                        <label className="text-[11px] text-slate-500 dark:text-zinc-500 uppercase font-black tracking-[0.2em] mb-1 block px-1">
                            {t('username')}
                        </label>
                        <div className="relative group">
                            <input
                                ref={usernameRef}
                                name="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyDown={handleUsernameKeyDown}
                                className="glass-input w-full bg-slate-50 dark:bg-zinc-950/50 border-slate-200 dark:border-white/10 h-14 text-lg font-black px-6 focus:bg-white dark:focus:bg-zinc-950 focus:ring-4 focus:ring-cyan-500/10 placeholder:text-slate-300 dark:placeholder:text-zinc-700 transition-all rounded-2xl shadow-sm"
                                required
                                autoComplete="username"
                                placeholder="اسم المستخدم"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[11px] text-slate-500 dark:text-zinc-500 uppercase font-black tracking-[0.2em] mb-1 block px-1">
                            {t('password')}
                        </label>
                        <input
                            ref={passwordRef}
                            type="password"
                            name="password"
                            className="glass-input w-full bg-slate-50 dark:bg-zinc-950/50 border-slate-200 dark:border-white/10 h-14 text-lg font-black px-6 focus:bg-white dark:focus:bg-zinc-950 focus:ring-4 focus:ring-cyan-500/10 placeholder:text-slate-300 dark:placeholder:text-zinc-700 transition-all rounded-2xl shadow-sm"
                            required
                            autoComplete="off"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
                            <div className={`w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center ${rememberMe ? 'bg-cyan-600 border-cyan-600 shadow-lg shadow-cyan-600/20' : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950'}`}>
                                {rememberMe && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <span className="text-sm font-black text-slate-600 dark:text-zinc-400 group-hover:text-cyan-600 transition-colors">
                                {t('rememberMe')}
                            </span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white font-black py-5 rounded-2xl mt-4 flex justify-center items-center gap-3 transition-all active:scale-[0.98] shadow-xl shadow-cyan-600/20 text-lg uppercase tracking-wider relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                        {loading ? (
                            <Loader2 className="animate-spin w-6 h-6" />
                        ) : (
                            <span>{t('login')}</span>
                        )}
                    </button>
                </form>

                {/* Footer decorations */}
                <div className="mt-14 pt-8 border-t border-slate-100 dark:border-zinc-900 text-center">
                    <p className="text-[10px] text-slate-400 dark:text-zinc-600 font-black uppercase tracking-[0.4em]">
                        &copy; 2026 CASPER ERP • PLATFORM PRO
                    </p>
                </div>
            </div>
        </div>
    );
}
