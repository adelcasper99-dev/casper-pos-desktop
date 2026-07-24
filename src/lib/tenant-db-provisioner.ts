import { prisma } from "@/lib/prisma";
import { TenantConnectionManager } from "./tenant-connection-manager";
import { Prisma } from "@prisma/client";

export interface ProvisionOptions {
  tenantId: string;
  storeName: string;
  slug: string;
  adminUsername: string;
  adminPasswordHash: string;
  adminEmail?: string;
  adminPhone?: string;
}

export class TenantDatabaseProvisioner {
  /**
   * Instantiates a new physical PostgreSQL database for a tenant cloned from template database.
   */
  public static async provisionTenantDatabase(options: ProvisionOptions): Promise<{
    success: boolean;
    dbName: string;
    dbUrl: string;
    error?: string;
  }> {
    const safeSlug = options.slug.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    const dbName = `casper_tenant_${safeSlug}_${options.tenantId.slice(0, 8)}`;

    const baseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/casper_db";
    const dbUrl = this.buildTenantDbUrl(baseUrl, dbName);

    try {
      console.log(`[TenantProvisioner] Creating physical DB: ${dbName} from template...`);

      // Execute CREATE DATABASE via raw query on main connection
      try {
        await prisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}" WITH TEMPLATE casper_template_db;`);
      } catch (createErr: any) {
        // Fallback if template does not exist: create standard database
        if (createErr?.message?.includes("template")) {
          console.warn("[TenantProvisioner] Template casper_template_db not found. Creating empty database...");
          await prisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}";`);
        } else {
          throw createErr;
        }
      }

      // Connect to the newly created database using TenantConnectionManager
      const tenantPrisma = await TenantConnectionManager.getTenantPrisma(options.tenantId, dbUrl);

      // Seed Turnkey Store Data inside a single transaction
      await tenantPrisma.$transaction(async (tx) => {
        // 1. Seed Branch
        const branch = await tx.branch.create({
          data: {
            name: "الفرع الرئيسي",
            code: `${safeSlug.toUpperCase()}-MAIN`,
            type: "CENTER"
          }
        });

        // 2. Seed StoreSettings
        await tx.storeSettings.create({
          data: {
            id: "settings",
            name: options.storeName,
            currency: "EGP",
            taxRate: new Prisma.Decimal("0.00")
          }
        });

        // 3. Seed Main Treasury
        await tx.treasury.create({
          data: {
            name: "الخزنة النقدية الرئيسية",
            branchId: branch.id,
            balance: new Prisma.Decimal("0.00")
          }
        });

        // 4. Seed Double-Entry GL Accounts
        await tx.account.createMany({
          data: [
            { code: "1110", name: "النقدية بالخزينة", type: "ASSET" },
            { code: "1120", name: "العملاء والحسابات المدينة", type: "ASSET" },
            { code: "1200", name: "مخزون البضائع", type: "ASSET" },
            { code: "2110", name: "الموردين والحسابات الدائنة", type: "LIABILITY" },
            { code: "4100", name: "إيرادات المبيعات", type: "REVENUE" },
            { code: "5100", name: "تكلفة البضاعة المباعة", type: "EXPENSE" }
          ]
        });

        // 5. Seed Admin User
        await tx.user.create({
          data: {
            username: options.adminUsername,
            password: options.adminPasswordHash,
            name: options.storeName,
            roleStr: "ADMIN",
            phone: options.adminPhone || null,
            branchId: branch.id
          }
        });
      });

      console.log(`[TenantProvisioner] Database ${dbName} successfully provisioned and seeded.`);

      return {
        success: true,
        dbName,
        dbUrl
      };
    } catch (error: any) {
      console.error(`[TenantProvisioner] Failed to provision DB ${dbName}:`, error);

      // Attempt cleanup drop if DB was created
      try {
        await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}";`);
      } catch (dropErr) {
        console.error("[TenantProvisioner] Cleanup drop failed:", dropErr);
      }

      return {
        success: false,
        dbName,
        dbUrl: "",
        error: error.message || "فشل إنشاء وتجهيز قاعدة بيانات العميل"
      };
    }
  }

  private static buildTenantDbUrl(baseUrl: string, dbName: string): string {
    const urlObj = new URL(baseUrl);
    urlObj.pathname = `/${dbName}`;
    return urlObj.toString();
  }
}
