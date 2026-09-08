const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function migrateUserIsolation() {
  const prisma = new PrismaClient();
  try {
    console.log('=== Step 1: Taking Pre-Migration PostgreSQL Backup ===');
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const backupPath = `/var/backups/casper_pre_user_isolation_${timestamp}.sql`;
    try {
      execSync(`sudo -u postgres pg_dump casper_db > ${backupPath}`);
      console.log(`✅ Backup successfully created at: ${backupPath}`);
    } catch (e) {
      console.warn('⚠️ Could not run local pg_dump directly via execSync, skipping local dump command if permissions differ.');
    }

    console.log('=== Step 2: Applying Atomic PostgreSQL DDL Index Migration ===');
    // Using Prisma atomic $transaction array: Each DDL executes sequentially inside an atomic transaction block
    await prisma.$transaction([
      // 1. User Model Unique Constraints
      prisma.$executeRawUnsafe(`ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_key"`),
      prisma.$executeRawUnsafe(`ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_phone_key"`),
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_username_key"`),
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_phone_key"`),
      prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_username_key" ON "User"("tenantId", "username")`),
      prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_phone_key" ON "User"("tenantId", "phone") WHERE "phone" IS NOT NULL`),

      // 2. Account Model Unique Constraints
      prisma.$executeRawUnsafe(`ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_code_key"`),
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Account_code_key"`),
      prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Account_tenantId_code_key" ON "Account"("tenantId", "code")`),

      // 3. Role Model Unique Constraints
      prisma.$executeRawUnsafe(`ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_name_key"`),
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Role_name_key"`),
      prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Role_tenantId_name_key" ON "Role"("tenantId", "name")`),

      // 4. Supplier Model Unique Constraints
      prisma.$executeRawUnsafe(`ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_phone_key"`),
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Supplier_phone_key"`),
      prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_tenantId_phone_key" ON "Supplier"("tenantId", "phone") WHERE "phone" IS NOT NULL`)
    ]);
    console.log('✅ Atomic DDL transaction committed successfully.');

    console.log('=== Step 3: Verifying PostgreSQL Index Configuration ===');
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE tablename IN ('User', 'Account', 'Role', 'Supplier') AND (indexname LIKE '%tenantId%' OR indexname LIKE '%key%');
    `);
    console.table(indexes);

    console.log('🎉 Migration completed successfully: Multi-tenant uniqueness is now strictly isolated per tenant!');
  } catch (err) {
    console.error('❌ Migration failed, transaction was aborted cleanly:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateUserIsolation();
