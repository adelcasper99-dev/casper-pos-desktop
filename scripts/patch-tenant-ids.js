const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("[PatchTenantIDs] Starting Tenant ID Migration...");
  const tenants = await prisma.tenant.findMany({});
  for (const t of tenants) {
    if (t.slug && t.id !== t.slug) {
      console.log(`[PatchTenantIDs] Migrating tenant '${t.slug}' (old id: ${t.id})`);
      const oldId = t.id;
      const newId = t.slug;

      // 1. Create temporary duplicate Tenant record with newId first so FKs pass
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Tenant" ("id", "name", "slug", "branchId", "syncSecret", "isActive", "createdAt")
        SELECT '${newId}', "name", "slug", "branchId", "syncSecret", "isActive", "createdAt"
        FROM "Tenant" WHERE "id" = '${oldId}'
        ON CONFLICT ("id") DO NOTHING;
      `);

      // 2. Re-point all child foreign keys to newId
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "Branch" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "StoreSettings" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "Account" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "Treasury" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "License" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);

      // 3. Delete old Tenant record
      await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE "id" = '${oldId}'`);
      console.log(`[PatchTenantIDs] Successfully updated '${t.slug}' to '${newId}'`);
    }
  }
  console.log("[PatchTenantIDs] Migration finished successfully.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
