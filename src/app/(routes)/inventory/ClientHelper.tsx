"use client";

import { useState } from "react";
import { Package, Palette, AlertTriangle } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import clsx from "clsx";
import type { Product } from "@/types/product";

import ProductsTab from "@/components/inventory/ProductsTab";
import CategoriesTab from "@/components/inventory/CategoriesTab";
import WarehouseClient from "@/components/inventory/WarehouseClient";
import ReorderRulesManager from "@/components/inventory/ReorderRulesManager";
import StockRequestsManager from "@/components/inventory/StockRequestsManager";

interface WarehouseItem {
    id: string;
    isDefault?: boolean;
    name?: string;
    branchId?: string;
    [key: string]: unknown;
}

interface CategoryItem {
    id: string;
    name: string;
    [key: string]: unknown;
}

interface ClientHelperProps {
    categories?: CategoryItem[];
    products?: Product[];
    warehouses?: WarehouseItem[];
    csrfToken?: string;
    user?: { id?: string; permissions?: string[]; [key: string]: unknown };
    features?: Record<string, unknown>;
    currency?: string;
    permissions?: { canManageCategories?: boolean; [key: string]: unknown };
    units?: unknown[];
    branches?: unknown[];
    isHQUser?: boolean;
    models?: unknown[];
    attributes?: unknown[];
}

