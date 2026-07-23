"use client";

import React, { useState, useMemo } from "react";
import { TrendingUp, KeyRound, Wrench, Building2 } from "lucide-react";
import { ProvisionTenantModal } from "@/components/hq/ProvisionTenantModal";
import { SalesPipelineTab, PipelineMetrics } from "@/components/hq/SalesPipelineTab";
import { TenantsManagementTab } from "@/components/hq/TenantsManagementTab";
import { TechSupportTab } from "@/components/hq/TechSupportTab";

interface TenantWithLicense {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string | Date;
  licenses: {
    id: string;
    key: string;
    macAddress: string;
    expiresAt: string | Date;
    status: string;
    emergencyModeAt?: string | Date | null;
  }[];
}

interface HQDashboardClientProps {
  tenants: TenantWithLicense[];
  adminMap: Map<string, { username: string; roleStr: string }>;
}

export function HQDashboardClient({ tenants, adminMap }: HQDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<"pipeline" | "tenants" | "support">("pipeline");
  const [tenantsTabFilter, setTenantsTabFilter] = useState<string>("all");

  // Calculate Pipeline Metrics
  const metrics: PipelineMetrics = useMemo(() => {
    const now = Date.now();
    let total = tenants.length;
    let active = 0;
    let trial = 0;
    let expiringSoon = 0;
    let expiredOrSuspended = 0;

    tenants.forEach((t) => {
      const primaryLic = t.licenses[0];
      const createdDaysAgo = Math.ceil((now - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const expiresAt = primaryLic ? new Date(primaryLic.expiresAt).getTime() : 0;
      const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

      if (!t.isActive || daysRemaining <= 0 || primaryLic?.status === "REVOKED") {
        expiredOrSuspended++;
      } else if (createdDaysAgo <= 14 && (!primaryLic || daysRemaining <= 14)) {
        trial++;
      } else if (daysRemaining <= 7) {
        expiringSoon++;
      } else {
        active++;
      }
    });

    return { total, active, trial, expiringSoon, expiredOrSuspended };
  }, [tenants]);

  // Collect emergency swap licenses
  const emergencyLicenses = useMemo(() => {
    const list: { id: string; key: string; macAddress: string; emergencyModeAt?: string | Date | null; tenantName: string }[] = [];
    tenants.forEach((t) => {
      t.licenses.forEach((lic) => {
        if (lic.status === "EMERGENCY_MODE") {
          list.push({
            id: lic.id,
            key: lic.key,
            macAddress: lic.macAddress,
            emergencyModeAt: lic.emergencyModeAt,
            tenantName: t.name
          });
        }
      });
    });
    return list;
  }, [tenants]);

  const handleSelectPipelineFilter = (filterKey: string) => {
    setTenantsTabFilter(filterKey);
    setActiveTab("tenants");
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-2">
            <Building2 className="w-7 h-7 text-blue-500" />
            لوحة تحكم كاسبر الرئيسية (Control Plane)
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-sm mt-0.5">
            إدارة المستأجرين (Tenants)، تتبع أنبوب المبيعات، وتوليد مفاتيح التجاوز للدعم الفني.
          </p>
        </div>
        <ProvisionTenantModal />
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${
            activeTab === "pipeline"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
              : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          أنبوب المبيعات والعملاء ({tenants.length})
        </button>

        <button
          onClick={() => setActiveTab("tenants")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${
            activeTab === "tenants"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
              : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10"
          }`}
        >
          <KeyRound className="w-4 h-4" />
          إدارة التراخيص والمستأجرين
        </button>

        <button
          onClick={() => setActiveTab("support")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${
            activeTab === "support"
              ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
              : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10"
          }`}
        >
          <Wrench className="w-4 h-4" />
          الدعم الفني وتجاوز الصلاحيات
          {emergencyLicenses.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950 font-black animate-pulse">
              {emergencyLicenses.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="pt-2">
        {activeTab === "pipeline" && (
          <SalesPipelineTab metrics={metrics} onSelectFilter={handleSelectPipelineFilter} />
        )}

        {activeTab === "tenants" && (
          <TenantsManagementTab
            tenants={tenants}
            adminMap={adminMap}
            initialFilter={tenantsTabFilter}
          />
        )}

        {activeTab === "support" && (
          <TechSupportTab emergencyLicenses={emergencyLicenses} />
        )}
      </div>
    </div>
  );
}
