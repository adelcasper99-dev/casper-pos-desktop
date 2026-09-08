const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function rollbackUserIsolation() {
  const prisma = new PrismaClient();
  try {
    console.log('=== Rollback Step 1: Reverting PostgreSQL Indexes to Global Uniqueness ===');
    
    await prisma.$transaction([
      // 1. Revert User Indexes
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_tenantId_username_key"`),
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_tenantId_phone_key"`),
      prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD CONSTRAINT "User_username_key" UNIQUE ("username")`),
      prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD CONSTRAINT "User_phone_key" UNIQUE ("phone")`),

      // 2. Revert Account Indexes
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Account_tenantId_code_key"`),
      prisma.$executeRawUnsafe(`ALTER TABLE "Account" ADD CONSTRAINT "Account_code_key" UNIQUE ("code")`),

      // 3. Revert Role Indexes
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Role_tenantId_name_key"`),
      prisma.$executeRawUnsafe(`ALTER TABLE "Role" ADD CONSTRAINT "Role_name_key" UNIQUE ("name")`),

      // 4. Revert Supplier Indexes
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Supplier_tenantId_phone_key"`),
      prisma.$executeRawUnsafe(`ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_phone_key" UNIQUE ("phone")`)
    ]);
    console.log('✅ Rollback DDL transaction committed successfully.');

    console.log('=== Rollback Step 2: Verifying Reverted Index Configuration ===');
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE tablename IN ('User', 'Account', 'Role', 'Supplier') AND (indexname LIKE '%tenantId%' OR indexname LIKE '%key%');
    `);
    console.table(indexes);

    console.log('⏮️ Rollback completed successfully.');
  } catch (err) {
    console.error('❌ Rollback failed:', err);
    console.log('💡 To restore full database from pre-migration dump, run:');
    console.log('   sudo -u postgres psql casper_db < /var/backups/casper_pre_user_isolation_<TIMESTAMP>.sql');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

rollbackUserIsolation();
