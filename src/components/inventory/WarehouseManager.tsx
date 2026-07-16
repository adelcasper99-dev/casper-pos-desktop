"use client";

import { useState } from "react";
import { Plus, Warehouse, MapPin, Eye, Package, Edit2, Trash2, AlertCircle, Search, Loader2 } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { createWarehouse, updateWarehouse, deleteWarehouse, getWarehouseStock } from "@/actions/inventory";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n-mock";
import { toast } from "sonner";

interface Warehouse {
    id: string;
    name: string;
    address: string | null;
    isDefault: boolean;
    branch?: {
        name: string;
    } | null;
    isMaintenanceDefault?: boolean;
}

interface StockItem {
    id: string;
    name: string;
    sku: string;
    quantity: number | string;
    sellPrice: number | string;
    categoryId: string;
    categoryName: string;
}

export default function WarehouseManager({ warehouses, csrfToken, branchId, branches, isAdmin }: { warehouses: Warehouse[], csrfToken?: string, branchId?: string, branches?: {id: string, name: string}[], isAdmin?: boolean }) {
    const t = useTranslations('Inventory.warehouses');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form State (Handles both Create & Edit)
    const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [selectedBranchId, setSelectedBranchId] = useState(branchId || (branches?.[0]?.id) || "");
    const [isMaintenanceDefault, setIsMaintenanceDefault] = useState(false);

    // Delete State
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // View Stock State
    const [viewedWarehouse, setViewedWarehouse] = useState<Warehouse | null>(null);
    const [stockList, setStockList] = useState<StockItem[]>([]);
    const [stockLoading, setStockLoading] = useState(false);
    const [stockSearch, setStockSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");

    const openCreateModal = () => {
        setEditingWarehouse(null);
        setName("");
        setAddress("");
        setSelectedBranchId(branchId || (branches?.[0]?.id) || "");
        setIsMaintenanceDefault(false);
        setIsModalOpen(true);
    };

    const openEditModal = (warehouse: Warehouse) => {
        setEditingWarehouse(warehouse);
        setName(warehouse.name);
        setAddress(warehouse.address || "");
        setIsMaintenanceDefault(warehouse.isMaintenanceDefault || false);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const res = editingWarehouse
            ? await updateWarehouse({ id: editingWarehouse.id, name, address, csrfToken, isMaintenanceDefault })
            : await createWarehouse({ name, address, csrfToken, branchId: selectedBranchId, isMaintenanceDefault });

        setLoading(false);

        if (res.success) {
            setIsModalOpen(false);
            setName("");
            setAddress("");
            setEditingWarehouse(null);
        } else {
            toast.error(res.error || (editingWarehouse ? t('failUpdate') : t('failCreate')));
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(t('confirmDeleteWarehouse'))) return;

        setIsDeleting(true);
        setDeletingId(id);
        const res = await deleteWarehouse({ id, csrfToken });
        setIsDeleting(false);
        setDeletingId(null);

        if (!res.success) {
            toast.error(res.error || t('failDelete'));
        }
    };

    const handleViewStock = async (warehouse: Warehouse) => {
        setViewedWarehouse(warehouse);
        setStockLoading(true);
        setStockSearch("");
        setSelectedCategory("all");
        const res = await getWarehouseStock(warehouse.id);
        if (res.success && res.data) {
            setStockList(res.data.map((item: any) => ({
                ...item,
                quantity: Number(item.quantity || 0)
            })));
        } else {
            setStockList([]);
        }
        setStockLoading(false);
    };

    const closeStockView = () => {
        setViewedWarehouse(null);
        setStockList([]);
    };

    // Filtered and Grouped Stock
    const filteredStock = stockList.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(stockSearch.toLowerCase()) || 
                             item.sku.toLowerCase().includes(stockSearch.toLowerCase());
        const matchesCategory = selectedCategory === "all" || item.categoryName === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const categoryOptions = Array.from(new Set(stockList.map(item => item.categoryName)));

    const groupedStock = filteredStock.reduce((acc, item) => {
        if (!acc[item.categoryName]) acc[item.categoryName] = [];
        acc[item.categoryName].push(item);
        return acc;
    }, {} as Record<string, StockItem[]>);

    const totalItems = filteredStock.length;
    const totalQuantity = filteredStock.reduce((sum, item) => sum + Number(item.quantity), 0);

    const tCommon = useTranslations('Common');

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-100 dark:bg-muted/50 p-6 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                <div className="flex items-center gap-3 text-slate-500 dark:text-muted-foreground">
                    <Warehouse className="w-6 h-6 text-cyan-500" />
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-foreground">{t('title')}</h3>
                        <p className="text-sm text-slate-500 dark:text-muted-foreground font-medium">{t('subtitle')}</p>
                    </div>
                </div>

                <button
                    onClick={openCreateModal}
                    className="text-sm font-black bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    {t('addLocation')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {warehouses.map((w) => (
                    <div key={w.id} className="glass-card p-6 group hover:border-cyan-500/40 transition-all flex flex-col justify-between h-56 bg-white dark:bg-black/20 border-slate-200 dark:border-white/5 shadow-md relative rounded-2xl">
                        <div>
                            <div className="flex justify-between items-start mb-3">
                                <div className={clsx(
                                    "w-12 h-1.5 rounded-full mb-4",
                                    w.isDefault ? "bg-cyan-500 shadow-lg shadow-cyan-500/50" : "bg-slate-200 dark:bg-white/10"
                                )} />
                                <div className="flex gap-2 items-center">
                                    {w.isDefault && <span className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 px-3 py-1 rounded-full font-black border border-cyan-500/20 uppercase tracking-tighter">{t('mainLabel')}</span>}
                                    {w.isMaintenanceDefault && <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-full font-black border border-amber-500/20 uppercase tracking-tighter">صيانة</span>}
                                    {!w.isDefault && (
                                        <div className="flex gap-2 items-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all">
                                            <button
                                                onClick={() => openEditModal(w)}
                                                className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                                                title={t('editWarehouse')}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(w.id)}
                                                disabled={isDeleting && deletingId === w.id}
                                                className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-red-600 transition-colors"
                                                title={t('deleteWarehouse')}
                                            >
                                                {isDeleting && deletingId === w.id ? (
                                                    <div className="w-4 h-4 border-2 border-red-500 border-t-transparent animate-spin rounded-full" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <h4 className="font-black text-xl text-slate-900 dark:text-white mb-2 truncate tracking-tight">{w.name}</h4>
                            {w.branch && (
                                <p className="text-[10px] text-slate-400 dark:text-zinc-400 font-black mb-2 uppercase tracking-widest">
                                    {tCommon('branch') || "Branch"}: {w.branch.name}
                                </p>
                            )}

                            {w.address ? (
                                <p className="text-sm text-slate-500 dark:text-muted-foreground flex items-center gap-2 font-medium">
                                    <MapPin className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
                                    {w.address}
                                </p>
                            ) : (
                                <p className="text-sm text-slate-400 dark:text-muted-foreground italic font-medium">{t('noAddress')}</p>
                            )}
                        </div>

                        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-white/5 flex gap-3">
                            <button
                                onClick={() => handleViewStock(w)}
                                className="flex-1 text-sm bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-400 py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-200 dark:border-white/10 font-black active:scale-95"
                            >
                                <Eye className="w-4 h-4" /> {t('viewStock')}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* CREATE / EDIT MODAL */}
            <GlassModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingWarehouse ? t('editWarehouse') : t('newWarehouseTitle')}
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">{t('nameLabel')}</label>
                        <input
                            className="glass-input w-full font-black text-slate-900 dark:text-white"
                            placeholder={t('namePlaceholder')}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">{t('addressLabel')}</label>
                        <input
                            className="glass-input w-full font-black text-slate-900 dark:text-white"
                            placeholder={t('addressPlaceholder')}
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                        />
                    </div>
                    {branches && !editingWarehouse && (
                        <div>
                            <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">الفرع التابع له</label>
                            <select
                                className="glass-input w-full font-black text-slate-900 dark:text-white bg-white dark:bg-black/20"
                                value={selectedBranchId}
                                onChange={e => setSelectedBranchId(e.target.value)}
                                required
                            >
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {isAdmin && (
                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10">
                            <input
                                type="checkbox"
                                id="isMaintenanceDefault"
                                className="w-5 h-5 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                                checked={isMaintenanceDefault}
                                onChange={(e) => setIsMaintenanceDefault(e.target.checked)}
                            />
                            <label htmlFor="isMaintenanceDefault" className="text-sm font-black text-slate-700 dark:text-slate-300 cursor-pointer">
                                مستودع الصيانة الرئيسي (يستقبل قطع غيار المهندسين المرتجعة)
                            </label>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black py-4 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all mt-4"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                            editingWarehouse
                                ? <><Edit2 className="w-5 h-5" /> {t('updateWarehouse')}</>
                                : <><Plus className="w-5 h-5" /> {t('createWarehouse')}</>
                        )}
                    </button>
                </form>
            </GlassModal>

            <GlassModal
                isOpen={!!viewedWarehouse}
                onClose={closeStockView}
                title={t('stockInWarehouse', { name: viewedWarehouse?.name || '...' })}
            >
                <div className="space-y-6">
                    {/* Filter Bar */}
                    <div className="flex gap-3">
                        <div className="relative flex-1 group">
                            <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500 group-focus-within:text-cyan-500 transition-colors" />
                            <input 
                                type="text"
                                className="glass-input w-full ps-12 py-3 text-sm font-black text-slate-900 dark:text-white"
                                placeholder={t('search')}
                                value={stockSearch}
                                onChange={(e) => setStockSearch(e.target.value)}
                            />
                        </div>
                        <select 
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="glass-input text-xs py-3 px-4 bg-white dark:bg-zinc-900 border-slate-200 dark:border-white/10 font-black text-slate-900 dark:text-white rounded-xl"
                        >
                            <option value="all">{t('allCategories')}</option>
                            {categoryOptions.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/10 text-center shadow-sm">
                            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-black tracking-widest mb-1">{t('totalItems')}</div>
                            <div className="text-xl font-black text-cyan-600 dark:text-cyan-400">{totalItems}</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/10 text-center shadow-sm">
                            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-black tracking-widest mb-1">{t('totalQuantity')}</div>
                            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">{totalQuantity}</div>
                        </div>
                    </div>

                    {stockLoading ? (
                        <div className="p-12 text-center text-slate-400 dark:text-muted-foreground font-black animate-pulse flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                            {t('loadingStock')}
                        </div>
                    ) : (
                        <div className="overflow-hidden">
                            {filteredStock.length === 0 ? (
                                <div className="p-16 text-center text-slate-300 dark:text-zinc-600 flex flex-col items-center">
                                    <Package className="w-16 h-16 opacity-10 mb-4" />
                                    <p className="font-black text-lg">{t('noStockFound')}</p>
                                </div>
                            ) : (
                                <div className="max-h-[55vh] overflow-y-auto pr-3 space-y-6 custom-scrollbar scroll-smooth">
                                    {Object.entries(groupedStock).map(([category, items]) => (
                                        <div key={category} className="space-y-3">
                                            <div className="flex items-center gap-3 px-1">
                                                <div className="h-px flex-1 bg-slate-100 dark:bg-white/5" />
                                                <span className="text-[10px] font-black text-slate-400 dark:text-muted-foreground uppercase tracking-[0.2em] bg-slate-50 dark:bg-white/5 px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/10 shadow-sm">
                                                    {category}
                                                </span>
                                                <div className="h-px flex-1 bg-slate-100 dark:bg-white/5" />
                                            </div>
                                            
                                            {items.map(item => (
                                                <div key={item.id} className="flex justify-between items-center bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/[0.05] p-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm transition-all group/item">
                                                    <div>
                                                        <div className="font-black text-base text-slate-900 dark:text-white group-hover/item:text-cyan-600 dark:group-hover/item:text-cyan-400 transition-colors">{item.name}</div>
                                                        <div className="text-[10px] font-black text-slate-400 dark:text-muted-foreground font-mono uppercase tracking-wider">{item.sku}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={clsx(
                                                            "font-black text-2xl tracking-tight",
                                                            Number(item.quantity) < 5 ? "text-rose-500" : "text-cyan-600 dark:text-cyan-400"
                                                        )}>
                                                            {Number.isInteger(Number(item.quantity)) ? Number(item.quantity) : Number(item.quantity).toFixed(3).replace(/\.?0+$/, '')}
                                                        </div>
                                                        <div className="text-[10px] font-black text-slate-400 dark:text-muted-foreground uppercase tracking-widest">{t('inStock')}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </GlassModal>
        </div>
    );
}
