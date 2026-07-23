"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renewLicense, revokeLicense } from "@/actions/hq-tenant-actions";
import { generateCSRFToken } from "@/lib/csrf-client";
import { toast } from "sonner";
import { Loader2, PlusCircle, ShieldOff, Copy, Check } from "lucide-react";
import ConfirmationModal from "@/components/ui/ConfirmationModal";
import { EditTenantModal } from "@/components/hq/EditTenantModal";
import { ToggleTenantButton } from "@/components/hq/ToggleTenantButton";

interface LicenseQuickActionsProps {
  tenantId: string;
  tenantName: string;
  displaySlug: string;
  adminUsername: string;
  adminRole: string;
  isActive: boolean;
  licenseId?: string;
  licenseKey?: string;
}

export function LicenseQuickActions({
  tenantId,
  tenantName,
  displaySlug,
  adminUsername,
  adminRole,
  isActive,
  licenseId,
  licenseKey
}: LicenseQuickActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);

  const handleRenew = async (days: number) => {
    if (!licenseId) {
      toast.error("لا يوجد ترخيص لهذا العميل");
      return;
    }

    setActionLoading(`renew-${days}`);
    try {
      const csrfToken = await generateCSRFToken();
      const res = await renewLicense({ licenseId, durationDays: days, csrfToken });
      
      if (res?.success) {
        toast.success(`تم تمديد الترخيص بنجاح لمدة ${days} يومًا`);
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error("تعذر تمديد الترخيص");
      }
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء التمديد");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!licenseId) return;

    setActionLoading("revoke");
    try {
      const csrfToken = await generateCSRFToken();
      const res = await revokeLicense({ licenseId, tenantId, csrfToken });

      if (res?.success) {
        toast.success("تم إلغاء الترخيص وإيقاف العميل بنجاح");
        setRevokeModalOpen(false);
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error("تعذر إلغاء الترخيص");
      }
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الإلغاء");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyKey = () => {
    if (!licenseKey) return;
    navigator.clipboard.writeText(licenseKey);
    setCopied(true);
    toast.success("تم نسخ كود التفعيل");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-end gap-1.5 flex-wrap" dir="rtl">
      {/* Copy Key Button */}
      {Boolean(licenseKey) && (
        <button
          onClick={handleCopyKey}
          title="نسخ كود التفعيل"
          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 transition-all text-xs font-bold flex items-center gap-1"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Renew +30 Days */}
      {Boolean(licenseId) && (
        <button
          onClick={() => handleRenew(30)}
          disabled={Boolean(actionLoading) || isPending}
          title="تمديد الترخيص 30 يومًا"
          className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1"
        >
          {actionLoading === "renew-30" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <PlusCircle className="w-3.5 h-3.5" />
          )}
          +30 يوم
        </button>
      )}

      {/* Renew +365 Days */}
      {Boolean(licenseId) && (
        <button
          onClick={() => handleRenew(365)}
          disabled={Boolean(actionLoading) || isPending}
          title="تمديد الترخيص سنة كاملة"
          className="hidden sm:flex px-2.5 py-1 rounded-lg border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-400 text-xs font-bold transition-all disabled:opacity-50 items-center gap-1"
        >
          {actionLoading === "renew-365" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <PlusCircle className="w-3.5 h-3.5" />
          )}
          +1 سنة
        </button>
      )}

      {/* Edit Tenant Modal */}
      <EditTenantModal
        tenantId={tenantId}
        initialName={tenantName}
        slug={displaySlug}
        initialAdminUsername={adminUsername}
        initialAdminRole={adminRole}
      />

      {/* Toggle Active Status */}
      <ToggleTenantButton tenantId={tenantId} isActive={isActive} />

      {/* Revoke License Button */}
      {Boolean(licenseId) && isActive && (
        <button
          onClick={() => setRevokeModalOpen(true)}
          disabled={Boolean(actionLoading) || isPending}
          title="إلغاء الترخيص وإيقاف العميل"
          className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1"
        >
          <ShieldOff className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Revoke Confirmation Modal */}
      <ConfirmationModal
        isOpen={revokeModalOpen}
        onClose={() => setRevokeModalOpen(false)}
        onConfirm={handleRevokeConfirm}
        title="إلغاء الترخيص وإيقاف العميل"
        message={`هل أنت أكتد من إلغاء ترخيص العميل (${tenantName})؟ سيؤدي هذا الإلغاء إلى تعطيل العميل وتوقف أجهزة POS المرتبطة به خلال 6 ساعات.`}
        confirmText="نعم، إلغاء الترخيص"
        cancelText="تراجع"
        loading={actionLoading === "revoke"}
        variant="danger"
      />
    </div>
  );
}
