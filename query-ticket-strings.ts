import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ticket = await prisma.ticket.findUnique({ where: { barcode: 'T-002' } });
  console.log('repairPrice:', ticket?.repairPrice?.toString());
  console.log('techCommissionAmount:', ticket?.techCommissionAmount?.toString());
  console.log('centerLaborProfit:', ticket?.centerLaborProfit?.toString());
  console.log('centerPartProfit:', ticket?.centerPartProfit?.toString());
  console.log('netProfit:', ticket?.netProfit?.toString());
}
main().catch(console.error).finally(() => prisma.$disconnect());
