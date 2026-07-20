"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { getSession } from "@/lib/auth";
import { z } from "zod";
import crypto from "crypto";

const provisionSchema = z.object({
  name: z.string().min(2),
  domain: z.string().min(3),
  adminUsername: z.string().min(3),
  adminPassword: z.string().min(6),
  adminRole: z.enum(["ADMIN", "MANAGER", "STAFF"]).default("ADMIN"),
  csrfToken: z.string().optional()
});

export const provisionNewTenant = secureAction(
  async (payload: z.infer<typeof provisionSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { name, domain, adminUsername, adminPassword, adminRole } = provisionSchema.parse(payload);

    // Hash admin password
    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

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
          slug: domain,
          branchId,
          syncSecret
        }
      });

      // 2. Create Branch
      await tx.branch.create({
        data: {
          id: branchId,
          name: `${name} Main Branch`,
          code: `${domain.toUpperCase()}-MAIN`,
          type: "CENTER",
          tenantId
        }
      });

      // 3. Create User with selected role
      await tx.user.create({
        data: {
          username: adminUsername,
          password: hashedPassword,
          name: name,
          roleStr: adminRole || "ADMIN",
          tenantId,
          branchId,
          isGlobalAdmin: false
        }
      });

      // 4. Create License
      const randomCode = crypto.randomBytes(3).toString("hex").toUpperCase();
      const activationCode = `CASPER-${randomCode}`;
      await tx.license.create({
        data: {
          id: `lic-${crypto.randomBytes(4).toString("hex")}`,
          tenantId,
          key: activationCode,
          macAddress: "",
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          status: "ACTIVE"
        }
      });

      return { tenant, activationCode };
    });

    return { activationCode: result.activationCode };
  }
);

const toggleSchema = z.object({
  tenantId: z.string(),
  csrfToken: z.string().optional()
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
  }
);

const approveSwapSchema = z.object({
  licenseId: z.string(),
  newMac: z.string(),
  csrfToken: z.string().optional()
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
        status: "ACTIVE",
        emergencyModeAt: null
      }
    });

    return { success: true };
  }
);

const editTenantSchema = z.object({
  tenantId: z.string(),
  name: z.string().min(2).max(100),
  adminUsername: z.string().min(3).optional(),
  newPassword: z.string().min(6).optional().or(z.literal("")),
  adminRole: z.enum(["ADMIN", "MANAGER", "STAFF"]).optional(),
  csrfToken: z.string().optional()
});

export const editTenant = secureAction(
  async (payload: z.infer<typeof editTenantSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { tenantId, name, adminUsername, newPassword, adminRole } = editTenantSchema.parse(payload);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) throw new Error("Tenant not found");

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name }
    });

    // Update Primary User if password, username, or role changed
    const adminUser = await prisma.user.findFirst({
      where: { tenantId }
    });

    if (adminUser) {
      const updateData: any = {};
      if (adminUsername && adminUsername.trim() !== "" && adminUsername !== adminUser.username) {
        updateData.username = adminUsername.trim();
      }
      if (adminRole && adminRole !== adminUser.roleStr) {
        updateData.roleStr = adminRole;
      }
      if (newPassword && newPassword.trim().length >= 6) {
        const bcrypt = require("bcryptjs");
        updateData.password = await bcrypt.hash(newPassword.trim(), 12);
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id: adminUser.id },
          data: updateData
        });
      }
    }

    return { success: true };
  }
);
