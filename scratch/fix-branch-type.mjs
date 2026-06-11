import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:./prisma/dev.db' } } });

// Update branch-1 (where all users are assigned) to be type CENTER
const updated = await p.branch.update({
    where: { id: 'branch-1' },
    data: { type: 'CENTER' }
});
console.log('Updated branch-1:', JSON.stringify(updated, null, 2));

// Verify all users now link to a CENTER branch
const users = await p.user.findMany({
    select: { id: true, username: true, branchId: true, branch: { select: { code: true, type: true } } }
});
console.log('Users:', JSON.stringify(users, null, 2));

await p.$disconnect();
