
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const productId = '19653af7-4fc7-40f1-b4fb-3bbb0f836f6e';

    console.log('--- Product Info ---');
    const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
            stocks: {
                include: {
                    warehouse: true
                }
            }
        }
    });

    if (!product) {
        console.log('Product not found!');
        return;
    }

    console.log(`ID: ${product.id}`);
    console.log(`Name: ${product.name}`);
    console.log(`SKU: ${product.sku}`);
    console.log(`Global Stock: ${product.stock}`);
    console.log(`Track Stock: ${product.trackStock}`);

    console.log('\n--- Warehouse Stocks ---');
    if (product.stocks.length === 0) {
        console.log('No warehouse stock records found for this product.');
    } else {
        product.stocks.forEach(s => {
            console.log(`Warehouse: ${s.warehouse.name} (${s.warehouse.id})`);
            console.log(`Quantity: ${s.quantity}`);
            console.log(`Is Default: ${s.warehouse.isDefault}`);
            console.log('---');
        });
    }

    const allWarehouses = await prisma.warehouse.findMany();
    console.log('\n--- All Warehouses ---');
    allWarehouses.forEach(w => {
        console.log(`${w.name} (ID: ${w.id}) - Default: ${w.isDefault}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
