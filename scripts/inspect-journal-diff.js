const { PrismaClient } = require('@prisma/client');

async function inspect() {
  const prisma = new PrismaClient();
  try {
    const lines = await prisma.journalLine.findMany({
      include: {
        journalEntry: true,
        account: true
      },
      orderBy: { id: 'asc' }
    });

    console.log(`TOTAL_JOURNAL_LINES: ${lines.length}`);
    lines.forEach((l, idx) => {
      console.log(`[#${idx + 1}] LineID: ${l.id} | LineTenant: ${l.tenantId} | EntryID: ${l.journalEntryId} | EntryTenant: ${l.journalEntry?.tenantId} | EntryNum: ${l.journalEntry?.entryNumber} | Debit: ${l.debit} | Credit: ${l.credit} | Account: ${l.account?.name} | Memo: ${l.journalEntry?.description || l.description}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

inspect();
