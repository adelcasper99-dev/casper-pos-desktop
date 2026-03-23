const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const shift = await prisma.shift.findFirst({
        where: { status: 'OPEN' },
        include: { user: true }
    });
    console.log("ACTIVE SHIFT:", JSON.stringify(shift, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2));
    await prisma.$disconnect();
}
check();
