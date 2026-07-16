import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const purchase = await prisma.purchaseInvoice.findFirst({
        where: { invoiceNumber: 'P-00001' },
        include: { items: { include: { product: true } } }
    });
    console.dir(purchase, { depth: null });
    
    const ticket = await prisma.ticket.findFirst({
        where: { barcode: 'T-002' },
        include: { parts: { include: { product: true } } }
    });
    console.dir(ticket, { depth: null });
}
main().catch(console.error).finally(() => prisma.$disconnect());
