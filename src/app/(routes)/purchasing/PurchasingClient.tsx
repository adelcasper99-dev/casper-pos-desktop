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
    invoices,
    warehouses,
    branches,
    isHQUser,
    userBranchId,
    csrfToken
}: any) {
    const t = useTranslations('Purchasing');
    const [activeTab, setActiveTab] = useState<'PURCHASES' | 'SUPPLIERS' | 'SERVICES'>('PURCHASES');

    return (
        <div className="space-y-6 font-cairo">
            {/* TABS */}
            <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-2xl border border-zinc-200 dark:border-white/10 overflow-x-auto shadow-inner">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('PURCHASES')}
                        className={clsx(
                            "px-6 py-3 rounded-xl flex items-center gap-2 font-black transition-all whitespace-nowrap text-xs uppercase tracking-widest",
                            activeTab === 'PURCHASES' ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        <ShoppingCart className="w-4 h-4" />
                        {t('tabs.invoices')}
                    </button>
                    <button
                        onClick={() => setActiveTab('SUPPLIERS')}
                        className={clsx(
                            "px-6 py-3 rounded-xl flex items-center gap-2 font-black transition-all whitespace-nowrap text-xs uppercase tracking-widest",
                            activeTab === 'SUPPLIERS' ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        <Truck className="w-4 h-4" />
                        {t('tabs.suppliers')}
                    </button>
                    <button
                        onClick={() => setActiveTab('SERVICES')}
                        className={clsx(
                            "px-6 py-3 rounded-xl flex items-center gap-2 font-black transition-all whitespace-nowrap text-xs uppercase tracking-widest",
                            activeTab === 'SERVICES' ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        <ShoppingCart className="w-4 h-4" />
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
                        invoices={invoices}
                        warehouses={warehouses}
                        branches={branches}
                        isHQUser={isHQUser}
                        userBranchId={userBranchId}
                        csrfToken={csrfToken}
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
