const { PrismaClient } = require('@prisma/client');

async function inspectTicketT004() {
  const prisma = new PrismaClient();
  try {
    const ticket = await prisma.ticket.findUnique({
      where: {
        id: '2d48d132-caeb-4f46-ac49-c52a6d6d0ebe'
      },
      include: {
        payments: true,
        parts: true
      }
    });

    console.log('=== TICKET T-004 RECORD ===');
    console.log(JSON.stringify(ticket, null, 2));

    const entries = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { reference: '2d48d132-caeb-4f46-ac49-c52a6d6d0ebe' },
          { ticketId: '2d48d132-caeb-4f46-ac49-c52a6d6d0ebe' },
          { description: { contains: 'T-004' } }
        ]
      },
      include: {
        lines: {
          include: { account: true }
        }
      }
    });

    console.log('=== JOURNAL ENTRIES FOR T-004 ===');
    console.log(JSON.stringify(entries, null, 2));

    const treasuryTx = await prisma.treasuryTransaction.findMany({
      where: {
        OR: [
          { reference: { contains: 'T-004' } },
          { description: { contains: 'T-004' } }
        ]
      }
    });

    console.log('=== TREASURY TRANSACTIONS FOR T-004 ===');
    console.log(JSON.stringify(treasuryTx, null, 2));

  } catch (e) {
    console.error('Inspection error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

inspectTicketT004();
