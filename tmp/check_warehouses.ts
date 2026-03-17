import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const productId = 'ae9cf8ef-0d4d-4097-89e4-faaf09836be0';

  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        stocks: {
          where: { productId }
        },
        branch: true
      }
    });

    console.log('Warehouse Status for Product:', productId);
    warehouses.forEach(w => {
      const stock = w.stocks[0]?.quantity ?? 'N/A';
      console.log(`- ${w.name} (Branch: ${w.branch?.name || 'Global'}): ${stock} [ID: ${w.id}] [Default: ${w.isDefault}]`);
    });

    const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { name: true, sku: true, stock: true }
    });
    console.log('\nGlobal Product Info:', product);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
