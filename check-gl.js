const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const sales4000   = await prisma.journalLine.aggregate({ where:{ account:{ code:'4000' } }, _sum:{ credit:true, debit:true } });
  const service4100 = await prisma.journalLine.aggregate({ where:{ account:{ code:'4100' } }, _sum:{ credit:true, debit:true } });
  const cogs5000    = await prisma.journalLine.aggregate({ where:{ account:{ code:'5000' } }, _sum:{ debit:true, credit:true } });
  const inv1200     = await prisma.journalLine.aggregate({ where:{ account:{ code:'1200' } }, _sum:{ debit:true, credit:true } });
  const pay2000     = await prisma.journalLine.aggregate({ where:{ account:{ code:'2000' } }, _sum:{ credit:true, debit:true } });
  const vat2100     = await prisma.journalLine.aggregate({ where:{ account:{ code:'2100' } }, _sum:{ credit:true, debit:true } });

  const netSales    = Number(sales4000._sum.credit   || 0) - Number(sales4000._sum.debit   || 0);
  const netService  = Number(service4100._sum.credit || 0) - Number(service4100._sum.debit || 0);
  const netCOGS     = Number(cogs5000._sum.debit     || 0) - Number(cogs5000._sum.credit   || 0);
  const netPurchase = Number(inv1200._sum.debit      || 0) - Number(inv1200._sum.credit    || 0);
  const netPayables = Number(pay2000._sum.credit     || 0) - Number(pay2000._sum.debit     || 0);
  const netVAT      = Number(vat2100._sum.credit     || 0) - Number(vat2100._sum.debit     || 0);

  console.log('=== GL Balance Summary ===');
  console.log('GL 4000 POS Sales Revenue (Net):', netSales);
  console.log('GL 4100 Service Revenue   (Net):', netService);
  console.log('GL 5000 COGS              (Net):', netCOGS);
  console.log('GL 1200 Inventory (Net Dr)     :', netPurchase);
  console.log('GL 2000 Payables  (Net Cr)     :', netPayables);
  console.log('GL 2100 VAT Output(Net Cr)     :', netVAT);
  console.log('=========================');
  console.log('Gross Profit POS (Rev-COGS)    :', netSales - netCOGS);
  console.log('Total Revenue (POS+Service)    :', netSales + netService);
  console.log('Net Profit after everything    :', netSales + netService - netCOGS);
}
run().finally(() => prisma.$disconnect());
