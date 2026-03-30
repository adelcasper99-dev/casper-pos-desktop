const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Check units
    const units = await prisma.unitOfMeasure.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    console.log('✅ Total units in DB:', units.length);
    console.log('✅ Categories:', [...new Set(units.map(u => u.category))].join(', '));

    // Check a few units
    const kg = await prisma.unitOfMeasure.findUnique({ where: { code: 'kg' } });
    console.log('✅ Found kg unit:', kg ? `${kg.name} (${kg.code})` : 'Not found');

    // Check that products table has the unitOfMeasureId column (nullable)
    const productCount = await prisma.product.count();
    console.log('✅ Total products in DB:', productCount);

    // Try to create a product with a unit (if there are no products, we create one for testing)
    if (productCount === 0) {
      const testUnit = await prisma.unitOfMeasure.findFirst({ where: { code: 'kg' } });
      if (testUnit) {
        const product = await prisma.product.create({
          data: {
            sku: 'TEST-UNIT',
            name: 'Test Product with Unit',
            costPrice: 10.0,
            sellPrice: 15.0,
            stock: 100,
            unitOfMeasureId: testUnit.id,
            categoryId: (await prisma.category.findFirst()).id, // assuming there is at least one category
            trackStock: true
          }
        });
        console.log('✅ Test product created with unit:', product.name, 'unitId:', product.unitOfMeasureId);
        // Clean up
        await prisma.product.delete({ where: { id: product.id } });
        console.log('🗑️ Test product deleted');
      }
    }

    // Check that getProducts action would return unit info (by simulating the include)
    const productsWithUnits = await prisma.product.findMany({
      take: 5,
      include: {
        unitOfMeasure: { select: { code: true, name: true, abbreviation: true } }
      }
    });
    console.log('✅ Sample products with unit info:', productsWithUnits.map(p => ({
      sku: p.sku,
      unit: p.unitOfMeasure ? `${p.unitOfMeasure.code} (${p.unitOfMeasure.name})` : 'No unit'
    })));

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
