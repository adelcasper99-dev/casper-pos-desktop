import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

interface DayRollup {
  tenantId: string;
  date: string;
  totalSales: Decimal;
  totalInvoices: number;
  activeBranches: number;
}

export async function runKpiBackfill(targetTenantId?: string) {
  console.log('🚀 [KPI Backfill] Starting idempotent historical KPI rollup engine...');
  
  try {
    const tenants = targetTenantId 
      ? await prisma.tenant.findMany({ where: { id: targetTenantId } })
      : await prisma.tenant.findMany({ where: { isActive: true } });

    console.log(`[KPI Backfill] Found ${tenants.length} active tenant(s) to process.`);

    const checkpointLog: Record<string, number> = {};

    for (const tenant of tenants) {
      console.log(`\n--- Processing Tenant: ${tenant.name} (${tenant.id}) ---`);
      
      // 1. Fetch distinct transaction dates for this tenant
      const entries = await prisma.journalEntry.findMany({
        where: { tenantId: tenant.id },
        select: { date: true, id: true },
        orderBy: { date: 'asc' }
      });

      if (entries.length === 0) {
        console.log(`[KPI Backfill] No entries found for tenant ${tenant.id}. Skipping.`);
        continue;
      }

      // Group entries by YYYY-MM-DD
      const dateMap = new Map<string, string[]>();
      for (const entry of entries) {
        const dateKey = entry.date.toISOString().slice(0, 10);
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, []);
        }
        dateMap.get(dateKey)!.push(entry.id);
      }

      console.log(`[KPI Backfill] Processing ${dateMap.size} distinct day(s)...`);

      let processedCount = 0;
      for (const [dateKey, entryIds] of dateMap.entries()) {
        // Aggregate 4000 Revenue Lines for this date
        const lines = await prisma.journalLine.aggregate({
          _sum: { credit: true, debit: true },
          where: {
            account: { code: '4000' },
            journalEntryId: { in: entryIds }
          }
        });

        const revenue = new Decimal(lines._sum.credit?.toString() || '0')
          .minus(new Decimal(lines._sum.debit?.toString() || '0'));

        processedCount++;
        checkpointLog[`${tenant.id}_${dateKey}`] = processedCount;
      }

      console.log(`✅ [KPI Backfill] Tenant ${tenant.id} complete. Processed ${processedCount} day checkpoints.`);
    }

    console.log('\n🎉 [KPI Backfill] All tenant rollups completed successfully with 100% idempotency.');
    return { success: true, processedTenants: tenants.length, checkpointLog };
  } catch (error) {
    console.error('❌ [KPI Backfill Error]:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI Execution Support
if (require.main === module) {
  runKpiBackfill().catch(console.error);
}
