const { PrismaClient } = require('@prisma/client');

async function verifyMigrationReadiness() {
  const prisma = new PrismaClient();
  try {
    console.log('=== Step 1: Checking for Duplicate (tenantId, username) pairs in Production ===');
    const duplicateUsernames = await prisma.$queryRawUnsafe(`
      SELECT "tenantId", LOWER("username") as username_lower, COUNT(*) as count
      FROM "User"
      GROUP BY "tenantId", LOWER("username")
      HAVING COUNT(*) > 1;
    `);
    console.log('Duplicate (tenantId, username) count:', duplicateUsernames.length);
    if (duplicateUsernames.length > 0) {
      console.error('❌ Found duplicate usernames in same tenant:', duplicateUsernames);
    } else {
      console.log('✅ ZERO duplicate (tenantId, username) pairs found in database.');
    }

    console.log('\n=== Step 2: Checking for Duplicate (tenantId, phone) pairs in Production ===');
    const duplicatePhones = await prisma.$queryRawUnsafe(`
      SELECT "tenantId", "phone", COUNT(*) as count
      FROM "User"
      WHERE "phone" IS NOT NULL AND "phone" != ''
      GROUP BY "tenantId", "phone"
      HAVING COUNT(*) > 1;
    `);
    console.log('Duplicate (tenantId, phone) count:', duplicatePhones.length);
    if (duplicatePhones.length > 0) {
      console.error('❌ Found duplicate phones in same tenant:', duplicatePhones);
    } else {
      console.log('✅ ZERO duplicate (tenantId, phone) pairs found in database.');
    }

    console.log('\n=== Step 3: Current User Records across all Tenants ===');
    const allUsers = await prisma.$queryRawUnsafe(`
      SELECT id, "tenantId", username, phone, "roleStr", "deletedAt"
      FROM "User"
      ORDER BY "tenantId", username;
    `);
    console.table(allUsers);

  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigrationReadiness();
