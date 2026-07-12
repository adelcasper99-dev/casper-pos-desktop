const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const branches = await prisma.branch.findMany({ 
        select: { id: true, name: true, type: true, createdAt: true } 
    });
    console.log("Branches:", JSON.stringify(branches, null, 2));

    const whs = await prisma.warehouse.findMany({ 
        select: { id: true, name: true, isDefault: true, createdAt: true, branch: { select: { name: true } } } 
    });
    console.log("Warehouses:", JSON.stringify(whs, null, 2));
}

main().finally(() => prisma.$disconnect());
