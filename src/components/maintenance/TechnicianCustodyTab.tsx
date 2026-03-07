'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import {
    Search,
    ShoppingCart,
    ArrowRight,
    Plus,
    Minus,
    Box,
    AlertCircle,
    CheckCircle2,
    Loader2,
    ArrowRightLeft
} from 'lucide-react';
import { toast } from 'sonner';
import {
    getTechniciansForCustody,
    searchProductsForCustody
} from '@/actions/technician-custody-actions';
import { useCSRF } from "@/contexts/CSRFContext";
import { transferStock } from '@/actions/inventory-transfer';
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
};

type CartItem = ProductItem & {
    cartQuantity: number;
};

export default function TechnicianCustodyTab() {
    const { token: csrfToken } = useCSRF();
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isPending, startTransition] = useTransition();
    const [isLoadingTechs, setIsLoadingTechs] = useState(true);
    const [isTransferConsoleOpen, setIsTransferConsoleOpen] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setIsLoadingTechs(true);
            try {
                const [techRes, whRes] = await Promise.all([
                    getTechniciansForCustody(),
                    getAllWarehouses()
                ]);

                if ((techRes as any)?.data) setTechnicians((techRes as any).data);
                if ((whRes as any)?.data) setWarehouses((whRes as any).data);

            } catch (error) {
                console.error("Failed to load initial data", error);
                toast.error("Failed to load data");
            } finally {
                setIsLoadingTechs(false);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        const timer = setTimeout(async () => {
            const res = await searchProductsForCustody({
                query: searchQuery,
                technicianId: selectedTechId || undefined
            });

            if ((res as any)?.data) {
                setProducts((res as any).data);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, selectedTechId]);

    const addToCart = (product: ProductItem) => {
        if (!selectedTechId) {
            toast.error("Please select a technician first!");
            return;
        }

        if (product.availableQuantity <= 0) {
            toast.error("Item is out of stock.");
            return;
        }

        setCart(prev => {
            const existing = prev.find(p => p.id === product.id);
            if (existing) {
                if (existing.cartQuantity >= product.availableQuantity) {
                    toast.error("Cannot add more than available stock.");
                    return prev;
                }
                return prev.map(p => p.id === product.id ? { ...p, cartQuantity: p.cartQuantity + 1 } : p);
            }
            return [...prev, { ...product, cartQuantity: 1 }];
        });
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(p => p.id !== productId));
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev => prev.map(p => {
            if (p.id !== productId) return p;
            const newQty = p.cartQuantity + delta;
            if (newQty > p.availableQuantity) {
                toast.error("Max stock reached");
                return p;
            }
            return newQty > 0 ? { ...p, cartQuantity: newQty } : p;
        }));
    };

    const handleQuickTransfer = () => {
        if (!selectedTechId) return;
        if (cart.length === 0) return;

        startTransition(async () => {
            const result = await transferStock({
                sourceId: 'WAREHOUSE', // Fixed source for now
                sourceType: 'WAREHOUSE',
                destinationId: selectedTechId,
                destinationType: 'ENGINEER',
                items: cart.map(item => ({
                    productId: item.id,
                    quantity: item.cartQuantity
                })),
                csrfToken: csrfToken ?? undefined
            });

            if (result && result.success) {
                toast.success("Custody transfer complete!");
                setCart([]);
                const res = await getTechniciansForCustody();
                if ((res as any)?.data) setTechnicians((res as any).data);
            } else {
                toast.error((result as any)?.message || "Transfer failed.");
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

    return (
        <div className="flex flex-col h-full h-[calc(100vh-100px)] bg-black overflow-hidden relative">
            <header className="bg-zinc-900 border-b border-white/10 p-4 shadow-sm z-10 shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Box className="w-6 h-6 text-cyan-500" />
                        Custody Handover
                    </h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsTransferConsoleOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 hover:text-white transition-all font-bold text-sm"
                        >
                            <ArrowRightLeft className="w-4 h-4" />
                            Advanced Transfer
                        </button>
                    </div>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x">
                    {isLoadingTechs ? (
                        <div className="flex gap-4">
                            {[1, 2, 3].map(i => <div key={i} className="w-32 h-32 bg-white/5 animate-pulse rounded-xl" />)}
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
                                    flex flex-col items-center justify-center min-w-[120px] p-4 rounded-xl border-2 transition-all duration-200 snap-start
                                    ${selectedTechId === tech.id
                                        ? 'border-cyan-500 bg-cyan-500/10 scale-105 shadow-md shadow-cyan-500/25'
                                        : 'border-white/10 bg-white/5 hover:border-white/20'
                                    }
                                `}
                            >
                                <div className={`
                                    w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-2
                                    ${selectedTechId === tech.id ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white'}
                                `}>
                                    {tech.name.substring(0, 2).toUpperCase()}
                                </div>
                                <span className={`text-sm font-medium truncate w-full text-center ${selectedTechId === tech.id ? 'text-cyan-400' : 'text-white'}`}>
                                    {tech.name}
                                </span>
                                <span className="text-xs text-zinc-500 mt-1">
                                    {tech.itemCount} Items
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <div className="w-1/2 flex flex-col border-r border-white/10 bg-zinc-900">
                    <div className="p-4 border-b border-white/10">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="Search Part..."
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-white/20 bg-black text-white outline-none text-lg"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
                        {products.map(product => {
                            const inStock = product.availableQuantity > 0;
                            return (
                                <button
                                    key={product.id}
                                    disabled={!inStock}
                                    onClick={() => addToCart(product)}
                                    className={`
                                    flex flex-col p-4 rounded-xl border text-left transition-all active:scale-95
                                    ${inStock
                                            ? 'bg-zinc-800 border-white/10 hover:border-cyan-500 cursor-pointer'
                                            : 'bg-zinc-900 border-white/5 opacity-40 cursor-not-allowed'
                                        }
                                `}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/10 text-cyan-400 uppercase tracking-wider">
                                            {product.categoryName}
                                        </span>
                                        {inStock ? (
                                            <span className="flex items-center text-xs font-bold text-green-600">
                                                {product.availableQuantity} Avail
                                            </span>
                                        ) : (
                                            <span className="flex items-center text-xs font-bold text-red-500">
                                                Out
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="font-semibold text-white leading-tight mb-1 line-clamp-2">
                                        {product.name}
                                    </h3>
                                    <p className="text-sm text-zinc-500">{product.sku}</p>
                                    <div className="mt-auto pt-2 border-t border-white/10 flex justify-between items-center px-4 py-2">
                                        <span className="font-mono text-white">{product.sellPrice.toFixed(2)}</span>
                                        <Plus className="w-5 h-5 text-cyan-500" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="w-1/2 flex flex-col bg-black">
                    <div className="p-4 bg-zinc-900 border-b border-white/10 shadow-sm z-10">
                        {selectedTech ? (
                            <h2 className="text-lg font-bold text-white">Transferring to {selectedTech.name}</h2>
                        ) : (
                            <div className="flex items-center text-zinc-500 italic">
                                Select a technician to start Quick Handover
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-white/10 rounded-xl m-4">
                                <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
                                <p>Cart is empty</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <div key={item.id} className="bg-zinc-800 p-4 rounded-xl border border-white/10 flex items-center justify-between">
                                    <div className="flex-1">
                                        <h4 className="font-medium text-white">{item.name}</h4>
                                        <p className="text-xs text-zinc-500">{item.sku}</p>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center bg-black rounded-lg p-1">
                                            <button
                                                onClick={() => updateQuantity(item.id, -1)}
                                                className="w-10 h-10 flex items-center justify-center bg-zinc-900 rounded-md text-white hover:text-red-400"
                                            >
                                                <Minus className="w-5 h-5" />
                                            </button>
                                            <span className="w-12 text-center font-bold text-lg text-white">
                                                {item.cartQuantity}
                                            </span>
                                            <button
                                                onClick={() => updateQuantity(item.id, 1)}
                                                className="w-10 h-10 flex items-center justify-center bg-zinc-900 rounded-md text-white hover:text-green-400"
                                            >
                                                <Plus className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 bg-zinc-900 border-t border-white/10">
                        <button
                            onClick={handleQuickTransfer}
                            disabled={!selectedTechId || cart.length === 0 || isPending}
                            className={`
                                w-full py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-3
                                ${!selectedTechId || cart.length === 0 || isPending
                                    ? 'bg-white/10 text-zinc-600 cursor-not-allowed'
                                    : 'bg-green-600 text-black hover:bg-green-500'
                                }
                            `}
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-6 h-6" />
                                    Confirm Transfer ({cart.reduce((a, c) => a + c.cartQuantity, 0)} Items)
                                </>
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
                onTransferComplete={() => {
                    getTechniciansForCustody().then(res => {
                        if ((res as any)?.data) setTechnicians((res as any).data);
                    });
                }}
            />
        </div>
    );
}
