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
  duration: z.enum(['14_DAYS', '1_MONTH', '6_MONTHS', '1_YEAR', 'LIFETIME']).default('14_DAYS'),
  csrfToken: z.string().optional()
});

export const provisionNewTenant = secureAction(
  async (payload: z.infer<typeof provisionSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { name, domain, adminUsername, adminPassword, adminRole, duration } = provisionSchema.parse(payload);

    // Hash admin password
    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    try {
      // Use a transaction to prevent partial provisioning
      const result = await prisma.$transaction(async (tx) => {
        // 1. Create Tenant
        const tenantId = `tenant-${crypto.randomBytes(4).toString("hex")}`;
        const syncSecret = crypto.randomBytes(32).toString("hex");
        const branchId = `branch-${crypto.randomBytes(4).toString("hex")}`;
        
        const cleanSlug = domain.replace(/\.casper-erp\.com$/i, "").trim();
        const { domainToUnicode } = require("url");
        const normalizedSlug = domainToUnicode(cleanSlug);

        const tenant = await tx.tenant.create({
          data: {
            id: tenantId,
            name,
            slug: normalizedSlug,
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

        // 4. Create License with 96-bit entropy format (CASPER-XXXX-XXXX-XXXX)
        const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
        const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
        const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
        const activationCode = `CASPER-${p1}-${p2}-${p3}`;

        // Calculate expiration date
        let expiresAt = new Date();
        switch (duration) {
          case '14_DAYS':
            expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            break;
          case '1_MONTH':
            expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            break;
          case '6_MONTHS':
            expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
            break;
          case '1_YEAR':
            expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            break;
          case 'LIFETIME':
            expiresAt = new Date('2099-12-31T23:59:59Z');
            break;
        }

        await tx.license.create({
          data: {
            id: `lic-${crypto.randomBytes(4).toString("hex")}`,
            tenantId,
            key: activationCode,
            macAddress: "",
            expiresAt,
            status: "ACTIVE"
          }
        });

        return { tenant, activationCode };
      });

      return { activationCode: result.activationCode };
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
        throw new Error("هذا المعرف (Subdomain) مستخدم بالفعل، يرجى اختيار اسم آخر.");
      }
      throw error;
    }
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

const renewLicenseSchema = z.object({
  licenseId: z.string(),
  durationDays: z.number().positive(),
  csrfToken: z.string().optional()
});

export const renewLicense = secureAction(
  async (payload: z.infer<typeof renewLicenseSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { licenseId, durationDays } = renewLicenseSchema.parse(payload);

    const license = await prisma.license.findUnique({
      where: { id: licenseId }
    });

    if (!license) throw new Error("License not found");

    const currentExpiry = new Date(license.expiresAt).getTime();
    const baseTime = Math.max(Date.now(), currentExpiry);
    const newExpiresAt = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000);

    await prisma.license.update({
      where: { id: licenseId },
      data: {
        expiresAt: newExpiresAt,
        status: "ACTIVE"
      }
    });

    return { success: true, newExpiresAt: newExpiresAt.toISOString() };
  }
);

const revokeLicenseSchema = z.object({
  licenseId: z.string(),
  tenantId: z.string(),
  csrfToken: z.string().optional()
});

export const revokeLicense = secureAction(
  async (payload: z.infer<typeof revokeLicenseSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { licenseId, tenantId } = revokeLicenseSchema.parse(payload);

    await prisma.$transaction([
      prisma.license.update({
        where: { id: licenseId },
        data: { status: "REVOKED" }
      }),
      prisma.tenant.update({
        where: { id: tenantId },
        data: { isActive: false }
      })
    ]);

    return { success: true };
  }
);

