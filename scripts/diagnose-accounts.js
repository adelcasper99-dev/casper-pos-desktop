const { PrismaClient } = require('@prisma/client');

async function checkDuplicates() {
  const prisma = new PrismaClient();
  try {
    const accs = await prisma.account.findMany({
      where: { code: '5100' }
    });
    console.log('=== Account 5100 Records ===');
    console.log(accs);

    const dupes = await prisma.$queryRawUnsafe(`
      SELECT "tenantId", code, COUNT(*) 
      FROM "Account" 
      GROUP BY "tenantId", code 
      HAVING COUNT(*) > 1;
    `);
    console.log('=== All Duplicate (tenantId, code) in Account ===');
    console.log(dupes);

    const dupRoles = await prisma.$queryRawUnsafe(`
      SELECT "tenantId", name, COUNT(*) 
      FROM "Role" 
      GROUP BY "tenantId", name 
      HAVING COUNT(*) > 1;
    `);
    console.log('=== All Duplicate (tenantId, name) in Role ===');
    console.log(dupRoles);

    const dupSuppliers = await prisma.$queryRawUnsafe(`
      SELECT "tenantId", phone, COUNT(*) 
      FROM "Supplier" 
      WHERE phone IS NOT NULL AND phone != ''
      GROUP BY "tenantId", phone 
      HAVING COUNT(*) > 1;
    `);
    console.log('=== All Duplicate (tenantId, phone) in Supplier ===');
    console.log(dupSuppliers);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();
