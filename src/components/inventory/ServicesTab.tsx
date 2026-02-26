"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Layers, Box, Edit2, Trash2, Infinity } from "lucide-react";
import { prisma } from "@/lib/prisma"; // This won't work in client, need action
import { getProducts, updateProduct, deleteProduct, createProduct } from "@/actions/inventory";
import { toast } from "sonner";
import clsx from "clsx";

import { useTranslations } from "@/lib/i18n-mock";

export default function ServicesTab({ categories, csrfToken }: any) {
    const t = useTranslations('Purchasing');
    const [searchTerm, setSearchTerm] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        sku: "",
        sellPrice: 0,
        categoryId: ""
    });
    const queryClient = useQueryClient();

    const { data: products = [], isLoading } = useQuery({
        queryKey: ['products-services'],
        queryFn: async () => {
            const res = await getProducts();
            if (!res.success) return [];
            // Filter only non-tracking products
            return (res.data || []).filter((p: any) => p.trackStock === false);
        }
    });

    const filtered = products.filter((p: any) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return toast.error(t('services.modal.nameRequired'));

        setIsSaving(true);
        try {
            const res = await createProduct({
                ...formData,
                costPrice: 0,
                stock: 0,
                minStock: 0,
                trackStock: false,
                csrfToken
            } as any);

            if (res.success) {
                toast.success(t('services.modal.success'));
                setIsModalOpen(false);
                setFormData({ name: "", sku: "", sellPrice: 0, categoryId: "" });
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
        <div className="space-y-6 animate-fly-in" dir="rtl">
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl border border-border">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Infinity className="w-5 h-5 text-cyan-400" />
                        {t('services.title')}
                    </h2>
                    <p className="text-muted-foreground text-sm">{t('services.subtitle')}</p>
                </div>
                {/* ml-24 added to prevent system overlay on left screen edge from blocking the button */}
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-cyan-500 text-black font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-cyan-400 transition-colors shadow-[0_0_15px_rgba(6,182,212,0.4)] ml-24"
                >
                    <Plus className="w-4 h-4" />
                    {t('services.newService')}
                </button>
            </div>

            <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                    type="text"
                    placeholder={t('services.searchPlaceholder')}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-10 pl-4 focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((item: any) => (
                        <div key={item.id} className="glass-card p-4 hover:border-cyan-500/50 transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-cyan-500/10 rounded-lg">
                                    <Infinity className="w-5 h-5 text-cyan-400" />
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <h3 className="font-bold text-lg mb-1">{item.name}</h3>
                            <div className="text-xs text-zinc-500 font-mono mb-3">{item.sku}</div>
                            <div className="flex justify-between items-center pt-3 border-t border-white/5">
                                <div className="text-cyan-500 font-bold font-mono">
                                    {Number(item.sellPrice).toFixed(2)} <span className="text-[10px] text-zinc-500">EGP</span>
                                </div>
                                <div className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/5 uppercase">
                                    {item.category?.name || 'بدون قسم'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* CREATE MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Plus className="w-5 h-5 text-cyan-500" />
                                {t('services.newService')}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="text-xs text-zinc-500 uppercase font-bold mb-1 block">اسم الخدمة</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 focus:ring-2 focus:ring-cyan-500 outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="مثال: خدمة شحن / غسيل سيارة..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-zinc-500 uppercase font-bold mb-1 block">الكود (SKU)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 focus:ring-2 focus:ring-cyan-500 outline-none flex-1"
                                            value={formData.sku}
                                            onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                            placeholder="تلقائي..."
                                        />
                                        <button
                                            type="button"
                                            onClick={generateRandomSKU}
                                            className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl transition-colors text-zinc-300"
                                            title="Generate SKU"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" /></svg>
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 uppercase font-bold mb-1 block">السعر</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 focus:ring-2 focus:ring-cyan-500 outline-none font-mono"
                                        value={formData.sellPrice}
                                        onChange={e => setFormData({ ...formData, sellPrice: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-zinc-500 uppercase font-bold mb-1 block">الفئة</label>
                                <select
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 focus:ring-2 focus:ring-cyan-500 outline-none"
                                    value={formData.categoryId}
                                    onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                                >
                                    <option value="" className="bg-[#111]">-- اختر فئة --</option>
                                    {categories.map((c: any) => (
                                        <option key={c.id} value={c.id} className="bg-[#111]">{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2 rounded-xl border border-white/10 font-bold hover:bg-white/5 transition-colors"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-[2] bg-cyan-500 text-black font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-cyan-400 transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? "جاري الحفظ..." : "حفظ الخدمة"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
