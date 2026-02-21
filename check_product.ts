
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProduct() {
    const productId = '4f4f56fb-9cb2-46de-8f72-98e05c7b41e3';
    console.log(`Checking for Product ID: ${productId}`);

    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (product) {
        console.log('Product Found:', JSON.stringify(product, null, 2));
    } else {
        console.log('Product NOT FOUND in database.');

        // Check for similar names or partial IDs just in case
        const similarProducts = await prisma.product.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' }
        });
        console.log('Recent 5 Products in DB:', JSON.stringify(similarProducts.map(p => ({ id: p.id, name: p.name })), null, 2));
    }
}

checkProduct()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
