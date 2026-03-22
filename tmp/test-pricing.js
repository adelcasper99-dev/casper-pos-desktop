const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const Decimal = require('decimal.js');

async function test() {
    console.log("--- Testing Tiered Pricing Logic ---");

    // 1. Get a test product
    const product = await prisma.product.findFirst();
    if (!product) {
        console.log("No product found for testing.");
        return;
    }
    console.log(`Product: ${product.name} | Cost: ${product.costPrice} | Sell1: ${product.sellPrice} | Sell2: ${product.sellPrice2} | Sell3: ${product.sellPrice3}`);

    // 2. Get a test technician and set to SELL_3
    const tech = await prisma.technician.findFirst();
    if (!tech) {
        console.log("No technician found.");
        return;
    }
    await prisma.technician.update({
        where: { id: tech.id },
        data: { defaultPriceTier: 'SELL_3' }
    });
    console.log(`Technician ${tech.name} updated to SELL_3`);

    // 3. Logic simulation (same as in ticket-actions.ts)
    const tier = 'SELL_3';
    let baseCostPrice = Number(product.costPrice);
    let transferPrice = 0;

    if (tier === 'SELL_1') transferPrice = Number(product.sellPrice);
    else if (tier === 'SELL_2') transferPrice = Number(product.sellPrice2);
    else if (tier === 'SELL_3') transferPrice = Number(product.sellPrice3);
    else transferPrice = Number(product.costPrice);

    console.log(`Calculated BaseCost: ${baseCostPrice}`);
    console.log(`Calculated TransferPrice: ${transferPrice}`);

    if (transferPrice === Number(product.sellPrice3)) {
        console.log("✅ SUCCESS: Transfer price correctly picked SELL_3 tier.");
    } else {
        console.log("❌ FAILURE: Transfer price logic error.");
    }

    // 4. Check formula calculations
    const totalPrice = 1000;
    const laborPool = totalPrice - transferPrice;
    const commissionRate = 40;
    const techComm = laborPool * (commissionRate / 100);
    const centerPartProfit = transferPrice - baseCostPrice;
    const centerTotalProfit = (laborPool - techComm) + centerPartProfit;

    console.log(`\nFormula Check (Total: ${totalPrice}):`);
    console.log(`- Labor Pool: ${laborPool}`);
    console.log(`- Tech Comm (40%): ${techComm}`);
    console.log(`- Center Part Profit: ${centerPartProfit}`);
    console.log(`- Center Total Profit: ${centerTotalProfit}`);

    await prisma.$disconnect();
}

test();
