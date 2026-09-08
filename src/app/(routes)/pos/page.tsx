import { prisma } from "@/lib/prisma";
import POSClientAPI, { type POSFloor } from "./POSClientAPI";
import { getCSRFToken } from "@/lib/csrf";
import { getCurrentShiftInternal } from "@/actions/shift-management-actions";
import ShiftStatusIndicator from "@/components/shift/ShiftStatusIndicator";
import { getEffectiveStoreSettings } from "@/actions/settings";
import { getDefaultWarehouses } from "@/actions/inventory";
import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { toNumber } from "@/lib/decimal-utils";

export const dynamic = 'force-dynamic';

export default async function POSPage() {
    try {
        const [csrfToken, session] = await Promise.all([
            getCSRFToken().catch(() => null),
            getSession().catch(() => null),
        ]);

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

        // Fetch current shift safely via internal server action
        const shiftResult = session?.user?.id 
            ? await getCurrentShiftInternal({ userId: session.user.id }).catch(() => ({ shift: null }))
            : { shift: null };
        const currentShift = shiftResult?.shift ?? null;

        const [settingsRes, whRes] = await Promise.all([
            getEffectiveStoreSettings().catch(() => ({ success: false, data: null })),
            getDefaultWarehouses().catch(() => ({ success: false, posDefault: null }))
        ]);
        const settings = settingsRes?.success ? settingsRes.data : null;
        const posDefault = whRes?.success ? whRes.posDefault : null;
        const posDefaultName = posDefault?.name || null;
        const posDefaultId = posDefault?.id || null;

        // Fetch initial data for SSR speed - filtering stock by POS default warehouse
        const productsRaw = await prisma.product.findMany({
            where: {
                deletedAt: null,
                archived: false,
            },
            include: {
                model: true,
                stocks: posDefaultId ? {
                    where: {
                        warehouseId: posDefaultId
                    }
                } : false
            }
        }).catch((err) => {
            console.error("Failed to load products for POS SSR:", err);
            return [];
        });

        const products = (productsRaw || []).map(p => {
            // Calculate stock for the specific warehouse, or total if no default is found (fallback)
            let warehouseStock = 0;
            if (posDefaultId && p.stocks && p.stocks.length > 0) {
                warehouseStock = toNumber(p.stocks[0].quantity);
            }

            return {
                id: p.id,
                sku: p.sku,
                name: p.name,
                stock: warehouseStock,
                categoryId: p.categoryId,
                modelId: p.modelId,
                modelName: p.model?.name || '-',
                costPrice: toNumber(p.costPrice),
                sellPrice: toNumber(p.sellPrice),
                sellPrice2: toNumber(p.sellPrice2),
                sellPrice3: toNumber(p.sellPrice3),
                minStock: p.minStock,
                trackStock: (p as { trackStock?: boolean }).trackStock ?? true,
                isBundle: !!(p as { isBundle?: boolean }).isBundle,
            };
        });

        const rawCategories = await prisma.category.findMany().catch((err) => {
            console.error("Failed to load categories for POS SSR:", err);
            return [];
        });
        const categories = (rawCategories || []).map(c => ({
            ...c,
            color: c.color || '#3b82f6'
        }));

        // Example registers
        const registers = [
            { id: "reg-1", name: "Main Register" },
            { id: "reg-2", name: "Counter A" }
        ];

        // Fetch Floors and Tables unconditionally now
        let floors: POSFloor[] = [];
        try {
            const dbFloors = await prisma.floor.findMany({
                include: { tables: true },
                orderBy: { createdAt: 'asc' }
            });
            floors = dbFloors as unknown as POSFloor[];
        } catch (e) {
            console.error("Failed to fetch floors", e);
        }

        return (
            <div className="flex flex-col h-[100dvh] overflow-hidden bg-slate-100/60 dark:bg-black/90">
                {/* Top Bar: Shift Status */}
                <div className="shrink-0 p-2 pb-0">
                    <ShiftStatusIndicator shift={currentShift} registers={registers} csrfToken={csrfToken || ''} />
                </div>

                {/* POS Interface - fills remaining height */}
                <div className="flex-1 flex flex-col md:flex-row gap-2 overflow-hidden p-2">
                    <POSClientAPI
                        products={products}
                        categories={categories}
                        settings={settings ?? undefined}
                        csrfToken={csrfToken || ''}
                        floors={floors}
                        permissions={permissions}
                        posDefaultName={posDefaultName ?? undefined}
                    />
                </div>
            </div>
        );
    } catch (error) {
        console.error("POS Critical Error:", error);
        return (
            <div className="flex flex-col items-center justify-center h-[100dvh] p-4 text-center">
                <h1 className="text-2xl font-bold text-red-600 mb-4">خطأ في تحميل نقطة البيع</h1>
                <p className="text-gray-600 dark:text-gray-300 mb-6">حدث خطأ تقني أثناء تحميل البيانات. قد يكون ذلك بسبب تلف مؤقت في الاتصال أو البيانات.</p>
                <div className="bg-yellow-500/10 border-l-4 border-yellow-500 p-4 mb-6 max-w-md text-start">
                    <p className="text-yellow-600 dark:text-yellow-400 text-sm">يرجى محاولة تحديث الصفحة أو إعادة تسجيل الدخول للتحقق من الصلاحيات.</p>
                </div>
                <a 
                    href="/pos" 
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors inline-block text-sm font-medium"
                >
                    إعادة المحاولة
                </a>
            </div>
        );
    }
}
