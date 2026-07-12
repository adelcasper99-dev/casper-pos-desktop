const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const whs = await prisma.warehouse.findMany({ 
        select: { id: true, name: true, isDefault: true, branch: { select: { name: true } } } 
    });
    console.log(JSON.stringify(whs, null, 2));
}

main().finally(() => prisma.$disconnect());
