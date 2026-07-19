"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { getSession } from "@/lib/auth";
import { z } from "zod";
import crypto from "crypto";

const provisionSchema = z.object({
  name: z.string().min(2),
  domain: z.string().min(3)
});

export const provisionNewTenant = secureAction(
  async (payload: z.infer<typeof provisionSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { name, domain } = provisionSchema.parse(payload);

    // Use a transaction to prevent partial provisioning
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Tenant
      const tenantId = `tenant-${crypto.randomBytes(4).toString("hex")}`;
      const syncSecret = crypto.randomBytes(32).toString("hex");
      const branchId = `branch-${crypto.randomBytes(4).toString("hex")}`;
      
      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name,
          domain,
          branchId,
          syncSecret
        }
      });

      // 2. Create Branch
      await tx.branch.create({
        data: {
          id: branchId,
          name: `${name} Main Branch`,
          type: "CENTER",
          tenantId
        }
      });

      // 3. Create License
      const activationCode = crypto.randomBytes(6).toString("hex").toUpperCase();
      await tx.license.create({
        data: {
          id: `lic-${crypto.randomBytes(4).toString("hex")}`,
          tenantId,
          branchId,
          licenseKey: activationCode,
          status: "ACTIVE",
          validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
        }
      });

      return { tenant, activationCode };
    });

    return { activationCode: result.activationCode };
  },
  { requireCSRF: false } // Temporary disable CSRF for internal API simplicity
);

const toggleSchema = z.object({
  tenantId: z.string()
});

export const toggleTenantStatus = secureAction(
  async (payload: z.infer<typeof toggleSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { tenantId } = toggleSchema.parse(payload);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) throw new Error("Tenant not found");

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { isActive: !tenant.isActive }
    });

    return { success: true };
  },
  { requireCSRF: false }
);

const approveSwapSchema = z.object({
  licenseId: z.string(),
  newMac: z.string()
});

export const approveHardwareSwap = secureAction(
  async (payload: z.infer<typeof approveSwapSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { licenseId, newMac } = approveSwapSchema.parse(payload);

    const license = await prisma.license.findUnique({
      where: { id: licenseId }
    });

    if (!license) throw new Error("License not found");

    await prisma.license.update({
      where: { id: licenseId },
      data: { 
        macAddress: newMac,
        status: "ACTIVE" 
      }
    });

    return { success: true };
  },
  { requireCSRF: false }
);
