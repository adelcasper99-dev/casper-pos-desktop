const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting Final Security Audit...");

    const tickets = await prisma.ticket.findMany({
        where: {
            status: 'PAID_DELIVERED',
            deletedAt: null
        }
    });

    let discrepancies = 0;
    for (const t of tickets) {
        const finalPrice = Number(t.finalCustomerPrice) || 0;
        const amountPaid = Number(t.amountPaid) || 0;
        
        // In a perfect system, finalCustomerPrice should match amountPaid for completed tickets
        if (Math.abs(finalPrice - amountPaid) > 0.01) {
            console.log(`[DISCREPANCY] Ticket #${t.barcode}: FinalPrice=${finalPrice}, AmountPaid=${amountPaid}`);
            discrepancies++;
        }
    }

    if (discrepancies === 0) {
        console.log("\n✅ AUDIT PASSED: All completed tickets have consistent final prices and payments.");
    } else {
        console.log(`\n❌ AUDIT FAILED: ${discrepancies} tickets still have discrepancies.`);
    }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
