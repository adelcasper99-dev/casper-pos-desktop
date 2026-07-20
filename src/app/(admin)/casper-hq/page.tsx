import { prisma, isPostgres } from "@/lib/prisma";
import { ProvisionTenantModal } from "@/components/hq/ProvisionTenantModal";
import { ToggleTenantButton } from "@/components/hq/ToggleTenantButton";
import { ApproveSwapButton } from "@/components/hq/ApproveSwapButton";

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
      branches: true,
      licenses: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10">
        <div>
          <h2 className="text-2xl font-black">Casper Control Plane</h2>
          <p className="text-slate-500">Manage all tenant provisioning and hardware licenses.</p>
        </div>
        <ProvisionTenantModal />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-zinc-800/50">
            <tr>
              <th className="p-4 font-bold">Tenant</th>
              <th className="p-4 font-bold">Domain</th>
              <th className="p-4 font-bold">Status</th>
              <th className="p-4 font-bold">Licenses</th>
              <th className="p-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(tenant => (
              <tr key={tenant.id} className="border-t border-slate-100 dark:border-white/5">
                <td className="p-4 font-semibold">{tenant.name}</td>
                <td className="p-4 text-slate-500">{tenant.domain}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-black ${tenant.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {tenant.isActive ? 'ACTIVE' : 'SUSPENDED'}
                  </span>
                </td>
                <td className="p-4">
                  {tenant.licenses.map(lic => (
                    <div key={lic.id} className="text-sm">
                      {lic.status === 'EMERGENCY_MODE' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-500 font-bold flex items-center gap-1">
                            ⚠️ Hardware Swap Alert (MAC: {lic.macAddress})
                            {lic.emergencyModeAt && (
                              <span className="text-xs font-normal text-slate-500 ml-1">
                                (Expires in: {Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - new Date(lic.emergencyModeAt).getTime())) / (60 * 60 * 1000)))}h)
                              </span>
                            )}
                          </span>
                          <ApproveSwapButton licenseId={lic.id} newMac={lic.macAddress || ''} />
                        </div>
                      ) : (
                        <span className="text-slate-500">MAC: {lic.macAddress || 'Unassigned'}</span>
                      )}
                    </div>
                  ))}
                </td>
                <td className="p-4 text-right">
                  <ToggleTenantButton tenantId={tenant.id} isActive={tenant.isActive} />
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">No tenants found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
