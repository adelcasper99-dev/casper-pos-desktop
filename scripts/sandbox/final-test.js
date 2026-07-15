
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Define some units to insert (same as in our constants)
    const testUnits = [
      { name: 'Kilogram', code: 'kg', category: 'WEIGHT', abbreviation: 'kg', conversionFactor: 1.0 },
      { name: 'Gram', code: 'g', category: 'WEIGHT', abbreviation: 'g', conversionFactor: 1000.0 },
      { name: 'Liter', code: 'L', category: 'VOLUME', abbreviation: 'L', conversionFactor: 1.0 },
      { name: 'Milliliter', code: 'mL', category: 'VOLUME', abbreviation: 'mL', conversionFactor: 1000.0 },
      { name: 'Piece', code: 'pcs', category: 'COUNT', abbreviation: 'pcs', conversionFactor: 1.0 },
    ];

    let insertedCount = 0;
    for (const unitData of testUnits) {
      const existing = await prisma.unitOfMeasure.findUnique({ where: { code: unitData.code } });
      if (!existing) {
        await prisma.unitOfMeasure.create({ data: unitData });
        insertedCount++;
      }
    }
    console.log('✅ Inserted', insertedCount, 'new units');

    // Count total units
    const totalUnits = await prisma.unitOfMeasure.count();
    console.log('✅ Total units in DB:', totalUnits);

    // List a few
    const units = await prisma.unitOfMeasure.findMany({
      take: 5,
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    console.log('✅ Sample units:');
    units.forEach(u => {
      console.log('  ', u.code, '-', u.name, '(', u.category, ')');
    });

    // Test creating a product with a unit
    const kgUnit = await prisma.unitOfMeasure.findFirst({ where: { code: 'kg' } });
    if (kgUnit) {
      const category = await prisma.category.findFirst();
      if (category) {
        const product = await prisma.product.create({
          data: {
            sku: 'UNIT-TEST-FINAL',
            name: 'Final Test Product',
            costPrice: 50.0,
            sellPrice: 75.0,
            stock: 25,
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
    await prisma.();
  }
}

main();

