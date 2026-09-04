import { prisma } from "@/lib/prisma";
import { Search, Box } from "lucide-react";
import ClientHelper from "./ClientHelper";
import { getTranslations } from "@/lib/i18n-mock";
import { getCSRFToken } from "@/lib/csrf";
import { getSession } from "@/lib/auth";
import { getVisibleBranches } from "@/actions/branch-actions";
import { getCurrentUser } from "@/actions/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
    const t = await getTranslations('Inventory');
    const categories = await prisma.category.findMany();
    const models = await prisma.model.findMany({
        orderBy: { name: 'asc' }
    });
    const attributes = await prisma.attribute.findMany({
        orderBy: { name: 'asc' }
    });

    // Fetch user and branches
    const user = await getCurrentUser();
    const branchesResult = await getVisibleBranches();
    const branches = branchesResult.data || [];
    const isHQUser = branchesResult.isHQUser || false;

    // Filter warehouses
    const isHQ = user?.role === 'ADMIN' || user?.role === 'Manager' || user?.branchType === 'CENTER';
    const warehouseWhere = isHQ ? { deletedAt: null } : { branchId: user?.branchId || '', deletedAt: null };

    const warehousesRaw = await prisma.warehouse.findMany({
        where: warehouseWhere,
        include: { branch: true },
        orderBy: { isDefault: 'desc' }
    });

    const warehouses = warehousesRaw.map((w) => ({
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

    const productsRaw = await prisma.product.findMany({
        where: {
            deletedAt: null,
            archived: false,
        },
        include: { model: true }
    });
    const products = productsRaw.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        stock: p.stock,
        categoryId: p.categoryId,
        modelId: p.modelId,
        attributeId: p.attributeId,
        unitOfMeasureId: p.unitOfMeasureId,
        modelName: p.model?.name || '-',
        costPrice: p.costPrice.toNumber(),
        sellPrice: p.sellPrice.toNumber(),
        sellPrice2: p.sellPrice2?.toNumber() || 0,
        sellPrice3: p.sellPrice3?.toNumber() || 0,
        trackStock: p.trackStock,
        isBundle: p.isBundle,
        itemType: p.itemType,
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
    const invoices = invoicesRaw.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        purchaseDate: inv.createdAt,
        supplier: {
            name: inv.supplier.name,
        },
        totalAmount: inv.totalAmount.toNumber(),
        paidAmount: inv.paidAmount.toNumber(),
        deliveryCharge: inv.deliveryCharge.toNumber()
    }));

    const csrfToken = await getCSRFToken();
    const session = await getSession();

    const stockRequests: unknown[] = [];

    const settingsRaw = await prisma.storeSettings.findFirst({});

    const currency = settingsRaw?.currency || "EGP";
    let features = {};
    try {
        features = JSON.parse(settingsRaw?.features || "{}");
    } catch (e) { }

    const userPerms = session?.user?.permissions || [];
    const isSuperAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'Admin';
    const permissions = {
        canManageCategories: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.INVENTORY_MANAGE_CATEGORIES),
    };

    const unitsRaw = await prisma.unitOfMeasure.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    const units = unitsRaw.map((u) => ({
        id: u.id,
        name: u.name,
        code: u.code,
        category: u.category,
        abbreviation: u.abbreviation
    }));

    return (
        <div className="space-y-2.5 max-w-[1920px] mx-auto p-3 md:p-4 font-cairo">
            <div className="flex items-center gap-2.5 bg-zinc-50/80 dark:bg-zinc-900/40 p-2.5 px-3.5 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-xs">
                <div className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs">
                    <Box className="w-4 h-4" />
                </div>
                <div>
                    <h1 className="text-base sm:text-lg font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                        {t('title')}
                        <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">({t('subtitle')})</span>
                    </h1>
                </div>
            </div>

            <ClientHelper
                categories={categories}
                models={models}
                products={products}
                warehouses={warehouses}
                csrfToken={csrfToken || ''}
                user={session?.user}
                features={features}
                currency={currency}
                permissions={permissions}
                units={units}
                attributes={attributes}
                branches={branches}
                isHQUser={isHQUser}
            />
        </div>
    );
}
