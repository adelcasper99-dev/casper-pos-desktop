import { prisma } from "./src/lib/prisma.js";
import { startOfMonth, endOfMonth } from "date-fns";
import { Decimal } from "decimal.js";

async function diag() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const start = startOfMonth(new Date(year, month));
    const end = endOfMonth(new Date(year, month));

    console.log(`Month: ${month}, Year: ${year}`);
    console.log(`Range: ${start.toISOString()} - ${end.toISOString()}`);

    const users = await prisma.user.findMany({
        where: { deletedAt: null, isFrozen: false },
        include: {
            dailyLogs: { where: { date: { gte: start, lte: end } } },
            employeeTransactions: { where: { createdAt: { gte: start, lte: end } } }
        }
    });

    console.log(`Found ${users.length} active users.`);

    let totalNetDue = new Decimal(0);

    for (const u of users) {
        let baseSalary = new Decimal(u.salary?.toString() || '0');
        let bonuses = new Decimal(0);
        let deductions = new Decimal(0);

        u.dailyLogs.forEach(log => {
            bonuses = bonuses.plus(log.bonus.toString());
            const logDed = new Decimal(log.deduction.toString());
            if (log.status === 'ABSENT' && logDed.isZero()) {
                deductions = deductions.plus(baseSalary.dividedBy(30));
            } else {
                deductions = deductions.plus(logDed);
            }
        });

        u.employeeTransactions.forEach(tx => {
            if (tx.type === 'BONUS' || tx.type === 'ADDITION' || tx.type.endsWith('_REVERSAL')) {
                bonuses = bonuses.plus(tx.amount.toString());
            } else if (tx.type === 'DEDUCTION' || tx.type === 'PENALTY' || tx.type.endsWith('_DEDUCTION') || tx.type === 'SALARY_PAYMENT') {
                deductions = deductions.plus(tx.amount.toString());
            }
        });

        const net = baseSalary.plus(bonuses).minus(deductions);
        console.log(`User ${u.username}: Base=${baseSalary}, Bonus=${bonuses}, Ded=${deductions}, Net=${net}`);
        totalNetDue = totalNetDue.plus(net);
    }

    console.log(`Final totalNetDue: ${totalNetDue}`);
}

diag().catch(console.error).finally(() => prisma.$disconnect());
