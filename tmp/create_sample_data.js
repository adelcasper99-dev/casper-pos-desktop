
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("CREATING SAMPLE DATA FOR TESTING...");
        
        const branch = await prisma.branch.findFirst();
        if (!branch) {
            console.log("No branch found. Cannot create ticket.");
            return;
        }

        const tech = await prisma.technician.findFirst();
        if (!tech) {
            console.log("No technician found. Cannot create ticket.");
            return;
        }

        const customer = await prisma.customer.findFirst();
        let customerId = customer?.id;
        if (!customer) {
            const newCust = await prisma.customer.create({
                data: {
                    name: "عميل تجريبي",
                    phone: "0123456789"
                }
            });
            customerId = newCust.id;
        }

        const ticket = await prisma.ticket.create({
            data: {
                barcode: "TEST-001",
                customerName: "عميل تجريبي",
                customerPhone: "0123456789",
                customerId: customerId,
                deviceBrand: "Samsung",
                deviceModel: "S23",
                issueDescription: "شاشة مكسورة",
                status: "DELIVERED",
                currentBranchId: branch.id,
                technicianId: tech.id,
                repairPrice: 1500,
                partsCost: 800,
                commissionAmount: 150,
                netProfit: 550,
                createdAt: new Date("2026-03-10T10:00:00Z"),
                deliveredAt: new Date("2026-03-12T14:00:00Z")
            }
        });

        console.log("Sample ticket created successfully:", ticket.barcode);

    } catch (e) {
        console.error(e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
