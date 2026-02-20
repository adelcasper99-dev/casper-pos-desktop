"use client";

import { useState } from "react";
import WarehouseManager from "./WarehouseManager";
import WarehouseOperations from "./WarehouseOperations";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n-mock";

interface WarehouseClientProps {
    warehouses: any[];
    products: any[];
    csrfToken: string;
    branchId?: string;
}

export default function WarehouseClient({ warehouses, products, csrfToken, branchId }: WarehouseClientProps) {
    const t = useTranslations('Inventory');
    const [activeTab, setActiveTab] = useState("locations");

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 border-b border-border pb-2 mb-6">
                <button
                    onClick={() => setActiveTab("locations")}
                    className={clsx(
                        "text-sm font-medium transition-colors hover:text-cyan-400 pb-2 -mb-2.5 border-b-2",
                        activeTab === "locations"
                            ? "border-cyan-500 text-cyan-500"
                            : "border-transparent text-muted-foreground"
                    )}
                >
                    {t('tabs.locations')}
                </button>
                <button
                    onClick={() => setActiveTab("operations")}
                    className={clsx(
                        "text-sm font-medium transition-colors hover:text-cyan-400 pb-2 -mb-2.5 border-b-2",
                        activeTab === "operations"
                            ? "border-cyan-500 text-cyan-500"
                            : "border-transparent text-muted-foreground"
                    )}
                >
                    {t('tabs.operations')}
                </button>
            </div>

            {activeTab === "locations" && (
                <WarehouseManager
                    warehouses={warehouses}
                    csrfToken={csrfToken}
                    branchId={branchId}
                />
            )}

            {activeTab === "operations" && (
                <WarehouseOperations
                    warehouses={warehouses}
                    products={products}
                    csrfToken={csrfToken}
                />
            )}
        </div>
    );
}
