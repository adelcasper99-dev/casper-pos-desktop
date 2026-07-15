import { prisma } from "./src/lib/prisma.js";
import { startOfMonth, endOfMonth } from "date-fns";

async function test() {
    const db = prisma;
    const now = new Date();
    const targetMonth = now.getMonth();
    const targetYear = now.getFullYear();

    const start = new Date(targetYear, targetMonth, 1);
    const end = endOfMonth(start);

    console.log("Start:", start);
    console.log("End:", end);

    try {
        console.log("Fetching active users...");
        const activeUsers = await db.user.findMany({
            where: {
                deletedAt: null,
                isFrozen: false
            },
            select: { salary: true }
        });
        console.log("Active users count:", activeUsers.length);

        console.log("Counting absences...");
        const totalAbsences = await db.dailyWorkLog.count({
            where: {
                status: 'ABSENT',
                date: {
                    gte: start,
                    lte: end
                }
            }
        });
        console.log("Total absences:", totalAbsences);

        console.log("Fetching transactions...");
        const transactions = await db.employeeTransaction.findMany({
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
        console.log("Transactions count:", transactions.length);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await db.$disconnect();
    }
}

test();
