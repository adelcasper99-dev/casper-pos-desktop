"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { Prisma } from "@prisma/client";

/**
 * Resets the database, deleting all transactional data but keeping settings,
 * users, products, categories, customers, suppliers, branches, warehouses, and treasuries.
 * Balances and stock quantities will be reset to 0.
 */
export async function resetDatabase() {
    try {
        const session = await getSession();
        const user = session?.user;

        // Security check: only global admins or those with MANAGE_SETTINGS
        const isAdmin = user?.role === 'ADMIN' || user?.role === 'مدير النظام' || user?.role === 'المالك' || user?.permissions?.includes('*') || user?.permissions?.includes('MANAGE_SETTINGS');

        if (!isAdmin) {
            return { success: false, error: "غير مصرح لك بالقيام بهذا الإجراء." };
        }

        // Safety measure: We'll use a massive transaction to ensure either everything resets or nothing does.
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Delete all transactional records in reverse order of dependencies

            // Accounting/Finance records
            await tx.journalLine.deleteMany();
            await tx.journalEntry.deleteMany();
            await tx.transaction.deleteMany(); // Treasury transactions
            await tx.customerTransaction.deleteMany();
            await tx.supplierPayment.deleteMany();
            await tx.expense.deleteMany();

            // Sales records
            await tx.salePayment.deleteMany();
            await tx.saleItem.deleteMany();
            await tx.sale.deleteMany();

            // Shift records
            await tx.shiftAdjustment.deleteMany();
            await tx.shift.deleteMany();

            // Purchase records
            await tx.purchaseItem.deleteMany();
            await tx.purchaseInvoice.deleteMany();

            // Inventory movement records
            await tx.stockMovement.deleteMany();
            await tx.stockRequestItem.deleteMany();
            await tx.stockRequest.deleteMany();
            await tx.stockWastage.deleteMany();

            // Logs
            await tx.actionLog.deleteMany();
            await tx.auditLog.deleteMany();

            // 2. Reset Quantities and Balances to 0

            // Reset Stock
            await tx.stock.updateMany({
                data: {
                    quantity: 0
                }
            });

            // Reset Customer Balances
            await tx.customer.updateMany({
                data: {
                    balance: 0
                }
            });

            // Reset Supplier Balances
            await tx.supplier.updateMany({
                data: {
                    balance: 0
                }
            });

            // Reset Treasury Balances
            await tx.treasury.updateMany({
                data: {
                    balance: 0
                }
            });

            // Update products summary field
            await tx.product.updateMany({
                data: {
                    stock: 0
                }
            });

        }, {
            timeout: 30000 // Increase timeout for large deletions
        });

        // Revalidate paths to clear caches
        revalidatePath("/", "layout");

        return { success: true, message: "تم إعادة ضبط النظام بنجاح. تم حذف جميع الحركات المالية والمخزنية." };

    } catch (error: any) {
        console.error("Error resetting database:", error);
        return { success: false, error: error.message || "حدث خطأ أثناء إعادة ضبط النظام." };
    }
}
