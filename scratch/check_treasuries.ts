
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkTreasuries() {
  const treasuries = await prisma.treasury.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      paymentMethod: true,
      balance: true,
      isDefault: true,
      _count: {
        select: { transactions: true }
      }
    }
  });

  console.log('--- Current Treasuries ---');
  console.table(treasuries.map(t => ({
    id: t.id,
    name: t.name,
    method: t.paymentMethod,
    balance: Number(t.balance),
    isDefault: t.isDefault,
    txCount: t._count.transactions
  })));
}

checkTreasuries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
