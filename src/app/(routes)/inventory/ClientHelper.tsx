"use client";

import { useState } from "react";
import { Package, Palette } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import clsx from "clsx";

import ProductsTab from "@/components/inventory/ProductsTab";
import CategoriesTab from "@/components/inventory/CategoriesTab";
import WarehouseClient from "@/components/inventory/WarehouseClient";

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
    isHQUser = false
}: any) {
    const t = useTranslations('Inventory');
    const [activeSection, setActiveSection] = useState<'STOCK' | 'WAREHOUSES'>('STOCK');
    const [stockTab, setStockTab] = useState<'PRODUCTS' | 'CATEGORIES'>('PRODUCTS');

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
            </div>
        </div>
    );
}