export default function InventoryTabs({
    categories = [],
    products = [],
    warehouses = [],
    csrfToken,
    user,
    features,
    currency = "EGP",
    permissions = { canManageCategories: true },
    units = [],
    branches = [],
    isHQUser = false,
    models = [],
    attributes = []
}: ClientHelperProps) {
    const t = useTranslations('Inventory');
    const [activeSection, setActiveSection] = useState<'STOCK' | 'WAREHOUSES' | 'REORDER_RULES' | 'STOCK_REQUESTS'>('STOCK');
    const [stockTab, setStockTab] = useState<'PRODUCTS' | 'CATEGORIES' | 'SHORTAGES'>('PRODUCTS');
    const [customMinStock, setCustomMinStock] = useState<number | "">("");
    const shortCount = (products || []).filter((p: Product) => {
        if (!p.trackStock) return false;
        const limit = customMinStock !== "" ? customMinStock : Number(p.minStock);
        return Number(p.stock) <= limit;
    }).length;

    return (
        <div className="space-y-2 font-cairo">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 dark:border-white/10 pb-1.5">
                <div className="inline-flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-inner">
                    <button
                        onClick={() => setActiveSection('STOCK')}
                        className={clsx(
                            "px-3 h-8 text-xs font-bold rounded-lg transition-all tracking-wide",
                            activeSection === 'STOCK' 
                                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs" 
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-white/5"
                        )}
                    >
                        {t('tabs.stock')}
                    </button>
                    {!features?.hideLocationsTab && (
                        <button
                            onClick={() => setActiveSection('WAREHOUSES')}
                            className={clsx(
                                "px-3 h-8 text-xs font-bold rounded-lg transition-all tracking-wide",
                                activeSection === 'WAREHOUSES' 
                                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs" 
                                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-white/5"
                            )}
                        >
                            {t('tabs.locations')}
                        </button>
                    )}
                    <button
                        onClick={() => setActiveSection('REORDER_RULES')}
                        className={clsx(
                            "px-3 h-8 text-xs font-bold rounded-lg transition-all tracking-wide",
                            activeSection === 'REORDER_RULES' 
                                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs" 
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-white/5"
                        )}
                    >
                        {t('tabs.reorderRules', 'قواعد إعادة الطلب')}
                    </button>
                    <button
                        onClick={() => setActiveSection('STOCK_REQUESTS')}
                        className={clsx(
                            "px-3 h-8 text-xs font-bold rounded-lg transition-all tracking-wide",
                            activeSection === 'STOCK_REQUESTS' 
                                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs" 
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-white/5"
                        )}
                    >
                        {t('tabs.stockRequests', 'طلبات المخزون')}
                    </button>
                </div>
            </div>

            {/* Sub Tabs (Only for Stock) */}
            {activeSection === 'STOCK' && (
                <div className="flex justify-between items-center bg-zinc-50/80 dark:bg-zinc-900/40 p-1 px-1.5 rounded-xl border border-zinc-200/80 dark:border-white/10 overflow-x-auto shadow-xs gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setStockTab('PRODUCTS')}
                            className={clsx(
                                "px-2.5 h-7 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap",
                                stockTab === 'PRODUCTS' 
                                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs" 
                                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-white/5"
                            )}
                        >
                            <Package className="w-3.5 h-3.5" />
                            {t('tabs.products')}
                        </button>
                        <button
                            onClick={() => setStockTab('SHORTAGES')}
                            className={clsx(
                                "px-2.5 h-7 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap",
                                stockTab === 'SHORTAGES' 
                                    ? "bg-rose-500 text-white shadow-xs font-bold" 
                                    : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            )}
                        >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            النواقص
                            {shortCount > 0 && (
                                <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold mr-1">
                                    {shortCount}
                                </span>
                            )}
                        </button>
                        {permissions.canManageCategories && (
                            <button
                                onClick={() => setStockTab('CATEGORIES')}
                                className={clsx(
                                    "px-2.5 h-7 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap",
                                    stockTab === 'CATEGORIES' 
                                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs" 
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-white/5"
                                )}
                            >
                                <Palette className="w-3.5 h-3.5" />
                                {t('tabs.categories')}
                            </button>
                        )}
                    </div>
                    {stockTab === 'SHORTAGES' && (
                        <div className="flex items-center gap-1.5 px-2.5 h-7 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 rounded-lg shadow-xs mr-auto ml-1">
                            <span className="text-[11px] font-bold text-zinc-500 whitespace-nowrap">الحد الأدنى:</span>
                            <input
                                type="number"
                                value={customMinStock}
                                onChange={(e) => {
                                    setCustomMinStock(e.target.value === "" ? "" : Number(e.target.value));
                                }}
                                className="w-14 h-5 px-1.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-white/10 text-xs font-mono font-bold text-center outline-none"
                                placeholder="تلقائي"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT */}
            <div className="min-h-0">
                {activeSection === 'STOCK' && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                        {stockTab === 'PRODUCTS' && (
                            <ProductsTab
                                products={products}
                                categories={categories}
                                csrfToken={csrfToken}
                                user={user}
                                warehouseId={warehouses.find((w: WarehouseItem) => w.isDefault)?.id}
                                currency={currency}
                                initialUnits={units as Parameters<typeof ProductsTab>[0]['initialUnits']}
                                models={models as Parameters<typeof ProductsTab>[0]['models']}
                                attributes={attributes as Parameters<typeof ProductsTab>[0]['attributes']}
                                features={features}
                            />
                        )}

                        {stockTab === 'SHORTAGES' && (
                            <ProductsTab
                                products={products}
                                categories={categories}
                                csrfToken={csrfToken}
                                user={user}
                                warehouseId={warehouses.find((w: WarehouseItem) => w.isDefault)?.id}
                                currency={currency}
                                initialUnits={units as Parameters<typeof ProductsTab>[0]['initialUnits']}
                                models={models as Parameters<typeof ProductsTab>[0]['models']}
                                attributes={attributes as Parameters<typeof ProductsTab>[0]['attributes']}
                                initialStockStatus="shortage"
                                isShortageOnly={true}
                                globalMinStock={customMinStock !== "" ? customMinStock : undefined}
                            />
                        )}

                        {stockTab === 'CATEGORIES' && (
                            <CategoriesTab categories={categories} csrfToken={csrfToken} />
                        )}
                    </div>
                )}

                {activeSection === 'WAREHOUSES' && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                        <WarehouseClient
                            warehouses={warehouses}
                            products={products}
                            csrfToken={csrfToken || ""}
                            branchId={warehouses?.[0]?.branchId}
                            branches={branches}
                            isHQUser={isHQUser}
                        />
                    </div>
                )}

                {activeSection === 'REORDER_RULES' && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                        <ReorderRulesManager
                            warehouses={warehouses}
                            products={products}
                            csrfToken={csrfToken}
                        />
                    </div>
                )}
                
                {activeSection === 'STOCK_REQUESTS' && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                        <StockRequestsManager
                            warehouses={warehouses}
                            csrfToken={csrfToken}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
