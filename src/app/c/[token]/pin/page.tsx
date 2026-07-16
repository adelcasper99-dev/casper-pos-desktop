"use client";

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { authenticatePortal } from '@/actions/customer-actions';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function PinVerificationPage() {
    const params = useParams();
    const router = useRouter();
    const token = params.token as string;
    
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length !== 4) {
            toast.error('الرجاء إدخال 4 أرقام');
            return;
        }

        setLoading(true);
        try {
            const res = await authenticatePortal(token, pin);
            if (res.success) {
                toast.success('تم تسجيل الدخول بنجاح');
                router.push(`/c/${token}`);
            } else {
                toast.error(res.error || 'الرقم السري غير صحيح');
            }
        } catch (error) {
            toast.error('حدث خطأ في النظام');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
            {/* Ambient Background */}
            <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-indigo-900/40 to-slate-900/80 -z-10" />
            <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-500/20 blur-3xl rounded-full mix-blend-screen" />
            <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-purple-500/20 blur-3xl rounded-full mix-blend-screen" />

            <div className="w-full max-w-sm backdrop-blur-xl bg-white/10 p-8 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] border border-white/20">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-4 border border-blue-400/30">
                        <ShieldCheck className="w-8 h-8 text-blue-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-wide">بوابة العملاء</h1>
                    <p className="text-slate-300 text-center text-sm leading-relaxed">
                        أدخل <span className="font-semibold text-blue-400">آخر 4 أرقام</span> من رقم هاتفك المحمول المسجل لدينا للوصول لحسابك.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <div className="relative group">
                            <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="tel"
                                maxLength={4}
                                placeholder="----"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                                className="w-full bg-slate-800/50 border border-slate-700 text-white text-center text-2xl tracking-[1em] rounded-xl py-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-500/50"
                                dir="ltr"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || pin.length !== 4}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)]"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'دخول للوحة التحكم'}
                    </button>
                </form>
            </div>
        </div>
    );
}
