"use client";

import { useTranslations } from "@/lib/i18n-mock";
import { Search, Wand2, Plus } from "lucide-react";
import { clsx } from "clsx";
import { Combobox } from "@/components/ui/combobox";
import CategoryModal from "../CategoryModal";
import { useState } from "react";

// Define the Product type for existing item props
interface Product {
    id: string;
    name: string;
    sku: string;
    stock: number;
    costPrice: number;
    sellPrice: number;
    sellPrice2?: number;
    sellPrice3?: number;
}

interface Category {
    id: string;
    name: string;
}

interface PurchaseItemEntryProps {
    entryMode: 'SEARCH' | 'NEW';
    onModeChange: (mode: 'SEARCH' | 'NEW') => void;

    // Search Mode Stats
    itemSearch: string;
    onItemSearchChange: (val: string) => void;
    filteredProducts: Product[];
    onSelectExisting: (product: Product) => void;

    // New Item State
    newItemSku: string;
    setNewItemSku: (val: string) => void;
    newItemName: string;
    setNewItemName: (val: string) => void;
    newItemCategoryId: string;
    setNewItemCategoryId: (val: string) => void;

    newItemCost: string;
    setNewItemCost: (val: string) => void;
    newItemQty: string;
    setNewItemQty: (val: string) => void;

    newItemSellPrice: string;
    setNewItemSellPrice: (val: string) => void;
    newItemSellPrice2: string;
    setNewItemSellPrice2: (val: string) => void;
    newItemSellPrice3: string;
    setNewItemSellPrice3: (val: string) => void;

    categories: Category[];
    onAutoSku: () => void;
    onAddNewSubmit: () => void; // Trigger for "Add" button
    csrfToken?: string;
}

