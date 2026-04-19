
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTicket() {
  const ticket = await prisma.ticket.findFirst({
    where: { barcode: 'T-002#' },
    include: { customer: true }
  });
  
  console.log('--- TICKET DATA ---');
  console.log(JSON.stringify({
    id: ticket.id,
    barcode: ticket.barcode,
    customerName: ticket.customerName,
    hasCustomerObject: !!ticket.customer,
    customerId: ticket.customerId
  }, null, 2));
}

checkTicket()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
