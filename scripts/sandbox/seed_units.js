const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const defaults = [
    { name: 'قطعة', code: 'PC', abbreviation: 'pc' },
    { name: 'كرتونة', code: 'BOX', abbreviation: 'box' },
    { name: 'كيلو', code: 'KG', abbreviation: 'kg' },
    { name: 'لتر', code: 'L', abbreviation: 'l' },
    { name: 'متر', code: 'M', abbreviation: 'm' },
  ];

  console.log('Seeding default units...');

  for (const unit of defaults) {
      const exists = await prisma.unitOfMeasure.findUnique({
          where: { code: unit.code }
      });

      if (!exists) {
          await prisma.unitOfMeasure.create({
              data: {
                  ...unit,
                  category: 'GENERAL'
              }
          });
          console.log(`Created unit: ${unit.name}`);
      } else {
          console.log(`Unit already exists: ${unit.name}`);
      }
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
