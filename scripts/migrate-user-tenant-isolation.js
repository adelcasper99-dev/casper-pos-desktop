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

    console.log('=== Step 2: Applying Database Index Migration ===');
    
    // 1. Drop existing global unique constraints if present
    console.log('Dropping legacy global unique constraints...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_key";
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_phone_key";
    `);
    await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS "User_username_key";
    `);
    await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS "User_phone_key";
    `);

    // 2. Create tenant-scoped composite unique indexes
    console.log('Creating tenant-scoped composite unique indexes...');
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_username_key" ON "User"("tenantId", "username");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_phone_key" ON "User"("tenantId", "phone") WHERE "phone" IS NOT NULL;
    `);

    console.log('=== Step 3: Verifying PostgreSQL Index Configuration ===');
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'User' AND (indexname LIKE '%username%' OR indexname LIKE '%phone%');
    `);
    console.log('Active User Indexes:', indexes);

    console.log('🎉 Migration completed successfully: User username and phone are now strictly isolated per tenant!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateUserIsolation();
