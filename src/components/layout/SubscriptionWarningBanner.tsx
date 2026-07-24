"use client";

import { Clock, AlertTriangle, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BannerProps {
  status: "ACTIVE" | "WARNING" | "EXPIRED_READ_ONLY";
  daysRemaining: number;
}

export function SubscriptionWarningBanner({ status, daysRemaining }: BannerProps) {
  if (status === "ACTIVE") return null;

  const isExpired = status === "EXPIRED_READ_ONLY";

  return (
    <div
      dir="rtl"
      className={`w-full py-2 px-4 text-xs font-bold font-cairo flex items-center justify-between shadow-md transition-colors ${
        isExpired
          ? "bg-red-600 text-white border-b border-red-700"
          : "bg-amber-500 text-slate-950 border-b border-amber-600"
      }`}
    >
      <div className="flex items-center gap-2">
        {isExpired ? (
          <ShieldAlert className="w-4 h-4 text-white animate-pulse" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-slate-950" />
        )}
        <span>
          {isExpired
            ? "انتهت الفترة التجريبية (14 يوماً). النظام حالياً في وضع القراءة فقط لحفظ بياناتك."
            : `تنبيه: متبقي ${daysRemaining} أيام على انتهاء الفترة التجريبية للاشتراك.`}
        </span>
      </div>

      <a
        href="https://ozza.casper-erp.com/casper-hq"
        target="_blank"
        rel="noopener noreferrer"
        className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
          isExpired
            ? "bg-white text-red-700 hover:bg-slate-100"
            : "bg-slate-950 text-amber-400 hover:bg-slate-900"
        }`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>ترقية الاشتراك الآن</span>
      </a>
    </div>
  );
}
