"use client";

import { useState } from "react";
import { Shield, KeyRound, Save, Eye, EyeOff } from "lucide-react";
import { changeSuperAdminPassword } from "@/actions/super-admin";
import { toast } from "sonner";

export default function SuperAdminSecurity() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);
    
    // Visibility toggles
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Errors
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        setError(null);
        
        // Front-end Validations
        if (!currentPassword) {
            setError("الرقم السري الحالي مطلوب");
            toast.error("الرقم السري الحالي مطلوب");
            return;
        }
        if (newPassword.length < 8) {
            setError("الرقم السري الجديد يجب أن يكون 8 حروف على الأقل");
            toast.error("الرقم السري الجديد قصير جداً");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("الأرقام السرية الجديدة غير متطابقة");
            toast.error("الأرقام السرية غير متطابقة");
            return;
        }

        setSaving(true);
        try {
            const res = await changeSuperAdminPassword({
                currentPassword,
                newPassword,
                confirmPassword
            });

            if (res.success) {
                toast.success("تم تغيير الرقم السري للمشرف العام بنجاح!");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
            } else {
                setError(res.error || "فشل تغيير الرقم السري");
                toast.error(res.error || "حدث خطأ ما");
            }
        } catch (err: any) {
            setError(err.message || "حدث خطأ في الشبكة");
            toast.error("فشل تنفيذ الطلب");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-xl space-y-10 animate-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-[2.5rem] p-4 sm:p-10 shadow-xl relative overflow-hidden group/container">
                <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/container:bg-rose-500/10 transition-colors" />

                <div className="space-y-8">
                    {/* Header */}
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black flex items-center gap-3 text-foreground uppercase tracking-tight">
                            <Shield className="w-6 h-6 text-rose-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" /> 
                            حماية المشرف العام
                        </h3>
                        <p className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-9 opacity-60">
                            تغيير كلمة المرور الخاصة بحساب الطوارئ والمشرف العام للمنشأة
                        </p>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-6">
                        {/* Current Password */}
                        <div className="space-y-2 group">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">
                                الرقم السري الحالي
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <KeyRound size={14} className="text-muted-foreground/40" />
                                </div>
                                <input
                                    type={showCurrent ? "text" : "password"}
                                    className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-3 pl-10 pr-12 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 shadow-sm transition-all text-left"
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrent(!showCurrent)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground/60 hover:text-foreground transition-colors"
                                >
                                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* New Password */}
                        <div className="space-y-2 group">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">
                                الرقم السري الجديد
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <KeyRound size={14} className="text-muted-foreground/40" />
                                </div>
                                <input
                                    type={showNew ? "text" : "password"}
                                    className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-3 pl-10 pr-12 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 shadow-sm transition-all text-left"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew(!showNew)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground/60 hover:text-foreground transition-colors"
                                >
                                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-2 group">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">
                                تأكيد الرقم السري الجديد
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <KeyRound size={14} className="text-muted-foreground/40" />
                                </div>
                                <input
                                    type={showConfirm ? "text" : "password"}
                                    className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-3 pl-10 pr-12 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 shadow-sm transition-all text-left"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground/60 hover:text-foreground transition-colors"
                                >
                                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Inline error feedback */}
                    {error && (
                        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold animate-in fade-in duration-300">
                            {error}
                        </div>
                    )}
                </div>

                {/* Save Button */}
                <div className="pt-10 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="group relative inline-flex items-center justify-center gap-3 bg-rose-600 hover:bg-rose-500 px-10 py-4 rounded-2xl text-white font-black uppercase tracking-widest overflow-hidden transition-all hover:scale-[1.05] active:scale-[0.98] disabled:opacity-50"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                        {saving ? (
                            <span className="flex items-center gap-2 animate-pulse">
                                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                                جاري الحفظ...
                            </span>
                        ) : (
                            <>
                                <Save className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                <span>حفظ التغييرات</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
