import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testCurrentData() {
    const startDate = new Date('2026-09-01T00:00:00.000Z');
    const endDate = new Date('2026-09-30T23:59:59.999Z');

    const tickets = await prisma.ticket.findMany({
        where: {
            deletedAt: null,
            status: { in: ['DELIVERED', 'PAID_DELIVERED', 'CLOSED', 'PICKED_UP', 'COMPLETED', 'READY_AT_BRANCH'] },
            createdAt: { gte: startDate, lte: endDate }
        },
        include: {
            technician: true,
            customer: true,
            parts: {
                include: { product: true }
            },
            payments: true
        },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Found ${tickets.length} tickets in DB.`);
    for (const t of tickets) {
        console.log(`Ticket: ${t.barcode} | Revenue: ${t.finalCustomerPrice || t.repairPrice} | PartCostPrice: ${t.partCostPrice} | PartsCost: ${t.partsCost} | Comm: ${t.commissionAmount} | Parts Count: ${t.parts.length}`);
        for (const p of t.parts) {
            console.log(`   -> Part: ${p.name || p.productId} | Price: ${p.price} | Cost: ${p.baseCostPrice || p.cost} | Qty: ${p.quantity} | Deleted: ${p.deletedAt} | Status: ${p.status}`);
        }
    }
}

testCurrentData().finally(() => prisma.$disconnect());
