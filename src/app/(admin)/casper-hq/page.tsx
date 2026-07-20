import { prisma, isPostgres } from "@/lib/prisma";
import { ProvisionTenantModal } from "@/components/hq/ProvisionTenantModal";
import { ToggleTenantButton } from "@/components/hq/ToggleTenantButton";
import { ApproveSwapButton } from "@/components/hq/ApproveSwapButton";
import { CopyLicenseButton } from "@/components/hq/CopyLicenseButton";
import { EditTenantModal } from "@/components/hq/EditTenantModal";

export default async function HQDashboard() {
  if (!isPostgres) {
    return (
      <div className="p-6 bg-amber-50 dark:bg-zinc-900 text-amber-800 dark:text-amber-500 rounded-2xl border border-amber-200 dark:border-white/10 space-y-2">
        <h2 className="text-xl font-black">Casper Control Plane Unavailable</h2>
        <p className="text-sm">
          The Casper Control Plane (HQ Dashboard) manages global SaaS tenants and requires a PostgreSQL connection (Cloud Core).
        </p>
        <p className="text-xs opacity-75">
          Local SQLite nodes operate in single-tenant offline mode and do not support control plane features.
        </p>
      </div>
    );
  }

  const tenants = await prisma.tenant.findMany({
    include: {
      licenses: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10">
        <div>
          <h2 className="text-2xl font-black">لوحة تحكم كاسبر (Control Plane)</h2>
          <p className="text-slate-500">إدارة إنشاء المستأجرين (Tenants) وتراخيص الأجهزة بسهولة.</p>
        </div>
        <ProvisionTenantModal />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 dark:bg-zinc-800/50">
            <tr>
              <th className="p-4 font-bold text-right">العميل (Tenant)</th>
              <th className="p-4 font-bold text-right">النطاق الفرعي (Domain)</th>
              <th className="p-4 font-bold text-right">الحالة (Status)</th>
              <th className="p-4 font-bold text-right">التراخيص وكود التفعيل</th>
              <th className="p-4 font-bold text-left">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(tenant => {
              const displaySlug = tenant.slug || (tenant as any).domain || "";
              return (
                <tr key={tenant.id} className="border-t border-slate-100 dark:border-white/5">
                  <td className="p-4 font-semibold">{tenant.name}</td>
                  <td className="p-4 text-slate-500 font-mono text-sm" dir="ltr">{displaySlug}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black ${tenant.isActive ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
                      {tenant.isActive ? 'نشط' : 'معطل'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="space-y-2">
                      {tenant.licenses.map(lic => (
                        <div key={lic.id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CopyLicenseButton licenseKey={lic.key} />
                            <span className="text-xs text-slate-400 font-medium">
                              {lic.macAddress ? `(MAC: ${lic.macAddress})` : "(غير معين)"}
                            </span>
                          </div>
                          {lic.status === 'EMERGENCY_MODE' && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-amber-500 font-bold flex items-center gap-1 text-xs">
                                ⚠️ تنبيه استبدال الجهاز (MAC: {lic.macAddress})
                                {lic.emergencyModeAt && (
                                  <span className="text-xs font-normal text-slate-500 ml-1">
                                    (ينتهي خلال: {Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - new Date(lic.emergencyModeAt).getTime())) / (60 * 60 * 1000)))} ساعة)
                                  </span>
                                )}
                              </span>
                              <ApproveSwapButton licenseId={lic.id} newMac={lic.macAddress || ''} />
                            </div>
                          )}
                        </div>
                      ))}
                      {tenant.licenses.length === 0 && (
                        <span className="text-slate-400 text-xs italic">لا توجد تراخيص مكسوة</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-left">
                    <div className="flex items-center justify-end gap-2">
                      <EditTenantModal tenantId={tenant.id} initialName={tenant.name} slug={displaySlug} />
                      <ToggleTenantButton tenantId={tenant.id} isActive={tenant.isActive} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">لا يوجد عملاء مضافين حالياً.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
