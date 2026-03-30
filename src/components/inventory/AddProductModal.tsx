"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Save, Wand2, Package, Box, Infinity as InfinityIcon, X } from "lucide-react";
import { createProduct, generateNextSku, seedBundleCategory } from "@/actions/inventory";
import GlassModal from "../ui/GlassModal";
import { Combobox } from "@/components/ui/combobox";
import { useTranslations } from "@/lib/i18n-mock";

interface Category {
    id: string;
    name: string;
}

interface Unit {
    id: string;
    name: string;
    code: string;
    category: string;
    abbreviation?: string;
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
    units?: Unit[];
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
    unitOfMeasureId: "",
};

export default function AddProductModal({
    isOpen,
    onClose,
    categories,
    allProducts,
    units = [],
    csrfToken,
    onSuccess,
}: AddProductModalProps) {
    const t = useTranslations('Inventory.products');
    const tCommon = useTranslations('Common');
    const [form, setForm] = useState(EMPTY_FORM);
    const [bundleItems, setBundleItems] = useState<BundleItemRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [generatingSku, setGeneratingSku] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Group units by category
    const unitsByCategory = units.reduce((acc, unit) => {
        const cat = unit.category || 'COUNT';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(unit);
        return acc;
    }, {} as Record<string, Unit[]>);

    // Get unit options with group labels
    const unitOptions = Object.entries(unitsByCategory).flatMap(([category, catUnits]) => [
        { label: `--- ${category} ---`, value: '', disabled: true },
        ...catUnits.map(u => ({ label: `${u.name} (${u.code})`, value: u.id }))
    ]);

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
                unitOfMeasureId: form.unitOfMeasureId || undefined,
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
            <form onSubmit={handleSubmit} className="space-y-6 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
                {/* SKU + Name */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 flex justify-between tracking-widest">
                            SKU
                            <button
                                type="button"
                                onClick={handleAutoSku}
                                disabled={generatingSku}
                                className="text-[10px] text-cyan-500 dark:text-cyan-400 hover:text-cyan-400 flex items-center gap-1 font-black transition-colors"
                            >
                                {generatingSku ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                {tCommon('auto') || "تلقائي"}
                            </button>
                        </label>
                        <input
                            className="glass-input w-full font-black text-slate-900 dark:text-white"
                            value={form.sku}
                            onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                            placeholder="SKU-001"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{tCommon('category') || "التصنيف"}</label>
                        <select
                            className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                            value={form.categoryId}
                            onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                        >
                            <option value="">اختر تصنيفاً</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">وحدة القياس</label>
                    <select
                        className="glass-input w-full [&>option]:text-black font-black text-slate-900 dark:text-white"
                        value={form.unitOfMeasureId}
                        onChange={e => setForm(f => ({ ...f, unitOfMeasureId: e.target.value }))}
                    >
                        <option value="">بدون وحدة</option>
                        {Object.entries(unitsByCategory).map(([category, catUnits]) => (
                            <optgroup key={category} label={category}>
                                {catUnits.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{tCommon('name') || "اسم المنتج"}</label>
                    <input
                        className="glass-input w-full font-black text-slate-900 dark:text-white"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="اسم الباقة"
                    />
                </div>

                {/* Prices */}
                <div className="grid grid-cols-4 gap-3">
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{tCommon('cost') || "التكلفة"}</label>
                        <div className="relative">
                            <input
                                type="number"
                                className="glass-input w-full bg-slate-100 dark:bg-white/5 opacity-80 cursor-not-allowed font-black text-slate-600 dark:text-zinc-400"
                                value={computedBundleCost.toFixed(2)}
                                readOnly
                            />
                        </div>
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 font-black uppercase tracking-tighter leading-tight">محسوب تلقائياً من المكونات</div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{tCommon('price1') || "سعر البيع"}</label>
                        <input type="number" className="glass-input w-full font-black text-slate-900 dark:text-white" value={form.sellPrice}
                            onChange={e => setForm(f => ({ ...f, sellPrice: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{tCommon('price2') || "سعر 2"}</label>
                        <input type="number" className="glass-input w-full font-black text-slate-900 dark:text-white" value={form.sellPrice2}
                            onChange={e => setForm(f => ({ ...f, sellPrice2: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-1.5 block tracking-widest">{tCommon('price3') || "سعر 3"}</label>
                        <input type="number" className="glass-input w-full font-black text-slate-900 dark:text-white" value={form.sellPrice3}
                            onChange={e => setForm(f => ({ ...f, sellPrice3: parseFloat(e.target.value) || 0 }))} />
                    </div>
                </div>


                {/* Bundle Components Table */}
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-amber-600 dark:text-amber-500 uppercase font-black tracking-widest flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                مكونات الباقة
                            </label>
                            <button
                                type="button"
                                onClick={handleAddComponent}
                                className="flex items-center gap-2 text-xs bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl font-black transition-all shadow-lg shadow-amber-500/20 active:scale-95"
                            >
                                <Plus className="w-4 h-4" /> إضافة منتج مكوّن
                            </button>
                        </div>

                        {bundleItems.length === 0 && (
                            <div className="text-center py-10 text-slate-400 dark:text-muted-foreground text-sm border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl flex flex-col items-center gap-2">
                                <Box className="w-8 h-8 opacity-20" />
                                <p className="font-black">انقر على "إضافة منتج" لبناء مكونات الباقة</p>
                            </div>
                        )}

                        <div className="space-y-3">
                        {bundleItems.map((row, idx) => {
                            const selectedComp = componentCandidates.find(p => p.id === row.componentProductId);
                            return (
                                <div key={idx} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-white/[0.03] rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm transition-all hover:bg-white dark:hover:bg-white/[0.05] group/row">
                                    <div className="flex-1">
                                        <Combobox
                                            options={componentCandidates.map(p => ({
                                                label: `${p.name} — مخزون: ${p.stock}`,
                                                value: p.id
                                            }))}
                                            value={row.componentProductId}
                                            onChange={(val: string) => handleComponentChange(idx, "componentProductId", val)}
                                            placeholder="اختر منتجاً للعرض..."
                                        />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <label className="text-xs text-slate-500 dark:text-muted-foreground font-black uppercase tracking-tight">الكمية:</label>
                                        <input
                                            type="number"
                                            min={1}
                                            className="glass-input w-20 text-center font-black text-slate-900 dark:text-white"
                                            value={row.quantityIncluded}
                                            onChange={e => handleComponentChange(idx, "quantityIncluded", parseInt(e.target.value) || 1)}
                                        />
                                    </div>
                                    {selectedComp && (
                                        <div className="text-xs text-slate-600 dark:text-muted-foreground whitespace-nowrap min-w-[70px] text-end font-black">
                                            {(selectedComp.costPrice * row.quantityIncluded).toFixed(2)} {tCommon('currency') || "EGP"}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveComponent(idx)}
                                        className="p-2.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all active:scale-90"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                        </div>

                        {bundleItems.length > 0 && (
                            <div className="flex justify-end items-center gap-3 text-sm font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-white/5 p-4 rounded-xl border border-amber-100 dark:border-amber-500/10 shadow-sm">
                                <span className="uppercase tracking-widest text-xs">إجمالي تكلفة المكونات:</span>
                                <span className="text-xl tracking-tight">{computedBundleCost.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                {/* Error */}
                {error && (
                    <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl text-rose-600 dark:text-rose-400 text-sm font-black flex items-center gap-3 animate-in shake duration-300">
                        <X className="w-5 h-5 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-white/5">
                    <button type="button" onClick={handleClose}
                        className="px-6 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-muted-foreground font-black transition-all active:scale-95">
                        إلغاء
                    </button>
                    <button type="submit" disabled={loading}
                        className="flex items-center gap-3 px-8 py-3 rounded-xl font-black transition-all bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-30">
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                        حفظ الباقة
                    </button>
                </div>
            </form>
        </GlassModal>
    );
}
