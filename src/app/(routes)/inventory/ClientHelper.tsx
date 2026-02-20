"use client";
import PurchasesTab from "@/components/inventory/PurchasesTab";
import ProductsTab from "@/components/inventory/ProductsTab";
import { useState, useEffect } from "react";
import { Plus, Truck, Package, Palette, ShoppingCart, ArrowRightLeft } from "lucide-react";
import SupplierModal from "@/components/inventory/SupplierModal";
import { useTranslations } from "@/lib/i18n-mock";
import { useSearchParams } from "next/navigation";
import CategoriesTab from "@/components/inventory/CategoriesTab";
import SuppliersTab from "@/components/inventory/SuppliersTab";
import clsx from "clsx";

// import StockRequestsTab from "@/components/inventory/StockRequestsTab";
// import InventoryTransferTab from "@/components/inventory/InventoryTransferTab";

export default function InventoryTabs({ suppliers, categories, products, invoices, warehouses, csrfToken, user, stockRequests = [] }: any) {
    const t = useTranslations('Inventory');
    const searchParams = useSearchParams();
    const sectionParam = searchParams.get('section');
    const [activeSection, setActiveSection] = useState<'STOCK' | 'PURCHASING' | 'REQUESTS' | 'TRANSFERS'>('STOCK'); // Added TRANSFERS
    const [stockTab, setStockTab] = useState<'PRODUCTS' | 'CATEGORIES'>('PRODUCTS');
    const [purchasingTab, setPurchasingTab] = useState<'PURCHASES' | 'SUPPLIERS'>('PURCHASES');

    useEffect(() => {
        // Sync Logic if needed
        if (sectionParam === 'purchasing') setActiveSection('PURCHASING');
    }, [sectionParam]);

    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b border-border pb-2">
                <button
                    onClick={() => setActiveSection('STOCK')}
                    className={clsx("px-4 py-2 font-bold rounded-lg transition-all", activeSection === 'STOCK' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                >
                    Stock
                </button>
                <button
                    onClick={() => setActiveSection('PURCHASING')}
                    className={clsx("px-4 py-2 font-bold rounded-lg transition-all", activeSection === 'PURCHASING' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                >
                    Purchasing
                </button>
                {/* REMOVED REQUESTS AND TRANSFERS TABS */}
            </div>

            {/* Sub Tabs (Only for Stock/Purchasing) */}
            {(activeSection !== 'REQUESTS' && activeSection !== 'TRANSFERS') && (
                <div className="flex justify-between items-center bg-card p-2 rounded-2xl border border-border overflow-x-auto animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                    <div className="flex gap-2">
                        {activeSection === 'STOCK' ? (
                            <>
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
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => setPurchasingTab('PURCHASES')}
                                    className={clsx(
                                        "px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all whitespace-nowrap",
                                        purchasingTab === 'PURCHASES' ? "bg-purple-500 text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                    )}
                                >
                                    <ShoppingCart className="w-4 h-4" />
                                    {t('tabs.invoices')}
                                </button>
                                <button
                                    onClick={() => setPurchasingTab('SUPPLIERS')}
                                    className={clsx(
                                        "px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all whitespace-nowrap",
                                        purchasingTab === 'SUPPLIERS' ? "bg-purple-500 text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                    )}
                                >
                                    <Truck className="w-4 h-4" />
                                    {t('tabs.suppliers')}
                                </button>
                            </>
                        )}
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

                {activeSection === 'PURCHASING' && purchasingTab === 'SUPPLIERS' && (
                    <SuppliersTab suppliers={suppliers} csrfToken={csrfToken} />
                )}

                {activeSection === 'PURCHASING' && purchasingTab === 'PURCHASES' && (
                    <PurchasesTab suppliers={suppliers} products={products} categories={categories} invoices={invoices} csrfToken={csrfToken} />
                )}

                {/* TABS CONTENT REMOVED */}
            </div>
        </div>
    );
}
