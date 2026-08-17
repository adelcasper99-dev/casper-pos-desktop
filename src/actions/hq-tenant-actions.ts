"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { getSession } from "@/lib/auth";
import { z } from "zod";
import crypto from "crypto";
import { LIFETIME_YEAR_THRESHOLD } from "@/lib/hq-metrics";

const provisionSchema = z.object({
  name: z.string().min(2),
  domain: z.string().min(3),
  adminUsername: z.string().min(3),
  adminPassword: z.string().min(6),
  adminRole: z.enum(["ADMIN", "MANAGER", "STAFF"]).default("ADMIN"),
  duration: z.enum(['14_DAYS', '1_MONTH', '6_MONTHS', '1_YEAR', 'LIFETIME']).default('14_DAYS'),
  csrfToken: z.string().optional()
});

export async function provisionTenantCore(params: {
  name: string;
  domain: string;
  adminUsername: string;
  adminPassword: string;
  adminRole?: "ADMIN" | "MANAGER" | "STAFF";
  duration?: '14_DAYS' | '1_MONTH' | '6_MONTHS' | '1_YEAR' | 'LIFETIME';
  email?: string;
  phone?: string;
}) {
  const { name, domain, adminUsername, adminPassword, adminRole = "ADMIN", duration = '14_DAYS', email, phone } = params;

  const bcrypt = require("bcryptjs");
  const { Prisma } = require("@prisma/client");
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const cleanSlug = domain.replace(/\.casper-erp\.com$/i, "").trim().toLowerCase();
  const { domainToUnicode } = require("url");
  const normalizedSlug = domainToUnicode(cleanSlug);

  return await prisma.$transaction(async (tx) => {
    const tenantId = normalizedSlug;
    const syncSecret = crypto.randomBytes(32).toString("hex");
    const branchId = `branch-${crypto.randomBytes(4).toString("hex")}`;

    // 1. Create Tenant
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
        code: `${cleanSlug.toUpperCase()}-MAIN`,
        type: "CENTER",
        tenantId
      }
    });

    // 3. Create User
    const user = await tx.user.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        name: name,
        phone: phone || null,
        roleStr: adminRole,
        tenantId,
        branchId,
        isGlobalAdmin: false
      }
    });

    // 4. Create Main Cash Treasury
    await tx.treasury.create({
      data: {
        id: `treasury-${crypto.randomBytes(4).toString("hex")}`,
        name: "الخزنة النقدية الرئيسية",
        isDefault: true,
        branchId,
        tenantId,
        balance: new Prisma.Decimal(0.00)
      }
    });

    // 5. Create Default Store Settings
    await tx.storeSettings.create({
      data: {
        id: `settings-${crypto.randomBytes(4).toString("hex")}`,
        name: name,
        currency: "EGP",
        taxRate: new Prisma.Decimal(0.00),
        tenantId,
        trialStartDate: new Date()
      }
    });

    // 6. Create Standard Double-Entry Chart of Accounts
    const defaultAccounts = [
      { code: "1110", name: "النقدية بالخزينة", type: "ASSET" },
      { code: "1120", name: "العملاء والحسابات المدينة", type: "ASSET" },
      { code: "1200", name: "المخزون السلعي", type: "ASSET" },
      { code: "2110", name: "الموردون والحسابات الدائنة", type: "LIABILITY" },
      { code: "4100", name: "إيرادات المبيعات", type: "REVENUE" },
      { code: "5100", name: "تكلفة البضاعة المباعة", type: "EXPENSE" },
    ];
    for (const acc of defaultAccounts) {
      await tx.account.create({
        data: {
          id: `acc-${acc.code}-${crypto.randomBytes(3).toString("hex")}`,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          tenantId
        }
      });
    }

    // 7. Generate Activation Code & License
    const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const activationCode = `CASPER-${p1}-${p2}-${p3}`;

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

    return { tenant, user, branchId, activationCode };
  });
}

export const provisionNewTenant = secureAction(
  async (payload: z.infer<typeof provisionSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { name, domain, adminUsername, adminPassword, adminRole, duration } = provisionSchema.parse(payload);

    try {
      const result = await provisionTenantCore({
        name,
        domain,
        adminUsername,
        adminPassword,
        adminRole,
        duration
      });

      return { activationCode: result.activationCode };
    } catch (error: unknown) {
      const prismaErr = error as { code?: string; meta?: { target?: string[] } } | null;
      if (prismaErr?.code === 'P2002' && prismaErr?.meta?.target?.includes('slug')) {
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
  adminUsername: z.string().min(3).optional().or(z.literal("")),
  newPassword: z.string().min(6).optional().or(z.literal("")),
  adminRole: z.enum(["ADMIN", "MANAGER", "STAFF", "SUPER_ADMIN"]).optional().or(z.literal("")),
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
      const updateData: { username?: string; roleStr?: string; password?: string } = {};
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
  durationDays: z.number().int().positive().max(3650),
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

    // Lifetime License Guard
    if (new Date(license.expiresAt).getFullYear() > LIFETIME_YEAR_THRESHOLD) {
      return { success: true, newExpiresAt: new Date(license.expiresAt).toISOString() };
    }

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

    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      select: { id: true, tenantId: true }
    });

    if (!license) {
      throw new Error("License not found");
    }

    // IDOR Protection: Verify license belongs to the specified tenantId
    if (license.tenantId !== tenantId) {
      throw new Error("License does not belong to the specified tenant.");
    }

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

const deleteTenantSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID مطلوب"),
  csrfToken: z.string().optional()
});

export const deleteTenantAction = secureAction(
  async (payload: z.infer<typeof deleteTenantSchema>) => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { tenantId } = deleteTenantSchema.parse(payload);

    if (tenantId.toUpperCase() === "SYSTEM" || tenantId.toLowerCase() === "default") {
      throw new Error("لا يمكن حذف المستأجر الأساسي للنظام (SYSTEM/default)");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error("المستأجر غير موجود أو تم حذفه بالفعل");
    }

    // Atomic Cascade Purge
    await prisma.$transaction(async (tx) => {
      // 1. Transactional & Movement records
      await tx.saleItem.deleteMany({ where: { sale: { tenantId } } }).catch(() => {});
      await tx.sale.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.ticketEvent.deleteMany({ where: { ticket: { tenantId } } }).catch(() => {});
      await tx.ticketPart.deleteMany({ where: { ticket: { tenantId } } }).catch(() => {});
      await tx.ticketAttachment.deleteMany({ where: { ticket: { tenantId } } }).catch(() => {});
      await tx.ticket.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.inventoryMovement.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.productStock.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.product.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.customer.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.supplier.deleteMany({ where: { tenantId } }).catch(() => {});
      
      // 2. Financial & Accounting
      await tx.journalEntryLine.deleteMany({ where: { journalEntry: { tenantId } } }).catch(() => {});
      await tx.journalEntry.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.account.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.treasuryTransaction.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.treasury.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.posShift.deleteMany({ where: { tenantId } }).catch(() => {});
      
      // 3. Organization & Users
      await tx.storeSettings.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.employee.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.user.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.branch.deleteMany({ where: { tenantId } }).catch(() => {});
      
      // 4. Licenses & Sequences
      await tx.license.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.tenantSequence.deleteMany({ where: { tenantId } }).catch(() => {});
      
      // 5. Tenant Core
      await tx.tenant.delete({ where: { id: tenantId } });
    });

    return { success: true, message: `تم حذف المستأجر (${tenant.name}) وبياناته بالكامل بنجاح` };
  }
);


