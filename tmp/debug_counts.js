
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("TESTING DATABASE CONNECTION...");
        const ticketCount = await prisma.ticket.count();
        const techCount = await prisma.technician.count();
        const userCount = await prisma.user.count();
        const partCount = await prisma.ticketPart.count();
        const branchCount = await prisma.branch.count();

        console.log({
            ticketCount,
            techCount,
            userCount,
            partCount,
            branchCount
        });

        if (ticketCount > 0) {
            const sample = await prisma.ticket.findFirst();
            console.log("SAMPLE TICKET:", sample);
        }

    } catch (e) {
        console.error(e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
