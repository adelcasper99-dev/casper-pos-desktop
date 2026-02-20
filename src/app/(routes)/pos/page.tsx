import { prisma } from "@/lib/prisma";
import POSClientAPI from "./POSClientAPI";
import { getTranslations } from "@/lib/i18n-mock";
import { getCSRFToken } from "@/lib/csrf";
import { getCurrentShift } from "@/actions/shift-management-actions";
import ShiftStatusIndicator from "@/components/shift/ShiftStatusIndicator";
import PrinterStatusIndicator from "@/components/pos/PrinterStatusIndicator";
import { getEffectiveStoreSettings } from "@/actions/settings";

export const dynamic = 'force-dynamic';

export default async function POSPage() {
    const csrfToken = await getCSRFToken();


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
        sellPrice2: p.sellPrice2?.toNumber() || 0,
        sellPrice3: p.sellPrice3?.toNumber() || 0,
        minStock: p.minStock
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

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            {/* Shift Status Indicator with integrated shift button */}
            <div className="shrink-0 p-4 pb-0">
                <ShiftStatusIndicator shift={currentShift} registers={registers} csrfToken={csrfToken || ''} />
            </div>

            {/* POS Interface - fills remaining height */}
            <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden p-4 animate-fly-in">
                <POSClientAPI products={products} categories={categories} settings={settings} csrfToken={csrfToken || ''} />
            </div>
        </div>
    );
}
