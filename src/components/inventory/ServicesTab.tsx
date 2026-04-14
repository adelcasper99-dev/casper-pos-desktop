"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Layers, Box, Edit2, Trash2, Infinity as InfinityIcon, AlertTriangle, Check, Lock } from "lucide-react";
import { getProducts, updateProduct, deleteProduct, createProduct } from "@/actions/inventory";
import { toast } from "sonner";
import clsx from "clsx";
import { cn } from "@/lib/utils";

import { useTranslations } from "@/lib/i18n-mock";

export default function ServicesTab({ categories, csrfToken }: any) {
    const t = useTranslations('Purchasing');
    const [searchTerm, setSearchTerm] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingService, setEditingService] = useState<any>(null);
    const [toBeDeleted, setToBeDeleted] = useState<any>(null);
    const [formData, setFormData] = useState({
        name: "",
        sku: "",
        sellPrice: 0,
        categoryId: "",
        trackStock: false
    });
    const queryClient = useQueryClient();

    const { data: products = [], isLoading } = useQuery({
        queryKey: ['products-services'],
        queryFn: async () => {
            const res = await getProducts();
            if (!res.success) return [];
            return (res.data || []).filter((p: any) => p.trackStock === false);
        }
    });

    const filtered = products.filter((p: any) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleOpenCreate = () => {
        setEditingService(null);
        setFormData({ name: "", sku: "", sellPrice: 0, categoryId: "", trackStock: false });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (service: any) => {
        setEditingService(service);
        setFormData({
            name: service.name,
            sku: service.sku,
            sellPrice: Number(service.sellPrice),
            categoryId: service.categoryId || "",
            trackStock: service.trackStock ?? false
        });
        setIsModalOpen(true);
    };

    const handleOpenDelete = (service: any) => {
        setToBeDeleted(service);
        setIsDeleteModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return toast.error(t('services.modal.nameRequired'));

        setIsSaving(true);
        try {
            let res;
            if (editingService) {
                res = await updateProduct({
                    id: editingService.id,
                    ...formData,
                    costPrice: 0,
                    stock: 0,
                    minStock: 0,
                    csrfToken
                } as any);
            } else {
                res = await createProduct({
                    ...formData,
                    costPrice: 0,
                    stock: 0,
                    minStock: 0,
                    csrfToken
                } as any);
            }

            if (res.success) {
                toast.success(editingService ? t('services.modal.updateSuccess') : t('services.modal.success'));
                setIsModalOpen(false);
                setEditingService(null);
                setFormData({ name: "", sku: "", sellPrice: 0, categoryId: "", trackStock: false });
                queryClient.invalidateQueries({ queryKey: ['products-services'] });
            } else {
                throw new Error(res.error || t('services.modal.error'));
            }
        } catch (error: any) {
            toast.error(error.message || t('services.modal.error'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!toBeDeleted) return;
        setIsSaving(true);
        try {
            const res = await deleteProduct({ id: toBeDeleted.id, csrfToken });
            if (res.success) {
                toast.success(t('services.modal.deleteSuccess'));
                setIsDeleteModalOpen(false);
                setToBeDeleted(null);
                queryClient.invalidateQueries({ queryKey: ['products-services'] });
            } else {
                throw new Error(res.error || t('services.modal.deleteError'));
            }
        } catch (error: any) {
            toast.error(error.message || t('services.modal.deleteError'));
        } finally {
            setIsSaving(false);
        }
    };

    const generateRandomSKU = () => {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const randomString =
            letters[Math.floor(Math.random() * letters.length)] +
            letters[Math.floor(Math.random() * letters.length)] +
            letters[Math.floor(Math.random() * letters.length)] +
            Math.floor(10000 + Math.random() * 90000);
        setFormData({ ...formData, sku: randomString });
    };

    return (
        <div className="space-y-6 animate-fly-in font-cairo" dir="rtl">
            <div className="flex justify-between items-center bg-white dark:bg-muted/50 p-6 rounded-2xl border border-zinc-200 dark:border-border shadow-sm">
                <div>
                    <h2 className="text-2xl font-black flex items-center gap-3 text-zinc-900 dark:text-white uppercase tracking-tight">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                            <InfinityIcon className="w-6 h-6" />
                        </div>
                        {t('services.title')}
                    </h2>
                    <p className="text-muted-foreground font-bold text-sm mt-1">{t('services.subtitle')}</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="bg-primary text-primary-foreground font-black px-6 py-3 rounded-xl flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20 text-xs uppercase tracking-widest"
                >
                    <Plus className="w-4 h-4" />
                    {t('services.newService')}
                </button>
            </div>

            <div className="relative group">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-primary transition-all pointer-events-none" />
                <input
                    type="text"
                    placeholder={t('services.searchPlaceholder')}
                    className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-2xl py-4 pr-12 pl-4 focus:border-primary/50 outline-none transition-all font-bold text-zinc-900 dark:text-white placeholder:text-zinc-500 shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-card p-12 text-center text-zinc-500">
                    <Layers className="w-12 h-12 mb-3 mx-auto opacity-20" />
                    <p>{t('services.noServices')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map((item: any) => (
                        <div key={item.id} className="bg-white dark:bg-card/50 border border-zinc-200 dark:border-white/5 p-6 rounded-2xl hover:border-primary/50 transition-all group relative shadow-sm hover:shadow-md">
                            <div className="flex justify-between items-start mb-6">
                                <div className="p-3 bg-primary/10 rounded-xl">
                                    <InfinityIcon className="w-6 h-6 text-primary" />
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
                                    <button 
                                        onClick={() => handleOpenEdit(item)}
                                        className="p-2.5 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-xl text-zinc-400 hover:text-primary transition-colors"
                                    >
                                        <Edit2 className="w-4.5 h-4.5" />
                                    </button>
                                    <button 
                                        onClick={() => handleOpenDelete(item)}
                                        className="p-2.5 hover:bg-rose-500/10 rounded-xl text-zinc-400 hover:text-rose-500 transition-colors"
                                    >
                                        <Trash2 className="w-4.5 h-4.5" />
                                    </button>
                                </div>
                            </div>
                            <h3 className="font-black text-zinc-900 dark:text-white text-xl mb-1 group-hover:text-primary transition-colors">{item.name}</h3>
                            <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-4 opacity-70 group-hover:opacity-100 transition-opacity">{item.sku}</div>
                            
                            <div className="flex justify-between items-center pt-5 border-t border-zinc-100 dark:border-white/5">
                                <div className="text-primary font-black text-lg font-mono">
                                    {Number(item.sellPrice).toFixed(2)} <span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase ml-1">EGP</span>
                                </div>
                                <div className="text-[10px] px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/5 font-black uppercase tracking-widest">
                                    {item.category?.name || 'بدون قسم'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* CREATE/EDIT MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-zinc-100 dark:border-white/10 flex justify-between items-center bg-zinc-50/50 dark:bg-white/[0.02]">
                            <h3 className="text-xl font-black flex items-center gap-3 text-zinc-900 dark:text-white uppercase tracking-tight">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                    {editingService ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                </div>
                                {editingService ? t('services.editService') : t('services.newService')}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase font-black tracking-widest mb-1 block pl-1">{t('services.modal.nameLabel')}</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-2xl py-3 px-4 focus:border-primary/50 outline-none text-zinc-900 dark:text-white font-bold transition-all shadow-sm"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={t('services.modal.namePlaceholder')}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase font-black tracking-widest mb-1 block pl-1">{t('services.modal.skuLabel')}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-2xl py-3 px-4 focus:border-primary/50 outline-none text-zinc-900 dark:text-white font-mono font-bold text-sm transition-all shadow-sm flex-1"
                                            value={formData.sku}
                                            onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                            placeholder={t('services.modal.skuPlaceholder')}
                                        />
                                        <button
                                            type="button"
                                            onClick={generateRandomSKU}
                                            className="bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 px-4 rounded-2xl transition-all text-zinc-500 dark:text-zinc-300 shadow-sm active:scale-95"
                                            title="Generate SKU"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" /></svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase font-black tracking-widest mb-1 block pl-1">{t('services.modal.priceLabel')}</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-2xl py-3 px-4 focus:border-primary/50 outline-none text-primary font-mono font-black text-lg transition-all shadow-sm"
                                        value={formData.sellPrice}
                                        onChange={e => setFormData({ ...formData, sellPrice: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            {/* Track Stock Toggle (Integrity Protected) */}
                            <div className="space-y-3">
                                <div className={cn(
                                    "flex items-center gap-3 p-4 rounded-2xl border transition-all shadow-sm",
                                    editingService?.hasHistory 
                                        ? "bg-slate-50 dark:bg-zinc-900/40 border-slate-200 dark:border-white/5 opacity-80" 
                                        : "bg-slate-100 dark:bg-muted/20 border-slate-200 dark:border-border text-primary"
                                )}>
                                    <input
                                        type="checkbox"
                                        id="trackStock"
                                        checked={formData.trackStock}
                                        disabled={editingService?.hasHistory}
                                        onChange={e => setFormData({ ...formData, trackStock: e.target.checked })}
                                        className={cn(
                                            "w-5 h-5 rounded-lg text-primary cursor-pointer accent-primary",
                                            editingService?.hasHistory && "cursor-not-allowed opacity-50"
                                        )}
                                    />
                                    <label htmlFor="trackStock" className={cn(
                                        "text-sm font-black flex items-center gap-3 cursor-pointer",
                                        editingService?.hasHistory ? "text-slate-500 cursor-not-allowed" : "text-zinc-900 dark:text-white"
                                    )}>
                                        {formData.trackStock ? 
                                            <Box className={cn("w-5 h-5", editingService?.hasHistory ? "text-slate-300" : "text-slate-400 dark:text-zinc-400")} /> : 
                                            <InfinityIcon className={cn("w-5 h-5", editingService?.hasHistory ? "text-primary/30" : "text-primary")} />
                                        }
                                        تفعيل تتبع المخزون (تحويل لمنتج)
                                        {editingService?.hasHistory && <Lock className="w-3.5 h-3.5 text-amber-500 ml-auto" />}
                                    </label>
                                </div>
                                
                                {editingService?.hasHistory && (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-1">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-tight">حماية نزاهة المخزون</div>
                                            <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 leading-relaxed">
                                                لا يمكن تغيير النوع لوجود حركات سابقة كخدمة (مبيعات). يرجى أرشفة الخدمة وإنشاء منتج جديد بدلاً منها.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase font-black tracking-widest mb-1 block pl-1">{t('services.modal.categoryLabel')}</label>
                                <select
                                    className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-2xl py-3 px-4 focus:border-primary/50 outline-none text-zinc-900 dark:text-white font-bold transition-all shadow-sm appearance-none"
                                    value={formData.categoryId}
                                    onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                                >
                                    <option value="" className="bg-white dark:bg-[#111]">{t('services.modal.categoryPlaceholder')}</option>
                                    {categories.map((c: any) => (
                                        <option key={c.id} value={c.id} className="bg-white dark:bg-[#111] font-bold">{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-4 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-6 py-4 rounded-2xl border border-zinc-200 dark:border-white/10 font-black text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm"
                                >
                                    {t('services.modal.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-[2] bg-primary text-primary-foreground font-black px-6 py-4 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50 text-xs uppercase tracking-widest"
                                >
                                    {isSaving ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                            {t('services.modal.saving')}
                                        </div>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {editingService ? t('services.modal.update') : t('services.modal.save')}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
                                <AlertTriangle className="w-10 h-10 text-rose-500" />
                            </div>
                            <h3 className="text-2xl font-black mb-2 text-zinc-900 dark:text-white uppercase tracking-tight">{t('services.modal.deleteConfirm')}</h3>
                            <p className="text-zinc-500 dark:text-zinc-400 font-bold text-sm mb-8 px-4">{toBeDeleted?.name}</p>
                            
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setIsDeleteModalOpen(false)}
                                    className="flex-1 px-6 py-4 rounded-2xl border border-zinc-200 dark:border-white/10 font-black text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm"
                                >
                                    {t('services.modal.cancel')}
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={isSaving}
                                    className="flex-1 bg-rose-500 text-white font-black px-6 py-4 rounded-2xl hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-rose-500/20 disabled:opacity-50 text-xs uppercase tracking-widest"
                                >
                                    {isSaving ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            {t('services.modal.saving')}
                                        </div>
                                    ) : (
                                        "حذف الخدمة"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
