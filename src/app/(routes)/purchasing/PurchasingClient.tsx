"use client";

import { useState } from "react";
import { Truck, ShoppingCart } from "lucide-react";
import PurchasesTab from "@/components/inventory/PurchasesTab";
import SuppliersTab from "@/components/inventory/SuppliersTab";
import ServicesTab from "@/components/inventory/ServicesTab";
import clsx from "clsx";

import { useTranslations } from "@/lib/i18n-mock";

export default function PurchasingClient({
    suppliers,
    products,
    categories,
    models,
    invoices,
    units,
    warehouses,
    branches,
    isHQUser,
    userBranchId,
    csrfToken,
    attributes,
    treasuries
}: any) {
    const t = useTranslations('Purchasing');
    const [activeTab, setActiveTab] = useState<'PURCHASES' | 'SUPPLIERS' | 'SERVICES'>('PURCHASES');

    return (
        <div className="space-y-2.5 font-cairo">
            {/* TABS */}
            <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50 p-1 sm:p-1.5 rounded-xl border border-zinc-200 dark:border-white/10 overflow-x-auto shadow-inner">
                <div className="flex gap-1.5">
                    <button
                        onClick={() => setActiveTab('PURCHASES')}
                        className={clsx(
                            "px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 font-black transition-all whitespace-nowrap text-xs uppercase tracking-widest cursor-pointer",
                            activeTab === 'PURCHASES' ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        {t('tabs.invoices')}
                    </button>
                    <button
                        onClick={() => setActiveTab('SUPPLIERS')}
                        className={clsx(
                            "px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 font-black transition-all whitespace-nowrap text-xs uppercase tracking-widest cursor-pointer",
                            activeTab === 'SUPPLIERS' ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        <Truck className="w-3.5 h-3.5" />
                        {t('tabs.suppliers')}
                    </button>
                    <button
                        onClick={() => setActiveTab('SERVICES')}
                        className={clsx(
                            "px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 font-black transition-all whitespace-nowrap text-xs uppercase tracking-widest cursor-pointer",
                            activeTab === 'SERVICES' ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        {t('tabs.services')}
                    </button>
                </div>
            </div>

            {/* CONTENT */}
            <div className="min-h-[500px]">
                {activeTab === 'PURCHASES' && (
                    <PurchasesTab
                        suppliers={suppliers}
                        products={products}
                        categories={categories}
                        models={models}
                        invoices={invoices}
                        warehouses={warehouses}
                        branches={branches}
                        isHQUser={isHQUser}
                        userBranchId={userBranchId}
                        csrfToken={csrfToken}
                        units={units}
                        attributes={attributes}
                        treasuries={treasuries}
                    />
                )}

                {activeTab === 'SUPPLIERS' && (
                    <SuppliersTab suppliers={suppliers} csrfToken={csrfToken} />
                )}

                {activeTab === 'SERVICES' && (
                    <ServicesTab
                        categories={categories}
                        csrfToken={csrfToken}
                    />
                )}
            </div>
        </div>
    );
}
