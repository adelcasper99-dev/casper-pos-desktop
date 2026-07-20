const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany();
    console.log("Tenants count:", tenants.length);
    tenants.forEach(t => {
        console.log(`ID: ${t.id} | Name: ${t.name} | Slug: ${t.slug} | Code: ${t.activationCode} | MachineId: ${t.machineId}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
