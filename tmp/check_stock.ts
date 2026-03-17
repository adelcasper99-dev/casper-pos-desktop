import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const productId = 'ae9cf8ef-0d4d-4097-89e4-faaf09836be0';
  const warehouseId = 'd6d47c47-3f57-4ab1-956c-0cdc94c9e5da';

  console.log('Checking stock for:');
  console.log('Product ID:', productId);
  console.log('Warehouse ID:', warehouseId);

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, sku: true, stock: true, trackStock: true }
    });

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, name: true }
    });

    const stockRelation = await prisma.stock.findUnique({
      where: {
        productId_warehouseId: {
          productId,
          warehouseId
        }
      }
    });

    const allStocks = await prisma.stock.findMany({
      where: { productId }
    });

    console.log('\n--- Results ---');
    console.log('Product:', product);
    console.log('Warehouse:', warehouse);
    console.log('Target Stock Record:', stockRelation);
    console.log('All Warehouse Stocks for Product:', allStocks);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
