"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, LogIn, Copy, Check, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

interface HQErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function HQError({ error, reset }: HQErrorProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Structured error logging for HQ monitoring
    console.error("[HQ Error Boundary Catch]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }, [error]);

  const isAuthError =
    error.message.toLowerCase().includes("unauthorized") ||
    error.message.toLowerCase().includes("forbidden") ||
    error.message.toLowerCase().includes("session") ||
    error.message.toLowerCase().includes("jwt");

  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  const handleCopyDigest = () => {
    const errorText = `[Casper HQ Error]\nTime: ${new Date().toISOString()}\nDigest: ${error.digest || "N/A"}\nMessage: ${error.message}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(errorText);
    } else {
      // ponytail: legacy execCommand fallback for older WebViews
      const el = document.createElement("textarea");
      el.value = errorText;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
          {isAuthError ? <ShieldAlert className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {isAuthError
              ? "انتهت جلسة تسجيل الدخول"
              : isOffline
              ? "لا يوجد اتصال بالإنترنت"
              : "حدث خطأ أثناء تحميل لوحة التحكم"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 font-medium">
            {isAuthError
              ? "يرجى إعادة تسجيل الدخول للتحقق من صلاحيات المدير العام (Super Admin)."
              : isOffline
              ? "يرجى التحقق من اتصال شبكة الهاتف أو الواي فاي وإعادة المحاولة."
              : error.message || "تعذر الاتصال بقاعدة البيانات السحابية المركزية."}
          </p>
        </div>

        {Boolean(error.digest) && (
          <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-200 dark:border-white/5 text-start space-y-1.5" dir="ltr">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>Digest: {error.digest}</span>
              <button
                onClick={handleCopyDigest}
                className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-bold"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? "نسخ" : "نسخ الكود"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {isAuthError ? (
            <button
              onClick={() => router.push("/login")}
              className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all min-h-[44px]"
            >
              <LogIn className="w-4 h-4" />
              تسجيل الدخول الآن
            </button>
          ) : (
            <button
              onClick={() => reset()}
              className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
            </button>
          )}

          <button
            onClick={() => router.push("/")}
            className="py-3 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 font-bold text-sm transition-all min-h-[44px]"
          >
            الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}
