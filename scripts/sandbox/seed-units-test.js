
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Import and run the seed units function
    const { seedUnits } = require('./src/lib/inventory/seed-units');
    await seedUnits();
    console.log('✅ Seeded units');

    // Verify
    const units = await prisma.unitOfMeasure.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    console.log('✅ Total units after seeding:', units.length);
    
    // Show some examples
    const examples = units.slice(0, 10);
    examples.forEach(u => {
      console.log();
    });
    
    // Check categories
    const categories = [...new Set(units.map(u => u.category))];
    console.log('✅ Categories:', categories.join(', '));
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.();
  }
}

main();

