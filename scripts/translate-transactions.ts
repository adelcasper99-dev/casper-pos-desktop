import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixTransactions() {
    const transactions = await prisma.customerTransaction.findMany({
        where: {
            description: {
                contains: 'Deferred'
            }
        }
    });

    for (const tx of transactions) {
        if (!tx.description) continue;
        let newDesc = tx.description;
        newDesc = newDesc.replace('Ticket', 'فاتورة');
        newDesc = newDesc.replace(' - Deferred', ' - آجل');
        newDesc = newDesc.replace(' Account Deferred', ' - آجل');

        await prisma.customerTransaction.update({
            where: { id: tx.id },
            data: { description: newDesc }
        });
    }

    console.log(`Updated ${transactions.length} transactions`);
}

fixTransactions()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
