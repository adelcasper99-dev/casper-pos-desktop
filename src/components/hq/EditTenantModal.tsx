"use client";

import { useState } from "react";
import { editTenant } from "@/actions/hq-tenant-actions";
import { generateCSRFToken } from "@/lib/csrf-client";
import { Loader2, Lock, Edit2, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";

type TenantAdminRole = "ADMIN" | "MANAGER" | "STAFF" | "SUPER_ADMIN";

interface EditTenantModalProps {
  tenantId: string;
  initialName: string;
  slug: string;
  initialAdminUsername?: string;
  initialAdminRole?: string;
}

export function EditTenantModal({ 
  tenantId, 
  initialName, 
  slug, 
  initialAdminUsername = "",
  initialAdminRole = "ADMIN"
}: EditTenantModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(initialName);
  const [adminUsername, setAdminUsername] = useState(initialAdminUsername);
  const [adminRole, setAdminRole] = useState(initialAdminRole || "ADMIN");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nameChanged = name.trim() !== initialName;
    const usernameChanged = adminUsername.trim() !== initialAdminUsername;
    const roleChanged = adminRole !== initialAdminRole;
    const passwordProvided = newPassword.trim().length >= 6;

    if (!nameChanged && !usernameChanged && !roleChanged && !passwordProvided) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const csrfToken = await generateCSRFToken();
      const res = await editTenant({ 
        tenantId, 
        name: name.trim(), 
        adminUsername: adminUsername.trim(),
        adminRole: (adminRole as TenantAdminRole) || "ADMIN",
        newPassword: newPassword.trim(),
        csrfToken 
      });

      if (res?.success) {
        setIsOpen(false);
        setNewPassword("");
        router.refresh();
      } else {
        setError(res?.error || "فشل في تحديث بيانات العميل");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "فشل في تحديث بيانات العميل");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setName(initialName);
          setAdminUsername(initialAdminUsername);
          setAdminRole(initialAdminRole || "ADMIN");
          setNewPassword("");
          setError("");
          setIsOpen(true);
        }}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10"
      >
        <Edit2 className="w-3.5 h-3.5" />
        تعديل
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-900 dark:text-white max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center sticky top-0 bg-white dark:bg-zinc-900 z-10">
              <h3 className="text-xl font-black">تعديل بيانات العميل</h3>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm font-bold">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold mb-1">اسم العميل (Tenant Name)</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none"
                    placeholder="مثال: مطعم كاسبر - فرع 1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1 flex items-center gap-1.5">
                    النطاق الفرعي / المعرف (Subdomain)
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </label>
                  <input
                    disabled
                    readOnly
                    value={slug}
                    dir="ltr"
                    className="w-full border-2 border-slate-100 dark:border-white/5 bg-slate-100 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400 rounded-xl px-4 py-3 font-mono font-semibold cursor-not-allowed outline-none select-none text-left"
                  />
                  <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                    النطاق الفرعي عبارة عن معرف ثابت لا يمكن تغييره لضمان استقرار المزامنة الأوفلاين.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                  <h4 className="text-xs font-black uppercase text-slate-400 mb-3 tracking-wider">حساب المسؤول الكلاود (Cloud Admin)</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-bold mb-1">اسم المستخدم للمسؤول (Admin Username)</label>
                      <input
                        type="text"
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        dir="ltr"
                        className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none text-left"
                        placeholder="admin@domain.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold mb-1">صلاحية المستخدم الأول (Role)</label>
                      <select
                        value={adminRole}
                        onChange={(e) => setAdminRole(e.target.value)}
                        className="w-full border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none cursor-pointer"
                      >
                        {adminRole === "SUPER_ADMIN" && (
                          <option value="SUPER_ADMIN">سوبر أدمن (SUPER_ADMIN) - تحكم كلي</option>
                        )}
                        <option value="ADMIN">مدير نظام (ADMIN) - صلاحيات كاملة</option>
                        <option value="MANAGER">مدير فرع (MANAGER) - صلاحيات إدارية</option>
                        <option value="STAFF">موظف / كاشير (STAFF) - صلاحيات مبيعات فقط</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold mb-1">تعيين كلمة مرور جديدة (New Password)</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          dir="ltr"
                          className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 pe-11 font-semibold focus:border-blue-500 outline-none text-left"
                          placeholder="اتركه فارغاً للإبقاء على كلمة المرور الحالية"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 end-0 pe-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                          title={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        >
                          {showPassword ? (
                            <EyeOff className="w-5 h-5" />
                          ) : (
                            <Eye className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                        اكتب كلمة مرور جديدة فقط إذا كنت تريد إعادة تعيين كلمة المرور لهذا العميل.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-white/5 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 font-bold py-3 rounded-xl transition-colors text-slate-700 dark:text-zinc-300"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    حفظ التغييرات
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
