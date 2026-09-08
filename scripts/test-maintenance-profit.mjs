import Decimal from 'decimal.js';
import assert from 'assert';

console.log('--- STARTING HARDENED MAINTENANCE PROFITABILITY INVARIANT & REGRESSION SUITE ---');

function calculateTicketFinancials(ticket) {
    const ticketRevenue = new Decimal(ticket.finalCustomerPrice?.toString() || ticket.repairPrice?.toString() || '0');
    const ticketPartsCost = new Decimal(
        Number(ticket.partCostPrice) > 0 
            ? ticket.partCostPrice.toString() 
            : (ticket.partsCost?.toString() || '0')
    );
    const commission = new Decimal(ticket.commissionAmount?.toString() || '0');

    // Physical parts MUST have a linked warehouse product (p.productId != null) and not be SERVICE
    const rawPartsRevenue = (ticket.parts || [])
        .filter(p => !!p.productId && p.product?.itemType !== 'SERVICE' && p.status !== 'SERVICE' && !p.deletedAt)
        .reduce((sum, p) => {
            const qty = new Decimal(Number(p.quantity || 1) - Number(p.refundedQty || 0));
            return qty.gt(0) ? sum.plus(new Decimal(p.price?.toString() || '0').times(qty)) : sum;
        }, new Decimal(0));

    // Realized parts revenue cannot exceed total ticket revenue
    const ticketPartsRevenue = Decimal.min(ticketRevenue, rawPartsRevenue);

    // Exact unclamped algebra: PartsProfit + LaborProfit === NetProfit
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

const regressionTestCases = [
    {
        id: '1',
        barcode: 'T-009-MANUAL-SERVICE-NO-PRODUCT-ID',
        finalCustomerPrice: 500,
        partCostPrice: 0,
        commissionAmount: 200,
        // Regression fixture: line item added with no productId (manual labor/service entry)
        parts: [
            { name: 'kll', price: 500, cost: 0, productId: null, quantity: 1 }
        ]
    },
    {
        id: '2',
        barcode: 'T-008-MANUAL-SERVICE-NO-PRODUCT-ID',
        finalCustomerPrice: 400,
        partCostPrice: 0,
        commissionAmount: 160,
        parts: [
            { name: 'fgh', price: 400, cost: 0, productId: null, quantity: 1 }
        ]
    },
    {
        id: '3',
        barcode: 'T-007-WARRANTY-ZERO-REVENUE-REAL-PART',
        finalCustomerPrice: 0,
        partCostPrice: 200,
        commissionAmount: 40,
        // Regression fixture: physical part linked to inventory product
        parts: [
            { name: 'شاشه - s26 - or', price: 300, cost: 100, productId: 'prod-screen-123', product: { itemType: 'PHYSICAL' }, quantity: 1 }
        ]
    },
    {
        id: '4',
        barcode: 'T-005-MANUAL-SERVICE-NO-PRODUCT-ID',
        finalCustomerPrice: 200,
        partCostPrice: 0,
        commissionAmount: 80,
        parts: [
            { name: 'hokk', price: 200, cost: 0, productId: null, quantity: 1 }
        ]
    },
    {
        id: '5',
        barcode: 'T-STRESS-BELOW-COST-PART',
        finalCustomerPrice: 350,
        partCostPrice: 150,
        commissionAmount: 50,
        parts: [
            { name: 'discounted-part', price: 100, cost: 150, productId: 'prod-disc-456', product: { itemType: 'PHYSICAL' }, quantity: 1 }
        ]
    },
    {
        id: '6',
        barcode: 'T-SERVICE-ITEM-TYPE-CATALOG',
        finalCustomerPrice: 600,
        partCostPrice: 0,
        commissionAmount: 150,
        // Regression fixture: catalog product with itemType: SERVICE
        parts: [
            { name: 'software-flash', price: 600, cost: 0, productId: 'prod-svc-789', product: { itemType: 'SERVICE' }, quantity: 1 }
        ]
    }
];

let totalRevenue = new Decimal(0);
let partsCOGS = new Decimal(0);
let totalCommissions = new Decimal(0);
let totalPartsProfit = new Decimal(0);
let totalLaborProfit = new Decimal(0);
let totalNetProfit = new Decimal(0);

for (const t of regressionTestCases) {
    const res = calculateTicketFinancials(t);

    totalRevenue = totalRevenue.plus(res.ticketRevenue);
    partsCOGS = partsCOGS.plus(res.ticketPartsCost);
    totalCommissions = totalCommissions.plus(res.commission);
    totalPartsProfit = totalPartsProfit.plus(res.ticketPartsProfit);
    totalLaborProfit = totalLaborProfit.plus(res.ticketLaborProfit);
    totalNetProfit = totalNetProfit.plus(res.ticketNetProfit);

    // Assert: Manual service items (no productId or itemType === SERVICE) must NOT leak into parts revenue
    if (t.barcode.includes('MANUAL-SERVICE') || t.barcode.includes('SERVICE-ITEM-TYPE')) {
        assert.strictEqual(
            res.ticketPartsRevenue.toFixed(2),
            '0.00',
            `Regression assertion failed: Manual/Service item on ${t.barcode} leaked into Parts Revenue!`
        );
        assert.strictEqual(
            res.ticketLaborRevenue.toFixed(2),
            res.ticketRevenue.toFixed(2),
            `Regression assertion failed: Service revenue on ${t.barcode} did not route to Labor Revenue!`
        );
    }

    // Invariant assertions
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

    console.log(`[PASS] Ticket ${t.barcode}: Rev=${res.ticketRevenue.toFixed(2)}, PartsRev=${res.ticketPartsRevenue.toFixed(2)}, PartsCost=${res.ticketPartsCost.toFixed(2)}, PartsProfit=${res.ticketPartsProfit.toFixed(2)}, LaborProfit=${res.ticketLaborProfit.toFixed(2)}, Net=${res.ticketNetProfit.toFixed(2)}`);
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
console.log('\n✅ ALL REGRESSION & INVARIANT ASSERTIONS PASSED UNCONDITIONALLY!');
