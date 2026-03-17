
import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("--- TECHNICIANS ---");
    const techs = await prisma.technician.findMany({
        include: { user: { select: { username: true, role: { select: { name: true } } } } }
    });
    console.log(JSON.stringify(techs, null, 2));

    console.log("\n--- USER ROLES (for techs) ---");
    const users = await prisma.user.findMany({
        where: { role: { name: { contains: "TECH" } } },
        select: { username: true, role: { select: { name: true } } }
    });
    console.log(JSON.stringify(users, null, 2));

    console.log("\n--- RECENT TICKETS (Last 10) ---");
    const tickets = await prisma.ticket.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, barcode: true, status: true, createdAt: true, deletedAt: true }
    });
    console.log(JSON.stringify(tickets, null, 2));
}

main().catch(console.error);
