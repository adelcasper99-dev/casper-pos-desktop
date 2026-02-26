"use server";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";

export async function resetAllData() {
    try {
        logger.info("Resetting transactional data...");

        // Transactional tables (Order matters due to foreign keys)
        // Delete child tables first

        // Sales & POS
        await prisma.salePayment.deleteMany();
        await prisma.saleItem.deleteMany();
        await prisma.sale.deleteMany();

        await prisma.shiftAdjustment.deleteMany();
        await prisma.transaction.deleteMany();
        await prisma.expense.deleteMany();
        await prisma.shift.deleteMany();

        // Tickets (Not present in Desktop schema yet)
        // await prisma.ticketPart.deleteMany();
        // await prisma.ticket.deleteMany();

        // Inventory
        await prisma.stockMovement.deleteMany();
        await prisma.stockWastage.deleteMany();
        await prisma.stockRequestItem.deleteMany();
        await prisma.stockRequest.deleteMany();
        await prisma.stock.deleteMany();

        // Purchasing
        await prisma.purchaseItem.deleteMany();
        await prisma.purchaseInvoice.deleteMany();
        await prisma.supplierPayment.deleteMany();

        // Core transactional entities
        await prisma.product.deleteMany();
        await prisma.category.deleteMany();
        await prisma.customerTransaction.deleteMany();
        // await prisma.customerDeviceHistory.deleteMany();
        await prisma.customer.deleteMany();
        await prisma.supplier.deleteMany();

        // Accounting
        await prisma.journalLine.deleteMany();
        await prisma.journalEntry.deleteMany();
        // await prisma.account.deleteMany(); 

        // HRM
        // await prisma.attendance.deleteMany();
        // await prisma.dailyWorkLog.deleteMany();
        // await prisma.payrollEntry.deleteMany();
        // await prisma.payrollRun.deleteMany();
        // await prisma.userShift.deleteMany();
        // await prisma.leaveRequest.deleteMany();
        // await prisma.employeeTransaction.deleteMany();

        logger.info("Transactional data reset complete.");
        revalidatePath("/");

        return { success: true };
    } catch (error) {
        logger.error("SYSTEM ERROR:", error);
        return { success: false, error: "System operation failed" };
    }
}
