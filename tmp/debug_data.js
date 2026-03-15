
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const roles = await prisma.role.findMany();
        console.log("ROLES:", roles.map(r => r.name));

        const techs = await prisma.technician.findMany();
        console.log("TECHS:", techs.map(t => t.name));

        const statuses = await prisma.ticket.groupBy({
            by: ['status'],
            _count: { id: true }
        });
        console.log("STATUSES:", statuses);

        const deliveredCount = await prisma.ticket.count({
            where: { deliveredAt: { not: null } }
        });
        console.log("DELIVERED_COUNT:", deliveredCount);

        const recentTickets = await prisma.ticket.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { barcode: true, status: true, createdAt: true }
        });
        console.log("RECENT_TICKETS:", JSON.stringify(recentTickets, null, 2));

    } catch (e) {
        console.error(e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
