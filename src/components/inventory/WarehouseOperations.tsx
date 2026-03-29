"use client";

import { useState, useEffect } from "react";
import { ArrowRightLeft, Package, AlertTriangle, ScanBarcode, X } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { adjustStock, getWarehouseStock } from "@/actions/inventory";
import { transferStock } from "@/actions/inventory-transfer";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n-mock";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
    costPrice?: number;
    sellPrice?: number;
    sellPrice2?: number;
    sellPrice3?: number;
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
    const [transferItems, setTransferItems] = useState<{ productId: string; quantity: number; priceTier?: string }[]>([]);

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
        setTransferItems(prev => [...prev, { productId: p.id, quantity: 1, priceTier: 'Cost' }]);
        setSearch("");
    };

    const handleTransfer = async () => {
        if (!fromId || !toId || transferItems.length === 0) return;
        setLoading(true);
        const res = await transferStock({
            sourceId: fromId,
            sourceType: 'WAREHOUSE',
            destinationId: toId,
            destinationType: 'WAREHOUSE',
            items: transferItems
        });
        setLoading(false);
        if (res.success) {
            toast.success(t('transferSuccess', { defaultValue: "Transfer Successful!" }));
            setTransferItems([]);
            // Refresh stock
            const stockRes = await getWarehouseStock(fromId);
            if (stockRes.success && stockRes.data) {
                const map: Record<string, number> = {};
                stockRes.data.forEach((item: any) => map[item.id] = item.quantity);
                setSourceStock(map);
            }
        } else {
            toast.error(res.message);
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
            toast.success(t('adjustmentSuccess', { defaultValue: "Adjustment Successful!" }));
            setAdjNewQty("");
            setAdjReason("");
        } else {
            toast.error(res.message);
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex gap-2 bg-slate-100 dark:bg-muted/50 p-1.5 rounded-2xl w-fit border border-slate-200 dark:border-white/5 shadow-sm">
                <button
                    onClick={() => setActiveTab('TRANSFER')}
                    className={clsx(
                        "px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-all active:scale-95", 
                        activeTab === 'TRANSFER' ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20" : "text-slate-500 dark:text-muted-foreground hover:bg-slate-200 dark:hover:bg-white/5"
                    )}
                >
                    <ArrowRightLeft className="w-4 h-4" /> {t('transfer')}
                </button>
                <button
                    onClick={() => setActiveTab('ADJUSTMENT')}
                    className={clsx(
                        "px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-all active:scale-95", 
                        activeTab === 'ADJUSTMENT' ? "bg-orange-500 text-black shadow-lg shadow-orange-500/20" : "text-slate-500 dark:text-muted-foreground hover:bg-slate-200 dark:hover:bg-white/5"
                    )}
                >
                    <AlertTriangle className="w-4 h-4" /> {t('adjustment')}
                </button>
            </div>

            <div className="glass-card p-6 border-slate-200 dark:border-white/10 shadow-xl bg-white dark:bg-black/20 rounded-3xl">
                {activeTab === 'TRANSFER' ? (
                    <div className="space-y-8">
                        <h3 className="text-xl font-black flex items-center gap-3 text-slate-900 dark:text-white">
                            <ArrowRightLeft className="w-6 h-6 text-cyan-500" /> {t('stockTransferTitle')}
                        </h3>

                        <div className="grid grid-cols-2 gap-8 relative">
                            {/* Decorative divider */}
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:block">
                                <div className="w-10 h-10 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 flex items-center justify-center shadow-lg">
                                    <ArrowRightLeft className="w-5 h-5 text-slate-400" />
                                </div>
                            </div>

                            {/* FROM SECTION */}
                            <div className="bg-slate-50 dark:bg-white/[0.03] p-6 rounded-3xl space-y-4 border border-slate-100 dark:border-white/5 shadow-sm">
                                <h4 className="font-black text-xs text-cyan-600 dark:text-cyan-500 uppercase tracking-[0.2em] mb-4">{t('origin')}</h4>
                                <div className="hidden">
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{t('branch')}</label>
                                    <select
                                        className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
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
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{t('warehouse')}</label>
                                    <select
                                        className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
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
                            <div className="bg-slate-50 dark:bg-white/[0.03] p-6 rounded-3xl space-y-4 border border-slate-100 dark:border-white/5 shadow-sm">
                                <h4 className="font-black text-xs text-orange-600 dark:text-orange-500 uppercase tracking-[0.2em] mb-4">{t('destination')}</h4>
                                <div className="hidden">
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{t('branch')}</label>
                                    <select
                                        className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                                        value={toBranchId}
                                        onChange={e => {
                                            setToBranchId(e.target.value);
                                            setToId(""); // Reset warehouse
                                        }}
                                        disabled={!isHQUser}
                                    >
                                        <option value="">{t('selectBranch')}</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{t('warehouse')}</label>
                                    <select
                                        className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
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
                        <div className="relative group">
                            <ScanBarcode className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-cyan-500 z-10 transition-colors" />
                            <input
                                className="glass-input w-full ps-12 py-4 font-black text-slate-900 dark:text-white rounded-2xl shadow-sm"
                                placeholder={fromId ? t('searchProductPlaceholder') : t('selectSourceFirst')}
                                disabled={!fromId}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {loadingStock && (
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                                    <span className="text-[10px] text-slate-400 dark:text-muted-foreground uppercase font-black tracking-widest">{t('loadingStock')}</span>
                                </div>
                            )}

                            {filteredProducts.length > 0 && (
                                <div className="absolute top-full left-0 w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl mt-2 z-50 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2">
                                    {filteredProducts.map(p => {
                                        const qtyInSource = sourceStock[p.id] || 0;
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => handleAddTransferItem(p)}
                                                disabled={qtyInSource <= 0}
                                                className="w-full text-right p-4 hover:bg-slate-50 dark:hover:bg-white/[0.05] text-sm flex justify-between items-center group disabled:opacity-30 disabled:grayscale transition-all"
                                            >
                                                <div>
                                                    <div className="font-black text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{p.name}</div>
                                                    <div className="text-xs font-black text-slate-400 dark:text-muted-foreground font-mono">{p.sku}</div>
                                                </div>
                                                <div className="text-left">
                                                    <div className={clsx("font-black text-lg", qtyInSource > 0 ? "text-cyan-600 dark:text-cyan-400" : "text-rose-500")}>
                                                        {qtyInSource}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 dark:text-muted-foreground uppercase font-black tracking-widest">{t('available')}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                            {transferItems.map((item, idx) => {
                                const p = products.find(prod => prod.id === item.productId);
                                const maxQty = sourceStock[item.productId] || 0;

                                return (
                                    <div key={idx} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-white/[0.02] p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm transition-all hover:shadow-md animate-in zoom-in-95 duration-200">
                                        <div className="mb-3 md:mb-0">
                                            <span className="text-base font-black block text-slate-900 dark:text-white">{p?.name || item.productId}</span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-zinc-500 rounded-md border border-slate-200 dark:border-white/5">
                                                    {p?.sku}
                                                </span>
                                                <span className="text-xs font-black text-cyan-600 dark:text-cyan-400">{t('max') || "Max"}: {maxQty}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 w-full md:w-auto">
                                            <div className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
                                                <span className="text-[10px] text-slate-400 dark:text-muted-foreground uppercase font-black tracking-widest text-center">{t('priceTier') || "Select Price"}</span>
                                                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-black/40 p-1.5 rounded-xl border border-slate-200 dark:border-white/10 flex-wrap justify-center">
                                                    {['Cost', 'Sell 1', 'Sell 2', 'Sell 3'].map(tier => {
                                                        const pVal = tier === 'Cost' ? p?.costPrice : 
                                                                   tier === 'Sell 1' ? p?.sellPrice :
                                                                   tier === 'Sell 2' ? p?.sellPrice2 : p?.sellPrice3;
                                                        
                                                        const label = `${tier.charAt(0)}${tier.includes(' ') ? tier.split(' ')[1] : ''} (${pVal ?? 0})`;
                                                        const isActive = (item.priceTier || 'Cost') === tier;
                                                        
                                                        return (
                                                            <button 
                                                                key={tier}
                                                                onClick={() => {
                                                                    const newItems = [...transferItems];
                                                                    newItems[idx].priceTier = tier;
                                                                    setTransferItems(newItems);
                                                                }}
                                                                className={clsx(
                                                                    "px-2 py-1 text-[10px] rounded-lg transition-all font-black",
                                                                    isActive ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20" : "text-slate-400 dark:text-muted-foreground hover:bg-slate-200 dark:hover:bg-white/10"
                                                                )}
                                                            >
                                                                {label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="flex items-center bg-slate-100 dark:bg-black/20 p-1 rounded-xl border border-slate-200 dark:border-white/10">
                                                <button
                                                    onClick={() => {
                                                        const newItems = [...transferItems];
                                                        newItems[idx].quantity = Math.max(1, newItems[idx].quantity - 1);
                                                        setTransferItems(newItems);
                                                    }}
                                                    className="h-10 w-10 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-zinc-700 text-xl font-black text-slate-900 dark:text-white transition-all active:scale-95"
                                                >
                                                    -
                                                </button>
                                                <input
                                                    type="number"
                                                    className="w-16 text-center bg-transparent font-black text-slate-900 dark:text-white text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    value={item.quantity}
                                                    onChange={(e) => {
                                                        let val = parseInt(e.target.value) || 0;
                                                        if (val > maxQty) val = maxQty;
                                                        const newItems = [...transferItems];
                                                        newItems[idx].quantity = Math.max(0, val);
                                                        setTransferItems(newItems);
                                                    }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newItems = [...transferItems];
                                                        newItems[idx].quantity = Math.min(maxQty, newItems[idx].quantity + 1);
                                                        setTransferItems(newItems);
                                                    }}
                                                    className="h-10 w-10 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-zinc-700 text-xl font-black text-slate-900 dark:text-white transition-all active:scale-95"
                                                >
                                                    +
                                                </button>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setTransferItems(transferItems.filter((_, i) => i !== idx));
                                                }}
                                                className="h-12 w-12 flex items-center justify-center bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all active:scale-95 shadow-sm"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            onClick={handleTransfer}
                            disabled={loading || !fromId || !toId || transferItems.length === 0}
                            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black py-4 rounded-2xl shadow-xl shadow-cyan-500/20 active:scale-95 transition-all text-lg flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale"
                        >
                            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRightLeft className="w-6 h-6" />}
                            {loading ? t('processing') : t('confirmTransfer')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <h3 className="text-xl font-black flex items-center gap-3 text-orange-600 dark:text-orange-400">
                            <AlertTriangle className="w-6 h-6" /> {t('stockAdjustmentTitle')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="hidden">
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">{t('branch')}</label>
                                <select
                                    className="glass-input w-full h-14 [&>option]:text-black font-black text-slate-900 dark:text-white"
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
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">{t('adjustmentLocation')}</label>
                                <select
                                    className="glass-input w-full h-14 [&>option]:text-black font-black text-slate-900 dark:text-white rounded-2xl"
                                    value={adjWarehouseId}
                                    onChange={e => setAdjWarehouseId(e.target.value)}
                                    disabled={!adjBranchId}
                                >
                                    <option value="">{t('selectOrigin')}</option>
                                    {adjWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">{t('adjustmentProduct')}</label>
                                <select 
                                    className="glass-input w-full h-14 [&>option]:text-black font-black text-slate-900 dark:text-white rounded-2xl" 
                                    value={adjProductId} 
                                    onChange={e => setAdjProductId(e.target.value)}
                                >
                                    <option value="">{t('selectProduct')}</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">{t('newQuantityLabel')}</label>
                                <input
                                    type="number"
                                    className="glass-input w-full h-14 font-black text-slate-900 dark:text-white rounded-2xl"
                                    placeholder={t('newQuantityPlaceholder')}
                                    value={adjNewQty}
                                    onChange={e => setAdjNewQty(e.target.value)}
                                />
                                <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-2 flex items-center gap-1.5 font-black uppercase">
                                    <AlertTriangle className="w-3 h-3" />
                                    {t('overwriteNote')}
                                </p>
                            </div>

                            <div>
                                <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">{t('reasonLabel')}</label>
                                <input
                                    className="glass-input w-full h-14 font-black text-slate-900 dark:text-white rounded-2xl"
                                    placeholder={t('reasonPlaceholder')}
                                    value={adjReason}
                                    onChange={e => setAdjReason(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleAdjustment}
                            disabled={loading || !adjWarehouseId || !adjProductId || !adjNewQty || !adjReason}
                            className="w-full bg-orange-500 hover:bg-orange-400 text-black font-black py-4 rounded-2xl shadow-xl shadow-orange-500/20 active:scale-95 transition-all text-lg flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale mt-4"
                        >
                            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Package className="w-6 h-6" />}
                            {loading ? t('processing') : t('confirmAdjustment')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
