import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const accs = await prisma.account.findMany();
    accs.forEach(a => console.log(`${a.code} - ${a.name}`));
}
main();
