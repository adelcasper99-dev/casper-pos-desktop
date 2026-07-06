const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- Database Integrity Check ---');
  
  // 1. Check for duplicate SKUs
  const duplicateSkus = await prisma.$queryRaw`SELECT sku, COUNT(*) as count FROM Product GROUP BY sku HAVING COUNT(*) > 1`;
  console.log('Duplicate SKUs:', duplicateSkus);

  // 2. Check for products with empty IDs or nulls (impossible but check anyway)
  const weirdProducts = await prisma.product.findMany({
    where: {
      OR: [
        { id: '' },
        { id: { equals: null } }
      ]
    }
  });
  console.log('Weird ID Products:', weirdProducts);

  // 3. Check for the specific SKU from screenshot
  const c01 = await prisma.product.findMany({
    where: { sku: 'C-01' }
  });
  console.log('Product C-01:', c01);

  // 4. Check for orphaned stock records (FK check)
  const orphanedStock = await prisma.$queryRaw`SELECT productId FROM Stock WHERE productId NOT IN (SELECT id FROM Product)`;
  console.log('Orphaned Stock:', orphanedStock);

  await prisma.$disconnect();
}
run().catch(console.error);
