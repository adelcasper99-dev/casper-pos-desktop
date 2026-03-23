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
    costPrice: number;
    sellPrice: number;
    sellPrice2: number;
    sellPrice3: number;
};

type CartItem = ProductItem & {
    cartQuantity: number;
    priceTier: 'Cost' | 'Sell 1' | 'Sell 2' | 'Sell 3';
};

export default function TechnicianCustodyTab() {
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
        if (product.availableQuantity <= 0) {
            toast.error("المنتج نفد من المخزن.");
            return;
        }
        setCart(prev => {
            const existing = prev.find(p => p.id === product.id);
            if (existing) {
                if (existing.cartQuantity >= product.availableQuantity) {
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
            if (newQty > p.availableQuantity) { toast.error("وصلت للحد الأقصى"); return p; }
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
        <div className="flex flex-col h-[calc(100vh-100px)] bg-black overflow-hidden relative">
            {/* Header */}
            <header className="bg-zinc-900 border-b border-white/10 p-4 shadow-sm z-10 shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Box className="w-6 h-6 text-cyan-500" />
                        تسليم عهدة للمهندسين
                    </h1>
                    <button
                        onClick={() => setIsTransferConsoleOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 hover:text-white transition-all font-bold text-sm"
                    >
                        <ArrowRightLeft className="w-4 h-4" />
                        تحويل متقدم
                    </button>
                </div>

                {/* Source Warehouse Selector */}
                <div className="mb-4">
                    <label className="text-xs text-zinc-500 uppercase font-bold mb-2 flex items-center gap-1">
                        <Warehouse className="w-3 h-3" /> المخزن المصدر
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {warehouses.map(wh => (
                            <button
                                key={wh.id}
                                onClick={() => {
                                    setSelectedSourceWarehouseId(wh.id);
                                    setCart([]);
                                }}
                                className={`flex-shrink-0 px-4 py-2 rounded-lg border text-sm font-medium transition-all
                                    ${selectedSourceWarehouseId === wh.id
                                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                                        : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20'
                                    }`}
                            >
                                {wh.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Technician Selector */}
                <label className="text-xs text-zinc-500 uppercase font-bold mb-2 flex items-center gap-1">
                    المهندس المستلم
                </label>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x">
                    {isLoadingTechs ? (
                        <div className="flex gap-4">
                            {[1, 2, 3].map(i => <div key={i} className="w-28 h-28 bg-white/5 animate-pulse rounded-xl" />)}
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
                                    flex flex-col items-center justify-center min-w-[110px] p-3 rounded-xl border-2 transition-all duration-200 snap-start
                                    ${selectedTechId === tech.id
                                        ? 'border-cyan-500 bg-cyan-500/10 scale-105 shadow-md shadow-cyan-500/25'
                                        : 'border-white/10 bg-white/5 hover:border-white/20'
                                    }
                                `}
                            >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold mb-2
                                    ${selectedTechId === tech.id ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white'}`}>
                                    {tech.name.substring(0, 2).toUpperCase()}
                                </div>
                                <span className={`text-xs font-medium truncate w-full text-center ${selectedTechId === tech.id ? 'text-cyan-400' : 'text-white'}`}>
                                    {tech.name}
                                </span>
                                <span className="text-[10px] text-zinc-500 mt-0.5">{tech.itemCount} قطعة</span>
                                {!tech.warehouseId && (
                                    <span className="text-[9px] text-red-400 mt-0.5">بدون مخزن</span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </header>

            {/* Body: Products | Cart */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Products */}
                <div className="w-1/2 flex flex-col border-r border-white/10 bg-zinc-900">
                    <div className="p-4 border-b border-white/10">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="ابحث عن قطعة..."
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-white/20 bg-black text-white outline-none text-base"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        {selectedSourceWh && (
                            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                                <Warehouse className="w-3 h-3" /> من: {selectedSourceWh.name}
                            </p>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
                        {products.length === 0 ? (
                            <div className="col-span-2 text-center text-zinc-600 py-12 italic">
                                لا توجد منتجات — ابحث أو اختار مخزن آخر
                            </div>
                        ) : (
                            products.map(product => {
                                const inStock = product.availableQuantity > 0;
                                return (
                                    <button
                                        key={product.id}
                                        disabled={!inStock}
                                        onClick={() => addToCart(product)}
                                        className={`flex flex-col p-4 rounded-xl border text-right transition-all active:scale-95
                                            ${inStock
                                                ? 'bg-zinc-800 border-white/10 hover:border-cyan-500 cursor-pointer'
                                                : 'bg-zinc-900 border-white/5 opacity-40 cursor-not-allowed'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-xs font-bold ${inStock ? 'text-green-400' : 'text-red-400'}`}>
                                                {inStock ? `${product.availableQuantity} متاح` : 'نفد'}
                                            </span>
                                            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-cyan-400 uppercase">
                                                {product.categoryName}
                                            </span>
                                        </div>
                                        <h3 className="font-semibold text-white leading-tight mb-1 line-clamp-2 text-right">
                                            {product.name}
                                        </h3>
                                        <p className="text-xs text-zinc-500">{product.sku}</p>
                                        <div className="mt-auto pt-2 border-t border-white/10 flex justify-between items-center">
                                            <Plus className="w-4 h-4 text-cyan-500" />
                                            <span className="font-mono text-white text-sm">{product.sellPrice.toFixed(2)}</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right: Cart */}
                <div className="w-1/2 flex flex-col bg-black">
                    <div className="p-4 bg-zinc-900 border-b border-white/10">
                        {selectedTech ? (
                            <h2 className="text-base font-bold text-white">
                                تسليم إلى: <span className="text-cyan-400">{selectedTech.name}</span>
                                {selectedTech.warehouseId ? '' : <span className="text-red-400 text-xs mr-2">(لا يوجد مخزن!)</span>}
                            </h2>
                        ) : (
                            <div className="text-zinc-500 italic text-sm">اختار مهندس لبدء التسليم</div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-white/10 rounded-xl">
                                <ShoppingCart className="w-10 h-10 mb-3 opacity-20" />
                                <p className="text-sm">السلة فارغة</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <div key={item.id} className="bg-zinc-800 p-4 rounded-xl border border-white/10 flex items-center justify-between">
                                    <div className="flex-1">
                                        <h4 className="font-medium text-white text-sm">{item.name}</h4>
                                        <p className="text-xs text-zinc-500 mb-2">{item.sku}</p>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] text-zinc-500 uppercase">تسعير النقل</span>
                                            <div className="flex items-center gap-1 flex-wrap">
                                                <button onClick={() => updatePriceTier(item.id, 'Cost')} className={`px-2 py-1 text-[10px] rounded border transition-colors ${item.priceTier === 'Cost' ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300' : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'}`}>التكلفة ({item.costPrice})</button>
                                                <button onClick={() => updatePriceTier(item.id, 'Sell 1')} className={`px-2 py-1 text-[10px] rounded border transition-colors ${item.priceTier === 'Sell 1' ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300' : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'}`}>مفرق ({item.sellPrice})</button>
                                                <button onClick={() => updatePriceTier(item.id, 'Sell 2')} className={`px-2 py-1 text-[10px] rounded border transition-colors ${item.priceTier === 'Sell 2' ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300' : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'}`}>جملة ({item.sellPrice2})</button>
                                                <button onClick={() => updatePriceTier(item.id, 'Sell 3')} className={`px-2 py-1 text-[10px] rounded border transition-colors ${item.priceTier === 'Sell 3' ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300' : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'}`}>نص جملة ({item.sellPrice3})</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center bg-black rounded-lg p-1">
                                            <button
                                                onClick={() => updateQuantity(item.id, -1)}
                                                className="w-8 h-8 flex items-center justify-center bg-zinc-900 rounded-md text-white hover:text-red-400"
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span className="w-10 text-center font-bold text-white">{item.cartQuantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.id, 1)}
                                                className="w-8 h-8 flex items-center justify-center bg-zinc-900 rounded-md text-white hover:text-green-400"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <button onClick={() => removeFromCart(item.id)} className="text-red-400 text-xs hover:text-red-300">
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 bg-zinc-900 border-t border-white/10">
                        {cart.length > 0 && (
                            <div className="flex justify-between text-xs text-zinc-400 mb-3">
                                <span>إجمالي القطع</span>
                                <span className="font-bold text-white">{cart.reduce((a, c) => a + c.cartQuantity, 0)} قطعة</span>
                            </div>
                        )}
                        <button
                            onClick={handleTransfer}
                            disabled={!selectedTechId || !selectedSourceWarehouseId || cart.length === 0 || isPending}
                            className={`w-full py-4 rounded-xl text-base font-bold flex items-center justify-center gap-3
                                ${!selectedTechId || !selectedSourceWarehouseId || cart.length === 0 || isPending
                                    ? 'bg-white/10 text-zinc-600 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-500'
                                }`}
                        >
                            {isPending ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> جاري التحويل...</>
                            ) : (
                                <><CheckCircle2 className="w-5 h-5" /> تأكيد التسليم ({cart.reduce((a, c) => a + c.cartQuantity, 0)} قطعة)</>
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
