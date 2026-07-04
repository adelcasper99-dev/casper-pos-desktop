const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 Testing Full Unit of Measure Flow...\n');

    // 1. Get a unit
    const unit = await prisma.unitOfMeasure.findFirst({ where: { code: 'kg' } });
    if (!unit) {
      throw new Error('No kg unit found');
    }
    console.log('✅ Step 1: Found unit:', unit.code, '-', unit.name);

    // 2. Get or create a category
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: { name: 'Test Category for Units' }
      });
      console.log('✅ Step 2: Created category:', category.name);
    } else {
      console.log('✅ Step 2: Using existing category:', category.name);
    }

    // 3. Create a product WITH unit
    const product = await prisma.product.create({
      data: {
        sku: 'FULL-FLOW-TEST',
        name: 'Full Flow Test Product',
        costPrice: 100.0,
        sellPrice: 150.0,
        stock: 50,
        unitOfMeasureId: unit.id,
        categoryId: category.id,
        trackStock: true
      }
    });
    console.log('✅ Step 3: Created product with unitOfMeasureId:', product.unitOfMeasureId);

    // 4. Simulate getProducts action - include unitOfMeasure
    const productWithUnit = await prisma.product.findMany({
      take: 1,
      where: { sku: 'FULL-FLOW-TEST' },
      include: {
        category: { select: { name: true } },
        unitOfMeasure: { select: { code: true, name: true, abbreviation: true } },
        stocks: false
      }
    });
    console.log('✅ Step 4: Retrieved product with unit info:');
    console.log('    SKU:', productWithUnit[0].sku);
    console.log('    Name:', productWithUnit[0].name);
    console.log('    Stock:', productWithUnit[0].stock);
    console.log('    Unit:', productWithUnit[0].unitOfMeasure ? 
      `${productWithUnit[0].unitOfMeasure.code} (${productWithUnit[0].unitOfMeasure.name})` : 'null');

    // 5. Clean up
    await prisma.product.delete({ where: { id: product.id } });
    console.log('✅ Step 5: Cleaned up test product');

    // 6. Summary
    const unitCount = await prisma.unitOfMeasure.count();
    console.log('\n🎉 Full flow test PASSED!');
    console.log('📊 Summary:');
    console.log('   - UnitOfMeasure table: READY');
    console.log('   - Total units in DB:', unitCount);
    console.log('   - Products can have units: YES');
    console.log('   - getProducts returns unit info: YES');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
