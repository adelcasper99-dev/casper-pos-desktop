"use client";

import { useTranslations } from "@/lib/i18n-mock";
import { Combobox } from "@/components/ui/combobox";

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

    paymentMethod: string;
    onPaymentMethodChange: (val: string) => void;

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
    paymentMethod,
    onPaymentMethodChange,
    isHQUser
}: PurchaseHeaderProps) {
    const t = useTranslations('Purchasing');
    const tPOS = useTranslations('POS');

    // Convert to Combobox options
    const supplierOptions = suppliers.map(s => ({ label: s.name, value: s.id }));
    const branchOptions = branches.map(b => ({ label: `${b.name} (${b.code || ''})`, value: b.id }));
    const warehouseOptions = warehouses.map(w => ({ label: w.name, value: w.id }));

    // Payment methods
    const paymentOptions = [
        { label: `${tPOS('cash')} (نقدي)`, value: "CASH" },
        { label: `${tPOS('deferred')} (آجل)`, value: "DEFERRED" },
        { label: tPOS('card'), value: "CARD" },
    ];

    return (
        <div className="bg-muted/30 rounded-xl p-4 border border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Supplier */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">
                        {t('supplier')}
                    </label>
                    <Combobox
                        options={supplierOptions}
                        value={selectedSupplierId}
                        onChange={onSupplierChange}
                        placeholder={t('selectSupplier')}
                        emptyText="No suppliers found."
                    />
                </div>

                {/* Branch */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">
                        {t('branch')}
                    </label>
                    <Combobox
                        options={branchOptions}
                        value={selectedBranchId}
                        onChange={onBranchChange}
                        placeholder={t('selectBranch')}
                        disabled={!isHQUser}
                        emptyText="No branches found."
                    />
                </div>

                {/* Warehouse */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">
                        {t('warehouse')}
                    </label>
                    <Combobox
                        options={warehouseOptions}
                        value={selectedWarehouseId}
                        onChange={onWarehouseChange}
                        placeholder={selectedBranchId ? t('selectWarehouse') : t('selectBranchFirst')}
                        disabled={!selectedBranchId}
                        emptyText="No warehouses found."
                    />
                </div>

                {/* Payment Method */}
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">
                        {t('paymentMethod')}
                    </label>
                    <Combobox
                        options={paymentOptions}
                        value={paymentMethod}
                        onChange={onPaymentMethodChange}
                        placeholder="Select Payment..."
                        emptyText="No options."
                    />
                </div>
            </div>
        </div>
    );
}
