const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("--- Unit Cleanup Process Start ---");

  // 1. Fetch all units
  const allUnits = await prisma.unitOfMeasure.findMany();
  
  // 2. Define Arabic units to keep
  const keepNames = ["قطعة", "كرتونة", "كيلو", "متر"];
  const keepUnits = allUnits.filter(u => keepNames.includes(u.name));
  const keepIds = keepUnits.map(u => u.id);
  
  const toDelete = allUnits.filter(u => !keepNames.includes(u.name));
  const toDeleteIds = toDelete.map(u => u.id);

  console.log(`Found ${keepUnits.length} Arabic units to keep.`);
  console.log(`Found ${toDelete.length} units to delete.`);

  // 3. Check for products using these units
  const productsWithBadUnits = await prisma.product.findMany({
    where: {
      unitOfMeasureId: { in: toDeleteIds }
    },
    include: {
      unitOfMeasure: true
    }
  });

  if (productsWithBadUnits.length > 0) {
    console.log(`Warning: Found ${productsWithBadUnits.length} products using English units.`);
    
    // Attempt mapping
    // Piece/pcs -> قطعة
    // Box/box/ctn -> كرتونة
    // Kilogram/kg -> كيلو
    // Meter/m -> متر
    
    const pieceUnit = keepUnits.find(u => u.name === "قطعة");
    const boxUnit = keepUnits.find(u => u.name === "كرتونة");
    const kiloUnit = keepUnits.find(u => u.name === "كيلو");
    const meterUnit = keepUnits.find(u => u.name === "متر");

    for (const prod of productsWithBadUnits) {
      let targetId = null;
      const oldName = prod.unitOfMeasure.name.toLowerCase();
      
      if (oldName.includes("piece") || oldName.includes("pcs")) targetId = pieceUnit?.id;
      else if (oldName.includes("box") || oldName.includes("carton") || oldName.includes("ctn")) targetId = boxUnit?.id;
      else if (oldName.includes("kilogram") || oldName.includes("kg")) targetId = kiloUnit?.id;
      else if (oldName.includes("meter") || oldName === "m") targetId = meterUnit?.id;

      await prisma.product.update({
        where: { id: prod.id },
        data: { unitOfMeasureId: targetId } // Will be null if no mapping found
      });
      console.log(`Updated product ${prod.name}: ${prod.unitOfMeasure.name} -> ${targetId ? "Arabic Equivalent" : "NULL"}`);
    }
  }

  // 4. Delete English units
  const deleteResult = await prisma.unitOfMeasure.deleteMany({
    where: {
      id: { in: toDeleteIds }
    }
  });

  console.log(`Successfully deleted ${deleteResult.count} units.`);
  console.log("--- Cleanup Finished ---");
}

main()
  .catch(e => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
