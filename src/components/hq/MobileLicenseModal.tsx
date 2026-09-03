"use client";

import React, { useState } from "react";
import {
  Smartphone,
  Copy,
  Check,
  KeyRound,
  Send,
  Sparkles,
  ShieldCheck,
  X,
  History
} from "lucide-react";
import {
  generateMobileLicenseKey,
  getDurationLabel,
  buildMobileLicenseWhatsAppUrl,
  MobileLicenseDuration,
  GeneratedMobileLicense
} from "@/lib/mobile-license";
import { toast } from "sonner";

interface MobileLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DURATION_OPTIONS: { value: MobileLicenseDuration; label: string; badge?: string }[] = [
  { value: 7, label: "7 أيام", badge: "تجريبي" },
  { value: 14, label: "14 يوم" },
  { value: 30, label: "شهر (30 يوم)" },
  { value: 90, label: "3 شهور" },
  { value: 365, label: "سنة (365 يوم)", badge: "شائع" },
  { value: 9999, label: "مدى الحياة", badge: "VIP" },
];

export function MobileLicenseModal({ isOpen, onClose }: MobileLicenseModalProps) {
  const [deviceId, setDeviceId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<MobileLicenseDuration>(365);
  const [generatedLicense, setGeneratedLicense] = useState<GeneratedMobileLicense | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<GeneratedMobileLicense[]>([]);

  if (!isOpen) return null;

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = deviceId.trim().toUpperCase();

    if (!cleanId) {
      toast.error("يرجى إدخال معرف الجهاز (Device ID)");
      return;
    }

    const key = generateMobileLicenseKey(cleanId, selectedDuration);
    const durationLabel = getDurationLabel(selectedDuration);
    const whatsappUrl = customerPhone.trim()
      ? buildMobileLicenseWhatsAppUrl(customerPhone, customerName, key, durationLabel)
      : undefined;

    const record: GeneratedMobileLicense = {
      key,
      tag: selectedDuration >= 9999 ? "LIFE" : `${selectedDuration}D`,
      deviceId: cleanId,
      days: selectedDuration,
      durationLabel,
      whatsappUrl,
    };

    setGeneratedLicense(record);
    setHistory((prev) => [record, ...prev.slice(0, 4)]);
    toast.success("تم توليد كود التفعيل بنجاح! 🎉");
  };

  const handleCopy = (keyToCopy: string) => {
    navigator.clipboard.writeText(keyToCopy);
    setCopied(true);
    toast.success("تم نسخ الكود للحافظة");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-gradient-to-r from-blue-600/10 via-cyan-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-500 flex items-center justify-center ring-1 ring-blue-500/30">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                توليد كود تفعيل الموبايل (Mobile POS)
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-bold">
                توليد أكواد مشفرة تعمل دون الحاجة لاتصال إنترنت
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Device ID */}
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-zinc-300 mb-1.5">
                معرف الجهاز (Device ID) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="مثال: DEV-A1B2C3D4"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 font-mono text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  dir="ltr"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                يظهر للمستخدم في شاشة التفعيل أو الإعدادات داخل تطبيق الموبايل.
              </p>
            </div>

            {/* Duration Selector */}
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-zinc-300 mb-2">
                مدة الترخيص
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setSelectedDuration(opt.value)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all relative border ${
                      selectedDuration === opt.value
                        ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20"
                        : "bg-slate-50 dark:bg-zinc-900/60 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-white/5 hover:border-blue-500/40"
                    }`}
                  >
                    {opt.label}
                    {opt.badge && (
                      <span
                        className={`absolute -top-1.5 -right-1 text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                          selectedDuration === opt.value
                            ? "bg-amber-400 text-slate-950"
                            : "bg-blue-500/10 text-blue-500"
                        }`}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Customer Info */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 mb-1">
                  اسم العميل (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: سوبر ماركت النور"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 mb-1">
                  رقم الواتساب (اختياري)
                </label>
                <input
                  type="tel"
                  placeholder="010XXXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black py-3 rounded-2xl text-sm flex items-center justify-center gap-2 hover:opacity-95 shadow-lg shadow-blue-600/25 transition-all mt-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              توليد كود التفعيل الفوري
            </button>
          </form>

          {/* Result Card */}
          {generatedLicense && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  كود التفعيل الجاهز:
                </span>
                <span className="text-[11px] font-bold text-muted-foreground">
                  المدة: {generatedLicense.durationLabel}
                </span>
              </div>

              <div className="flex items-center gap-2" dir="ltr">
                <input
                  readOnly
                  value={generatedLicense.key}
                  className="flex-1 bg-white dark:bg-zinc-900 border border-emerald-500/30 rounded-xl px-3 py-2.5 font-mono text-center font-black text-base text-emerald-600 dark:text-emerald-400 tracking-wider shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(generatedLicense.key)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-xl font-bold transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-md shadow-emerald-600/20"
                  title="نسخ الكود"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                {generatedLicense.whatsappUrl && (
                  <a
                    href={generatedLicense.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    إرسال الكود للعميل عبر الواتساب
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(generatedLicense.key)}
                  className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <Copy className="w-3.5 h-3.5" />
                  نسخ الكود فقط
                </button>
              </div>
            </div>
          )}

          {/* Quick History */}
          {history.length > 0 && (
            <div className="border-t border-slate-100 dark:border-white/5 pt-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <History className="w-3.5 h-3.5" />
                آخر الأكواد المولدة في هذه الجلسة:
              </div>
              <div className="space-y-1.5">
                {history.map((item, idx) => (
                  <div
                    key={`${item.key}-${idx}`}
                    className="flex items-center justify-between bg-slate-50 dark:bg-zinc-900/50 px-3 py-1.5 rounded-xl text-xs font-mono border border-slate-200/50 dark:border-white/5"
                    dir="ltr"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-zinc-200">{item.key}</span>
                      <span className="text-[10px] text-slate-400">({item.deviceId})</span>
                    </div>
                    <button
                      onClick={() => handleCopy(item.key)}
                      className="text-blue-500 hover:text-blue-600 text-[11px] font-bold"
                    >
                      نسخ
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
