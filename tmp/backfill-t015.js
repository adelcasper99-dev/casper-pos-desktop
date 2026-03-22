const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfill() {
    console.log("--- Backfilling Ticket #T-015 ---");

    const ticket = await prisma.ticket.findFirst({
        where: { barcode: 'T-015' }
    });

    if (!ticket) {
        console.log("Ticket #T-015 not found.");
        return;
    }

    // Update Ticket summary fields
    await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
            techBillingPrice: 100,
            partCostPrice: 50,
            partsCost: 100 // Legacy partsCost should reflect the transfer price to match commission math
        }
    });

    // Update TicketParts
    await prisma.ticketPart.updateMany({
        where: { ticketId: ticket.id, status: 'ACTIVE' },
        data: {
            baseCostPrice: 50,
            transferPrice: 100,
            cost: 100
        }
    });

    console.log("✅ Success: Ticket #T-015 updated to 100 Transfer / 50 Base Cost.");
    await prisma.$disconnect();
}

backfill();
