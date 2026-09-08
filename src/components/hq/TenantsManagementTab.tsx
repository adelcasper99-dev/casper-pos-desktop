"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search, ShieldAlert, KeyRound, ExternalLink, User, ChevronDown } from "lucide-react";
import { CopyLicenseButton } from "@/components/hq/CopyLicenseButton";
import { ApproveSwapButton } from "@/components/hq/ApproveSwapButton";
import { LicenseQuickActions } from "@/components/hq/LicenseQuickActions";
import { classifyTenant, LIFETIME_YEAR_THRESHOLD, TenantWithLicense } from "@/lib/hq-metrics";

interface TenantsManagementTabProps {
  tenants: TenantWithLicense[];
  adminMap: Map<string, { username: string; roleStr: string }>;
  initialFilter?: string;
}

const PAGE_SIZE = 20;

export function TenantsManagementTab({
  tenants,
  adminMap,
  initialFilter = "all"
}: TenantsManagementTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>(initialFilter);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Sync activeFilter when initialFilter prop changes (e.g. from KPI card click)
  useEffect(() => {
    setActiveFilter(initialFilter);
    setVisibleCount(PAGE_SIZE);
  }, [initialFilter]);

  // Reset pagination on search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchTerm]);

  // UTC-safe date countdown helper
  const getExpirationBadge = (expiresAtDate: string | Date, status: string) => {
    if (status === "REVOKED") {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20">
          ملغى (Revoked)
        </span>
      );
    }

    const expiresAt = new Date(expiresAtDate).getTime();
    const now = Date.now();
    const isLifetime = new Date(expiresAtDate).getFullYear() > LIFETIME_YEAR_THRESHOLD;

    if (isLifetime) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          مدى الحياة (Lifetime)
        </span>
      );
    }

    const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20">
          منتهي منذ {Math.abs(daysRemaining)} يوم
        </span>
      );
    }

    if (daysRemaining <= 7) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
          ينتهي خلال {daysRemaining} أيام ⚠️
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300">
        متبقي {daysRemaining} يومًا
      </span>
    );
  };

  const filteredTenants = useMemo(() => {
    const now = Date.now();
    return tenants.filter((tenant) => {
      const displaySlug = tenant.slug || "";
      const primaryLic = tenant.licenses[0];
      const adminMeta = adminMap.get(tenant.id);

      // Search match
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        tenant.name.toLowerCase().includes(query) ||
        displaySlug.toLowerCase().includes(query) ||
        (adminMeta?.username && adminMeta.username.toLowerCase().includes(query)) ||
        (primaryLic?.key && primaryLic.key.toLowerCase().includes(query)) ||
        (primaryLic?.macAddress && primaryLic.macAddress.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Filter category match via pure utility
      if (activeFilter !== "all") {
        const stage = classifyTenant(tenant, now);
        if (activeFilter === "expired" && stage !== "expired") return false;
        if (activeFilter === "trial" && stage !== "trial") return false;
        if (activeFilter === "expiring" && stage !== "expiring") return false;
        if (activeFilter === "active" && stage !== "active") return false;
      }

      return true;
    });
  }, [tenants, adminMap, searchTerm, activeFilter]);

  const pagedTenants = useMemo(() => {
    return filteredTenants.slice(0, visibleCount);
  }, [filteredTenants, visibleCount]);

  const hasMore = visibleCount < filteredTenants.length;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Search and Category Filter Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم العميل، النطاق، كود التفعيل، أو الـ MAC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-white/10 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-blue-500 font-medium min-h-[44px]"
          />
        </div>

        {/* Quick Filter Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
          {[
            { id: "all", label: `الكل (${tenants.length})` },
            { id: "active", label: "نشط ومدفوع" },
            { id: "trial", label: "تجريبي" },
            { id: "expiring", label: "تجديد قريب (≤7d)" },
            { id: "expired", label: "منتهي / معلق" }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[36px] flex items-center ${
                activeFilter === f.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. MOBILE FEED VIEW (Cards for Viewports < 768px) ── */}
      <div className="block md:hidden space-y-3">
        {pagedTenants.map((tenant) => {
          const displaySlug = tenant.slug || "";
          const userMeta = adminMap.get(tenant.id);
          const adminUsername = userMeta?.username || "";
          const adminRole = userMeta?.roleStr || "ADMIN";
          const primaryLic = tenant.licenses[0];

          return (
            <div
              key={tenant.id}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-4 space-y-3"
            >
              {/* Card Header: Name & Status */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-white/5 pb-2.5">
                <div>
                  <h4 className="font-black text-base text-slate-900 dark:text-white leading-tight">
                    {tenant.name}
                  </h4>
                  {Boolean(adminUsername) && (
                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-1" dir="ltr">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>{adminUsername}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300 font-sans font-bold">
                        {adminRole}
                      </span>
                    </div>
                  )}
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-black shrink-0 ${
                    tenant.isActive
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-500/20"
                  }`}
                >
                  {tenant.isActive ? "نشط" : "معطل"}
                </span>
              </div>

              {/* Card Body: Domain & Direct Link */}
              <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-zinc-800/40 p-2.5 rounded-xl">
                <span className="text-slate-500 dark:text-zinc-400 font-bold">النطاق السحابي:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{displaySlug}</span>
                  {Boolean(displaySlug) && (
                    <a
                      href={`https://${displaySlug}.casper-erp.com/login`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 p-1"
                      title="فتح رابط الدخول"
                    >
                      <ExternalLink className="w-3.5 h-3.5 rtl:rotate-180" />
                    </a>
                  )}
                </div>
              </div>

              {/* Card Body: License Info */}
              <div className="space-y-2 text-xs">
                {tenant.licenses.map((lic) => (
                  <div key={lic.id} className="bg-slate-50/70 dark:bg-zinc-800/20 p-2.5 rounded-xl border border-slate-100 dark:border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CopyLicenseButton licenseKey={lic.key} />
                        <span className="text-[11px] text-slate-400 font-mono">
                          {lic.macAddress ? `(MAC: ${lic.macAddress})` : "(غير معين)"}
                        </span>
                      </div>
                      {getExpirationBadge(lic.expiresAt, lic.status)}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-0.5">
                      <span>تاريخ الانتهاء:</span>
                      <span className="font-mono">{new Date(lic.expiresAt).toLocaleDateString("ar-EG")}</span>
                    </div>

                    {lic.status === "EMERGENCY_MODE" && (
                      <div className="flex items-center justify-between gap-2 mt-1.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                        <span className="text-amber-500 font-bold flex items-center gap-1 text-[11px]">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                          طلب استبدال جهاز
                        </span>
                        <ApproveSwapButton licenseId={lic.id} newMac={lic.macAddress || ""} />
                      </div>
                    )}
                  </div>
                ))}

                {tenant.licenses.length === 0 && (
                  <div className="text-slate-400 text-xs italic py-1">لا توجد تراخيص مسجلة</div>
                )}
              </div>

              {/* Card Footer: Quick Actions */}
              <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">الإجراءات السريعة:</span>
                <LicenseQuickActions
                  tenantId={tenant.id}
                  tenantName={tenant.name}
                  displaySlug={displaySlug}
                  adminUsername={adminUsername}
                  adminRole={adminRole}
                  isActive={tenant.isActive}
                  licenseId={primaryLic?.id}
                  licenseKey={primaryLic?.key}
                />
              </div>
            </div>
          );
        })}

        {filteredTenants.length === 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-8 text-center text-slate-400 font-bold border border-slate-200 dark:border-white/10">
            لا توجد نتائج مطابقة لمحددات البحث.
          </div>
        )}
      </div>

      {/* ── 2. DESKTOP TABLE VIEW (For Viewports >= 768px) ── */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400 text-xs font-bold">
              <tr>
                <th className="p-4 font-bold text-right">العميل (Tenant)</th>
                <th className="p-4 font-bold text-right">النطاق (Domain)</th>
                <th className="p-4 font-bold text-right">الحالة</th>
                <th className="p-4 font-bold text-right">التراخيص وموعد الانتهاء</th>
                <th className="p-4 font-bold text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-sm">
              {pagedTenants.map((tenant) => {
                const displaySlug = tenant.slug || "";
                const userMeta = adminMap.get(tenant.id);
                const adminUsername = userMeta?.username || "";
                const adminRole = userMeta?.roleStr || "ADMIN";
                const primaryLic = tenant.licenses[0];

                return (
                  <tr key={tenant.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    {/* Tenant Column */}
                    <td className="p-4">
                      <div className="font-bold text-slate-900 dark:text-white">{tenant.name}</div>
                      {Boolean(adminUsername) && (
                        <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-1" dir="ltr">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{adminUsername}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300 font-sans font-bold">
                            {adminRole}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Domain Column */}
                    <td className="p-4" dir="ltr">
                      <div className="font-mono text-sm font-bold text-slate-700 dark:text-zinc-300">{displaySlug}</div>
                      {Boolean(displaySlug) && (
                        <a
                          href={`https://${displaySlug}.casper-erp.com/login`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-sans font-bold text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                        >
                          <ExternalLink className="w-3 h-3 rtl:rotate-180" /> رابط الدخول المباشر
                        </a>
                      )}
                    </td>

                    {/* Status Column */}
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-black ${
                          tenant.isActive
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {tenant.isActive ? "نشط" : "معطل"}
                      </span>
                    </td>

                    {/* Licenses Column */}
                    <td className="p-4">
                      <div className="space-y-2">
                        {tenant.licenses.map((lic) => (
                          <div key={lic.id} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <CopyLicenseButton licenseKey={lic.key} />
                              <span className="text-xs text-slate-400 font-mono">
                                {lic.macAddress ? `(MAC: ${lic.macAddress})` : "(غير معين)"}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                              {getExpirationBadge(lic.expiresAt, lic.status)}
                              <span className="text-[10px] text-slate-400">
                                تاريخ: {new Date(lic.expiresAt).toLocaleDateString("ar-EG")}
                              </span>
                            </div>

                            {lic.status === "EMERGENCY_MODE" && (
                              <div className="flex items-center gap-2 mt-1.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                                <span className="text-amber-500 font-bold flex items-center gap-1 text-xs">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  تنبيه استبدال الجهاز (MAC: {lic.macAddress})
                                </span>
                                <ApproveSwapButton licenseId={lic.id} newMac={lic.macAddress || ""} />
                              </div>
                            )}
                          </div>
                        ))}

                        {tenant.licenses.length === 0 && (
                          <span className="text-slate-400 text-xs italic">لا توجد تراخيص مسجلة</span>
                        )}
                      </div>
                    </td>

                    {/* Actions Column */}
                    <td className="p-4 text-left">
                      <LicenseQuickActions
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        displaySlug={displaySlug}
                        adminUsername={adminUsername}
                        adminRole={adminRole}
                        isActive={tenant.isActive}
                        licenseId={primaryLic?.id}
                        licenseKey={primaryLic?.key}
                      />
                    </td>
                  </tr>
                );
              })}

              {filteredTenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400 font-bold">
                    لا توجد نتائج مطابقة لمحددات البحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination & Load More Controls */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs sm:text-sm font-bold text-slate-700 dark:text-zinc-300 shadow-sm transition-all min-h-[44px]"
          >
            <ChevronDown className="w-4 h-4" />
            عرض المزيد (متبقي {filteredTenants.length - visibleCount} عميل)
          </button>
        </div>
      )}
    </div>
  );
}
