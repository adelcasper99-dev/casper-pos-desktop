const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const units = await prisma.unitOfMeasure.findMany({
      select: { name: true, abbreviation: true }
    });
    console.log('UNITS_DATA_START');
    console.log(JSON.stringify(units));
    console.log('UNITS_DATA_END');
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
