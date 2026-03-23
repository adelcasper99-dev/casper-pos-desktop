const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tickets = await prisma.ticket.findMany({
        where: {
            status: 'PAID_DELIVERED',
            deletedAt: null
        }
    });

    console.log(`Analyzing ${tickets.length} tickets...`);
    let discrepancyCount = 0;

    tickets.forEach(t => {
        const repairPrice = Number(t.repairPrice) || 0;
        const partsCost = Number(t.partsCost) || 0;
        const amountPaid = Number(t.amountPaid) || 0;
        const finalPrice = Number(t.finalCustomerPrice) || repairPrice;

        const oldCalculatedTotal = repairPrice + partsCost;
        
        if (oldCalculatedTotal !== amountPaid && amountPaid > 0) {
            // Check if partsCost is the difference
            const diff = oldCalculatedTotal - amountPaid;
            if (Math.abs(diff - partsCost) < 0.01) {
                console.log(`[BUG DETECTED] Ticket #${t.barcode}: Shown=${oldCalculatedTotal}, Paid=${amountPaid}, PartsCost=${partsCost}. Diff matches PartsCost!`);
                discrepancyCount++;
            } else {
                console.log(`[OTHER DIFF] Ticket #${t.barcode}: Shown=${oldCalculatedTotal}, Paid=${amountPaid}, Diff=${diff}`);
            }
        }
    });

    console.log(`\nAudit Complete. Total discrepancies found: ${discrepancyCount}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