export function PurchaseItemEntry({
    entryMode,
    onModeChange,
    itemSearch,
    onItemSearchChange,
    filteredProducts = [],
    onSelectExisting,
    newItemSku,
    setNewItemSku,
    newItemName,
    setNewItemName,
    newItemCategoryId,
    setNewItemCategoryId,
    newItemCost,
    setNewItemCost,
    newItemQty,
    setNewItemQty,
    newItemSellPrice,
    setNewItemSellPrice,
    newItemSellPrice2,
    setNewItemSellPrice2,
    newItemSellPrice3,
    setNewItemSellPrice3,
    categories,
    onAutoSku,
    onAddNewSubmit,
    csrfToken
}: PurchaseItemEntryProps) {
    const t = useTranslations('Purchasing');
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    const categoryOptions = categories.map(c => ({ label: c.name, value: c.id }));

    return (
        <div className="bg-muted/30 rounded-xl p-4 border border-border">
            {/* Toggle Header */}
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold flex items-center gap-2">{t('addItems')}</h3>
                <div className="flex bg-muted/50 rounded-lg p-1 border border-border">
                    <button
                        onClick={() => onModeChange('SEARCH')}
                        className={clsx("px-3 py-1 text-xs font-bold rounded-md transition-all", entryMode === 'SEARCH' ? "bg-cyan-500 text-black" : "text-muted-foreground hover:text-cyan-500 hover:bg-cyan-500/10")}
                    >
                        {t('searchStock')}
                    </button>
                    <button
                        onClick={() => onModeChange('NEW')}
                        className={clsx("px-3 py-1 text-xs font-bold rounded-md transition-all", entryMode === 'NEW' ? "bg-cyan-500 text-black" : "text-muted-foreground hover:text-cyan-500 hover:bg-cyan-500/10")}
                    >
                        {t('newItem')}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-4 items-end">
                {entryMode === 'SEARCH' ? (
                    <div className="flex-1 relative">
                        {/* Input matching WarehouseOps style */}
                        <div className="relative">
                            <Search className="absolute start-3 top-3 w-4 h-4 text-muted-foreground" />
                            <input
                                className="glass-input w-full ps-12"
                                placeholder={t('searchPlaceholder')}
                                value={itemSearch}
                                onChange={(e) => onItemSearchChange(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {filteredProducts.length > 0 && (
                            <div className="absolute top-full left-0 w-full bg-popover border border-border rounded-xl mt-1 p-1 shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                                {filteredProducts.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => onSelectExisting(p)}
                                        className="w-full text-left p-2.5 hover:bg-muted/50 rounded-lg flex justify-between items-center text-sm group"
                                    >
                                        <div>
                                            <div className="font-bold text-foreground">{p.name}</div>
                                            <div className="text-muted-foreground text-xs font-mono">{p.sku}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className={clsx("font-bold font-mono", p.stock > 0 ? "text-cyan-500" : "text-red-500")}>
                                                {p.stock}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground uppercase">In Stock</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* New Item Form - Grid Layout for better spacing */}
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                            {/* SKU */}
                            <div className="">
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 flex justify-between">
                                    {t('sku')} *
                                    <button onClick={onAutoSku} className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                                        <Wand2 className="w-3 h-3" /> {t('auto')}
                                    </button>
                                </label>
                                <input
                                    className="glass-input w-full text-xs"
                                    placeholder="CODE"
                                    value={newItemSku}
                                    onChange={e => setNewItemSku(e.target.value)}
                                />
                            </div>

                            {/* Name */}
                            <div className="lg:col-span-2">
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('name')} *</label>
                                <input
                                    className="glass-input w-full text-xs"
                                    placeholder={t('name')}
                                    value={newItemName}
                                    onChange={e => setNewItemName(e.target.value)}
                                />
                            </div>

                            {/* Category */}
                            <div className="relative">
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('category')}</label>
                                <Combobox
                                    options={categoryOptions}
                                    value={newItemCategoryId}
                                    onChange={setNewItemCategoryId}
                                    placeholder={t('select')}
                                    className="h-9 [&_.glass-input]:h-9 [&_.glass-input]:text-xs"
                                />
                                <div className="absolute -right-6 top-6">
                                    <button
                                        onClick={() => setIsCategoryModalOpen(true)}
                                        className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-500 p-1.5 rounded-lg transition-colors"
                                        title={t('newCategory')}
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Cost */}
                            <div className="">
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('cost')}</label>
                                <input
                                    type="number"
                                    className="glass-input w-full text-xs"
                                    placeholder="0.00"
                                    value={newItemCost}
                                    onChange={e => setNewItemCost(e.target.value)}
                                />
                            </div>

                            {/* Qty */}
                            <div className="">
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('qty')}</label>
                                <input
                                    type="number"
                                    className="glass-input w-full text-xs"
                                    placeholder="1"
                                    value={newItemQty}
                                    onChange={e => setNewItemQty(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') onAddNewSubmit();
                                    }}
                                />
                            </div>

                            {/* Prices */}
                            <div className="lg:col-span-2">
                                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('sellPrices')} (1 / 2 / 3)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <input
                                        type="number"
                                        className="glass-input w-full text-xs text-center"
                                        placeholder="P1"
                                        value={newItemSellPrice}
                                        onChange={e => setNewItemSellPrice(e.target.value)}
                                    />
                                    <input
                                        type="number"
                                        className="glass-input w-full text-xs text-center"
                                        placeholder="P2"
                                        value={newItemSellPrice2}
                                        onChange={e => setNewItemSellPrice2(e.target.value)}
                                    />
                                    <input
                                        type="number"
                                        className="glass-input w-full text-xs text-center"
                                        placeholder="P3"
                                        value={newItemSellPrice3}
                                        onChange={e => setNewItemSellPrice3(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') onAddNewSubmit();
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Add Button - Mobile Only or Explicit Action */}
                            <div className="lg:col-span-4 flex justify-end mt-2">
                                <button
                                    onClick={onAddNewSubmit}
                                    className="bg-cyan-500 hover:bg-cyan-400 text-black px-8 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    {t('addItems')}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
            {/* Category Modal */}
            <CategoryModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                csrfToken={csrfToken}
                onSuccess={(newCategory) => {
                    setNewItemCategoryId(newCategory.id);
                }}
            />
        </div>
    );
}
