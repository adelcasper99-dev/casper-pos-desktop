import { getFinancialDashboardMetrics } from './src/features/dashboard/api/dashboard-service.ts';
import { getReportData } from './src/actions/reports-actions.ts';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // Test with the exact March range shown in the image: March 1 to March 31
    const startDate = '2026-03-01T00:00:00.000Z';
    const endDate = '2026-03-31T23:59:59.999Z';

    const dashObj = await getFinancialDashboardMetrics({ startDate, endDate });
    const repObj = await getReportData({ startDate, endDate });

    console.log("=== NEW DASHBOARD ===");
    console.log(JSON.stringify(dashObj.data, null, 2));

    console.log("=== OLD REPORTS DASHBOARD ===");
    console.log(JSON.stringify(repObj.data?.kpis, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
