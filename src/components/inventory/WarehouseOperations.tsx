"use client";

import { useState, useEffect } from "react";
import { ArrowRightLeft, Package, AlertTriangle, ScanBarcode } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { transferStock, adjustStock, getWarehouseStock } from "@/actions/inventory";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n-mock";
import { Loader2 } from "lucide-react";

interface Branch {
    id: string;
    name: string;
    code: string;
    type: string;
}

interface Warehouse {
    id: string;
    name: string;
    isDefault: boolean;
    branchId: string;
}

interface Product {
    id: string;
    name: string;
    sku: string;
    stock: number; // Global stock
}

export default function WarehouseOperations({
    warehouses,
    products,
    csrfToken,
    branches = [],
    isHQUser = false,
    userBranchId
}: {
    warehouses: Warehouse[],
    products: Product[],
    csrfToken?: string,
    branches?: Branch[],
    isHQUser?: boolean,
    userBranchId?: string
}) {
    const t = useTranslations('Inventory.operations');
    const [activeTab, setActiveTab] = useState<'TRANSFER' | 'ADJUSTMENT'>('TRANSFER');
    const [loading, setLoading] = useState(false);

    // Filter helpers
    const getWarehousesForBranch = (bId: string) => {
        if (!bId) return [];
        return warehouses.filter(w => w.branchId === bId);
    }

    // Transfer State
    // Transfer State
    const [fromBranchId, setFromBranchId] = useState(() => {
        if (userBranchId) return userBranchId;
        if (branches.length > 0) return branches[0].id;
        return "";
    });
    const [toBranchId, setToBranchId] = useState(() => {
        if (userBranchId) return userBranchId;
        if (branches.length > 0) return branches[0].id;
        return "";
    });

    const [fromId, setFromId] = useState("");
    const [toId, setToId] = useState("");
    const [transferItems, setTransferItems] = useState<{ productId: string; quantity: number }[]>([]);

    // Filtered lists for Transfer
    const fromWarehouses = getWarehousesForBranch(fromBranchId);
    const toWarehouses = getWarehousesForBranch(toBranchId);

    // Stock Cache for "From" Warehouse
    const [sourceStock, setSourceStock] = useState<Record<string, number>>({});
    const [loadingStock, setLoadingStock] = useState(false);

    // Fetch stock when source warehouse changes
    useEffect(() => {
        if (!fromId) {
            setSourceStock({});
            return;
        }

        const fetchStock = async () => {
            setLoadingStock(true);
            const res = await getWarehouseStock(fromId);
            if (res.success && res.data) {
                const map: Record<string, number> = {};
                res.data.forEach((item: any) => {
                    map[item.id] = item.quantity;
                });
                setSourceStock(map);
            }
            setLoadingStock(false);
        };
        fetchStock();
    }, [fromId]);

    // Adjustment State
    const [adjBranchId, setAdjBranchId] = useState(() => {
        if (userBranchId) return userBranchId;
        if (branches.length > 0) return branches[0].id;
        return "";
    });
    const [adjWarehouseId, setAdjWarehouseId] = useState("");
    const [adjProductId, setAdjProductId] = useState("");
    const [adjNewQty, setAdjNewQty] = useState("");
    const [adjReason, setAdjReason] = useState("");

    const adjWarehouses = getWarehousesForBranch(adjBranchId);

    // Helper to add item to transfer
    const [search, setSearch] = useState("");
    const filteredProducts = search ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search)).slice(0, 5) : [];

    const handleAddTransferItem = (p: Product) => {
        setTransferItems(prev => [...prev, { productId: p.id, quantity: 1 }]);
        setSearch("");
    };

    const handleTransfer = async () => {
        if (!fromId || !toId || transferItems.length === 0) return;
        setLoading(true);
        const res = await transferStock({
            fromWarehouseId: fromId,
            toWarehouseId: toId,
            items: transferItems,
            reason: "Manual Transfer"
        });
        setLoading(false);
        if (res.success) {
            alert(t('transferSuccess', { defaultValue: "Transfer Successful!" }));
            setTransferItems([]);
            // Refresh stock
            const stockRes = await getWarehouseStock(fromId);
            if (stockRes.success && stockRes.data) {
                const map: Record<string, number> = {};
                stockRes.data.forEach((item: any) => map[item.id] = item.quantity);
                setSourceStock(map);
            }
        } else {
            alert(res.message);
        }
    };

    const handleAdjustment = async () => {
        if (!adjWarehouseId || !adjProductId || !adjNewQty || !adjReason) return;
        setLoading(true);
        const res = await adjustStock({
            productId: adjProductId,
            warehouseId: adjWarehouseId,
            newQuantity: parseInt(adjNewQty),
            reason: adjReason,
            csrfToken
        });
        setLoading(false);
        if (res.success) {
            alert(t('adjustmentSuccess', { defaultValue: "Adjustment Successful!" }));
            setAdjNewQty("");
            setAdjReason("");
        } else {
            alert(res.message);
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex gap-2 bg-muted/50 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('TRANSFER')}
                    className={clsx("px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all", activeTab === 'TRANSFER' ? "bg-cyan-500 text-black" : "text-muted-foreground hover:text-foreground")}
                >
                    <ArrowRightLeft className="w-4 h-4" /> {t('transfer')}
                </button>
                <button
                    onClick={() => setActiveTab('ADJUSTMENT')}
                    className={clsx("px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all", activeTab === 'ADJUSTMENT' ? "bg-orange-500 text-black" : "text-muted-foreground hover:text-foreground")}
                >
                    <AlertTriangle className="w-4 h-4" /> {t('adjustment')}
                </button>
            </div>

            <div className="glass-card p-6">
                {activeTab === 'TRANSFER' ? (
                    <div className="space-y-6">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5 text-cyan-400" /> {t('stockTransferTitle')}
                        </h3>

                        <div className="grid grid-cols-2 gap-6">
                            {/* FROM SECTION */}
                            <div className="bg-muted/20 p-4 rounded-xl space-y-3">
                                <h4 className="font-bold text-sm text-cyan-500 uppercase">{t('origin')}</h4>
                                <div className="hidden">
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('branch')}</label>
                                    <select
                                        className="glass-input w-full [&>option]:text-black"
                                        value={fromBranchId}
                                        onChange={e => {
                                            setFromBranchId(e.target.value);
                                            setFromId(""); // Reset warehouse
                                        }}
                                        disabled={!isHQUser}
                                    >
                                        <option value="">{t('selectBranch')}</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('warehouse')}</label>
                                    <select
                                        className="glass-input w-full [&>option]:text-black"
                                        value={fromId}
                                        onChange={e => setFromId(e.target.value)}
                                        disabled={!fromBranchId}
                                    >
                                        <option value="">{t('selectOrigin')}</option>
                                        {fromWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* TO SECTION */}
                            <div className="bg-muted/20 p-4 rounded-xl space-y-3">
                                <h4 className="font-bold text-sm text-orange-500 uppercase">{t('destination')}</h4>
                                <div className="hidden">
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('branch')}</label>
                                    <select
                                        className="glass-input w-full [&>option]:text-black"
                                        value={toBranchId}
                                        onChange={e => {
                                            setToBranchId(e.target.value);
                                            setToId(""); // Reset warehouse
                                        }}
                                        disabled={!isHQUser} // Assuming even HQ can transfer anywhere? Yes.
                                    >
                                        <option value="">{t('selectBranch')}</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('warehouse')}</label>
                                    <select
                                        className="glass-input w-full [&>option]:text-black"
                                        value={toId}
                                        onChange={e => setToId(e.target.value)}
                                        disabled={!toBranchId}
                                    >
                                        <option value="">{t('selectDestination')}</option>
                                        {toWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Item Selector */}
                        <div className="relative">
                            <input
                                className="glass-input w-full"
                                placeholder={fromId ? t('searchProductPlaceholder') : t('selectSourceFirst')}
                                disabled={!fromId}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {loadingStock && <div className="absolute left-3 top-3 text-xs text-muted-foreground">{t('loadingStock')}</div>}

                            {filteredProducts.length > 0 && (
                                <div className="absolute top-full left-0 w-full bg-popover border border-border rounded-xl mt-1 z-50 overflow-hidden shadow-xl">
                                    {filteredProducts.map(p => {
                                        const qtyInSource = sourceStock[p.id] || 0;
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => handleAddTransferItem(p)}
                                                disabled={qtyInSource <= 0}
                                                className="w-full text-left p-3 hover:bg-muted text-sm flex justify-between items-center group disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <div>
                                                    <div className="font-bold text-foreground">{p.name}</div>
                                                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={clsx("font-bold", qtyInSource > 0 ? "text-cyan-400" : "text-red-500")}>
                                                        {qtyInSource}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground uppercase">{t('available')}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            {transferItems.map((item, idx) => {
                                const p = products.find(prod => prod.id === item.productId);
                                const maxQty = sourceStock[item.productId] || 0;

                                return (
                                    <div key={idx} className="flex justify-between items-center bg-muted/50 p-3 rounded-xl border border-border">
                                        <div>
                                            <span className="text-sm font-bold block text-foreground">{p?.name || item.productId}</span>
                                            <span className="text-xs text-muted-foreground">Max: {maxQty}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => {
                                                    const newItems = [...transferItems];
                                                    const val = Math.max(1, newItems[idx].quantity - 1);
                                                    newItems[idx].quantity = val;
                                                    setTransferItems(newItems);
                                                }}
                                                className="h-9 w-9 flex items-center justify-center bg-background rounded-lg border border-border hover:bg-muted text-lg font-bold"
                                            >
                                                -
                                            </button>
                                            <input
                                                type="number"
                                                className="glass-input w-14 text-center py-1 h-9 p-0 font-bold"
                                                value={item.quantity}
                                                max={maxQty}
                                                onChange={(e) => {
                                                    let val = parseInt(e.target.value) || 0;
                                                    if (val > maxQty) val = maxQty; // Prevent exceeding stock
                                                    const newItems = [...transferItems];
                                                    newItems[idx].quantity = val;
                                                    setTransferItems(newItems);
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    const newItems = [...transferItems];
                                                    const val = Math.min(maxQty, newItems[idx].quantity + 1);
                                                    newItems[idx].quantity = val;
                                                    setTransferItems(newItems);
                                                }}
                                                className="h-9 w-9 flex items-center justify-center bg-background rounded-lg border border-border hover:bg-muted text-lg font-bold"
                                            >
                                                +
                                            </button>
                                            <button
                                                onClick={() => setTransferItems(prev => prev.filter((_, i) => i !== idx))}
                                                className="h-9 w-9 flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg ml-2"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            onClick={handleTransfer}
                            disabled={loading || !fromId || !toId || transferItems.length === 0}
                            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl disabled:opacity-50"
                        >
                            {loading ? t('processing') : t('confirmTransfer')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-orange-400">
                            <AlertTriangle className="w-5 h-5" /> {t('stockAdjustmentTitle')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="hidden">
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('branch')}</label>
                                <select
                                    className="glass-input w-full h-12 [&>option]:text-black"
                                    value={adjBranchId}
                                    onChange={e => {
                                        setAdjBranchId(e.target.value);
                                        setAdjWarehouseId("");
                                    }}
                                    disabled={!isHQUser}
                                >
                                    <option value="">{t('selectBranch')}</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('adjustmentLocation')}</label>
                                <select
                                    className="glass-input w-full h-12 [&>option]:text-black"
                                    value={adjWarehouseId}
                                    onChange={e => setAdjWarehouseId(e.target.value)}
                                    disabled={!adjBranchId}
                                >
                                    <option value="">{t('selectOrigin')}</option>
                                    {adjWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('adjustmentProduct')}</label>
                                <select className="glass-input w-full h-12 [&>option]:text-black" value={adjProductId} onChange={e => setAdjProductId(e.target.value)}>
                                    <option value="">{t('selectProduct')}</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('newQuantityLabel')}</label>
                            <input
                                type="number"
                                className="glass-input w-full h-12"
                                placeholder={t('newQuantityPlaceholder')}
                                value={adjNewQty}
                                onChange={e => setAdjNewQty(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground mt-1">{t('overwriteNote')}</p>
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('reasonLabel')}</label>
                            <input
                                className="glass-input w-full h-12"
                                placeholder={t('reasonPlaceholder')}
                                value={adjReason}
                                onChange={e => setAdjReason(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={handleAdjustment}
                            disabled={loading || !adjWarehouseId || !adjProductId || !adjNewQty || !adjReason}
                            className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bold py-3 rounded-xl disabled:opacity-50"
                        >
                            {loading ? t('processing') : t('confirmAdjustment')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
