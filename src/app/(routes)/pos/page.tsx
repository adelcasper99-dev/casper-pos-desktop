import { prisma } from "@/lib/prisma";
import POSClientAPI from "./POSClientAPI";
import { getTranslations } from "@/lib/i18n-mock";
import { getCSRFToken } from "@/lib/csrf";
import { getCurrentShift } from "@/actions/shift-management-actions";
import ShiftStatusIndicator from "@/components/shift/ShiftStatusIndicator";
import PrinterStatusIndicator from "@/components/pos/PrinterStatusIndicator";
import { getEffectiveStoreSettings } from "@/actions/settings";
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
        maxDiscount: session?.user?.maxDiscount ?? 0,
        maxDiscountAmount: session?.user?.maxDiscountAmount ?? 0,
    };

    // Fetch current shift
    const shiftResult = await getCurrentShift();
    const currentShift = shiftResult.shift;

    // Fetch initial data for SSR speed
    const productsRaw = await prisma.product.findMany();
    const products = productsRaw.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        stock: p.stock,
        categoryId: p.categoryId,
        costPrice: p.costPrice.toNumber(),
        sellPrice: p.sellPrice.toNumber(),
        sellPrice3: p.sellPrice3?.toNumber() || 0,
        minStock: p.minStock,
        trackStock: (p as any).trackStock ?? true,
        isBundle: !!(p as any).isBundle,
    }));
    const categories = await prisma.category.findMany();

    // Get Effective Settings (Global + Branch Overrides)
    const settingsRes = await getEffectiveStoreSettings();
    const settings = settingsRes.success ? settingsRes.data : null;

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
            {/* Top Bar: Shift & Printer Status */}
            <div className="shrink-0 p-4 pb-0 flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                <div className="flex-1">
                    <ShiftStatusIndicator shift={currentShift} registers={registers} csrfToken={csrfToken || ''} />
                </div>
                <div className="shrink-0">
                    <PrinterStatusIndicator />
                </div>
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
                />
            </div>
        </div>
    );
}
