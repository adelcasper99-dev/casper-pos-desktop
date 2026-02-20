import { prisma } from "@/lib/prisma";
import { Search, Box } from "lucide-react";
import ClientHelper from "./ClientHelper";
import { getTranslations } from "@/lib/i18n-mock";
import { getCSRFToken } from "@/lib/csrf";
import { getSession } from "@/lib/auth";
import { getVisibleBranches } from "@/actions/branch-actions";
import { getCurrentUser } from "@/actions/auth";

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
    const t = await getTranslations('Inventory');
    const suppliersRaw = await prisma.supplier.findMany();
    const suppliers = suppliersRaw.map((s: { id: string; name: string; phone: string | null; email: string | null; address: string | null; balance: { toNumber: () => number } }) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        balance: s.balance.toNumber()
    }));

    const categories = await prisma.category.findMany();

    // Fetch user and branches
    const user = await getCurrentUser();
    const branchesResult = await getVisibleBranches();
    const branches = branchesResult.data || [];
    const isHQUser = branchesResult.isHQUser || false;

    // Filter warehouses
    const isHQ = user?.role === 'ADMIN' || user?.role === 'Manager' || user?.branchType === 'CENTER';
    const warehouseWhere = isHQ ? {} : { branchId: user?.branchId || '' };

    const warehousesRaw = await prisma.warehouse.findMany({
        where: warehouseWhere,
        include: { branch: true },
        orderBy: { isDefault: 'desc' }
    });

    const warehouses = warehousesRaw.map((w: any) => ({
        id: w.id,
        name: w.name,
        isDefault: w.isDefault,
        branchId: w.branchId,
        branch: {
            id: w.branch.id,
            name: w.branch.name,
            code: w.branch.code
        }
    }));

    const productsRaw = await prisma.product.findMany();
    const products = productsRaw.map((p: any) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        stock: p.stock,
        categoryId: p.categoryId,
        costPrice: p.costPrice.toNumber(),
        sellPrice: p.sellPrice.toNumber(),
        sellPrice2: p.sellPrice2?.toNumber() || 0,
        sellPrice3: p.sellPrice3?.toNumber() || 0,
        // Add missing fields for type compatibility
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
        description: p.description,
        archived: p.archived,
        minStock: p.minStock,
        version: p.version
    }));

    const invoicesRaw = await prisma.purchaseInvoice.findMany({
        include: { supplier: true },
        orderBy: { createdAt: 'desc' }
    });
    const invoices = invoicesRaw.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        purchaseDate: inv.createdAt,
        supplier: {
            name: inv.supplier.name,
        },
        totalAmount: inv.totalAmount.toNumber(),
        paidAmount: inv.paidAmount.toNumber()
    }));

    const csrfToken = await getCSRFToken();
    const session = await getSession();

    // Fetch Stock Requests
    // const stockRequestsRes = await getStockRequests();
    // const stockRequests = stockRequestsRes?.data || [];
    const stockRequests: any[] = [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">{t('title')}</h1>
                <p className="text-zinc-400 mt-1">{t('subtitle')}</p>
            </div>

            <ClientHelper
                categories={categories}
                products={products}
                warehouses={warehouses}
                csrfToken={csrfToken || ''}
                user={session?.user}
            />
        </div>
    );
}
