import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// One-time cleanup: Hard-delete the phantom duplicate warehouse
// Warehouse 91cb2210-3b7f-4fe2-b16a-9a92f433ca93 has 0 stock, 0 sales, 0 purchases
export async function GET() {
    try {
        const TARGET_ID = '91cb2210-3b7f-4fe2-b16a-9a92f433ca93';

        const warehouse = await prisma.warehouse.findUnique({
            where: { id: TARGET_ID },
            select: { id: true }
        });
        if (!warehouse) {
            return NextResponse.json({ success: true, message: 'Phantom warehouse already deleted.' });
        }
        
        // Verify it's still empty before deleting
        const [stockCount, saleCount, purchaseCount] = await Promise.all([
            prisma.stock.count({ where: { warehouseId: TARGET_ID, quantity: { gt: 0 } } }),
            prisma.sale.count({ where: { warehouseId: TARGET_ID } }),
            prisma.purchaseInvoice.count({ where: { warehouseId: TARGET_ID } }),
        ]);
        
        if (stockCount > 0 || saleCount > 0 || purchaseCount > 0) {
            return NextResponse.json({ 
                error: 'Cannot delete: warehouse has data', 
                stockCount, saleCount, purchaseCount 
            }, { status: 400 });
        }
        
        // Safe to delete - clean up zero-qty stock records first
        await prisma.stock.deleteMany({ where: { warehouseId: TARGET_ID } });
        try {
            await prisma.warehouse.delete({ where: { id: TARGET_ID } });
        } catch (e: any) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                return NextResponse.json({ success: true, message: 'Phantom warehouse already deleted.' });
            }
            throw e;
        }
        
        return NextResponse.json({ success: true, message: 'Phantom warehouse deleted!' });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
