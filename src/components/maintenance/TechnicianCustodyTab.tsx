'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import {
    Search,
    ShoppingCart,
    Plus,
    Minus,
    Box,
    CheckCircle2,
    Loader2,
    ArrowRightLeft,
    Warehouse
} from 'lucide-react';
import { useTranslations } from '@/lib/i18n-mock';
import { toast } from 'sonner';
import {
    getTechniciansForCustody,
    searchProductsForCustody,
    transferCustodyToTech
} from '@/actions/technician-custody-actions';
import { useCSRF } from "@/contexts/CSRFContext";
import { getAllWarehouses } from '@/actions/branch-actions';
import TransferConsole, { type TransferEntity } from '@/components/tickets/TransferConsole';

type ProductItem = {
    id: string;
    name: string;
    sku: string;
    categoryName: string;
    categoryColor: string | null;
    availableQuantity: number;
    costPrice: number | string;
    sellPrice: number | string;
    sellPrice2: number | string;
    sellPrice3: number | string;
};

type CartItem = ProductItem & {
    cartQuantity: number;
    priceTier: 'Cost' | 'Sell 1' | 'Sell 2' | 'Sell 3';
};

export default function TechnicianCustodyTab() {
    const t = useTranslations('Tickets');
    const { token: csrfToken } = useCSRF();
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
    const [selectedSourceWarehouseId, setSelectedSourceWarehouseId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isPending, startTransition] = useTransition();
    const [isLoadingTechs, setIsLoadingTechs] = useState(true);
    const [isTransferConsoleOpen, setIsTransferConsoleOpen] = useState(false);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            setIsLoadingTechs(true);
            try {
                const [techRes, whRes] = await Promise.all([
                    getTechniciansForCustody(),
                    getAllWarehouses()
                ]);
                if ((techRes as any)?.data) setTechnicians((techRes as any).data);
                if ((whRes as any)?.data) {
                    const whs = (whRes as any).data;
                    setWarehouses(whs);
                    // Auto-select default warehouse
                    const def = whs.find((w: any) => w.isDefault);
                    if (def) setSelectedSourceWarehouseId(def.id);
                }
            } catch {
                toast.error("فشل تحميل البيانات");
            } finally {
                setIsLoadingTechs(false);
            }
        };
        loadData();
    }, []);

    // Search products from selected source warehouse
    useEffect(() => {
        const timer = setTimeout(async () => {
            const res = await searchProductsForCustody({
                query: searchQuery,
                sourceWarehouseId: selectedSourceWarehouseId || undefined
            });
            if ((res as any)?.data) setProducts((res as any).data);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, selectedSourceWarehouseId]);

    const addToCart = (product: ProductItem) => {
        if (!selectedTechId) {
            toast.error("اختار مهندس أولاً!");
            return;
        }
        if (Number(product.availableQuantity) <= 0) {
            toast.error("المنتج نفد من المخزن.");
            return;
        }
        setCart(prev => {
            const existing = prev.find(p => p.id === product.id);
            if (existing) {
                if (Number(existing.cartQuantity) >= Number(product.availableQuantity)) {
                    toast.error("وصلت للحد الأقصى المتاح.");
                    return prev;
                }
                return prev.map(p => p.id === product.id ? { ...p, cartQuantity: p.cartQuantity + 1 } : p);
            }
            return [...prev, { ...product, cartQuantity: 1, priceTier: 'Cost' }];
        });
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(p => p.id !== productId));
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev => prev.map(p => {
            if (p.id !== productId) return p;
            const newQty = p.cartQuantity + delta;
            if (newQty > Number(p.availableQuantity)) { toast.error("وصلت للحد الأقصى"); return p; }
            return newQty > 0 ? { ...p, cartQuantity: newQty } : p;
        }));
    };

    const updatePriceTier = (productId: string, tier: 'Cost' | 'Sell 1' | 'Sell 2' | 'Sell 3') => {
        setCart(prev => prev.map(p => p.id === productId ? { ...p, priceTier: tier } : p));
    };

    const handleTransfer = () => {
        if (!selectedTechId) { toast.error("اختار مهندس"); return; }
        if (!selectedSourceWarehouseId) { toast.error("اختار المخزن المصدر"); return; }
        if (cart.length === 0) { toast.error("السلة فارغة"); return; }

        startTransition(async () => {
            const result = await transferCustodyToTech({
                technicianId: selectedTechId,
                sourceWarehouseId: selectedSourceWarehouseId,
                items: cart.map(item => ({ productId: item.id, quantity: item.cartQuantity, priceTier: item.priceTier })),
                csrfToken: csrfToken ?? undefined
            });

            if (result && (result as any).success) {
                toast.success("تم التحويل بنجاح! ✅");
                setCart([]);
                const res = await getTechniciansForCustody();
                if ((res as any)?.data) setTechnicians((res as any).data);
                // Refresh products
                const pRes = await searchProductsForCustody({ query: searchQuery, sourceWarehouseId: selectedSourceWarehouseId || undefined });
                if ((pRes as any)?.data) setProducts((pRes as any).data);
            } else {
                toast.error((result as any)?.message || "فشل التحويل.");
            }
        });
    };

    const transferEntities = useMemo<TransferEntity[]>(() => {
        const techs = technicians.map(t => ({
            id: t.id,
            name: t.name,
            type: 'ENGINEER' as const,
            warehouseId: t.warehouseId ?? undefined
        }));
        const whs = warehouses.map(w => ({
            id: w.id,
            name: w.name,
            type: 'WAREHOUSE' as const,
            warehouseId: w.id
        }));
        return [...techs, ...whs];
    }, [technicians, warehouses]);

    const selectedTech = technicians.find(t => t.id === selectedTechId);
    const selectedSourceWh = warehouses.find(w => w.id === selectedSourceWarehouseId);

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] bg-slate-50 dark:bg-black overflow-hidden relative rounded-2xl border border-slate-200 dark:border-white/5">
            {/* Header */}
            <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-white/10 p-5 shadow-sm z-10 shrink-0">
                <div className="flex items-center justify-between mb-5">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900/10 dark:bg-white/10 flex items-center justify-center">
                            <Box className="w-6 h-6 text-slate-900 dark:text-white" />
                        </div>
                        تسليم العهدة
                    </h1>
                    <button
                        onClick={() => setIsTransferConsoleOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl hover:bg-black dark:hover:bg-zinc-200 transition-all font-black text-sm shadow-lg shadow-slate-900/20"
                    >
                        <ArrowRightLeft className="w-4 h-4" />
                        تحويل متقدم
                    </button>
                </div>

                {/* Source Warehouse Selector */}
                <div className="mb-5">
                    <label className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase font-black mb-2 flex items-center gap-1.5 tracking-wider">
                        <Warehouse className="w-3.5 h-3.5" /> المخزن المصدر
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {warehouses.map(wh => (
                            <button
                                key={wh.id}
                                onClick={() => {
                                    setSelectedSourceWarehouseId(wh.id);
                                    setCart([]);
                                }}
                                className={`flex-shrink-0 px-5 py-2 rounded-xl border-2 text-sm font-black transition-all shadow-sm
                                    ${selectedSourceWarehouseId === wh.id
                                        ? 'border-black bg-black/10 dark:border-white dark:bg-white/10 text-black dark:text-white'
                                        : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-white/20'
                                    }`}
                            >
                                {wh.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Technician Selector */}
                <label className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase font-black mb-3 flex items-center gap-1.5 tracking-wider">
                    المهندس المستلم
                </label>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x">
                    {isLoadingTechs ? (
                        <div className="flex gap-4">
                            {[1, 2, 3, 4].map(i => <div key={i} className="w-28 h-28 bg-slate-100 dark:bg-white/5 animate-pulse rounded-2xl" />)}
                        </div>
                    ) : (
                        technicians.map(tech => (
                            <button
                                key={tech.id}
                                onClick={() => {
                                    setSelectedTechId(tech.id);
                                    setCart([]);
                                }}
                                className={`
                                    flex flex-col items-center justify-center min-w-[120px] p-4 rounded-2xl border-2 transition-all duration-300 snap-start shadow-sm
                                    ${selectedTechId === tech.id
                                        ? 'border-black bg-black/5 dark:border-white dark:bg-white/5 scale-105 shadow-xl shadow-black/10'
                                        : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'
                                    }
                                `}
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-black mb-3 shadow-inner
                                    ${selectedTechId === tech.id ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white'}`}>
                                    {tech.name.substring(0, 2).toUpperCase()}
                                </div>
                                <span className={`text-[11px] font-black truncate w-full text-center ${selectedTechId === tech.id ? 'text-black dark:text-white' : 'text-slate-900 dark:text-white'}`}>
                                    {tech.name}
                                </span>
                                <span className="text-[9px] font-black text-slate-500 dark:text-zinc-500 mt-1 uppercase">
                                    {tech.itemCount} قطعة
                                </span>
                                {!tech.warehouseId && (
                                    <span className="text-[8px] font-black text-slate-500 dark:text-zinc-500 mt-1 uppercase">
                                        بدون مخزن
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </header>

            {/* Body: Products | Cart */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Products */}
                <div className="w-1/2 flex flex-col border-r border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-sm">
                    <div className="p-5 border-b border-slate-100 dark:border-white/10">
                        <div className="relative group/search">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 w-5 h-5 font-black group-focus-within/search:text-black dark:group-focus-within/search:text-white transition-colors" />
                            <input
                                type="text"
                                placeholder="ابحث عن قطعة..."
                                className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-black text-slate-900 dark:text-white outline-none text-base font-black focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 transition-all shadow-inner placeholder:text-slate-400"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        {selectedSourceWh && (
                            <p className="text-[10px] text-slate-900 dark:text-white mt-3 flex items-center gap-1.5 font-black uppercase tracking-wider">
                                <Warehouse className="w-3.5 h-3.5" /> من: {selectedSourceWh.name}
                            </p>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 gap-4 content-start">
                        {products.length === 0 ? (
                            <div className="col-span-2 text-center text-slate-400 dark:text-zinc-600 py-20 italic font-black">
                                لا توجد منتجات — ابحث أو اختار مخزن آخر
                            </div>
                        ) : (
                            products.map(product => {
                                const inStock = Number(product.availableQuantity) > 0;
                                return (
                                    <button
                                        key={product.id}
                                        disabled={!inStock}
                                        onClick={() => addToCart(product)}
                                        className={`flex flex-col p-5 rounded-2xl border-2 text-right transition-all transform active:scale-[0.98] shadow-sm
                                            ${inStock
                                                ? 'bg-white dark:bg-zinc-800 border-slate-100 dark:border-white/10 hover:border-black dark:hover:border-white hover:shadow-lg hover:shadow-black/10 cursor-pointer'
                                                : 'bg-slate-100 dark:bg-zinc-900 border-white/5 opacity-40 cursor-not-allowed'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${inStock ? 'text-emerald-600 bg-emerald-50 dark:text-green-400 dark:bg-green-500/10' : 'text-slate-900 bg-slate-100 dark:text-zinc-100 dark:bg-white/10'}`}>
                                                {inStock ? `${Number(product.availableQuantity)} متاح` : 'نفد'}
                                            </span>
                                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white uppercase tracking-wider">
                                                {product.categoryName}
                                            </span>
                                        </div>
                                        <h3 className="font-black text-slate-900 dark:text-white leading-tight mb-2 line-clamp-2 text-right text-sm">
                                            {product.name}
                                        </h3>
                                        <p className="text-[11px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-tighter">{product.sku}</p>
                                        <div className="mt-auto pt-3 border-t border-slate-50 dark:border-white/10 flex justify-between items-center">
                                            <div className="w-7 h-7 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
                                                <Plus className="w-4 h-4 text-black dark:text-white" />
                                            </div>
                                            <span className="font-black text-slate-900 dark:text-white text-base">
                                                {Number(product.sellPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right: Cart */}
                <div className="w-1/2 flex flex-col bg-slate-100 dark:bg-black">
                    <div className="p-5 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-white/10 shadow-sm">
                        {selectedTech ? (
                            <h2 className="text-sm font-black text-slate-700 dark:text-white flex items-center gap-2">
                                <ShoppingCart className="w-4 h-4 text-slate-400" />
                                تحويل إلى: <span className="text-black dark:text-white underline decoration-black/30 dark:decoration-white/30 underline-offset-4">{selectedTech.name}</span>
                                {selectedTech.warehouseId ? '' : <span className="text-slate-900 dark:text-zinc-400 text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 mr-2">(لا يوجد مخزن!)</span>}
                            </h2>
                        ) : (
                            <div className="text-slate-400 dark:text-zinc-500 italic text-sm font-black">اختار مهندس لبدء التسليم</div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-zinc-800 border-2 border-dashed border-slate-200 dark:border-white/5 rounded-2xl bg-white/30 dark:bg-transparent">
                                <ShoppingCart className="w-16 h-16 mb-4 opacity-10" />
                                <p className="text-base font-black uppercase tracking-tighter opacity-50">السلة فارغة</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <div key={item.id} className="bg-white dark:bg-zinc-800 p-5 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between shadow-sm group/item hover:border-cyan-500/50 transition-all">
                                    <div className="flex-1">
                                        <h4 className="font-black text-slate-900 dark:text-white text-sm">{item.name}</h4>
                                        <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 mb-3 tracking-tighter">{item.sku}</p>
                                        <div className="flex flex-col gap-2">
                                            <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">تسعير النقل</span>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <button onClick={() => updatePriceTier(item.id, 'Cost')} className={`px-2.5 py-1.5 text-[9px] font-black rounded-lg border transition-all ${item.priceTier === 'Cost' ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-lg' : 'bg-slate-100 dark:bg-black/40 border-slate-300 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/5'}`}>التكلفة ({Number(item.costPrice).toLocaleString()})</button>
                                                <button onClick={() => updatePriceTier(item.id, 'Sell 1')} className={`px-2.5 py-1.5 text-[9px] font-black rounded-lg border transition-all ${item.priceTier === 'Sell 1' ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-lg' : 'bg-slate-100 dark:bg-black/40 border-slate-300 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/5'}`}>مفرق ({Number(item.sellPrice).toLocaleString()})</button>
                                                <button onClick={() => updatePriceTier(item.id, 'Sell 2')} className={`px-2.5 py-1.5 text-[9px] font-black rounded-lg border transition-all ${item.priceTier === 'Sell 2' ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-lg' : 'bg-slate-100 dark:bg-black/40 border-slate-300 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/5'}`}>جملة ({Number(item.sellPrice2).toLocaleString()})</button>
                                                <button onClick={() => updatePriceTier(item.id, 'Sell 3')} className={`px-2.5 py-1.5 text-[9px] font-black rounded-lg border transition-all ${item.priceTier === 'Sell 3' ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-lg' : 'bg-slate-100 dark:bg-black/40 border-slate-300 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/5'}`}>نص جملة ({Number(item.sellPrice3).toLocaleString()})</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 mr-4">
                                        <div className="flex items-center bg-slate-100 dark:bg-black rounded-xl p-1 shadow-inner border border-slate-200 dark:border-white/5">
                                            <button
                                                onClick={() => updateQuantity(item.id, -1)}
                                                className="w-9 h-9 flex items-center justify-center bg-white dark:bg-zinc-900 rounded-lg text-slate-700 dark:text-white hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all shadow-sm"
                                            >
                                                <Minus className="w-3.5 h-3.5" />
                                            </button>
                                            <span className="w-12 text-center font-black text-slate-900 dark:text-white text-base">{Number(item.cartQuantity)}</span>
                                            <button
                                                onClick={() => updateQuantity(item.id, 1)}
                                                className="w-9 h-9 flex items-center justify-center bg-white dark:bg-zinc-900 rounded-lg text-slate-700 dark:text-white hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all shadow-sm"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 flex items-center justify-center text-slate-300 dark:text-zinc-600 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover/item:opacity-100 font-black">
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-6 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-white/10 shadow-2xl z-20">
                        {cart.length > 0 && (
                            <div className="flex justify-between text-xs text-slate-500 dark:text-zinc-400 mb-4 font-black uppercase tracking-widest">
                                <span>إجمالي القطع</span>
                                <span className="text-slate-900 dark:text-white underline underline-offset-4 decoration-slate-300">{cart.reduce((a, c) => a + Number(c.cartQuantity), 0)} قطعة</span>
                            </div>
                        )}
                        <button
                            onClick={handleTransfer}
                            disabled={!selectedTechId || !selectedSourceWarehouseId || cart.length === 0 || isPending}
                            className={`w-full py-4 rounded-2xl text-base font-black flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-lg
                                ${!selectedTechId || !selectedSourceWarehouseId || cart.length === 0 || isPending
                                    ? 'bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-zinc-600 cursor-not-allowed border border-slate-300 dark:border-0'
                                    : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-400 hover:to-green-500 shadow-emerald-500/25'
                                }`}
                        >
                            {isPending ? (
                                <><Loader2 className="w-6 h-6 animate-spin" /> جاري التحويل...</>
                            ) : (
                                <><CheckCircle2 className="w-6 h-6" /> تأكيد التسليم ({cart.reduce((a, c) => a + Number(c.cartQuantity), 0)} قطعة)</>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <TransferConsole
                isOpen={isTransferConsoleOpen}
                onClose={() => setIsTransferConsoleOpen(false)}
                availableSources={transferEntities}
                availableDestinations={transferEntities}
                csrfToken={csrfToken || undefined}
                onTransferComplete={() => {
                    getTechniciansForCustody().then(res => {
                        if ((res as any)?.data) setTechnicians((res as any).data);
                    });
                }}
            />
        </div>
    );
}
