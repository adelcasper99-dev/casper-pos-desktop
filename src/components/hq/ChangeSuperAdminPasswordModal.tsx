"use client";

import { useState } from "react";
import { changeSuperAdminPassword } from "@/actions/super-admin";
import { generateCSRFToken } from "@/lib/csrf-client";
import { KeyRound, Loader2, Eye, EyeOff, CheckCircle2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

export function ChangeSuperAdminPasswordModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (newPassword !== confirmPassword) {
      setError("كلمات المرور الجديدة غير متطابقة");
      return;
    }

    if (newPassword.length < 6) {
      setError("كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف");
      return;
    }

    setLoading(true);

    try {
      const csrfToken = await generateCSRFToken();
      const res = await changeSuperAdminPassword({
        currentPassword,
        newPassword,
        confirmPassword,
        csrfToken
      });

      if (res?.success) {
        setSuccessMsg("✅ تم تحديث كلمة مرور المشرف العام بنجاح!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          setIsOpen(false);
          setSuccessMsg("");
          router.refresh();
        }, 1500);
      } else {
        setError(res?.message || res?.error || "فشل في تحديث كلمة المرور");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setError("");
          setSuccessMsg("");
          setIsOpen(true);
        }}
        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold px-3.5 py-2.5 rounded-xl text-sm transition-all border border-slate-200 dark:border-white/10 cursor-pointer shadow-sm"
        title="تغيير كلمة مرور المشرف العام"
      >
        <KeyRound className="w-4 h-4 text-amber-500" />
        <span>تغيير باسورد المشرف العام</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-white/10 flex justify-between items-center bg-slate-50/50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">تغيير كلمة مرور المشرف العام</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Casper HQ Master Credentials</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-300">
                  كلمة المرور الحالية للمشرف العام
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور الحالية"
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-300">
                  كلمة المرور الجديدة
                </label>
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الجديدة (6 أحرف فأكثر)"
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-300">
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد إدخال كلمة المرور الجديدة"
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-1/3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-bold text-xs shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>حفظ كلمة المرور الجديدة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
