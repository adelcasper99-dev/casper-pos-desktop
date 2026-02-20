import { prisma } from "@/lib/prisma";
import PurchasingClient from "./PurchasingClient";
import { getTranslations } from "@/lib/i18n-mock";
import { getCSRFToken } from '@/lib/csrf';
import { getVisibleBranches } from "@/actions/branch-actions";
import { getCurrentUser } from "@/actions/auth";

export const dynamic = 'force-dynamic';

export default async function PurchasingPage() {
    const t = await getTranslations('Purchasing');

    const csrfToken = await getCSRFToken();
    const user = await getCurrentUser();

    // 0. Branches (New)
    const branchesResult = await getVisibleBranches();
    const branches = branchesResult.data || [];
    const isHQUser = branchesResult.isHQUser || false;

    // DEBUG: Log branch and user info
    console.log('=== PURCHASING PAGE DEBUG ===');
    console.log('User:', {
        id: user?.id,
        role: user?.role,
        branchId: user?.branchId,
        branchType: user?.branchType
    });
    console.log('Branches:', branches.length, 'branches found');
    console.log('isHQUser:', isHQUser);
    console.log('============================');

    // 1. Suppliers
    const suppliersRaw = await prisma.supplier.findMany();
    const suppliers = suppliersRaw.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        balance: s.balance.toNumber()
    }));

    // 2. Categories (for Add Product modal in Purchase)
    const categories = await prisma.category.findMany();

    // 3. Products (for search in Purchase)
    const productsRaw = await prisma.product.findMany();
    const products = productsRaw.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        stock: p.stock,
        categoryId: p.categoryId,
        costPrice: p.costPrice.toNumber(),
        sellPrice: p.sellPrice.toNumber(),
        sellPrice2: p.sellPrice2.toNumber(),
        sellPrice3: p.sellPrice3.toNumber()
    }));

    // 4. Invoices
    const invoicesRaw = await prisma.purchaseInvoice.findMany({
        include: { supplier: true },
        orderBy: { createdAt: 'desc' }
    });
    const invoices = invoicesRaw.map(inv => ({
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

    // 5. Warehouses
    // 5. Warehouses
    // Filter warehouses for non-HQ users server-side as well for initial load
    const isHQ = (user?.role?.toUpperCase() === 'ADMIN') || (user?.role?.toUpperCase() === 'MANAGER') || user?.branchType === 'CENTER';
    const warehouseWhere = isHQ ? {} : { branchId: user?.branchId || '' };

    const warehousesRaw = await prisma.warehouse.findMany({
        where: warehouseWhere,
        include: { branch: true },
        orderBy: { isDefault: 'desc' }
    });

    // Map to client-friendly format including branch info
    const warehouses = warehousesRaw.map(w => ({
        id: w.id,
        name: w.name,
        address: w.address,
        isDefault: w.isDefault,
        branchId: w.branchId,
        branch: {
            id: w.branch.id,
            name: w.branch.name,
            code: w.branch.code
        }
    }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">{t('header.title')}</h1>
                <p className="text-zinc-400 mt-1">{t('header.subtitle')}</p>
            </div>

            <PurchasingClient
                suppliers={suppliers}
                categories={categories}
                products={products}
                invoices={invoices}
                warehouses={warehouses}
                branches={branches}
                isHQUser={isHQUser}
                userBranchId={user?.branchId || undefined}
                csrfToken={csrfToken || ''}
            />
        </div>
    );
}
