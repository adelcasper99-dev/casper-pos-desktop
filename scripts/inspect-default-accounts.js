const { PrismaClient } = require('@prisma/client');

async function inspectDefaultAccounts() {
  const prisma = new PrismaClient();
  try {
    const accs = await prisma.account.findMany({
      where: {
        tenantId: 'default',
        code: { in: ['1200', '4100', '5100'] }
      },
      include: {
        journalLines: {
          select: { id: true, journalEntryId: true }
        }
      }
    });

    console.log('=== Duplicate Accounts in Tenant "default" and their JournalLine usage ===');
    for (const a of accs) {
      console.log(`Account ID: ${a.id} | Code: ${a.code} | Name: ${a.name} | isSystem: ${a.isSystem} | JournalLines: ${a.journalLines.length}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

inspectDefaultAccounts();
