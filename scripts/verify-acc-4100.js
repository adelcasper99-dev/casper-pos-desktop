const { PrismaClient } = require('@prisma/client');

async function verifyAccount4100() {
  const prisma = new PrismaClient();
  try {
    const acc = await prisma.account.findUnique({
      where: {
        id: 'acc-4100-047eff'
      }
    });

    console.log('=== ACCOUNT ROW IN DATABASE ===');
    console.log(JSON.stringify(acc, null, 2));

    const allDemoAccounts = await prisma.account.findMany({
      where: { tenantId: 'demo' },
      select: { id: true, code: true, name: true, type: true }
    });

    console.log('=== ALL DEMO ACCOUNTS ===');
    console.log(JSON.stringify(allDemoAccounts, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

verifyAccount4100();
