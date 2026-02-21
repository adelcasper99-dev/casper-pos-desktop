"use client";

import { login } from "@/actions/auth";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";

export default function LoginPage() {
    const t = useTranslations('Auth');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (formData: FormData) => {
        setLoading(true);
        setError("");

        const res = await login(formData);

        if (res?.success === false) {
            setError(res.message);
            setLoading(false);
        } else {
            // Store rememberMe preference for session monitoring
            const rememberMe = formData.get('rememberMe') === 'on';
            try {
                localStorage.setItem('rememberMe', rememberMe.toString());
                localStorage.setItem('sessionStart', Date.now().toString());
            } catch (error) {
                console.warn('Failed to store session data:', error);
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4" dir="rtl">
            <div className="glass-card p-8 w-full max-w-md animate-fly-in">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/assets/casper-icon.png"
                            alt="Casper ERP"
                            className="w-24 h-24 object-contain drop-shadow-[0_0_20px_rgba(0,207,255,0.45)]"
                        />
                    </div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="text-zinc-400 text-sm mt-2">{t('subtitle')}</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-3 rounded-lg text-sm mb-4 text-center">
                        {error}
                    </div>
                )}

                <form action={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('username')}</label>
                        <input
                            name="username"
                            className="glass-input w-full"
                            placeholder="admin"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('password')}</label>
                        <input
                            type="password"
                            name="password"
                            className="glass-input w-full"
                            placeholder="••••••"
                            required
                        />
                    </div>

                    <div className="flex items-center gap-2 py-2">
                        <input
                            type="checkbox"
                            name="rememberMe"
                            id="rememberMe"
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-2 focus:ring-cyan-500"
                        />
                        <label htmlFor="rememberMe" className="text-sm text-zinc-400">
                            {t('rememberMe')}
                        </label>
                    </div>

                    <p className="text-xs text-zinc-500 text-center pt-2 italic">
                        {t('defaultCreds')}
                    </p>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl mt-4 flex justify-center items-center gap-2 transition-all active:scale-95"
                    >
                        {loading && <Loader2 className="animate-spin w-4 h-4" />}
                        {t('login')}
                    </button>
                </form>
            </div>
        </div>
    );
}
