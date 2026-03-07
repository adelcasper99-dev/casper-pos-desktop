"use client";

import { useState } from "react";
import { Package, Palette, Truck, Box } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import clsx from "clsx";

import ProductsTab from "@/components/inventory/ProductsTab";
import CategoriesTab from "@/components/inventory/CategoriesTab";
import WarehouseClient from "@/components/inventory/WarehouseClient";
import SuppliersTab from "@/components/inventory/SuppliersTab";

export default function InventoryTabs({
    suppliers,
    categories,
    products,
    warehouses,
    csrfToken,
    user,
    features,
    currency = "EGP",
    permissions = { canManageCategories: true, canViewSuppliers: true }
}: any) {
    const t = useTranslations('Inventory');
    const [activeSection, setActiveSection] = useState<'STOCK' | 'WAREHOUSES' | 'SUPPLIERS'>('STOCK');
    const [stockTab, setStockTab] = useState<'PRODUCTS' | 'CATEGORIES'>('PRODUCTS');

    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b border-white/10 pb-2">
                <button
                    onClick={() => setActiveSection('STOCK')}
                    className={clsx(
                        "px-4 py-2 font-bold rounded-lg transition-all",
                        activeSection === 'STOCK' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-white/5 text-zinc-400"
                    )}
                >
                    {t('tabs.stock')}
                </button>
                {!features?.hideLocationsTab && (
                    <button
                        onClick={() => setActiveSection('WAREHOUSES')}
                        className={clsx(
                            "px-4 py-2 font-bold rounded-lg transition-all",
                            activeSection === 'WAREHOUSES' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-white/5 text-zinc-400"
                        )}
                    >
                        {t('tabs.locations')}
                    </button>
                )}
                {permissions.canViewSuppliers && (
                    <button
                        onClick={() => setActiveSection('SUPPLIERS')}
                        className={clsx(
                            "px-4 py-2 font-bold rounded-lg transition-all",
                            activeSection === 'SUPPLIERS' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-white/5 text-zinc-400"
                        )}
                    >
                        {t('tabs.suppliers') || "الموردين"}
                    </button>
                )}
            </div>

            {/* Sub Tabs (Only for Stock) */}
            {activeSection === 'STOCK' && (
                <div className="flex justify-between items-center bg-white/5 p-2 rounded-2xl border border-white/10 overflow-x-auto animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setStockTab('PRODUCTS')}
                            className={clsx(
                                "px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all whitespace-nowrap",
                                stockTab === 'PRODUCTS' ? "bg-primary text-primary-foreground shadow-md" : "text-zinc-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Package className="w-4 h-4" />
                            {t('tabs.products')}
                        </button>
                        {permissions.canManageCategories && (
                            <button
                                onClick={() => setStockTab('CATEGORIES')}
                                className={clsx(
                                    "px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all whitespace-nowrap",
                                    stockTab === 'CATEGORIES' ? "bg-primary text-primary-foreground shadow-md" : "text-zinc-400 hover:text-white hover:bg-white/5"
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
                        />
                    </div>
                )}

                {activeSection === 'SUPPLIERS' && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                        <SuppliersTab
                            suppliers={suppliers}
                            csrfToken={csrfToken}
                            currency={currency}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
