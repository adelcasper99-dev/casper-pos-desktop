"use client";

import React, { useState } from "react";
import { Server, KeyRound, Copy, Check, Loader2, AlertTriangle, ShieldCheck, Cpu } from "lucide-react";
import { toast } from "sonner";
import { ApproveSwapButton } from "@/components/hq/ApproveSwapButton";

interface EmergencyLicense {
  id: string;
  key: string;
  macAddress: string;
  emergencyModeAt?: string | Date | null;
  tenantName: string;
}

interface TechSupportTabProps {
  emergencyLicenses?: EmergencyLicense[];
}

export function TechSupportTab({ emergencyLicenses = [] }: TechSupportTabProps) {
  // Staff Override generator state
  const [challengeCode, setChallengeCode] = useState("");
  const [machineId, setMachineId] = useState("");
  const [overrideToken, setOverrideToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const handleGenerateOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeCode.trim() || !machineId.trim()) {
      toast.error("يرجى إدخال كود التحدي ورقم الجهاز");
      return;
    }

    setLoading(true);
    setOverrideToken(null);

    try {
      const res = await fetch("/api/admin/license/staff-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: challengeCode.trim().toUpperCase(),
          machineId: machineId.trim().toUpperCase()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setOverrideToken(data.token);
        toast.success("تم توقيع رمز تجاوز الصلاحيات بنجاح!");
      } else {
        toast.error(data.error || "تعذر توقيع الرمز، تأكد من إعداد المفتاح الخاص LICENSE_PRIVATE_KEY");
      }
    } catch (err: any) {
      toast.error("حدث خطأ في الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = () => {
    if (!overrideToken) return;
    navigator.clipboard.writeText(overrideToken);
    setCopiedToken(true);
    toast.success("تم نسخ الرمز للحافظة!");
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-8" dir="rtl">
      {/* Staff Override Generator Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6 space-y-6 relative overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-white/5 pb-4">
          <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              مولّد رمز تجاوز الصلاحيات (Staff Override Token Generator)
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              توقيع مفاتيح مؤقتة صالحة لمدة 5 دقائق لأجهزة الفنيين في حالة انقطاع الاتصال بالسيرفر.
            </p>
          </div>
        </div>

        {/* Warning Alert Banner */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <span className="font-black">تنبيه أمان مهم:</span> هذا الرمز موقع رقمياً بمفتاح RS256 الخاص بـ HQ. يسمح للفني بتجاوز التراخيص والأقفال أوفلاين لمدة 5 دقائق فقط. يرجى التحقق من هية الفني قبل التسليم.
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleGenerateOverride} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Challenge Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-rose-500" />
                كود التحدي من شاشة الفني (Challenge Code)
              </label>
              <input
                type="text"
                placeholder="مثال: CF7A-3B91"
                value={challengeCode}
                onChange={(e) => setChallengeCode(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:border-rose-500 uppercase tracking-widest"
              />
            </div>

            {/* Machine ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-rose-500" />
                معرف جهاز الفني (Machine ID / Client)
              </label>
              <input
                type="text"
                placeholder="مثال: F12A-99B7-4C3D"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:border-rose-500 uppercase tracking-widest"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !challengeCode.trim() || !machineId.trim()}
            className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-all shadow-lg shadow-rose-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
            توقيع مفتاح التجاوز رقمياً (Sign Staff Override Key)
          </button>
        </form>

        {/* Output Token Result */}
        {Boolean(overrideToken) && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                رمز التجاوز الموقع (صالح لمدة 5 دقائق)
              </span>
              <button
                onClick={handleCopyToken}
                className="px-3 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all flex items-center gap-1"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                نسخ الرمز
              </button>
            </div>

            <textarea
              readOnly
              value={overrideToken || ""}
              rows={3}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 resize-none outline-none"
              dir="ltr"
            />
            <p className="text-[11px] text-slate-400 font-bold">
              امسح هذا الرمز بأكمله وقدمه للفني لإدخاله في شاشة التجاوز على جهاز POS الأوفلاين.
            </p>
          </div>
        )}
      </div>

      {/* Emergency MAC Swaps Queue */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6 space-y-4">
        <h4 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          طابور طلبات تغيير الهاردوير الطارئ (Emergency MAC Swaps)
        </h4>

        {emergencyLicenses.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-white/5 border border-slate-100 dark:border-white/5 rounded-xl overflow-hidden">
            {emergencyLicenses.map((lic) => (
              <div key={lic.id} className="p-4 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-white/[0.02]">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{lic.tenantName}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">
                    Key: {lic.key} | New MAC: {lic.macAddress}
                  </div>
                </div>
                <ApproveSwapButton licenseId={lic.id} newMac={lic.macAddress} />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs font-bold border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
            لا توجد طلبات تغيير هاردوير طارئة حالياً.
          </div>
        )}
      </div>
    </div>
  );
}
