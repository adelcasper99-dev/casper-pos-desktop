const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixJournalLineTenants() {
  console.log("=== Backfilling JournalLine.tenantId from parent JournalEntry ===");
  try {
    const updatedCount = await prisma.$executeRawUnsafe(`
      UPDATE "JournalLine" jl
      SET "tenantId" = je."tenantId"
      FROM "JournalEntry" je
      WHERE jl."journalEntryId" = je."id"
        AND (jl."tenantId" IS NULL OR jl."tenantId" = 'default' OR jl."tenantId" != je."tenantId")
        AND je."tenantId" IS NOT NULL;
    `);
    console.log(`✅ Successfully aligned ${updatedCount} JournalLine record(s) to match parent JournalEntry tenantId.`);
  } catch (err) {
    console.error("❌ Backfill failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

fixJournalLineTenants();
