import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function debug() {
    console.log("Starting P2003 Debug...");

    try {
        console.log("Testing invalid shiftId...");
        await prisma.transaction.create({
            data: {
                type: 'SALE',
                amount: 100,
                shiftId: 'non-existent-shift-id'
            }
        });
    } catch (e: any) {
        console.log("Error for invalid shiftId:", JSON.stringify(e, null, 2));
    }

    try {
        console.log("Testing invalid treasuryId...");
        await prisma.transaction.create({
            data: {
                type: 'SALE',
                amount: 100,
                treasuryId: 'non-existent-treasury-id'
            }
        });
    } catch (e: any) {
        console.log("Error for invalid treasuryId:", JSON.stringify(e, null, 2));
    }

    try {
        console.log("Testing invalid expenseId...");
        await prisma.transaction.create({
            data: {
                type: 'SALE',
                amount: 100,
                expenseId: 'non-existent-expense-id'
            }
        });
    } catch (e: any) {
        console.log("Error for invalid expenseId:", JSON.stringify(e, null, 2));
    }

    await prisma.$disconnect();
}

debug();
