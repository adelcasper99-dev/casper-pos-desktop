import { PrismaClient } from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';

const prisma = new PrismaClient();

async function test() {
    const now = new Date();
    const targetMonth = now.getMonth();
    const targetYear = now.getFullYear();

    const start = new Date(targetYear, targetMonth, 1);
    const end = endOfMonth(start);

    console.log("Date Range:", start.toISOString(), "to", end.toISOString());

    try {
        console.log("1. Querying Users...");
        const activeUsersCount = await prisma.user.count({
            where: {
                deletedAt: null,
                isFrozen: false
            }
        });
        console.log("Active users count:", activeUsersCount);

        const usersWithSalary = await prisma.user.findMany({
            where: {
                deletedAt: null,
                isFrozen: false
            },
            select: { salary: true }
        });
        const expectedSalaries = usersWithSalary.reduce((sum, u) => sum + (u.salary ? Number(u.salary) : 0), 0);
        console.log("Expected Salaries:", expectedSalaries);

        console.log("2. Querying Absences...");
        const totalAbsences = await prisma.dailyWorkLog.count({
            where: {
                status: 'ABSENT',
                date: {
                    gte: start,
                    lte: end
                }
            }
        });
        console.log("Total Absences:", totalAbsences);

        console.log("3. Querying Transactions...");
        const transactions = await prisma.employeeTransaction.findMany({
            where: {
                createdAt: {
                    gte: start,
                    lte: end
                },
                type: {
                    in: ['SALES_DEDUCTION', 'MAINTENANCE_DEDUCTION', 'SALES_DEDUCTION_REVERSAL', 'MAINTENANCE_DEDUCTION_REVERSAL']
                }
            },
            select: { amount: true, type: true }
        });
        console.log("Transactions Count:", transactions.length);

    } catch (e) {
        console.error("CRASH DETECTED:", e);
    } finally {
        await prisma.$disconnect();
    }
}

test();
