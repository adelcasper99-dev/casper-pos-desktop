"use client";

import { useState } from "react";
import { provisionNewTenant } from "@/actions/hq-tenant-actions";
import { generateCSRFToken } from "@/lib/csrf-client";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";

export function ProvisionTenantModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [createdDomain, setCreatedDomain] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const domain = formData.get("domain") as string;
    const adminUsername = formData.get("adminUsername") as string;
    const adminPassword = formData.get("adminPassword") as string;
    const adminRole = (formData.get("adminRole") as "ADMIN" | "MANAGER" | "STAFF") || "ADMIN";
    const duration = ((formData.get("duration") as string) || "14_DAYS") as "14_DAYS" | "1_MONTH" | "6_MONTHS" | "1_YEAR" | "LIFETIME";

    try {
      const csrfToken = await generateCSRFToken();
      const res = await provisionNewTenant({ name, domain, adminUsername, adminPassword, adminRole, duration, csrfToken });
      
      // `res` from safe-action is typed and flattened.
      if (res?.success) {
        setActivationCode(res.activationCode || "");
        setCreatedDomain(domain);
        router.refresh(); // Refresh table
      } else {
        setError(res?.error || "Unknown error occurred");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to provision");
    } finally {
      setLoading(false);
    }
  }

  const getLoginUrl = () => {
    if (!createdDomain) return "";
    if (typeof window !== "undefined") {
      const host = window.location.host.replace(/^hq\./, "");
      return `${window.location.protocol}//${createdDomain}.${host}/login`;
    }
    return `https://${createdDomain}.casper-erp.com/login`;
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="bg-slate-900 dark:bg-white text-white dark:text-zinc-900 font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition-opacity"
      >
        + إضافة عميل جديد
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
              <h3 className="text-xl font-black">إضافة عميل جديد (Tenant)</h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6">
              {activationCode ? (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 p-4 rounded-xl space-y-4">
                    <p className="font-bold">تم إنشاء العميل وتوليد الترخيص بنجاح! 🎉</p>
                    
                    <div>
                      <label className="block text-xs font-bold mb-1 text-slate-600 dark:text-zinc-400">🔑 كود التفعيل (لتطبيق الـ Desktop):</label>
                      <div className="flex gap-2" dir="ltr">
                        <input 
                          readOnly 
                          value={activationCode}
                          className="flex-1 bg-white dark:bg-zinc-950 border border-green-200 dark:border-green-500/20 rounded-lg px-3 py-2 font-mono text-center font-bold text-sm"
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(activationCode);
                          }}
                          className="bg-green-600 text-white px-3 py-2 rounded-lg font-bold text-xs hover:bg-green-700 transition-colors"
                        >
                          نسخ الكود
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1 text-slate-600 dark:text-zinc-400">🌐 رابط تسجيل الدخول المباشر (للكلاود):</label>
                      <div className="flex gap-2" dir="ltr">
                        <input 
                          readOnly 
                          value={getLoginUrl()}
                          className="flex-1 bg-white dark:bg-zinc-950 border border-green-200 dark:border-green-500/20 rounded-lg px-3 py-2 font-mono text-xs font-bold text-slate-700 dark:text-zinc-300"
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(getLoginUrl());
                          }}
                          className="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold text-xs hover:bg-blue-700 transition-colors"
                        >
                          نسخ الرابط
                        </button>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      setActivationCode("");
                      setCreatedDomain("");
                    }}
                    className="w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 font-bold py-3 rounded-xl transition-colors text-slate-900 dark:text-white"
                  >
                    تم
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold">{error}</div>}
                  
                  <div>
                    <label className="block text-sm font-bold mb-1">اسم العميل (Tenant Name)</label>
                    <input 
                      name="name" 
                      required 
                      className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none"
                      placeholder="مثال: مطعم كاسبر - فرع 1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">النطاق الفرعي / المعرف (Subdomain)</label>
                    <input 
                      name="domain" 
                      required 
                      pattern="^[a-zA-Z0-9-]+$"
                      title="يسمح فقط بالأحرف الإنجليزية والأرقام والشرطة (-) دون نقاط أو مسافات"
                      className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none"
                      placeholder="مثال: kfc-01 (بدون نقاط أو مسافات)"
                      dir="ltr"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">يسمح فقط بالأحرف الإنجليزية والأرقام والشرطة (-) لضمان عمل شهادة الأمان SSL.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">اسم المستخدم للمسؤول (Admin Username)</label>
                    <input 
                      name="adminUsername" 
                      required 
                      className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none"
                      placeholder="مثال: admin@kfc.com"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">كلمة المرور (Password)</label>
                    <div className="relative">
                      <input 
                        name="adminPassword" 
                        type={showPassword ? "text" : "password"} 
                        required 
                        minLength={6}
                        className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 pe-11 font-semibold focus:border-blue-500 outline-none text-left"
                        placeholder="الحد الأدنى 6 خانات"
                        dir="ltr"
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
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">صلاحية المستخدم الأول (Role)</label>
                    <select
                      name="adminRole"
                      defaultValue="ADMIN"
                      className="w-full border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <option value="ADMIN">مدير نظام (ADMIN) - صلاحيات كاملة</option>
                      <option value="MANAGER">مدير فرع (MANAGER) - صلاحيات إدارية</option>
                      <option value="STAFF">موظف / كاشير (STAFF) - صلاحيات مبيعات فقط</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">مدة الترخيص (License Duration)</label>
                    <select
                      name="duration"
                      defaultValue="14_DAYS"
                      className="w-full border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <option value="14_DAYS">14 يوم (تجريبي)</option>
                      <option value="1_MONTH">شهر واحد</option>
                      <option value="6_MONTHS">6 أشهر</option>
                      <option value="1_YEAR">سنة واحدة</option>
                      <option value="LIFETIME">مدى الحياة</option>
                    </select>
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
                      إنشاء العميل
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
