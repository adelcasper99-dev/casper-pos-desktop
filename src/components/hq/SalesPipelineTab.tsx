"use client";

import React from "react";
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  TrendingUp, 
  Zap, 
  ShieldAlert,
  ArrowRight
} from "lucide-react";

export interface PipelineMetrics {
  total: number;
  active: number;
  trial: number;
  expiringSoon: number;
  expiredOrSuspended: number;
}

interface SalesPipelineTabProps {
  metrics: PipelineMetrics;
  onSelectFilter: (filterKey: string) => void;
}

export function SalesPipelineTab({ metrics, onSelectFilter }: SalesPipelineTabProps) {
  const stages = [
    {
      id: "trial",
      title: "فترة تجريبية",
      subtitle: "عملاء جدد في فترة التجربة",
      count: metrics.trial,
      color: "from-blue-600/20 to-cyan-500/10 border-cyan-500/30 text-cyan-400",
      badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      icon: Clock,
      filterKey: "trial"
    },
    {
      id: "active",
      title: "عميل نشط ومدفوع",
      subtitle: "اشتراكات سارية ومستقرة",
      count: metrics.active,
      color: "from-emerald-600/20 to-teal-500/10 border-emerald-500/30 text-emerald-400",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      icon: CheckCircle2,
      filterKey: "active"
    },
    {
      id: "expiring",
      title: "تنبيه تجديد (أقل من 7 أيام)",
      subtitle: "عملاء يحتاجون للتواصل للتجديد",
      count: metrics.expiringSoon,
      color: "from-amber-600/20 to-yellow-500/10 border-amber-500/30 text-amber-400",
      badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      icon: AlertTriangle,
      filterKey: "expiring"
    },
    {
      id: "expired",
      title: "منتهي / معلق",
      subtitle: "حسابات متوقفة تحتاج إعادة تنشيط",
      count: metrics.expiredOrSuspended,
      color: "from-rose-600/20 to-red-500/10 border-rose-500/30 text-rose-400",
      badgeColor: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      icon: XCircle,
      filterKey: "expired"
    }
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Customers */}
        <div 
          onClick={() => onSelectFilter("all")}
          className="bg-white dark:bg-zinc-900/90 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm hover:border-blue-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">إجمالي العملاء</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{metrics.total}</span>
            <span className="text-[10px] text-blue-500 font-bold group-hover:underline flex items-center gap-0.5">
              عرض الكل <ArrowRight className="w-3 h-3 rotate-180" />
            </span>
          </div>
        </div>

        {/* Active Subscribers */}
        <div 
          onClick={() => onSelectFilter("active")}
          className="bg-white dark:bg-zinc-900/90 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm hover:border-emerald-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">نشط ومدفوع</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{metrics.active}</span>
            <span className="text-[11px] font-bold text-slate-400">
              {metrics.total > 0 ? Math.round((metrics.active / metrics.total) * 100) : 0}% من الإجمالي
            </span>
          </div>
        </div>

        {/* Trials */}
        <div 
          onClick={() => onSelectFilter("trial")}
          className="bg-white dark:bg-zinc-900/90 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm hover:border-cyan-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">تجريبي (Trials)</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-cyan-600 dark:text-cyan-400">{metrics.trial}</span>
            <span className="text-[11px] font-bold text-slate-400">فرص تحويل</span>
          </div>
        </div>

        {/* Expiring Soon */}
        <div 
          onClick={() => onSelectFilter("expiring")}
          className="bg-white dark:bg-zinc-900/90 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm hover:border-amber-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">تجديد قريب (&lt; 7d)</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{metrics.expiringSoon}</span>
            <span className="text-[11px] font-bold text-amber-500">متابعة المبيعات</span>
          </div>
        </div>

        {/* Expired / Suspended */}
        <div 
          onClick={() => onSelectFilter("expired")}
          className="bg-white dark:bg-zinc-900/90 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm hover:border-rose-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">معطل / منتهي</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-rose-600 dark:text-rose-400">{metrics.expiredOrSuspended}</span>
            <span className="text-[11px] font-bold text-slate-400">متوقف</span>
          </div>
        </div>
      </div>

      {/* Sales Pipeline Stages Visual */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
          <div>
            <h3 className="text-lg font-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              أنبوب حركة العملاء والاختراق (Sales Pipeline Stages)
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              اضغط على أي مرحلة للانتقال المباشر وتصفية الجدول الخاص بالعملاء.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stages.map((stage) => {
            const Icon = stage.icon;
            const percentage = metrics.total > 0 ? Math.round((stage.count / metrics.total) * 100) : 0;

            return (
              <div 
                key={stage.id}
                onClick={() => onSelectFilter(stage.filterKey)}
                className={`bg-gradient-to-br ${stage.color} p-5 rounded-2xl border shadow-sm cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between space-y-4`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${stage.badgeColor}`}>
                      {percentage}% من المستأجرين
                    </span>
                    <Icon className="w-5 h-5 opacity-80" />
                  </div>
                  <h4 className="font-black text-base text-slate-900 dark:text-white">{stage.title}</h4>
                  <p className="text-xs opacity-75">{stage.subtitle}</p>
                </div>

                <div className="pt-2 border-t border-slate-200/20 dark:border-white/10 flex items-center justify-between">
                  <span className="text-2xl font-black">{stage.count} عميل</span>
                  <span className="text-xs font-bold underline flex items-center gap-1">
                    إدارة <ArrowRight className="w-3 h-3 rotate-180" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
