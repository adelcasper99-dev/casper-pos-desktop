import { getReportData } from './src/actions/reports-actions.ts';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const res = await getReportData();
    console.log(JSON.stringify(res.data?.kpis, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
