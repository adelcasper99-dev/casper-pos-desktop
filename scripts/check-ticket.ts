import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const ticket = await prisma.ticket.findFirst({where: {barcode: 'T-002'}});
    console.log("Status is:", ticket?.status);
}
run().finally(() => prisma.$disconnect());
