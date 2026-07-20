import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    console.error('❌ ERROR: Casper HQ requires a Postgres database. Your DATABASE_URL is pointing to a local SQLite file.');
    console.error('Please update your .env file with a valid postgres:// URL before seeding HQ.');
    process.exit(1);
  }

  console.log('Seeding HQ Super Admin...');

  // 1. Create or Update the HQ Tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'casper-hq' },
    update: {},
    create: {
      id: 'casper-hq',
      name: 'Casper HQ',
      domain: 'hq.casper.local',
      branchId: 'hq-branch-01',
      syncSecret: 'hq-super-secret-sync-key',
      slug: 'casper-hq'
    }
  });

  console.log(`Tenant verified: ${tenant.id}`);

  // 2. Hash password
  const hashedPassword = await bcrypt.hash('SuperSecret123!', 10);

  // 3. Create or Update the Super Admin User
  const user = await prisma.user.upsert({
    where: { username: 'super-admin' },
    update: {
      isGlobalAdmin: true,
      roleStr: 'SUPER_ADMIN'
    },
    create: {
      username: 'super-admin',
      name: 'Super Admin',
      password: hashedPassword,
      tenantId: tenant.id,
      isGlobalAdmin: true,
      roleStr: 'SUPER_ADMIN'
    }
  });

  console.log(`Super Admin verified: ${user.username}`);
  console.log('HQ Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
