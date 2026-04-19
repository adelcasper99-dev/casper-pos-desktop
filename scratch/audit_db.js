const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function audit() {
    const branches = await p.branch.findMany();
    const treasuries = await p.treasury.findMany();

    console.log('\n=== BRANCHES ===');
    branches.forEach(b => console.log(JSON.stringify({ id: b.id, name: b.name, code: b.code })));

    console.log('\n=== ALL TREASURIES (including deleted) ===');
    treasuries.forEach(t => console.log(JSON.stringify({
        id: t.id,
        name: t.name,
        branchId: t.branchId,
        paymentMethod: t.paymentMethod,
        isDefault: t.isDefault,
        deletedAt: t.deletedAt,
        createdAt: t.createdAt
    })));

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total branches: ${branches.length}`);
    console.log(`Total treasuries (incl. deleted): ${treasuries.length}`);
    console.log(`Active treasuries: ${treasuries.filter(t => !t.deletedAt).length}`);
    console.log(`Default treasuries: ${treasuries.filter(t => t.isDefault && !t.deletedAt).length}`);
}

audit().catch(console.error).finally(() => p.$disconnect());
