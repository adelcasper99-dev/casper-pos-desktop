'use client';

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash, RefreshCw, Layers, Box, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getReorderRules, upsertReorderRule, deleteReorderRule, checkAndGenerateRequests } from "@/actions/reorder-rules-actions";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";

interface WarehouseOption {
    id: string;
    name?: string;
    [key: string]: unknown;
}

interface ProductOption {
    id: string;
    name: string;
    [key: string]: unknown;
}

interface ReorderRuleItem {
    id: string;
    warehouseId: string;
    productId: string;
    minQty: number;
    maxQty: number;
    isActive: boolean;
    product?: { id: string; name: string };
}

interface ReorderRulesManagerProps {
    warehouses?: WarehouseOption[];
    products?: ProductOption[];
    csrfToken?: string;
}

export default function ReorderRulesManager({ warehouses = [], products = [], csrfToken }: ReorderRulesManagerProps) {
    const t = useTranslations('Inventory.reorder');
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(warehouses?.[0]?.id || '');
    const [rules, setRules] = useState<ReorderRuleItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAdding, setIsAdding] = useState(false);

    // New rule form
    const [newProductId, setNewProductId] = useState('');
    const [newMin, setNewMin] = useState<number | string>('');
    const [newMax, setNewMax] = useState<number | string>('');

    const loadRules = useCallback(async () => {
        if (!selectedWarehouseId) return;
        setLoading(true);
        try {
            const res = await getReorderRules(selectedWarehouseId);
            if (res.success && Array.isArray(res.data)) {
                setRules(res.data as ReorderRuleItem[]);
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'حدث خطأ أثناء تحميل القواعد';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [selectedWarehouseId]);

    useEffect(() => {
        loadRules();
    }, [loadRules]);

    const handleAdd = async () => {
        if (!newProductId) {
            return toast.error(t('selectProductError', 'يرجى تحديد منتج أولاً'));
        }
        const minVal = Number(newMin) || 0;
        const maxVal = Number(newMax) || 0;

        setIsAdding(true);
        try {
            const res = await upsertReorderRule({
                warehouseId: selectedWarehouseId,
                productId: newProductId,
                minQty: minVal,
                maxQty: maxVal,
                isActive: true,
                csrfToken
            });
            if (res.success) {
                toast.success(t('ruleAdded', 'تمت إضافة قاعدة إعادة الطلب بنجاح'));
                setNewProductId('');
                setNewMin('');
                setNewMax('');
                loadRules();
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'فشل إضافة القاعدة';
            toast.error(message);
        } finally {
            setIsAdding(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteReorderRule({ id, csrfToken });
            toast.success(t('ruleDeleted', 'تم حذف القاعدة بنجاح'));
            loadRules();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'فشل حذف القاعدة';
            toast.error(message);
        }
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const res = await checkAndGenerateRequests({ warehouseId: selectedWarehouseId, csrfToken });
            if (res.success) {
                const count = res.count ?? 0;
                toast.success(t('generatedCount', { count }, `تم إنشاء ${count} طلب تزويد بنجاح`));
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'فشل توليد طلبات التزويد';
            toast.error(message);
        } finally {
            setIsGenerating(false);
        }
    };

    const productOptions = products.map((p) => ({ label: p.name, value: p.id }));
    const warehouseOptions = warehouses.map((w) => ({ label: w.name || 'مستودع غير مسمى', value: w.id }));

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500 text-start" dir="rtl">
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                        <Layers className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-wide">
                            {t('title', 'قواعد إعادة الطلب')}
                        </h2>
                        <p className="text-xs text-zinc-400">
                            حدد الحدود الدنيا والقصوى للأصناف لتوليد أوامر التزويد والشراء تلقائياً
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button 
                        onClick={handleGenerate} 
                        disabled={isGenerating || !selectedWarehouseId}
                        className="gap-2 font-bold bg-cyan-500 hover:bg-cyan-600 text-black shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                        <span>{t('generateRequests', 'توليد طلبات التزويد')}</span>
                    </Button>
                </div>
            </div>

            {/* Warehouse Filter */}
            <div className="flex flex-wrap items-center gap-4 bg-zinc-900/40 p-3.5 rounded-2xl border border-zinc-800/80">
                <div className="w-72">
                    <label className="text-xs font-bold text-zinc-400 mb-1.5 block">
                        {t('warehouse', 'المستودع المستهدف')}
                    </label>
                    <SearchableSelect 
                        options={warehouseOptions}
                        value={selectedWarehouseId}
                        onChange={setSelectedWarehouseId}
                        placeholder={t('selectWarehouse', 'اختر المستودع...')}
                    />
                </div>
            </div>

            {/* Rule Creation Form & Rules Table */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-6">
                {/* Form Row */}
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                    <div className="text-xs font-bold text-zinc-300 mb-3 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-cyan-400" />
                        <span>إضافة قاعدة تزويد جديدة</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-6">
                            <label className="text-xs font-bold text-zinc-400 mb-1.5 block">
                                {t('product', 'المنتج')}
                            </label>
                            <SearchableSelect 
                                options={productOptions}
                                value={newProductId}
                                onChange={setNewProductId}
                                placeholder={t('selectProduct', 'اختر المنتج...')}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-zinc-400 mb-1.5 block">
                                {t('minQty', 'الحد الأدنى')}
                            </label>
                            <Input 
                                type="number" 
                                min={0}
                                value={newMin} 
                                onChange={e => setNewMin(e.target.value === '' ? '' : Number(e.target.value))} 
                                placeholder="0"
                                className="h-10 bg-zinc-900 border-zinc-700 text-white font-mono text-center"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-zinc-400 mb-1.5 block">
                                {t('maxQty', 'الحد الأقصى')}
                            </label>
                            <Input 
                                type="number" 
                                min={0}
                                value={newMax} 
                                onChange={e => setNewMax(e.target.value === '' ? '' : Number(e.target.value))} 
                                placeholder="0"
                                className="h-10 bg-zinc-900 border-zinc-700 text-white font-mono text-center"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <Button 
                                onClick={handleAdd} 
                                disabled={isAdding || !newProductId}
                                className="w-full gap-2 font-bold h-10 bg-zinc-100 hover:bg-white text-zinc-900 transition-all cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>{t('addRule', 'إضافة +')}</span>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-bold">
                                <th className="py-3 px-4 text-start font-black">{t('tableProduct', 'المنتج')}</th>
                                <th className="py-3 px-4 text-center font-black w-32">{t('tableMin', 'الحد الأدنى')}</th>
                                <th className="py-3 px-4 text-center font-black w-32">{t('tableMax', 'الحد الأقصى')}</th>
                                <th className="py-3 px-4 text-end font-black w-24">{t('actions', 'الإجراءات')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-zinc-400 font-bold text-sm">
                                        <div className="flex items-center justify-center gap-2">
                                            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                                            <span>{t('loading', 'جاري التحميل...')}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : rules.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-zinc-500 font-medium text-sm">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Box className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
                                            <span>{t('noRules', 'لا توجد قواعد إعادة طلب مسجلة لهذا المستودع')}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                rules.map((r) => (
                                    <tr key={r.id} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="py-3.5 px-4 font-bold text-white text-sm">
                                            {r.product?.name || r.productId}
                                        </td>
                                        <td className="py-3.5 px-4 text-center font-mono font-bold text-cyan-400 text-sm">
                                            {r.minQty}
                                        </td>
                                        <td className="py-3.5 px-4 text-center font-mono font-bold text-zinc-300 text-sm">
                                            {r.maxQty}
                                        </td>
                                        <td className="py-3.5 px-4 text-end">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => handleDelete(r.id)}
                                                className="h-8 w-8 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                                title="حذف القاعدة"
                                            >
                                                <Trash className="w-4 h-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
