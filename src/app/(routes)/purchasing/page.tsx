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

    // 2.0 Models
    const models = await prisma.model.findMany();

    // 2.1 Units
    const unitsRaw = await prisma.unitOfMeasure.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
    });
    const units = unitsRaw.map(u => ({
        ...u,
        conversionFactor: (u.conversionFactor as any).toNumber?.() ?? Number(u.conversionFactor)
    }));

    // 2.2 Attributes
    const attributes = await prisma.attribute.findMany({
        orderBy: { name: 'asc' }
    });

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
        sellPrice2: p.sellPrice2?.toNumber() || 0,
        sellPrice3: p.sellPrice3?.toNumber() || 0,
        unitOfMeasureId: p.unitOfMeasureId,
        modelId: p.modelId,
        attributeId: p.attributeId
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
        paidAmount: inv.paidAmount.toNumber(),
        deliveryCharge: inv.deliveryCharge.toNumber(),
    }));

    // 5. Warehouses
    // 5. Warehouses
    // Filter warehouses for non-HQ users server-side as well for initial load
    const isHQ = (user?.role?.toUpperCase() === 'ADMIN') || (user?.role?.toUpperCase() === 'MANAGER') || user?.branchType === 'CENTER';
    const warehouseWhere = isHQ ? { deletedAt: null } : { branchId: user?.branchId || '', deletedAt: null };

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
    
    // 6. Treasuries
    const treasuriesRaw = await prisma.treasury.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' }
    });
    const treasuries = treasuriesRaw.map(t => ({
        id: t.id,
        name: t.name,
        balance: t.balance.toNumber()
    }));

    return (
        <div className="space-y-6 font-cairo">
            <header className="flex flex-col gap-1">
                <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white uppercase">{t('header.title')}</h1>
                <p className="text-muted-foreground font-bold text-sm">{t('header.subtitle')}</p>
            </header>

            <PurchasingClient
                suppliers={suppliers}
                categories={categories}
                models={models}
                products={products}
                invoices={invoices}
                units={units}
                attributes={attributes}
                warehouses={warehouses}
                branches={branches}
                treasuries={treasuries}
                isHQUser={isHQUser}
                userBranchId={user?.branchId || undefined}
                csrfToken={csrfToken || ''}
            />
        </div>
    );
}
