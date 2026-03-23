import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const ticket = await prisma.ticket.findFirst({
        where: { barcode: 'T-014' }
    })
    console.log(ticket)
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect()
    })
