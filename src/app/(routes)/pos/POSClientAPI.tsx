"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, PauseCircle, PlayCircle, XCircle, User, Phone } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useCartStore } from "@/store/cart";
import { useFormatCurrency } from "@/contexts/SettingsContext";
import clsx from "clsx";
import CheckoutModal from "@/components/pos/CheckoutModal";
import ReceiptModal from "@/components/pos/ReceiptModal";
import CustomerSearch from "@/components/pos/CustomerSearch";
import CategoryModal from "@/components/pos/CategoryModal";

import { VirtuosoGrid } from 'react-virtuoso';

// ... (other imports remain, remove unused if any)

export default function POSClientAPI({ products, categories: initialCategories, settings, csrfToken }: any) {
    const t = useTranslations("POS");
    const router = useRouter();
    const formatCurrency = useFormatCurrency();
    const [search, setSearch] = useState("");
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [showHeldCarts, setShowHeldCarts] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState<{ id: string; name: string; color: string } | null>(null);
    // Local categories state for instant UI updates after create/edit
    const [localCategories, setLocalCategories] = useState<{ id: string; name: string; color: string }[]>(initialCategories || []);

    // 🛡️ OFFLINE HANDLING
    const { isOnline } = useNetworkStatus();
    const [cachedProducts, setCachedProducts] = useState<any[]>([]);

    useEffect(() => {
        if (!isOnline) {
            import('@/lib/product-cache').then(({ ProductCacheService }) => {
                ProductCacheService.getProducts().then(setCachedProducts);
            });
        }
    }, [isOnline]);

    const displayProducts = isOnline ? products : cachedProducts;

    const {
        items, addToCart, removeFromCart, updateQuantity, getTotal, clearCart,
        holdCart, heldCarts, resumeCart, removeHeldCart,
        customerName, customerPhone, setCustomer
    } = useCartStore();

    const filteredProducts = useMemo(() => {
        return displayProducts.filter((p: any) => {
            const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.includes(search)) || (p.barcode && p.barcode.includes(search));
            const matchesCategory = selectedCategory ? p.categoryId === selectedCategory : true;
            return matchesSearch && matchesCategory;
        });
    }, [displayProducts, search, selectedCategory]);

    // Grid Cell Renderer - This is no longer needed with VirtuosoGrid's itemContent
    // const Cell = ({ columnIndex, rowIndex, style, data }: any) => {
    //     const { items, columnCount } = data;
    //     const index = rowIndex * columnCount + columnIndex;
    //     const p = items[index];

    //     if (!p) return null;

    //     return (
    //         <div style={{ ...style, left: (style.left as number) + 10, top: (style.top as number) + 10, width: (style.width as number) - 10, height: (style.height as number) - 10 }}>
    //             <button
    //                 onClick={() => addToCart(p)}
    //                 className="w-full h-full bg-[#1f1f22] hover:bg-[#27272a] p-4 rounded-2xl flex flex-col items-start gap-2 transition-all text-left group relative overflow-hidden shadow-sm border border-white/5"
    //             >
    //                 <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
    //                     <Plus className="w-5 h-5 text-cyan-400 bg-black/50 rounded-full" />
    //                 </div>

    //                 <div className="flex justify-between w-full">
    //                     <div className="h-10 w-10 bg-black/20 rounded-lg flex items-center justify-center text-xs font-bold text-zinc-500">
    //                         {p.sku.slice(0, 2)}
    //                     </div>
    //                     <span className={clsx(
    //                         "text-[10px] font-bold px-2 py-1 rounded-full h-fit",
    //                         p.stock > 5 ? "bg-green-500/10 text-green-500" :
    //                             p.stock > 0 ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"
    //                     )}>
    //                         {p.stock}
    //                     </span>
    //                 </div>

    //                 <div>
    //                     <div className="font-bold text-sm line-clamp-2 text-zinc-200 group-hover:text-white">{p.name}</div>
    //                     <div className="text-cyan-400 font-mono text-sm">${Number(p.sellPrice).toFixed(2)}</div>
    //                 </div>
    //             </button>
    //         </div>
    //     );
    // };

    return (
        <div className="flex h-full w-full gap-0">
            {/* LEFT: Cart Sidebar - UNCHANGED */}
            <div className="w-full md:w-[400px] flex flex-col h-full bg-card border-r border-border z-20 shadow-2xl shrink-0">
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Header */}
                    <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50">
                        <h2 className="font-bold flex items-center gap-2 text-lg text-foreground">
                            <ShoppingCart className="w-5 h-5 text-cyan-400" />
                            {t('items')}
                            <span className="bg-cyan-500 text-black font-bold text-xs px-2 py-0.5 rounded-full">{items.length}</span>
                        </h2>
                        <div className="flex items-center gap-2">
                            {heldCarts.length > 0 && (
                                <button
                                    onClick={() => setShowHeldCarts(!showHeldCarts)}
                                    className="flex items-center gap-1 text-yellow-400 text-xs font-bold animate-pulse px-2 py-1 bg-yellow-400/10 rounded-lg border border-yellow-400/20"
                                >
                                    <PauseCircle className="w-3 h-3" />
                                    {heldCarts.length} {t('held')}
                                </button>
                            )}
                            <button onClick={clearCart} className="text-zinc-500 hover:text-red-400 text-xs font-bold hover:underline px-2 transition-colors">
                                {t('clear')}
                            </button>
                        </div>
                    </div>

                    {/* Held Carts Overlay */}
                    {showHeldCarts && (
                        <div className="absolute top-14 left-0 w-full bg-black/95 backdrop-blur-xl z-30 border-b border-white/10 p-2 space-y-2 animate-fly-in">
                            <div className="flex justify-between items-center px-2">
                                <span className="text-xs font-bold text-zinc-400">{t('heldCartsTitle')}</span>
                                <button onClick={() => setShowHeldCarts(false)}><XCircle className="w-4 h-4 text-zinc-500" /></button>
                            </div>
                            {heldCarts.map(cart => (
                                <div key={cart.id} className="bg-white/5 p-2 rounded-lg flex justify-between items-center border border-white/5 hover:border-white/20 transition-colors">
                                    <div>
                                        <div className="text-sm font-bold text-white">{cart.name}</div>
                                        <div className="text-xs text-zinc-500">{new Date(cart.date).toLocaleTimeString()} • {cart.items.length} Items</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { resumeCart(cart.id); setShowHeldCarts(false); }} className="p-1 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30">
                                            <PlayCircle className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => removeHeldCart(cart.id)} className="p-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Cart Items List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar bg-card">
                        {items.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-700 opacity-50">
                                <ShoppingCart className="w-16 h-16 mb-4 opacity-50" />
                                <p className="text-sm font-bold uppercase tracking-widest">{t('emptyCart')}</p>
                            </div>
                        )}
                        {items.map((item) => (
                            <div key={item.id} className="relative bg-muted/30 border border-border p-4 rounded-2xl flex justify-between items-center group overflow-hidden shadow-lg mb-3">
                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                                <div className="relative z-10">
                                    <div className="font-black text-lg text-foreground mb-1 truncate max-w-[180px]">{item.name}</div>
                                    <div className="flex items-baseline gap-2">
                                        <div className="text-cyan-400 font-black text-base font-mono">{formatCurrency(item.price)}</div>
                                        <div className="text-zinc-500 text-xs font-bold">x {item.quantity}</div>
                                    </div>
                                </div>
                                <div className="relative z-10 flex items-center gap-4">
                                    <div className="flex items-center gap-2 bg-background/50 rounded-xl p-1.5 border border-border shadow-inner">
                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-colors border border-white/5"><Minus className="w-4 h-4" /></button>
                                        <span className="w-8 text-center text-lg font-black font-mono text-white tracking-tight">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition-colors border border-white/5 shadow-[0_0_10px_rgba(6,182,212,0.3)]"><Plus className="w-4 h-4" /></button>
                                    </div>
                                    <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 flex items-center justify-center border border-red-500/20 transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-5 h-5" /></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-border bg-card shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10">
                        {/* ... Footer content same as before ... */}
                        <div className="flex flex-col items-end mb-4 px-2 text-right">
                            <div className="flex justify-between w-full text-zinc-500 text-xs font-bold uppercase tracking-wider">
                                <span>{t('subtotal')}</span>
                                <span>{formatCurrency(getTotal())}</span>
                            </div>
                            {settings?.taxRate > 0 && (
                                <div className="flex justify-between w-full text-cyan-400 text-xs font-bold uppercase tracking-wider mt-1">
                                    <span>{t('tax')} ({Number(settings.taxRate)}%)</span>
                                    <span>{formatCurrency(getTotal() * (Number(settings.taxRate) / 100))}</span>
                                </div>
                            )}
                            <div className="flex justify-between w-full items-end mt-2">
                                <span className="text-zinc-400 text-sm font-bold uppercase tracking-wider">{t('total')}</span>
                                <span className="text-4xl font-black text-foreground tracking-tighter">
                                    {formatCurrency(getTotal() * (1 + (Number(settings?.taxRate || 0) / 100)))}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3 h-14">
                            <button onClick={() => holdCart()} disabled={items.length === 0} className="w-16 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 font-bold rounded-xl flex items-center justify-center border border-yellow-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="Hold Cart"><PauseCircle className="w-6 h-6" /></button>
                            <button onClick={() => setIsCheckoutOpen(true)} disabled={items.length === 0} className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xl tracking-wide rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(0,242,255,0.3)] hover:shadow-[0_0_30px_rgba(0,242,255,0.5)] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"><Banknote className="w-6 h-6" />{t('checkout')}</button>
                        </div>
                    </div>
                </div>
            </div>

            <CheckoutModal
                isOpen={isCheckoutOpen}
                onClose={() => setIsCheckoutOpen(false)}
                settings={settings}
                csrfToken={csrfToken}
            />

            <CategoryModal
                isOpen={isCategoryModalOpen}
                onClose={() => {
                    setIsCategoryModalOpen(false);
                    setCategoryToEdit(null);
                }}
                category={categoryToEdit}
                csrfToken={csrfToken}
                onCategorySaved={(savedCategory) => {
                    setLocalCategories(prev => {
                        const exists = prev.find(c => c.id === savedCategory.id);
                        if (exists) {
                            // Update existing
                            return prev.map(c => c.id === savedCategory.id ? { ...c, ...savedCategory } : c);
                        } else {
                            // Add new
                            return [...prev, savedCategory];
                        }
                    });
                }}
            />

            {/* RIGHT SIDE: Product Grid */}
            <div className="flex-1 flex bg-muted/10">
                {/* Categories */}
                <div className="w-40 border-r border-border bg-card/50 backdrop-blur-2xl px-2 py-4 flex flex-col gap-2 overflow-y-auto no-scrollbar z-10 h-full">
                    <button onClick={() => setSelectedCategory(null)} className={clsx("w-full h-16 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-300 shadow-lg relative overflow-hidden group shrink-0", selectedCategory === null ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(0,242,255,0.4)] scale-[1.02]" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground")}>{t('allCategories')}</button>
                    {localCategories.map((c: any) => (
                        <button
                            key={c.id}
                            onClick={() => setSelectedCategory(c.id)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setCategoryToEdit(c);
                                setIsCategoryModalOpen(true);
                            }}
                            className={clsx("w-full h-24 rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all duration-300 shadow-lg relative overflow-hidden group shrink-0 text-center break-words p-2 border border-white/5", selectedCategory === c.id ? "scale-[1.02] ring-2 ring-white/50" : "hover:scale-[1.02] opacity-90 hover:opacity-100")}
                            style={{ backgroundColor: c.color || "#06b6d4", color: "#000", textShadow: "0px 1px 2px rgba(255,255,255,0.2)" }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                            <span className="relative z-10 text-white drop-shadow-md text-sm uppercase tracking-wider">{c.name}</span>
                        </button>
                    ))}

                    {/* Add Category Button */}
                    <button
                        onClick={() => {
                            setCategoryToEdit(null);
                            setIsCategoryModalOpen(true);
                        }}
                        className="w-full h-16 rounded-xl flex items-center justify-center bg-zinc-800/50 border border-dashed border-zinc-700 text-zinc-500 hover:text-cyan-400 hover:border-cyan-500/50 hover:bg-zinc-800 transition-all shrink-0 group border-2"
                        title={t('addCategory') || "Add Category"}
                    >
                        <Plus className="w-6 h-6 group-hover:scale-125 transition-transform" />
                    </button>
                </div>

                {/* Products */}
                <div className="flex-1 flex flex-col gap-4 h-full overflow-hidden p-4">
                    {/* Search Header */}
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-3">
                            <div className="bg-card rounded-xl flex items-center gap-3 py-3 px-4 flex-[2] border border-border transition-all focus-within:border-cyan-500/50">
                                <Search className="w-5 h-5 text-muted-foreground" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchPlaceholder')} className="bg-transparent outline-none w-full placeholder:text-muted-foreground text-foreground" />
                            </div>

                            {/* New Customer Search Component */}
                            <div className="flex-[2]">
                                <CustomerSearch />
                            </div>
                        </div>
                    </div>

                    {/* VIRTUALIZED GRID (Virtuoso) */}
                    <div className="flex-1 -mx-4 px-4"> {/* Negative margin to allow full scroll but padding for look */}
                        <VirtuosoGrid
                            style={{ height: '100%', width: '100%' }}
                            data={filteredProducts}
                            listClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-20"
                            itemContent={(index, p) => (
                                <button
                                    key={p.id}
                                    onClick={() => addToCart(p)}
                                    className="h-[140px] w-full bg-card hover:bg-muted/50 p-4 rounded-2xl flex flex-col items-start gap-2 transition-all text-left group relative overflow-hidden shadow-sm border border-border"
                                >
                                    <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Plus className="w-5 h-5 text-cyan-400 bg-black/50 rounded-full" />
                                    </div>

                                    <div className="flex justify-between w-full">
                                        <div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center text-xs font-bold text-muted-foreground">
                                            {(p.sku || "??").slice(0, 2)}
                                        </div>
                                        <span className={clsx(
                                            "text-[10px] font-bold px-2 py-1 rounded-full h-fit",
                                            p.stock > 5 ? "bg-green-500/10 text-green-500" :
                                                p.stock > 0 ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"
                                        )}>
                                            {p.stock}
                                        </span>
                                    </div>

                                    <div>
                                        <div className="font-bold text-sm line-clamp-2 text-foreground group-hover:text-primary transition-colors">{p.name}</div>
                                        <div className="text-cyan-400 font-mono text-sm">{formatCurrency(p.sellPrice)}</div>
                                    </div>
                                </button>
                            )}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

