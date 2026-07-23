export const LIFETIME_YEAR_THRESHOLD = 2090;

export interface TenantWithLicense {
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

export interface PipelineMetrics {
  total: number;
  active: number;
  trial: number;
  expiringSoon: number;
  expiredOrSuspended: number;
}

export type TenantStage = "active" | "trial" | "expiring" | "expired";

/**
 * Pure function to classify a tenant into a specific pipeline stage.
 * Strict priority order:
 * 1. Disabled or Revoked -> expired (expiredOrSuspended)
 * 2. No primary license or expired date -> expired
 * 3. Brand new tenant (<=14d) with no license -> trial
 * 4. License expiring within 7 days -> expiring
 * 5. Tenant <= 14d old with license <= 30d and not fully active -> trial
 * 6. Default -> active
 */
export function classifyTenant(tenant: TenantWithLicense, now: number = Date.now()): TenantStage {
  const primaryLic = tenant.licenses[0];

  if (!tenant.isActive || primaryLic?.status === "REVOKED") {
    return "expired";
  }

  if (!primaryLic) {
    const createdDaysAgo = Math.ceil((now - new Date(tenant.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return createdDaysAgo <= 14 ? "trial" : "expired";
  }

  const expiresAt = new Date(primaryLic.expiresAt).getTime();
  const isLifetime = new Date(primaryLic.expiresAt).getFullYear() > LIFETIME_YEAR_THRESHOLD;
  const daysRemaining = isLifetime ? 99999 : Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
  const createdDaysAgo = Math.ceil((now - new Date(tenant.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) {
    return "expired";
  }

  if (daysRemaining <= 7) {
    return "expiring";
  }

  if (createdDaysAgo <= 14 && daysRemaining <= 30 && primaryLic.status !== "ACTIVE") {
    return "trial";
  }

  return "active";
}

/**
 * Computes summary pipeline metrics for all tenants.
 */
export function computePipelineMetrics(tenants: TenantWithLicense[], now: number = Date.now()): PipelineMetrics {
  let total = tenants.length;
  let active = 0;
  let trial = 0;
  let expiringSoon = 0;
  let expiredOrSuspended = 0;

  tenants.forEach((tenant) => {
    const stage = classifyTenant(tenant, now);
    switch (stage) {
      case "active":
        active++;
        break;
      case "trial":
        trial++;
        break;
      case "expiring":
        expiringSoon++;
        break;
      case "expired":
        expiredOrSuspended++;
        break;
    }
  });

  return { total, active, trial, expiringSoon, expiredOrSuspended };
}
