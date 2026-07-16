"use client";

import { useState } from "react";
import { Package, Palette, AlertTriangle } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import clsx from "clsx";

import ProductsTab from "@/components/inventory/ProductsTab";
import CategoriesTab from "@/components/inventory/CategoriesTab";
import WarehouseClient from "@/components/inventory/WarehouseClient";
import ReorderRulesManager from "@/components/inventory/ReorderRulesManager";
import StockRequestsManager from "@/components/inventory/StockRequestsManager";

export default function InventoryTabs({
    categories,
    products,
    warehouses,
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
}: any) {
    const t = useTranslations('Inventory');
    const [activeSection, setActiveSection] = useState<'STOCK' | 'WAREHOUSES' | 'REORDER_RULES' | 'STOCK_REQUESTS'>('STOCK');
    const [stockTab, setStockTab] = useState<'PRODUCTS' | 'CATEGORIES' | 'SHORTAGES'>('PRODUCTS');
    const [customMinStock, setCustomMinStock] = useState<number | "">("");
    const shortCount = (products || []).filter((p: any) => {
        if (!p.trackStock) return false;
        const limit = customMinStock !== "" ? customMinStock : Number(p.minStock);
        return Number(p.stock) <= limit;
    }).length;

    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b border-slate-200 dark:border-white/10 pb-2">
                <button
                    onClick={() => setActiveSection('STOCK')}
                    className={clsx(
                        "px-4 py-2 font-black rounded-lg transition-all",
                        activeSection === 'STOCK' 
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                            : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                    )}
                >
                    {t('tabs.stock')}
                </button>
                {!features?.hideLocationsTab && (
                    <button
                        onClick={() => setActiveSection('WAREHOUSES')}
                        className={clsx(
                            "px-4 py-2 font-black rounded-lg transition-all",
                            activeSection === 'WAREHOUSES' 
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                        )}
                    >
                        {t('tabs.locations')}
                    </button>
                )}
                <button
                    onClick={() => setActiveSection('REORDER_RULES')}
                    className={clsx(
                        "px-4 py-2 font-black rounded-lg transition-all",
                        activeSection === 'REORDER_RULES' 
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                            : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                    )}
                >
                    Reorder Rules
                </button>
                <button
                    onClick={() => setActiveSection('STOCK_REQUESTS')}
                    className={clsx(
                        "px-4 py-2 font-black rounded-lg transition-all",
                        activeSection === 'STOCK_REQUESTS' 
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                            : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                    )}
                >
                    Stock Requests
                </button>
            </div>

            {/* Sub Tabs (Only for Stock) */}
            {activeSection === 'STOCK' && (
                <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 p-2 rounded-2xl border border-slate-200 dark:border-white/10 overflow-x-auto animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setStockTab('PRODUCTS')}
                            className={clsx(
                                "px-4 py-2 rounded-xl flex items-center gap-2 font-black transition-all whitespace-nowrap",
                                stockTab === 'PRODUCTS' 
                                    ? "bg-primary text-primary-foreground shadow-md" 
                                    : "text-slate-400 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5"
                            )}
                        >
                            <Package className="w-4 h-4" />
                            {t('tabs.products')}
                        </button>
                        <button
                            onClick={() => setStockTab('SHORTAGES')}
                            className={clsx(
                                "px-4 py-2 rounded-xl flex items-center gap-2 font-black transition-all whitespace-nowrap",
                                stockTab === 'SHORTAGES' 
                                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/20" 
                                    : "text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-950/20"
                            )}
                        >
                            <AlertTriangle className="w-4 h-4 text-rose-500" />
                            النواقص
                            {shortCount > 0 && (
                                <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold ml-1">
                                    {shortCount}
                                </span>
                            )}
                        </button>
                        {permissions.canManageCategories && (
                            <button
                                onClick={() => setStockTab('CATEGORIES')}
                                className={clsx(
                                    "px-4 py-2 rounded-xl flex items-center gap-2 font-black transition-all whitespace-nowrap",
                                    stockTab === 'CATEGORIES' 
                                        ? "bg-primary text-primary-foreground shadow-md" 
                                        : "text-slate-400 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5"
                                )}
                            >
                                <Palette className="w-4 h-4" />
                                {t('tabs.categories')}
                            </button>
                        )}
                    </div>
                    {stockTab === 'SHORTAGES' && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-sm mr-auto ml-2">
                            <span className="text-xs font-black text-slate-500 whitespace-nowrap">الحد الأدنى العام:</span>
                            <input
                                type="number"
                                value={customMinStock}
                                onChange={(e) => {
                                    setCustomMinStock(e.target.value === "" ? "" : Number(e.target.value));
                                }}
                                className="w-12 bg-transparent text-center border-b border-slate-300 dark:border-zinc-700 focus:border-cyan-500 focus:outline-none font-bold text-slate-800 dark:text-white text-xs"
                                placeholder="تلقائي"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT */}
            <div className="min-h-[500px]">
                {activeSection === 'STOCK' && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                        {stockTab === 'PRODUCTS' && (
                            <ProductsTab
                                products={products}
                                categories={categories}
                                csrfToken={csrfToken}
                                user={user}
                                warehouseId={warehouses.find((w: any) => w.isDefault)?.id}
                                currency={currency}
                                initialUnits={units}
                                models={models}
                                attributes={attributes}
                                features={features}
                            />
                        )}

                        {stockTab === 'SHORTAGES' && (
                            <ProductsTab
                                products={products}
                                categories={categories}
                                csrfToken={csrfToken}
                                user={user}
                                warehouseId={warehouses.find((w: any) => w.isDefault)?.id}
                                currency={currency}
                                initialUnits={units}
                                models={models}
                                attributes={attributes}
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
                            csrfToken={csrfToken}
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
