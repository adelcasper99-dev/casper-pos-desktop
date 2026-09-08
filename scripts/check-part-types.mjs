import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkProducts() {
    const parts = await prisma.ticketPart.findMany({
        include: { product: true }
    });
    for (const p of parts) {
        console.log(`Part ID: ${p.id} | Name: ${p.name || p.product?.name} | Price: ${p.price} | Cost: ${p.cost} | Status: ${p.status} | Product itemType: ${p.product?.itemType} | Product Type: ${p.product?.type}`);
    }
}
checkProducts().finally(() => prisma.$disconnect());
