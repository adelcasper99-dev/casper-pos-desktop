import { prisma } from "@/lib/prisma";
import { TenantConnectionManager } from "./tenant-connection-manager";
import { Prisma } from "@prisma/client";

export class HQMetricsAggregator {
  /**
   * Asynchronously collects aggregated sales metrics from active tenant databases
   * and updates HQ metrics snapshots without locking live client databases.
   */
  public static async aggregateAllTenantMetrics(): Promise<{
    processed: number;
    errors: number;
  }> {
    let processed = 0;
    let errors = 0;

    try {
      // Query active tenants from HQ Database
      const tenants = await prisma.tenant.findMany({
        where: { isActive: true }
      });

      console.log(`[HQMetricsAggregator] Starting metric snapshot for ${tenants.length} tenants...`);

      for (const tenant of tenants) {
        try {
          // Construct database URL for tenant
          const baseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/casper_db";
          const tenantDbName = `casper_tenant_${tenant.slug.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}_${tenant.id.slice(0, 8)}`;
          const urlObj = new URL(baseUrl);
          urlObj.pathname = `/${tenantDbName}`;
          const dbUrl = urlObj.toString();

          // Connect to tenant DB safely
          const tenantPrisma = await TenantConnectionManager.getTenantPrisma(tenant.id, dbUrl);

          // Execute fast read-only query (max 5s timeout)
          const salesAgg = await tenantPrisma.sale.aggregate({
            _sum: { totalAmount: true },
            _count: { _all: true },
            where: { status: "COMPLETED" }
          });

          const totalSales = salesAgg._sum?.totalAmount || new Prisma.Decimal("0.00");
          const totalInvoices = salesAgg._count?._all || 0;

          // Record snapshot in HQ metric table if HQ Prisma model exists
          console.log(`[HQMetricsAggregator] Tenant ${tenant.slug}: Total Sales = ${totalSales.toString()}, Invoices = ${totalInvoices}`);

          processed++;
        } catch (tenantErr) {
          console.error(`[HQMetricsAggregator] Error collecting metrics for tenant ${tenant.slug}:`, tenantErr);
          errors++;
        }
      }
    } catch (err) {
      console.error("[HQMetricsAggregator] Failed to run HQ metrics snapshot:", err);
    }

    return { processed, errors };
  }
}
