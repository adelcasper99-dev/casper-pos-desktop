"use client";
import ProductsTab from "@/components/inventory/ProductsTab";
import { useState } from "react";
import { Package, Palette } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import CategoriesTab from "@/components/inventory/CategoriesTab";
import WarehouseClient from "@/components/inventory/WarehouseClient";
import clsx from "clsx";

// import StockRequestsTab from "@/components/inventory/StockRequestsTab";
// import InventoryTransferTab from "@/components/inventory/InventoryTransferTab";

export default function InventoryTabs({ suppliers, categories, products, warehouses, csrfToken, user }: any) {
    const t = useTranslations('Inventory');
    const [activeSection, setActiveSection] = useState<'STOCK' | 'WAREHOUSES'>('STOCK');
    const [stockTab, setStockTab] = useState<'PRODUCTS' | 'CATEGORIES'>('PRODUCTS');

    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b border-border pb-2">
                <button
                    onClick={() => setActiveSection('STOCK')}
                    className={clsx("px-4 py-2 font-bold rounded-lg transition-all", activeSection === 'STOCK' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                >
                    {t('tabs.stock')}
                </button>
                <button
                    onClick={() => setActiveSection('WAREHOUSES')}
                    className={clsx("px-4 py-2 font-bold rounded-lg transition-all", activeSection === 'WAREHOUSES' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                >
                    {t('tabs.locations')}
                </button>
            </div>

            {/* Sub Tabs (Only for Stock) */}
            {activeSection === 'STOCK' && (
                <div className="flex justify-between items-center bg-card p-2 rounded-2xl border border-border overflow-x-auto animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setStockTab('PRODUCTS')}
                            className={clsx(
                                "px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all whitespace-nowrap",
                                stockTab === 'PRODUCTS' ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            <Package className="w-4 h-4" />
                            {t('tabs.products')}
                        </button>
                        <button
                            onClick={() => setStockTab('CATEGORIES')}
                            className={clsx(
                                "px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all whitespace-nowrap",
                                stockTab === 'CATEGORIES' ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            <Palette className="w-4 h-4" />
                            {t('tabs.categories')}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB CONTENT */}
            <div className="min-h-[500px]">
                {activeSection === 'STOCK' && stockTab === 'PRODUCTS' && (
                    <ProductsTab
                        products={products}
                        categories={categories}
                        csrfToken={csrfToken}
                        user={user}
                        warehouseId={warehouses?.[0]?.id}
                    />
                )}

                {activeSection === 'STOCK' && stockTab === 'CATEGORIES' && (
                    <CategoriesTab categories={categories} csrfToken={csrfToken} />
                )}

                {activeSection === 'WAREHOUSES' && (
                    <WarehouseClient
                        warehouses={warehouses}
                        products={products}
                        csrfToken={csrfToken}
                        branchId={warehouses?.[0]?.branchId}
                    />
                )}
            </div>
        </div>
    );
}
