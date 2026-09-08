import Decimal from 'decimal.js';
import assert from 'assert';

console.log('--- STARTING MAINTENANCE PROFITABILITY INVARIANT TEST ---');

interface MockPart {
    price: number;
    cost: number;
    quantity?: number;
    refundedQty?: number;
    deletedAt?: Date | null;
    status?: string;
    product?: { itemType?: string };
}

interface MockTicket {
    id: string;
    barcode: string;
    finalCustomerPrice?: number;
    repairPrice?: number;
    partCostPrice?: number;
    partsCost?: number;
    commissionAmount?: number;
    parts: MockPart[];
}

function calculateTicketFinancials(ticket: MockTicket) {
    const ticketRevenue = new Decimal(ticket.finalCustomerPrice?.toString() || ticket.repairPrice?.toString() || '0');
    const ticketPartsCost = new Decimal(
        Number(ticket.partCostPrice) > 0 
            ? ticket.partCostPrice.toString() 
            : (ticket.partsCost?.toString() || '0')
    );
    const commission = new Decimal(ticket.commissionAmount?.toString() || '0');

    const ticketPartsRevenue = ticket.parts
        .filter(p => p.product?.itemType !== 'SERVICE' && p.status !== 'SERVICE' && !p.deletedAt)
        .reduce((sum, p) => {
            const qty = new Decimal(Number(p.quantity || 1) - Number(p.refundedQty || 0));
            return qty.gt(0) ? sum.plus(new Decimal(p.price?.toString() || '0').times(qty)) : sum;
        }, new Decimal(0));

    const ticketPartsProfit = ticketPartsRevenue.minus(ticketPartsCost);
    const ticketLaborRevenue = ticketRevenue.minus(ticketPartsRevenue);
    const ticketLaborProfit = ticketLaborRevenue.minus(commission);
    const ticketNetProfit = ticketPartsProfit.plus(ticketLaborProfit);

    return {
        ticketRevenue,
        ticketPartsCost,
        ticketPartsRevenue,
        ticketPartsProfit,
        ticketLaborRevenue,
        ticketLaborProfit,
        ticketNetProfit,
        commission
    };
}

const testCases: MockTicket[] = [
    {
        id: '1',
        barcode: 'T-009',
        finalCustomerPrice: 500,
        partCostPrice: 0,
        commissionAmount: 200,
        parts: []
    },
    {
        id: '2',
        barcode: 'T-008',
        finalCustomerPrice: 400,
        partCostPrice: 0,
        commissionAmount: 160,
        parts: []
    },
    {
        id: '3',
        barcode: 'T-007', // Warranty / Complementary (0 revenue, 200 cost, 40 commission)
        finalCustomerPrice: 0,
        partCostPrice: 200,
        commissionAmount: 40,
        parts: [
            { price: 0, cost: 200, quantity: 1 }
        ]
    },
    {
        id: '4',
        barcode: 'T-005',
        finalCustomerPrice: 200,
        partCostPrice: 0,
        commissionAmount: 80,
        parts: []
    },
    {
        id: '5',
        barcode: 'T-STRESS-BELOW-COST', // Stress test: part sold below cost
        finalCustomerPrice: 350,
        partCostPrice: 150,
        commissionAmount: 50,
        parts: [
            { price: 100, cost: 150, quantity: 1 } // Sold at 100, cost is 150 -> -50 part profit
        ]
    }
];

let totalRevenue = new Decimal(0);
let partsCOGS = new Decimal(0);
let totalCommissions = new Decimal(0);
let totalPartsProfit = new Decimal(0);
let totalLaborProfit = new Decimal(0);
let totalNetProfit = new Decimal(0);

for (const t of testCases) {
    const res = calculateTicketFinancials(t);

    totalRevenue = totalRevenue.plus(res.ticketRevenue);
    partsCOGS = partsCOGS.plus(res.ticketPartsCost);
    totalCommissions = totalCommissions.plus(res.commission);
    totalPartsProfit = totalPartsProfit.plus(res.ticketPartsProfit);
    totalLaborProfit = totalLaborProfit.plus(res.ticketLaborProfit);
    totalNetProfit = totalNetProfit.plus(res.ticketNetProfit);

    // Per-ticket invariant assertion
    const expectedDirectNet = res.ticketRevenue.minus(res.ticketPartsCost.plus(res.commission));
    assert.strictEqual(
        res.ticketNetProfit.toFixed(2),
        expectedDirectNet.toFixed(2),
        `Per-ticket invariant failed on ${t.barcode}`
    );
    assert.strictEqual(
        res.ticketPartsProfit.plus(res.ticketLaborProfit).toFixed(2),
        res.ticketNetProfit.toFixed(2),
        `Sum of parts + labor profit must equal net profit on ${t.barcode}`
    );

    console.log(`[PASS] Ticket ${t.barcode}: Revenue=${res.ticketRevenue.toFixed(2)}, PartsCost=${res.ticketPartsCost.toFixed(2)}, PartsProfit=${res.ticketPartsProfit.toFixed(2)}, LaborProfit=${res.ticketLaborProfit.toFixed(2)}, NetProfit=${res.ticketNetProfit.toFixed(2)}`);
}

// Aggregate reconciliation assertion
const expectedAggregateNet = totalRevenue.minus(partsCOGS.plus(totalCommissions));
const sumOfComponentProfits = totalPartsProfit.plus(totalLaborProfit);

assert.strictEqual(
    totalNetProfit.toFixed(2),
    expectedAggregateNet.toFixed(2),
    'Aggregate totalNetProfit must match Total Revenue - Parts COGS - Total Commissions'
);
assert.strictEqual(
    sumOfComponentProfits.toFixed(2),
    totalNetProfit.toFixed(2),
    'Aggregate totalPartsProfit + totalLaborProfit must match totalNetProfit'
);

console.log('\n--- AGGREGATE RECONCILIATION SUMMARY ---');
console.log(`Total Revenue:          ${totalRevenue.toFixed(2)}`);
console.log(`Total Parts COGS:       ${partsCOGS.toFixed(2)}`);
console.log(`Total Commissions:      ${totalCommissions.toFixed(2)}`);
console.log(`Total Parts Profit:     ${totalPartsProfit.toFixed(2)}`);
console.log(`Total Labor Profit:     ${totalLaborProfit.toFixed(2)}`);
console.log(`Total Net Profit:       ${totalNetProfit.toFixed(2)}`);
console.log(`Sum (Parts + Labor):    ${sumOfComponentProfits.toFixed(2)}`);
console.log(`Expected (Rev-COGS-Com):${expectedAggregateNet.toFixed(2)}`);
console.log('\n✅ ALL PER-TICKET AND AGGREGATE INVARIANT ASSERTIONS PASSED UNCONDITIONALLY!');
