"use client";

import { useState } from "react";
import { Plus, Warehouse, MapPin, Eye, Package, Edit2, Trash2, AlertCircle, Search } from "lucide-react";
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
}

interface StockItem {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    sellPrice: number;
    categoryId: string;
    categoryName: string;
}

export default function WarehouseManager({ warehouses, csrfToken, branchId }: { warehouses: Warehouse[], csrfToken?: string, branchId?: string }) {
    const t = useTranslations('Inventory.warehouses');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form State (Handles both Create & Edit)
    const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");

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
        setIsModalOpen(true);
    };

    const openEditModal = (warehouse: Warehouse) => {
        setEditingWarehouse(warehouse);
        setName(warehouse.name);
        setAddress(warehouse.address || "");
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const res = editingWarehouse
            ? await updateWarehouse({ id: editingWarehouse.id, name, address, csrfToken })
            : await createWarehouse({ name, address, csrfToken, branchId });

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
            setStockList(res.data);
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
    const totalQuantity = filteredStock.reduce((sum, item) => sum + item.quantity, 0);

    const tCommon = useTranslations('Common');

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-2xl border border-border" dir="rtl">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Warehouse className="w-5 h-5 text-cyan-400" />
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('title')}</h3>
                        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
                    </div>
                </div>

                <button
                    onClick={openCreateModal}
                    className="text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                >
                    <Plus className="w-4 h-4" />
                    {t('addLocation')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {warehouses.map((w) => (
                    <div key={w.id} className="glass-card p-5 group hover:border-cyan-500/30 transition-all flex flex-col justify-between h-48 bg-card border-border relative">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div className={clsx(
                                    "w-10 h-1 rounded-full mb-3",
                                    w.isDefault ? "bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" : "bg-muted-foreground/30"
                                )} />
                                <div className="flex gap-2 items-center">
                                    {w.isDefault && <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full font-bold border border-cyan-500/20">{t('mainLabel')}</span>}
                                    {!w.isDefault && (
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => openEditModal(w)}
                                                className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-cyan-400"
                                                title={t('editWarehouse')}
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(w.id)}
                                                disabled={isDeleting && deletingId === w.id}
                                                className="p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive"
                                                title={t('deleteWarehouse')}
                                            >
                                                {isDeleting && deletingId === w.id ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-destructive border-t-transparent animate-spin rounded-full" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <h4 className="font-bold text-lg text-foreground mb-1 truncate">{w.name}</h4>
                            {w.branch && (
                                <p className="text-[10px] text-zinc-400 font-bold mb-1 uppercase tracking-wider">
                                    الفرع: {w.branch.name}
                                </p>
                            )}

                            {w.address ? (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-muted-foreground" />
                                    {w.address}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">{t('noAddress')}</p>
                            )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-border flex gap-2">
                            <button
                                onClick={() => handleViewStock(w)}
                                className="flex-1 text-xs bg-muted/50 hover:bg-muted text-muted-foreground py-2 rounded-lg flex items-center justify-center gap-2 transition-colors border border-border"
                            >
                                <Eye className="w-3 h-3" /> {t('viewStock')}
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
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('nameLabel')}</label>
                        <input
                            className="glass-input w-full"
                            placeholder={t('namePlaceholder')}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('addressLabel')}</label>
                        <input
                            className="glass-input w-full"
                            placeholder={t('addressPlaceholder')}
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl flex justify-center items-center gap-2"
                    >
                        {loading ? t('saving') : (
                            editingWarehouse
                                ? <><Edit2 className="w-4 h-4" /> {t('updateWarehouse')}</>
                                : <><Plus className="w-4 h-4" /> {t('createWarehouse')}</>
                        )}
                    </button>
                </form>
            </GlassModal>

            <GlassModal
                isOpen={!!viewedWarehouse}
                onClose={closeStockView}
                title={t('stockInWarehouse', { name: viewedWarehouse?.name || '...' })}
            >
                <div className="space-y-4">
                    {/* Filter Bar */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
                            <input 
                                type="text"
                                className="glass-input w-full ps-9 py-2 text-sm"
                                placeholder={t('search')}
                                value={stockSearch}
                                onChange={(e) => setStockSearch(e.target.value)}
                            />
                        </div>
                        <select 
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="glass-input text-xs py-2 bg-zinc-900 border-border"
                        >
                            <option value="all">{t('allCategories')}</option>
                            {categoryOptions.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/5 p-2 rounded-xl border border-white/10 text-center">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold">{t('totalItems')}</div>
                            <div className="text-sm font-bold text-cyan-400">{totalItems}</div>
                        </div>
                        <div className="bg-white/5 p-2 rounded-xl border border-white/10 text-center">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold">{t('totalQuantity')}</div>
                            <div className="text-sm font-bold text-green-400">{totalQuantity}</div>
                        </div>
                    </div>

                    {stockLoading ? (
                        <div className="p-8 text-center text-muted-foreground">{t('loadingStock')}</div>
                    ) : (
                        <div className="overflow-hidden">
                            {filteredStock.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                                    <Package className="w-8 h-8 opacity-20 mb-2" />
                                    <p>{t('noStockFound')}</p>
                                </div>
                            ) : (
                                <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                                    {Object.entries(groupedStock).map(([category, items]) => (
                                        <div key={category} className="space-y-2">
                                            <div className="flex items-center gap-2 px-1">
                                                <div className="h-px flex-1 bg-white/5" />
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                                                    {category}
                                                </span>
                                                <div className="h-px flex-1 bg-white/5" />
                                            </div>
                                            
                                            {items.map(item => (
                                                <div key={item.id} className="flex justify-between items-center bg-muted/30 hover:bg-muted/50 p-3 rounded-xl border border-border transition-colors">
                                                    <div>
                                                        <div className="font-bold text-sm text-foreground">{item.name}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">{item.sku}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={clsx(
                                                            "font-bold text-lg",
                                                            item.quantity < 5 ? "text-destructive" : "text-cyan-400"
                                                        )}>
                                                            {item.quantity}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-tight">{t('inStock')}</div>
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
