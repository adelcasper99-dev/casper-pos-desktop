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
      const tmpSlug = `${t.slug}_tmp_${Math.floor(Math.random() * 100000)}`;

      // 1. Temporarily change old tenant's slug to avoid UNIQUE constraint collision
      await prisma.$executeRawUnsafe(`UPDATE "Tenant" SET slug = '${tmpSlug}' WHERE id = '${oldId}'`);

      // 2. Insert new Tenant record with id = newId and original slug
      const safeName = (t.name || 'Store').replace(/'/g, "''");
      const safeBranch = t.branchId ? `'${t.branchId}'` : 'NULL';
      const safeSecret = t.syncSecret ? `'${t.syncSecret}'` : 'NULL';

      await prisma.$executeRawUnsafe(`
        INSERT INTO "Tenant" ("id", "name", "slug", "branchId", "syncSecret", "isActive", "createdAt")
        VALUES ('${newId}', '${safeName}', '${t.slug}', ${safeBranch}, ${safeSecret}, ${t.isActive ? 'true' : 'false'}, NOW())
        ON CONFLICT ("id") DO NOTHING;
      `);

      // 3. Update all dependent child tables to point to newId
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "Branch" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "StoreSettings" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "Account" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "Treasury" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);
      await prisma.$executeRawUnsafe(`UPDATE "License" SET "tenantId" = '${newId}' WHERE "tenantId" = '${oldId}'`);

      // 4. Delete old Tenant record
      await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE "id" = '${oldId}'`);
      console.log(`[PatchTenantIDs] Successfully migrated '${t.slug}' to '${newId}'`);
    }
  }
  console.log("[PatchTenantIDs] Migration finished successfully.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
