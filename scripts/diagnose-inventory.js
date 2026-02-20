const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log('Checking Suppliers...');
        const suppliers = await prisma.supplier.findMany();
        console.log('Found', suppliers.length, 'suppliers');
        for (const s of suppliers) {
            console.log(`Checking supplier ${s.id}: balance type is ${typeof s.balance}`);
            if (s.balance && typeof s.balance.toNumber === 'function') {
                console.log(`  balance.toNumber() = ${s.balance.toNumber()}`);
            } else {
                console.warn(`  WARNING: balance does not have toNumber()! Value:`, s.balance);
            }
        }

        console.log('\nChecking Products...');
        const products = await prisma.product.findMany();
        console.log('Found', products.length, 'products');
        for (const p of products) {
            console.log(`Checking product ${p.id}: costPrice type is ${typeof p.costPrice}`);
            if (p.costPrice && typeof p.costPrice.toNumber === 'function') {
                console.log(`  costPrice.toNumber() = ${p.costPrice.toNumber()}`);
            } else {
                console.warn(`  WARNING: costPrice does not have toNumber()! Value:`, p.costPrice);
            }
        }

        console.log('\nChecking Purchase Invoices...');
        const invoices = await prisma.purchaseInvoice.findMany({ include: { supplier: true } });
        console.log('Found', invoices.length, 'invoices');
        for (const inv of invoices) {
            console.log(`Checking invoice ${inv.id}: totalAmount type is ${typeof inv.totalAmount}`);
            if (!inv.supplier) {
                console.warn(`  WARNING: invoice ${inv.id} has no supplier!`);
            }
        }

    } catch (e) {
        console.error('DIAGNOSTIC FAILED:', e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
