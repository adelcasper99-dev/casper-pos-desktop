import React from "react";

export default function HQLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" dir="rtl">
      {/* Header Bar Skeleton */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
        <div className="space-y-2 w-full md:w-auto">
          <div className="h-7 w-64 bg-slate-200 dark:bg-zinc-800 rounded-xl" />
          <div className="h-4 w-80 bg-slate-100 dark:bg-zinc-800/60 rounded-lg max-w-full" />
        </div>
        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap sm:flex-nowrap">
          <div className="h-10 w-32 bg-slate-200 dark:bg-zinc-800 rounded-xl flex-1 sm:flex-initial" />
          <div className="h-10 w-40 bg-slate-200 dark:bg-zinc-800 rounded-xl flex-1 sm:flex-initial" />
          <div className="h-10 w-36 bg-slate-200 dark:bg-zinc-800 rounded-xl flex-1 sm:flex-initial" />
        </div>
      </div>

      {/* Overview Stat Cards Skeleton (5 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-zinc-900/90 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-20 bg-slate-200 dark:bg-zinc-800 rounded" />
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800" />
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <div className="h-8 w-14 bg-slate-300 dark:bg-zinc-700 rounded-lg" />
              <div className="h-3 w-16 bg-slate-100 dark:bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Tabs Bar Skeleton */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2 overflow-x-auto">
        <div className="h-11 w-44 bg-slate-200 dark:bg-zinc-800 rounded-2xl shrink-0" />
        <div className="h-11 w-44 bg-slate-100 dark:bg-zinc-800/60 rounded-2xl shrink-0" />
        <div className="h-11 w-44 bg-slate-100 dark:bg-zinc-800/60 rounded-2xl shrink-0" />
        <div className="h-11 w-40 bg-slate-100 dark:bg-zinc-800/60 rounded-2xl shrink-0" />
      </div>

      {/* Search and Category Filter Controls Skeleton */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
        <div className="h-10 flex-1 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-20 bg-slate-100 dark:bg-zinc-800 rounded-xl shrink-0" />
          ))}
        </div>
      </div>

      {/* Mobile Card Feed / Desktop Table Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-5 w-40 bg-slate-200 dark:bg-zinc-800 rounded-lg" />
                <div className="h-3 w-28 bg-slate-100 dark:bg-zinc-800/60 rounded" />
              </div>
              <div className="h-6 w-16 bg-slate-200 dark:bg-zinc-800 rounded-full" />
            </div>
            <div className="h-10 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-slate-100 dark:border-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
