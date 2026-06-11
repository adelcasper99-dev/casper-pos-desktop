import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:./prisma/dev.db' } } });
const branches = await p.branch.findMany({ select: { id: true, name: true, code: true, type: true } });
console.log(JSON.stringify(branches, null, 2));
const users = await p.user.findMany({ select: { id: true, username: true, branchId: true, branch: { select: { type: true } } } });
console.log(JSON.stringify(users, null, 2));
await p.$disconnect();
