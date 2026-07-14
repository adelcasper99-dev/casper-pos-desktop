import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Starting backfill of floating records...');

  // 1. Create SYSTEM_USER if not exists
  let systemUser = await prisma.user.findUnique({
    where: { id: 'SYSTEM_USER' }
  });

  if (!systemUser) {
    // Check if username 'SYSTEM_USER' exists
    const userByUsername = await prisma.user.findUnique({
      where: { username: 'SYSTEM_USER' }
    });
    
    if (userByUsername) {
      systemUser = userByUsername;
    } else {
      systemUser = await prisma.user.create({
        data: {
          id: 'SYSTEM_USER',
          username: 'SYSTEM_USER',
          password: 'SYSTEM_PASSWORD_PLACEHOLDER',
          name: 'System Ghost User',
          roleStr: 'ADMIN',
          isGlobalAdmin: true
        }
      });
      console.log('Created SYSTEM_USER.');
    }
  }

  // 2. Create SYSTEM_SHIFT if not exists
  let systemShift = await prisma.shift.findUnique({
    where: { id: 'SYSTEM_SHIFT' }
  });

  if (!systemShift) {
    systemShift = await prisma.shift.create({
      data: {
        id: 'SYSTEM_SHIFT',
        userId: systemUser.id,
        status: 'CLOSED',
        notes: 'System default shift for legacy floating records'
      }
    });
    console.log('Created SYSTEM_SHIFT.');
  }

  // 3. Backfill Sales
  const saleUpdateUser = await prisma.sale.updateMany({
    where: { userId: null },
    data: { userId: systemUser.id }
  });
  const saleUpdateShift = await prisma.sale.updateMany({
    where: { shiftId: null },
    data: { shiftId: systemShift.id }
  });
  console.log(`Backfilled ${saleUpdateUser.count} Sale users and ${saleUpdateShift.count} Sale shifts.`);

  // 4. Backfill Transactions
  const txUpdate = await prisma.transaction.updateMany({
    where: {
      shiftId: null
    },
    data: {
      shiftId: systemShift.id
    }
  });
  console.log(`Backfilled ${txUpdate.count} Transaction records.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
