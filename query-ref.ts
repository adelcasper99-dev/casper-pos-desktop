import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ticket = await prisma.ticket.findUnique({ where: { id: '82d86d4b-d7b9-4753-b142-74c7603d19f8' } });
  console.log('Ticket ID:', ticket?.id);
  console.log('Barcode:', ticket?.barcode);
  console.log('repairPrice:', ticket?.repairPrice.toString());
  console.log('techCommissionAmount:', ticket?.techCommissionAmount.toString());
}
main().catch(console.error).finally(() => prisma.$disconnect());
