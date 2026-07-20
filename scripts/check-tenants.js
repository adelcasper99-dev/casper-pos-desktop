const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany();
    console.log("=== TENANTS ===");
    tenants.forEach(t => {
        console.log(`ID: ${t.id} | Name: ${t.name} | Slug: ${t.slug} | ActivationCode: ${t.activationCode} | MachineId: ${t.machineId}`);
    });

    const licenses = await prisma.license.findMany();
    console.log("=== LICENSES ===");
    licenses.forEach(l => {
        console.log(`ID: ${l.id} | Key: ${l.key} | TenantId: ${l.tenantId} | Status: ${l.status}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
