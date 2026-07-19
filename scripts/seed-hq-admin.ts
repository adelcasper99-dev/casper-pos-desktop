import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
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
      syncSecret: 'hq-super-secret-sync-key'
    }
  });

  console.log(`Tenant verified: ${tenant.id}`);

  // 2. Hash password
  const hashedPassword = await bcrypt.hash('SuperSecret123!', 10);

  // 3. Create or Update the Super Admin User
  const user = await prisma.user.upsert({
    where: { email: 'admin@casperhq.local' },
    update: {
      isGlobalAdmin: true,
      roleStr: 'SUPER_ADMIN'
    },
    create: {
      email: 'admin@casperhq.local',
      name: 'Super Admin',
      password: hashedPassword,
      tenantId: tenant.id,
      isGlobalAdmin: true,
      roleStr: 'SUPER_ADMIN'
    }
  });

  console.log(`Super Admin verified: ${user.email}`);
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
