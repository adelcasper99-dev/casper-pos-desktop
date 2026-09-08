const { PrismaClient } = require('@prisma/client');

async function inspectTicketOnly() {
  const prisma = new PrismaClient();
  try {
    const ticket = await prisma.ticket.findUnique({
      where: {
        id: '2d48d132-caeb-4f46-ac49-c52a6d6d0ebe'
      },
      include: {
        payments: true
      }
    });

    console.log('=== TICKET OBJECT ===');
    console.log({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber || ticket.ticketNo,
      cost: ticket.cost,
      finalCost: ticket.finalCost,
      amountPaid: ticket.amountPaid,
      status: ticket.status,
      tenantId: ticket.tenantId,
      branchId: ticket.branchId,
      payments: ticket.payments
    });

    const refunds = await prisma.refund.findMany({
      where: {
        tenantId: 'demo'
      }
    });
    console.log('=== REFUND TABLE ENTRIES ===', refunds);

  } catch (e) {
    console.error('Inspection error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

inspectTicketOnly();
