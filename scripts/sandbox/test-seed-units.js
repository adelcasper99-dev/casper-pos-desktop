// Test seeding units
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

// Import the seed function
const { seedUnits } = require('./src/lib/inventory/seed-units');

async function main() {
  try {
    await seedUnits();
    console.log('✅ Seeded units');

    const units = await prisma.unitOfMeasure.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    console.log('✅ Total units:', units.length);

    // Show first 5 units as examples
    for (let i = 0; i < Math.min(5, units.length); i++) {
      const u = units[i];
      console.log(`  ${u.code} - ${u.name} (${u.category})`);
    }

    // Check categories
    const categories = [...new Set(units.map(u => u.category))];
    console.log('✅ Categories:', categories.join(', '));

    // Test creating a product with a unit
    const kgUnit = await prisma.unitOfMeasure.findFirst({ where: { code: 'kg' } });
    if (kgUnit) {
      const category = await prisma.category.findFirst();
      if (category) {
        const product = await prisma.product.create({
          data: {
            sku: 'UNIT-TEST-001',
            name: 'Test Product with KG Unit',
            costPrice: 100.0,
            sellPrice: 150.0,
            stock: 50,
            unitOfMeasureId: kgUnit.id,
            categoryId: category.id,
            trackStock: true
          }
        });
        console.log('✅ Created test product with unit:', product.name, 'unitId:', product.unitOfMeasureId);

        // Clean up
        await prisma.product.delete({ where: { id: product.id } });
        console.log('🗑️ Cleaned up test product');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
