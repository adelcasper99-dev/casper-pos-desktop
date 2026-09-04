"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Save, Wand2, Package, Box, Infinity as InfinityIcon, X } from "lucide-react";
import { createProduct, generateNextSku, seedBundleCategory } from "@/actions/inventory";
import GlassModal from "../ui/GlassModal";
import { Combobox } from "@/components/ui/combobox";
import { AsyncCreatableSelect } from "@/components/ui/async-creatable-select";
import { useTranslations } from "@/lib/i18n-mock";
import { cn } from "@/lib/utils";

import { Product, Category, Unit } from "@/types/product";

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
    models?: any[];
    attributes?: any[];
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
    modelId: "",
    attributeId: "",
};

export default function AddProductModal({
    isOpen,
    onClose,
    categories,
    allProducts,
    units = [],
    models = [],
    attributes = [],
    csrfToken,
    features = {},
    onSuccess,
}: any) {
    const updateDerivedName = (currentForm: any) => {
        const cat = categories.find((c: Category) => c.id === currentForm.categoryId);
        const mod = models.find((m: any) => m.id === currentForm.modelId);
        const attr = attributes.find((a: any) => a.id === currentForm.attributeId);
        
        let newName = currentForm.name;
        if (cat || mod || attr || currentForm.description) {
            const parts: string[] = [];
            if (cat) parts.push(cat.name);
            if (mod) parts.push(mod.name);
            if (attr) parts.push(attr.name);
            if (currentForm.description) parts.push(currentForm.description);
            newName = parts.join(' - ');
        }
        return newName;
    };
    const t = useTranslations('Inventory.products');
    const tCommon = useTranslations('Common');
    const [form, setForm] = useState(EMPTY_FORM);
    const [bundleItems, setBundleItems] = useState<BundleItemRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [generatingSku, setGeneratingSku] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Group units by category
    const unitsByCategory = units.reduce((acc: Record<string, Unit[]>, unit: Unit) => {
        const cat = unit.category || 'COUNT';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(unit);
        return acc;
    }, {} as Record<string, Unit[]>);

    // Get unit options with group labels
    const unitOptions = (Object.entries(unitsByCategory) as [string, Unit[]][]).flatMap(([category, catUnits]) => [
        { label: `--- ${category} ---`, value: '', disabled: true },
        ...catUnits.map((u: Unit) => ({ label: `${u.name} (${u.code})`, value: u.id }))
    ]);

    // Filter out bundles from component candidates
    const componentCandidates = allProducts.filter((p: any) => !(p as any).isBundle);

    // Auto-calculate bundle cost from selected components
    const computedBundleCost = bundleItems.reduce((total: number, row: BundleItemRow) => {
        const comp = componentCandidates.find((p: any) => p.id === row.componentProductId);
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
            const bundleCat = categories.find((c: Category) => c.name === "العروض والباقات");
            if (bundleCat && form.categoryId === "") {
                setForm(f => ({ ...f, categoryId: bundleCat.id }));
            }

            // Set default unit to "قطعة" if unit visibility is hidden
            if (features?.unitVisibility === false && form.unitOfMeasureId === "") {
                const pieceUnit = units.find((u: Unit) => u.name === "قطعة" || u.code === "PCS" || u.code === "piece");
                if (pieceUnit) {
                    setForm(f => ({ ...f, unitOfMeasureId: pieceUnit.id }));
                }
            }
        }
    }, [isOpen, categories, form.categoryId, csrfToken, features?.unitVisibility, units]);

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

    const fetchCategories = async (query: string) => {
        const res = await fetch(`/api/categories?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        return json.data.map((c: any) => ({ label: c.name, value: c.id }));
    };

    const fetchModels = async (query: string) => {
        let url = `/api/models?q=${encodeURIComponent(query)}`;
        if (form.categoryId) url += `&categoryId=${form.categoryId}`;
        const res = await fetch(url);
        const json = await res.json();
        return json.data.map((m: any) => ({ label: m.name, value: m.id }));
    };

    const handleCreateCategory = async (name: string) => {
        const res = await fetch('/api/inventory/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const json = await res.json();
        if (json.success && json.category) {
            return json.category.id;
        }
    };

    const handleCreateModel = async (name: string) => {
        const res = await fetch('/api/inventory/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, categoryId: form.categoryId })
        });
        const json = await res.json();
        if (json.success && json.model) {
            return json.model.id;
        }
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
                description: form.description || undefined,
                modelId: form.modelId || undefined,
                attributeId: form.attributeId || undefined,
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
        <GlassModal
            isOpen={isOpen}
            onClose={handleClose}
            title="إضافة باقة / عرض جديد"
            className="max-w-[calc(100vw-2rem)] sm:max-w-2xl md:max-w-3xl max-h-[92dvh] p-4 sm:p-5"
        >
            <form onSubmit={handleSubmit} className="space-y-3 text-start" dir="rtl">
                {/* Row 1: الهوية والتصنيف (4 أعمدة متوازنة) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {/* SKU */}
                    <div>
                        <label className="text-[11px] text-zinc-400 font-bold mb-1 flex items-center justify-between">
                            <span>SKU</span>
                            <button
                                type="button"
                                onClick={handleAutoSku}
                                disabled={generatingSku}
                                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold transition-colors cursor-pointer"
                            >
                                {generatingSku ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                {tCommon('auto') || "تلقائي"}
                            </button>
                        </label>
                        <input
                            className="glass-input w-full h-8.5 text-xs font-bold text-slate-900 dark:text-white"
                            value={form.sku}
                            onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                            placeholder="SKU-001"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="text-[11px] text-zinc-400 font-bold mb-1 block">{tCommon('category') || "التصنيف"}</label>
                        <AsyncCreatableSelect
                            className="h-8.5 text-xs font-bold text-slate-900 dark:text-white"
                            value={form.categoryId}
                            onChange={val => {
                                const nextForm = { ...form, categoryId: val, modelId: "", attributeId: "" };
                                setForm({ ...nextForm, name: updateDerivedName(nextForm) });
                            }}
                            fetchOptions={fetchCategories}
                            onAdd={handleCreateCategory}
                            placeholder={tCommon('selectCategory') || "اختر تصنيفاً"}
                            defaultOptions={categories.map((c: Category) => ({ label: c.name, value: c.id }))}
                        />
                    </div>

                    {/* Model */}
                    <div>
                        <label className="text-[11px] text-zinc-400 font-bold mb-1 block">{tCommon('model') || "الموديل"}</label>
                        <AsyncCreatableSelect
                            className="h-8.5 text-xs font-bold text-slate-900 dark:text-white"
                            value={form.modelId}
                            onChange={val => {
                                const nextForm = { ...form, modelId: val };
                                setForm({ ...nextForm, name: updateDerivedName(nextForm) });
                            }}
                            fetchOptions={fetchModels}
                            onAdd={form.categoryId ? handleCreateModel : undefined}
                            disabled={!form.categoryId}
                            placeholder="اختر موديل"
                            defaultOptions={models.filter((m: any) => !form.categoryId || m.categoryId === form.categoryId).map((m: any) => {
                                const cat = categories.find((c: any) => c.id === m.categoryId);
                                return { label: cat ? `${cat.name} - ${m.name}` : m.name, value: m.id };
                            })}
                        />
                    </div>

                    {/* Attribute */}
                    <div>
                        <label className="text-[11px] text-zinc-400 font-bold mb-1 block">الوصف / الصفة</label>
                        <select
                            className="glass-input w-full h-8.5 text-xs [&>option]:text-black font-bold text-slate-900 dark:text-white"
                            value={form.attributeId}
                            onChange={e => {
                                const nextForm = { ...form, attributeId: e.target.value };
                                setForm({ ...nextForm, name: updateDerivedName(nextForm) });
                            }}
                        >
                            <option value="">بدون صفة</option>
                            {attributes.map((a: any) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Row 2: الاسم المشتق + الوصف الإضافي + الوحدة */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                    {/* Derived Name */}
                    <div className={features?.unitVisibility !== false ? "sm:col-span-6" : "sm:col-span-8"}>
                        <label className="text-[11px] text-zinc-400 font-bold mb-1 block">{tCommon('name') || "اسم المنتج"}</label>
                        <input
                            className="glass-input w-full h-8.5 text-xs font-bold text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-white/5 cursor-not-allowed"
                            value={form.name}
                            readOnly
                            placeholder="اسم الباقة"
                        />
                    </div>

                    {/* Additional Description */}
                    <div className={features?.unitVisibility !== false ? "sm:col-span-3" : "sm:col-span-4"}>
                        <label className="text-[11px] text-zinc-400 font-bold mb-1 block">الوصف الإضافي</label>
                        <input
                            className="glass-input w-full h-8.5 text-xs font-bold text-slate-900 dark:text-white"
                            value={form.description}
                            onChange={e => {
                                const nextForm = { ...form, description: e.target.value };
                                setForm({ ...nextForm, name: updateDerivedName(nextForm) });
                            }}
                            placeholder="مثلاً: 128GB، أسود..."
                        />
                    </div>

                    {/* Unit */}
                    {features?.unitVisibility !== false && (
                        <div className="sm:col-span-3">
                            <label className="text-[11px] text-zinc-400 font-bold mb-1 block">وحدة القياس</label>
                            <select
                                className="glass-input w-full h-8.5 text-xs [&>option]:text-black font-bold text-slate-900 dark:text-white"
                                value={form.unitOfMeasureId}
                                onChange={e => setForm(f => ({ ...f, unitOfMeasureId: e.target.value }))}
                            >
                                <option value="">بدون وحدة</option>
                                {(Object.entries(unitsByCategory) as [string, Unit[]][]).map(([category, catUnits]) => (
                                    <optgroup key={category} label={category}>
                                        {catUnits.map((u: Unit) => (
                                            <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Section 2: هيكل التسعير (4 أعمدة متناسقة) */}
                <div className="p-2.5 bg-zinc-950/40 rounded-xl border border-zinc-800/80">
                    <div className="text-[11px] font-bold text-zinc-400 mb-1.5 flex items-center justify-between">
                        <span>هيكل التسعير</span>
                        <span className="text-[10px] text-amber-500 font-bold">محسوب تلقائياً من المكونات</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {/* Cost */}
                        <div>
                            <label className="text-[10px] text-zinc-400 font-bold mb-1 block">{tCommon('cost') || "التكلفة"}</label>
                            <input
                                type="number"
                                className="glass-input w-full h-8 text-xs font-mono font-bold bg-slate-100 dark:bg-white/5 opacity-80 cursor-not-allowed text-center text-slate-600 dark:text-zinc-400"
                                value={computedBundleCost.toFixed(2)}
                                readOnly
                            />
                        </div>

                        {/* Price 1 */}
                        <div>
                            <label className="text-[10px] text-zinc-400 font-bold mb-1 block">{tCommon('price1') || "سعر البيع"}</label>
                            <input
                                type="number"
                                className="glass-input w-full h-8 text-xs font-mono font-bold text-cyan-400 text-center"
                                value={form.sellPrice}
                                onChange={e => setForm(f => ({ ...f, sellPrice: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>

                        {/* Price 2 */}
                        <div>
                            <label className="text-[10px] text-zinc-400 font-bold mb-1 block">{tCommon('price2') || "سعر 2"}</label>
                            <input
                                type="number"
                                className="glass-input w-full h-8 text-xs font-mono font-bold text-slate-900 dark:text-white text-center"
                                value={form.sellPrice2}
                                onChange={e => setForm(f => ({ ...f, sellPrice2: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>

                        {/* Price 3 */}
                        <div>
                            <label className="text-[10px] text-zinc-400 font-bold mb-1 block">{tCommon('price3') || "سعر 3"}</label>
                            <input
                                type="number"
                                className="glass-input w-full h-8 text-xs font-mono font-bold text-slate-900 dark:text-white text-center"
                                value={form.sellPrice3}
                                onChange={e => setForm(f => ({ ...f, sellPrice3: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>
                    </div>
                </div>

                {/* Section 3: مكونات الباقة */}
                <div className="p-2.5 bg-zinc-950/40 rounded-xl border border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs text-amber-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5" />
                            <span>مكونات الباقة</span>
                        </label>
                        <button
                            type="button"
                            onClick={handleAddComponent}
                            className="flex items-center gap-1 text-[11px] bg-amber-500 hover:bg-amber-400 text-black px-3 py-1 rounded-lg font-bold transition-all shadow-md shadow-amber-500/10 active:scale-95 cursor-pointer"
                        >
                            <Plus className="w-3 h-3" /> إضافة منتج مكوّن
                        </button>
                    </div>

                    {bundleItems.length === 0 ? (
                        <div className="text-center py-3 text-slate-400 dark:text-muted-foreground text-xs border border-dashed border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-center gap-2">
                            <Box className="w-4 h-4 opacity-30" />
                            <span>انقر على &quot;إضافة منتج مكوّن&quot; لإدراج أصناف العرض</span>
                        </div>
                    ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-0.5">
                            {bundleItems.map((row, idx) => {
                                const selectedComp = componentCandidates.find((p: any) => p.id === row.componentProductId);
                                return (
                                    <div key={idx} className="flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-200 dark:border-white/5">
                                        <div className="flex-1 min-w-0">
                                            <Combobox
                                                options={componentCandidates.map((p: any) => ({
                                                    label: `${p.name} — مخزون: ${p.stock}`,
                                                    value: p.id
                                                }))}
                                                value={row.componentProductId}
                                                onChange={(val: string) => handleComponentChange(idx, "componentProductId", val)}
                                                placeholder="اختر منتجاً للعرض..."
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <label className="text-[10px] text-zinc-400 font-bold">الكمية:</label>
                                            <input
                                                type="number"
                                                step="any"
                                                min={0.001}
                                                className="glass-input w-16 h-7 text-xs text-center font-bold font-mono text-slate-900 dark:text-white"
                                                value={row.quantityIncluded}
                                                onChange={e => handleComponentChange(idx, "quantityIncluded", parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        {selectedComp && (
                                            <div className="text-[11px] font-mono text-zinc-300 whitespace-nowrap min-w-[60px] text-end font-bold shrink-0">
                                                {(selectedComp.costPrice * row.quantityIncluded).toFixed(2)} {tCommon('currency') || "EGP"}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveComponent(idx)}
                                            className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all active:scale-90 cursor-pointer shrink-0"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {bundleItems.length > 0 && (
                        <div className="flex justify-end items-center gap-2 text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                            <span className="text-[10px] uppercase tracking-wider text-amber-400">إجمالي تكلفة المكونات:</span>
                            <span className="text-sm font-mono tracking-tight">{computedBundleCost.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="p-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
                        <X className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Section 4: أزرار الحفظ والإلغاء */}
                <div className="flex justify-end items-center gap-2 pt-2 border-t border-zinc-800">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
                    >
                        {tCommon('cancel') || "إلغاء"}
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-1.5 rounded-xl flex items-center gap-1.5 text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                        <span>حفظ الباقة</span>
                    </button>
                </div>
            </form>
        </GlassModal>
    );
}
