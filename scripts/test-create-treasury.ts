import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCreate() {
    try {
        const branch = await prisma.branch.findFirst();
        if (!branch) {
            console.log("No branch found");
            return;
        }

        const treasury = await prisma.treasury.create({
            data: {
                name: "Test Treasury " + Date.now(),
                branchId: branch.id,
                isDefault: false,
                paymentMethod: "WALLET"
            }
        });

        console.log("Created successfully:", treasury);

        const treasuries = await prisma.treasury.findMany({
            where: { branchId: branch.id }
        });
        console.log("All treasuries:", treasuries);
    } catch (e) {
        console.error("Error creating treasury:", e);
    } finally {
        await prisma.$disconnect();
    }
}

testCreate();
