import { prisma } from "@/lib/prisma";
import POSClientAPI from "./POSClientAPI";
import { getTranslations } from "@/lib/i18n-mock";
import { getCSRFToken } from "@/lib/csrf";
import { getCurrentShift } from "@/actions/shift-management-actions";
import ShiftStatusIndicator from "@/components/shift/ShiftStatusIndicator";
import { getEffectiveStoreSettings } from "@/actions/settings";
import { getDefaultWarehouses } from "@/actions/inventory";
import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export default async function POSPage() {
    const csrfToken = await getCSRFToken();
    const session = await getSession();

    // Evaluate permissions tightly for the client controls
    const userPerms = session?.user?.permissions || [];
    const isSuperAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'Admin';
    const permissions = {
        canCheckout: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.POS_CHECKOUT),
        canHoldCart: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.POS_HOLD_CART),
        canDineIn: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.POS_DINE_IN),
        canPrintReceipt: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.POS_PRINT_RECEIPT),
        canChangePrice: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.POS_CHANGE_PRICE),
        canDiscount: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.POS_DISCOUNT),
        canViewCost: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.INVENTORY_VIEW_COST),
        canSelectPriceTier: isSuperAdmin || hasPermission(userPerms, PERMISSIONS.POS_SELECT_PRICE_TIER),
        maxDiscount: session?.user?.maxDiscount ?? 0,
        maxDiscountAmount: session?.user?.maxDiscountAmount ?? 0,
    };

    // Fetch current shift
    const shiftResult = await getCurrentShift();
    const currentShift = shiftResult.shift;

    // Get Effective Settings (Global + Branch Overrides) and identify the default POS warehouse
    const [settingsRes, whRes] = await Promise.all([
        getEffectiveStoreSettings(),
        getDefaultWarehouses()
    ]);
    const settings = settingsRes.success ? settingsRes.data : null;
    const posDefault = whRes.success ? whRes.posDefault : null;
    const posDefaultName = posDefault?.name || null;
    const posDefaultId = posDefault?.id || null;

    // Fetch initial data for SSR speed - filtering stock by POS default warehouse
    const productsRaw = await prisma.product.findMany({
        where: {
            deletedAt: null,
            archived: false,
        },
        include: {
            stocks: posDefaultId ? {
                where: {
                    warehouseId: posDefaultId
                }
            } : false
        }
    });

    const products = productsRaw.map(p => {
        // Calculate stock for the specific warehouse, or total if no default is found (fallback)
        let warehouseStock = 0;
        if (posDefaultId && p.stocks && p.stocks.length > 0) {
            warehouseStock = p.stocks[0].quantity;
        }

        return {
            id: p.id,
            sku: p.sku,
            name: p.name,
            stock: warehouseStock, // Now reflects the specific warehouse stock
            categoryId: p.categoryId,
            costPrice: p.costPrice.toNumber(),
            sellPrice: p.sellPrice.toNumber(),
            sellPrice2: p.sellPrice2?.toNumber() || 0,
            sellPrice3: p.sellPrice3?.toNumber() || 0,
            minStock: p.minStock,
            trackStock: (p as any).trackStock ?? true,
            isBundle: !!(p as any).isBundle,
        };
    });
    const categories = await prisma.category.findMany();

    // Example registers - In production, fetch from database
    const registers = [
        { id: "reg-1", name: "Main Register" },
        { id: "reg-2", name: "Counter A" }
    ];

    // Fetch Floors and Tables unconditionally now
    let floors: any[] = [];
    try {
        floors = await prisma.floor.findMany({
            include: { tables: true },
            orderBy: { createdAt: 'asc' }
        });
    } catch (e) {
        console.error("Failed to fetch floors", e);
    }

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            {/* Top Bar: Shift Status */}
            <div className="shrink-0 p-4 pb-0">
                <ShiftStatusIndicator shift={currentShift} registers={registers} csrfToken={csrfToken || ''} />
            </div>

            {/* POS Interface - fills remaining height */}
            <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden p-4 animate-fly-in">
                <POSClientAPI
                    products={products}
                    categories={categories}
                    settings={settings}
                    csrfToken={csrfToken || ''}
                    floors={floors}
                    permissions={permissions}
                    posDefaultName={posDefaultName}
                />
            </div>
        </div>
    );
}
