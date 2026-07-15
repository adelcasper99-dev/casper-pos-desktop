import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixBalances() {
    // Get all customers whose balance is negative, which might be due to the bug
    const customers = await prisma.customer.findMany({
        where: { balance: { lt: 0 } },
        include: { transactions: true }
    });

    for (const customer of customers) {
        console.log(`Checking customer ${customer.name} (${customer.phone}) - Current Balance: ${customer.balance}`);
        
        // Let's recalculate their balance from their transactions
        let calculatedBalance = 0;
        
        for (const tx of customer.transactions) {
            // A DEBIT increases their debt (positive balance)
            // A CREDIT decreases their debt (negative balance impact)
            if (tx.type === 'DEBIT' || tx.type === 'OPENING_BALANCE') {
                calculatedBalance += Number(tx.amount);
            } else if (tx.type === 'CREDIT' || tx.type === 'REFUND') {
                calculatedBalance -= Number(tx.amount);
            }
        }
        
        console.log(`Calculated Balance should be: ${calculatedBalance}`);
        
        // Update to the calculated balance
        await prisma.customer.update({
            where: { id: customer.id },
            data: { balance: calculatedBalance }
        });
        console.log(`✅ Fixed balance for ${customer.name} to ${calculatedBalance}`);
    }
}

fixBalances().catch(console.error).finally(() => prisma.$disconnect());
