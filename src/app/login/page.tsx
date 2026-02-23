"use client";

import { login } from "@/actions/auth";
import { useState, useEffect } from "react";
import { Loader2, Lock } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const t = useTranslations('Auth');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [username, setUsername] = useState("");
    const [rememberMe, setRememberMe] = useState(false);

    useEffect(() => {
        const storedUsername = localStorage.getItem('rememberedAccount');
        const storedRememberMe = localStorage.getItem('rememberMe') === 'true';
        if (storedUsername && storedRememberMe) {
            setUsername(storedUsername);
            setRememberMe(storedRememberMe);
        }
    }, []);

    const handleSubmit = async (formData: FormData) => {
        setLoading(true);
        setError("");

        const res = await login(formData);

        if (res?.success === false) {
            setError(res.message);
            setLoading(false);
        } else {
            // Store rememberMe preference for session monitoring
            try {
                localStorage.setItem('rememberMe', rememberMe.toString());
                localStorage.setItem('sessionStart', Date.now().toString());
                if (rememberMe) {
                    localStorage.setItem('rememberedAccount', formData.get('username') as string);
                } else {
                    localStorage.removeItem('rememberedAccount');
                }
            } catch (error) {
                console.warn('Failed to store session data:', error);
            }
        }

        if (res?.success) {
            window.location.href = '/dashboard';
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4" dir="rtl">
            <div className="glass-card p-8 w-full max-w-md animate-fly-in">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <div className="w-20 h-20 bg-cyan-500 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                            <Lock className="w-10 h-10 text-white" />
                        </div>
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
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="glass-input w-full"
                            required
                            autoComplete="username"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('password')}</label>
                        <input
                            type="password"
                            name="password"
                            className="glass-input w-full"
                            required
                            autoComplete="off"
                        />
                    </div>

                    <div className="flex items-center gap-2 py-2">
                        <input
                            type="checkbox"
                            name="rememberMe"
                            id="rememberMe"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-2 focus:ring-cyan-500"
                        />
                        <label htmlFor="rememberMe" className="text-sm text-zinc-400">
                            {t('rememberMe')}
                        </label>
                    </div>



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
