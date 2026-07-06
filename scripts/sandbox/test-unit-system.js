// Test unit of measure system
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 Testing UnitOfMeasure system...');

    // 1. Check that the UnitOfMeasure table exists by trying to count
    let count = await prisma.unitOfMeasure.count();
    console.log('✅ UnitOfMeasure table exists. Current unit count:', count);

    // 2. If no units, we can insert a test unit to verify write access
    let unitCreatedByUs = false;
    if (count === 0) {
      const testUnit = await prisma.unitOfMeasure.create({
        data: {
          name: 'Test Unit',
          code: 'TST',
          category: 'COUNT',
          abbreviation: 'TST',
          conversionFactor: 1.0,
          isActive: true
        }
      });
      console.log('✅ Inserted test unit:', testUnit.code);
      unitCreatedByUs = true;
      count = 1; // update count
    }

    // 3. Get a unit to use for product test
    const unit = await prisma.unitOfMeasure.findFirst();
    if (!unit) {
      throw new Error('No unit available after attempted creation');
    }
    console.log('✅ Selected unit for product test:', unit.code, '(', unit.name, ')');

    // 4. Get a category (required for product)
    let category = await prisma.category.findFirst();
    let categoryCreatedByUs = false;
    if (!category) {
      // Create a test category if none exists
      category = await prisma.category.create({
        data: {
          name: 'Test Category'
        }
      });
      categoryCreatedByUs = true;
      console.log('✅ Inserted test category:', category.name);
    }
    console.log('✅ Selected category for product test:', category.id, '(', category.name, ')');

    // 5. Create a product with the unit
    const product = await prisma.product.create({
      data: {
        sku: 'UNIT-TEST-PROD',
        name: 'Product Unit Test',
        costPrice: 10.0,
        sellPrice: 15.0,
        stock: 100,
        unitOfMeasureId: unit.id,
        categoryId: category.id,
        trackStock: true
      }
    });
    console.log('✅ Created test product with unitId:', product.unitOfMeasureId);

    // 6. Verify we can retrieve the product with unit info (simulating getProducts include)
    const productWithUnit = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        unitOfMeasure: { select: { code: true, name: true, abbreviation: true } }
      }
    });
    console.log('✅ Retrieved product with unit info:',
      productWithUnit.sku,
      'unit:', productWithUnit.unitOfMeasure ? `${productWithUnit.unitOfMeasure.code} (${productWithUnit.unitOfMeasure.name})` : 'null');

    // 7. Clean up product
    await prisma.product.delete({ where: { id: product.id } });
    console.log('🗑️ Deleted test product');

    // 8. If we created a unit just for the test (because there were none), delete it now
    if (unitCreatedByUs) {
      await prisma.unitOfMeasure.delete({ where: { id: unit.id } });
      console.log('🗑️ Deleted test unit');
    }

    // 9. If we created a category just for the test, delete it now
    if (categoryCreatedByUs) {
      await prisma.category.delete({ where: { id: category.id } });
      console.log('🗑️ Deleted test category');
    }

    // 10. Final count
    const finalCount = await prisma.unitOfMeasure.count();
    console.log('✅ Final unit count:', finalCount);

    console.log('🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
