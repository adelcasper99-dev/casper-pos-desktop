"use client";

import { useState } from "react";
import { Truck, ShoppingCart } from "lucide-react";
import PurchasesTab from "@/components/inventory/PurchasesTab";
import SuppliersTab from "@/components/inventory/SuppliersTab";
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
    const t = useTranslations('purchasing');
    const [activeTab, setActiveTab] = useState<'PURCHASES' | 'SUPPLIERS'>('PURCHASES');

    return (
        <div className="space-y-6">
            {/* TABS */}
            <div className="flex justify-between items-center bg-white/5 p-2 rounded-2xl border border-white/10 overflow-x-auto">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('PURCHASES')}
                        className={clsx(
                            "px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all whitespace-nowrap",
                            activeTab === 'PURCHASES' ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(168,85,247,0.4)]" : "text-zinc-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <ShoppingCart className="w-4 h-4" />
                        {t('Purchasing.tabs.invoices')}
                    </button>
                    <button
                        onClick={() => setActiveTab('SUPPLIERS')}
                        className={clsx(
                            "px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all whitespace-nowrap",
                            activeTab === 'SUPPLIERS' ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(168,85,247,0.4)]" : "text-zinc-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <Truck className="w-4 h-4" />
                        {t('Purchasing.tabs.suppliers')}
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
            </div>
        </div>
    );
}
