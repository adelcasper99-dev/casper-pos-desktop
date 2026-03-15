"use client";

import { useTranslations } from "@/lib/i18n-mock";
import { Combobox } from "@/components/ui/combobox";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";

interface PurchaseHeaderProps {
    suppliers: { id: string; name: string }[];
    branches: { id: string; name: string; code?: string }[];
    warehouses: { id: string; name: string }[];

    selectedSupplierId: string;
    onSupplierChange: (id: string) => void;

    selectedBranchId: string;
    onBranchChange: (id: string) => void;

    selectedWarehouseId: string;
    onWarehouseChange: (id: string) => void;

    isHQUser: boolean;
}

export function PurchaseHeader({
    suppliers,
    branches,
    warehouses,
    selectedSupplierId,
    onSupplierChange,
    selectedBranchId,
    onBranchChange,
    selectedWarehouseId,
    onWarehouseChange,
    isHQUser
}: PurchaseHeaderProps) {
    const t = useTranslations('Purchasing');
    const { handleKeyDown, getNavProps } = useKeyboardNavigation();

    // Convert to Combobox options
    const supplierOptions = suppliers.map(s => ({ label: s.name, value: s.id }));
    const warehouseOptions = warehouses.map(w => ({ label: w.name, value: w.id }));

    return (
        <div className="bg-muted/30 rounded-xl p-4 border border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Supplier */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">
                        {t('supplier')}
                    </label>
                    <Combobox
                        {...getNavProps(0)}
                        options={supplierOptions}
                        value={selectedSupplierId}
                        onChange={onSupplierChange}
                        onKeyDown={(e: any) => handleKeyDown(e, 0, 13, undefined)}
                        placeholder={t('selectSupplier')}
                        emptyText="No suppliers found."
                    />
                </div>

                {/* Warehouse */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">
                        {t('warehouse')}
                    </label>
                    <Combobox
                        {...getNavProps(1)}
                        options={warehouseOptions}
                        value={selectedWarehouseId}
                        onChange={onWarehouseChange}
                        onKeyDown={(e: any) => handleKeyDown(e, 1, 13, undefined)}
                        placeholder={t('selectWarehouse')}
                        emptyText="No warehouses found."
                    />
                </div>
            </div>
        </div>
    );
}
