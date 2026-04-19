const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function fix() {
    // Get all valid branch IDs
    const branches = await p.branch.findMany({ select: { id: true } });
    const validBranchIds = branches.map(b => b.id);
    
    console.log('Valid branch IDs:', validBranchIds);
    
    // Find orphaned treasuries (branchId references a deleted branch)
    const allTreasuries = await p.treasury.findMany();
    const orphaned = allTreasuries.filter(t => !validBranchIds.includes(t.branchId));
    
    console.log(`\nFound ${orphaned.length} orphaned treasuries:`);
    orphaned.forEach(t => console.log(` - ${t.name} (${t.id}) → branchId: ${t.branchId}`));
    
    if (orphaned.length === 0) {
        console.log('Nothing to clean.');
        return;
    }

    // Delete orphaned treasuries
    for (const t of orphaned) {
        await p.treasury.delete({ where: { id: t.id } });
        console.log(`✅ Deleted orphan: ${t.name} (${t.id})`);
    }

    // Final state
    const remaining = await p.treasury.findMany({ where: { deletedAt: null } });
    console.log(`\n✨ Done. ${remaining.length} treasury/treasuries remaining:`);
    remaining.forEach(t => console.log(` - ${t.name} | branch: ${t.branchId} | method: ${t.paymentMethod} | default: ${t.isDefault}`));
}

fix().catch(console.error).finally(() => p.$disconnect());
