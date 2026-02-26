const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const treasuries = await prisma.treasury.findMany();

    // Find the CASH treasury
    let mainTreasury = treasuries.find(t => t.paymentMethod === 'CASH') || treasuries[0];

    if (!mainTreasury) {
        console.log("No treasuries found.");
        return;
    }

    // Update the main treasury
    await prisma.treasury.update({
        where: { id: mainTreasury.id },
        data: {
            name: "الخزينة الرئيسية",
            paymentMethod: "CASH",
            isDefault: true,
            deletedAt: null
        }
    });
    console.log(`Updated main treasury: ${mainTreasury.id} to "الخزينة الرئيسية"`);

    // Soft delete all others and remove default status
    for (const t of treasuries) {
        if (t.id !== mainTreasury.id) {
            await prisma.treasury.update({
                where: { id: t.id },
                data: {
                    isDefault: false,
                    deletedAt: new Date()
                }
            });
            console.log(`Soft deleted treasury: ${t.name} (ID: ${t.id})`);
        }
    }

    console.log("Treasury cleanup complete.");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
