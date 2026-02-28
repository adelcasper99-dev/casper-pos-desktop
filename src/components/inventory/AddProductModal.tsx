"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Save, Wand2, Package, Box, Infinity as InfinityIcon, X } from "lucide-react";
import { createProduct, generateNextSku, seedBundleCategory } from "@/actions/inventory";
import GlassModal from "../ui/GlassModal";
import { Combobox } from "@/components/ui/combobox";

interface Category {
    id: string;
    name: string;
}

interface Product {
    id: string;
    name: string;
    sku: string;
    costPrice: number;
    sellPrice: number;
    stock: number;
    isBundle?: boolean;
}

interface BundleItemRow {
    componentProductId: string;
    quantityIncluded: number;
}

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: Category[];
    allProducts: Product[];
    csrfToken?: string;
    onSuccess?: () => void;
}

const EMPTY_FORM = {
    sku: "",
    name: "",
    categoryId: "",
    costPrice: 0,
    sellPrice: 0,
    sellPrice2: 0,
    sellPrice3: 0,
    stock: 0,
    minStock: 0,
    trackStock: false,
    isBundle: true,
    description: "",
};

export default function AddProductModal({
    isOpen,
    onClose,
    categories,
    allProducts,
    csrfToken,
    onSuccess,
}: AddProductModalProps) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [bundleItems, setBundleItems] = useState<BundleItemRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [generatingSku, setGeneratingSku] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter out bundles from component candidates
    const componentCandidates = allProducts.filter(p => !(p as any).isBundle);

    // Auto-calculate bundle cost from selected components
    const computedBundleCost = bundleItems.reduce((total, row) => {
        const comp = componentCandidates.find(p => p.id === row.componentProductId);
        if (!comp) return total;
        return total + comp.costPrice * row.quantityIncluded;
    }, 0);

    // Keep costPrice in sync with bundle components
    useEffect(() => {
        setForm(f => ({ ...f, costPrice: computedBundleCost }));
    }, [computedBundleCost]);

    // Ensure category exists and auto-select
    useEffect(() => {
        if (isOpen) {
            seedBundleCategory({ csrfToken } as any).catch(() => {});
            const bundleCat = categories.find(c => c.name === "العروض والباقات");
            if (bundleCat && form.categoryId === "") {
                setForm(f => ({ ...f, categoryId: bundleCat.id }));
            }
        }
    }, [isOpen, categories, form.categoryId, csrfToken]);

    const handleAutoSku = async () => {
        setGeneratingSku(true);
        const res = await generateNextSku();
        if (res.success && res.sku) setForm(f => ({ ...f, sku: res.sku as string }));
        setGeneratingSku(false);
    };

    const handleAddComponent = () => {
        setBundleItems(prev => [...prev, { componentProductId: "", quantityIncluded: 1 }]);
    };

    const handleRemoveComponent = (idx: number) => {
        setBundleItems(prev => prev.filter((_, i) => i !== idx));
    };

    const handleComponentChange = (idx: number, field: keyof BundleItemRow, value: string | number) => {
        setBundleItems(prev => prev.map((row, i) =>
            i === idx ? { ...row, [field]: value } : row
        ));
    };



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!form.sku.trim()) { setError("SKU مطلوب"); return; }
        if (!form.name.trim()) { setError("اسم المنتج مطلوب"); return; }
        if (!form.categoryId) { setError("يرجى اختيار تصنيف"); return; }
        if (bundleItems.length === 0) { setError("أضف منتجاً واحداً على الأقل للباقة"); return; }
        if (bundleItems.some(b => !b.componentProductId)) {
            setError("يرجى اختيار منتج لكل عنصر في الباقة"); return;
        }

        setLoading(true);
        try {
            const result = await createProduct({
                sku: form.sku.trim(),
                name: form.name.trim(),
                categoryId: form.categoryId || undefined,
                costPrice: computedBundleCost,
                sellPrice: Number(form.sellPrice),
                sellPrice2: Number(form.sellPrice2) || 0,
                sellPrice3: Number(form.sellPrice3) || 0,
                stock: 0,
                minStock: 0,
                trackStock: false,
                isBundle: true,
                bundleItems: bundleItems.map(b => ({
                    componentProductId: b.componentProductId,
                    quantityIncluded: Number(b.quantityIncluded),
                })),
                csrfToken,
            } as any);

            if (result && result.success) {
                setForm(EMPTY_FORM);
                setBundleItems([]);
                onSuccess?.();
                onClose();
            } else {
                setError((result as any)?.error || (result as any)?.message || "فشل إنشاء المنتج");
            }
        } catch (err: any) {
            setError(err.message || "حدث خطأ");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setForm(EMPTY_FORM);
        setBundleItems([]);
        setError(null);
        onClose();
    };

    return (
        <GlassModal isOpen={isOpen} onClose={handleClose} title="إضافة باقة / عرض جديد">
            <form onSubmit={handleSubmit} className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
                {/* SKU + Name */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 flex justify-between">
                            SKU
                            <button
                                type="button"
                                onClick={handleAutoSku}
                                disabled={generatingSku}
                                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                            >
                                {generatingSku ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                تلقائي
                            </button>
                        </label>
                        <input
                            className="glass-input w-full"
                            value={form.sku}
                            onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                            placeholder="SKU-001"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">التصنيف</label>
                        <select
                            className="glass-input w-full [&>option]:text-black"
                            value={form.categoryId}
                            onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                        >
                            <option value="">اختر تصنيفاً</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">اسم المنتج</label>
                    <input
                        className="glass-input w-full"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="اسم المنتج"
                    />
                </div>

                {/* Prices */}
                <div className="grid grid-cols-4 gap-2">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">التكلفة</label>
                        <input
                            type="number"
                            className="glass-input w-full opacity-60 cursor-not-allowed"
                            value={computedBundleCost.toFixed(2)}
                            readOnly
                        />
                        <div className="text-[10px] text-amber-400 mt-0.5">محسوب تلقائياً من المكونات</div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">سعر البيع</label>
                        <input type="number" className="glass-input w-full" value={form.sellPrice}
                            onChange={e => setForm(f => ({ ...f, sellPrice: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">سعر 2</label>
                        <input type="number" className="glass-input w-full" value={form.sellPrice2}
                            onChange={e => setForm(f => ({ ...f, sellPrice2: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">سعر 3</label>
                        <input type="number" className="glass-input w-full" value={form.sellPrice3}
                            onChange={e => setForm(f => ({ ...f, sellPrice3: parseFloat(e.target.value) || 0 }))} />
                    </div>
                </div>


                {/* Bundle Components Table */}
                <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-amber-400 uppercase font-bold">مكونات الباقة</label>
                            <button
                                type="button"
                                onClick={handleAddComponent}
                                className="flex items-center gap-1 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                <Plus className="w-3 h-3" /> إضافة منتج
                            </button>
                        </div>

                        {bundleItems.length === 0 && (
                            <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                                انقر على "إضافة منتج" لإضافة مكونات الباقة
                            </div>
                        )}

                        {bundleItems.map((row, idx) => {
                            const selectedComp = componentCandidates.find(p => p.id === row.componentProductId);
                            return (
                                <div key={idx} className="flex items-center gap-2 p-3 bg-muted/20 rounded-xl border border-border">
                                    <div className="flex-1">
                                        <Combobox
                                            options={componentCandidates.map(p => ({
                                                label: `${p.name} — مخزون: ${p.stock}`,
                                                value: p.id
                                            }))}
                                            value={row.componentProductId}
                                            onChange={(val: string) => handleComponentChange(idx, "componentProductId", val)}
                                            placeholder="اختر منتجاً..."
                                        />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <label className="text-xs text-muted-foreground whitespace-nowrap">الكمية:</label>
                                        <input
                                            type="number"
                                            min={1}
                                            className="glass-input w-16 text-center"
                                            value={row.quantityIncluded}
                                            onChange={e => handleComponentChange(idx, "quantityIncluded", parseInt(e.target.value) || 1)}
                                        />
                                    </div>
                                    {selectedComp && (
                                        <div className="text-xs text-muted-foreground whitespace-nowrap min-w-[60px] text-end">
                                            {(selectedComp.costPrice * row.quantityIncluded).toFixed(2)}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveComponent(idx)}
                                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}

                        {bundleItems.length > 0 && (
                            <div className="flex justify-end gap-2 text-sm font-bold text-amber-400 border-t border-border pt-2">
                                <span>إجمالي التكلفة:</span>
                                <span>{computedBundleCost.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                {/* Error */}
                {error && (
                    <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm flex items-center gap-2">
                        <X className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <button type="button" onClick={handleClose}
                        className="px-4 py-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
                        إلغاء
                    </button>
                    <button type="submit" disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-colors bg-amber-500 hover:bg-amber-400 text-black">
                        {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                        حفظ المنتج
                    </button>
                </div>
            </form>
        </GlassModal>
    );
}
