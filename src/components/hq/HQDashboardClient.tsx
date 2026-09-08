"use client";

import React, { useState, useMemo } from "react";
import { TrendingUp, KeyRound, Wrench, Building2, MessageSquare } from "lucide-react";
import { ProvisionTenantModal } from "@/components/hq/ProvisionTenantModal";
import { SalesPipelineTab, PipelineMetrics } from "@/components/hq/SalesPipelineTab";
import { TenantsManagementTab } from "@/components/hq/TenantsManagementTab";
import { TechSupportTab } from "@/components/hq/TechSupportTab";
import { WhatsAppGatewayTab } from "@/components/hq/WhatsAppGatewayTab";

import { computePipelineMetrics, TenantWithLicense } from "@/lib/hq-metrics";

import { MobileLicenseModal } from "@/components/hq/MobileLicenseModal";
import { ChangeSuperAdminPasswordModal } from "@/components/hq/ChangeSuperAdminPasswordModal";
import { Smartphone } from "lucide-react";

interface HQDashboardClientProps {
  tenants: TenantWithLicense[];
  adminMap: Map<string, { username: string; roleStr: string }>;
}

export function HQDashboardClient({ tenants, adminMap }: HQDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<"pipeline" | "tenants" | "support" | "whatsapp">("pipeline");
  const [tenantsTabFilter, setTenantsTabFilter] = useState<string>("all");
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);

  // Calculate Pipeline Metrics via pure utility
  const metrics: PipelineMetrics = useMemo(() => {
    return computePipelineMetrics(tenants);
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
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10">
        <div>
          <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2 text-slate-900 dark:text-white">
            <Building2 className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500 shrink-0" />
            لوحة تحكم كاسبر الرئيسية (Control Plane)
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-xs sm:text-sm mt-1">
            إدارة المستأجرين (Tenants)، تتبع أنبوب المبيعات، وتوليد مفاتيح التجاوز وتراخيص الموبايل.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
          <ChangeSuperAdminPasswordModal />
          <button
            onClick={() => setIsMobileModalOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-md shadow-blue-600/20 transition-all cursor-pointer min-h-[44px]"
          >
            <Smartphone className="w-4 h-4" />
            📱 كود تفعيل الموبايل
          </button>
          <div className="flex-1 sm:flex-initial">
            <ProvisionTenantModal />
          </div>
        </div>
      </div>

      <MobileLicenseModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
      />

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2 overflow-x-auto no-scrollbar scroll-smooth">
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] ${
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
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] ${
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
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] ${
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

        <button
          onClick={() => setActiveTab("whatsapp")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] ${
            activeTab === "whatsapp"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
              : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          بوابة واتساب والرسائل
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

        {activeTab === "whatsapp" && (
          <WhatsAppGatewayTab />
        )}
      </div>
    </div>
  );
}
