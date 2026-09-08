import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

async function testReportLogic() {
    const startDate = new Date('2026-09-01T00:00:00.000Z');
    const endDate = new Date('2026-09-30T23:59:59.999Z');

    const tickets = await prisma.ticket.findMany({
        where: {
            deletedAt: null,
            status: { in: ['DELIVERED', 'PAID_DELIVERED', 'CLOSED', 'PICKED_UP', 'COMPLETED', 'READY_AT_BRANCH'] },
            createdAt: { gte: startDate, lte: endDate }
        },
        include: {
            technician: true,
            customer: true,
            parts: {
                include: { product: true }
            },
            payments: true
        },
        orderBy: { createdAt: 'desc' }
    });

    let totalRevenue = new Decimal(0);
    let partsCOGS = new Decimal(0);
    let partsRevenue = new Decimal(0);
    let laborRevenue = new Decimal(0);
    let totalCommissions = new Decimal(0);
    let totalPartsProfit = new Decimal(0);
    let totalLaborProfit = new Decimal(0);
    let totalNetProfit = new Decimal(0);

    for (const ticket of tickets) {
        const ticketRevenue = new Decimal(ticket.finalCustomerPrice?.toString() || ticket.repairPrice?.toString() || '0');
        const ticketPartsCost = new Decimal(
            Number(ticket.partCostPrice) > 0 
                ? ticket.partCostPrice.toString() 
                : (ticket.partsCost?.toString() || '0')
        );
        const commission = new Decimal(ticket.commissionAmount?.toString() || '0');

        // Physical parts must have a linked product
        const rawPartsRevenue = ticket.parts
            .filter(p => !!p.productId && p.product?.itemType !== 'SERVICE' && p.status !== 'SERVICE' && !p.deletedAt)
            .reduce((sum, p) => {
                const qty = new Decimal(Number(p.quantity || 1) - Number(p.refundedQty || 0));
                return qty.gt(0) ? sum.plus(new Decimal(p.price?.toString() || '0').times(qty)) : sum;
            }, new Decimal(0));

        // Part revenue realized cannot exceed ticket revenue
        const ticketPartsRevenue = Decimal.min(ticketRevenue, rawPartsRevenue);
        const ticketPartsProfit = ticketPartsRevenue.minus(ticketPartsCost);
        const ticketLaborRevenue = ticketRevenue.minus(ticketPartsRevenue);
        const ticketLaborProfit = ticketLaborRevenue.minus(commission);
        const ticketNetProfit = ticketPartsProfit.plus(ticketLaborProfit);

        totalRevenue = totalRevenue.plus(ticketRevenue);
        partsCOGS = partsCOGS.plus(ticketPartsCost);
        partsRevenue = partsRevenue.plus(ticketPartsRevenue);
        laborRevenue = laborRevenue.plus(ticketLaborRevenue);
        totalCommissions = totalCommissions.plus(commission);
        totalPartsProfit = totalPartsProfit.plus(ticketPartsProfit);
        totalLaborProfit = totalLaborProfit.plus(ticketLaborProfit);
        totalNetProfit = totalNetProfit.plus(ticketNetProfit);

        console.log(`[Ticket ${ticket.barcode}] Rev: ${ticketRevenue.toFixed(2)}, PartsRev: ${ticketPartsRevenue.toFixed(2)}, PartsCost: ${ticketPartsCost.toFixed(2)}, PartsProfit: ${ticketPartsProfit.toFixed(2)}, LaborProfit: ${ticketLaborProfit.toFixed(2)}, Net: ${ticketNetProfit.toFixed(2)}`);
    }

    console.log('\n--- EXACT KPI TOTALS ---');
    console.log(`إجمالي الإيرادات: ${totalRevenue.toFixed(2)} ج.م`);
    console.log(`تكلفة قطع الغيار: ${partsCOGS.toFixed(2)} ج.م`);
    console.log(`صافي ربح القطع: ${totalPartsProfit.toFixed(2)} ج.م`);
    console.log(`عمولات المهندسين: ${totalCommissions.toFixed(2)} ج.م`);
    console.log(`ربح الصيانة (صافي): ${totalLaborProfit.toFixed(2)} ج.م`);
    console.log(`صافي الربح العام: ${totalNetProfit.toFixed(2)} ج.م`);
}

testReportLogic().finally(() => prisma.$disconnect());
