import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const warehouses = await prisma.warehouse.findMany();
    if (warehouses.length === 0) {
        console.log('No warehouses found in database.');
        return;
    }

    const defaultWh = warehouses.find(w => w.isDefault) || warehouses[0];
    
    await prisma.warehouse.update({
        where: { id: defaultWh.id },
        data: { isMaintenanceDefault: true }
    });

    console.log(`Successfully set warehouse "${defaultWh.name}" as the maintenance default.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
