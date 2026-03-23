const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const ticket = await prisma.ticket.findFirst({
        where: { barcode: 'T-015' },
        include: {
            parts: true,
            payments: true,
        }
    });

    if (!ticket) {
        console.log("Ticket #T-015 not found.");
        return;
    }

    console.log("\n=== TICKET MAIN DATA ===");
    console.log(JSON.stringify({
        id: ticket.id,
        barcode: ticket.barcode,
        status: ticket.status,
        repairPrice: ticket.repairPrice,
        partsCost: ticket.partsCost,
        finalCustomerPrice: ticket.finalCustomerPrice,
        amountPaid: ticket.amountPaid,
        netProfit: ticket.netProfit,
        commissionAmount: ticket.commissionAmount,
        techCommissionAmount: ticket.techCommissionAmount,
        centerLaborProfit: ticket.centerLaborProfit,
        centerPartProfit: ticket.centerPartProfit,
    }, null, 2));

    console.log("\n=== PARTS ===");
    ticket.parts.forEach(p => console.log(`- ${p.name}: Cost=${p.cost}, Price=${p.price}, Qty=${p.quantity}`));

    console.log("\n=== PAYMENTS ===");
    ticket.payments.forEach(p => console.log(`- Type=${p.type}, Method=${p.method}, Amount=${p.amount}`));

    const journalEntries = await prisma.journalEntry.findMany({
        where: { OR: [ { reference: ticket.id }, { reference: ticket.barcode } ] },
        include: { lines: { include: { account: true } } }
    });

    console.log("\n=== JOURNAL ENTRIES ===");
    journalEntries.forEach(je => {
        console.log(`\nEntry: ${je.description} (${je.reference})`);
        je.lines.forEach(l => {
            console.log(`  [${l.account.code}] ${l.account.name}: Debit=${l.debit}, Credit=${l.credit}`);
        });
    });

    const employeeTransactions = await prisma.employeeTransaction.findMany({
        where: { referenceId: ticket.id }
    });

    console.log("\n=== EMPLOYEE TRANSACTIONS ===");
    employeeTransactions.forEach(et => {
        console.log(`- Type=${et.type}, Amount=${et.amount}, Desc=${et.description}`);
    });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
