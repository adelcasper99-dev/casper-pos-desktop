"use client";
import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, PauseCircle, PlayCircle, XCircle, User, Phone, Printer, Infinity, Loader2, ZoomIn, ZoomOut } from "lucide-react";

import { useCartStore } from "@/store/cart";
import { useFormatCurrency } from "@/contexts/SettingsContext";
import clsx from "clsx";
import CheckoutModal from "@/components/pos/CheckoutModal";
import ReceiptModal from "@/components/pos/ReceiptModal";
import CustomerSearch from "@/components/pos/CustomerSearch";
import CategoryModal from "@/components/pos/CategoryModal";
import TableSelectionModal from "@/components/pos/TableSelectionModal";
import { generateThermalReceiptHTML } from "@/components/pos/ThermalReceiptTemplate";
import { toast } from "sonner";
import { printService } from "@/lib/print-service";
import { formatArabicPrintText } from "@/lib/arabic-reshaper";
import { getBundleComponents } from "@/actions/inventory";

import { VirtuosoGrid } from 'react-virtuoso';
import { DesktopStatus } from "@/components/pos/DesktopStatus";

// ... (other imports remain, remove unused if any)

export default function POSClientAPI({ products, categories: initialCategories, settings, csrfToken, floors = [], permissions = { canCheckout: true, canHoldCart: true, canDineIn: true, canPrintReceipt: true, canChangePrice: true, canDiscount: true, canViewCost: false, maxDiscount: 0, maxDiscountAmount: 0 } }: any) {
    const t = useTranslations("POS");
    const router = useRouter();
    const formatCurrency = useFormatCurrency();
    const [search, setSearch] = useState("");
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [showHeldCarts, setShowHeldCarts] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState<{ id: string; name: string; color: string } | null>(null);
    // Local categories state for instant UI updates after create/edit
    const [localCategories, setLocalCategories] = useState<{ id: string; name: string; color: string }[]>(initialCategories || []);
    const [isPrinting, setIsPrinting] = useState(false);
    const [gridCols, setGridCols] = useState(5); // Default grid columns

    // Always use SSR products — the Next.js server is local (127.0.0.1 in Electron),
    // so navigator.onLine (WAN internet) must never gate access to DB data.
    const displayProducts = products;

    const [isSpeedPrintModalOpen, setIsSpeedPrintModalOpen] = useState(false);
    const [speedPrintData, setSpeedPrintData] = useState<any>(null);

    const {
        items, addToCart, removeFromCart, updateQuantity, getTotal, clearCart,
        holdCart, heldCarts, resumeCart, removeHeldCart,
        customerId, customerName, customerPhone, customerBalance, setCustomer,
        tableId, tableName, setTable,
        discountAmount, discountPercentage, setDiscount
    } = useCartStore();

    const [orderMode, setOrderMode] = useState<"takeaway" | "dine-in">("takeaway");
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Sync orderMode with held carts that might have a table selected
    useEffect(() => {
        if (tableId) setOrderMode("dine-in");
    }, [tableId]);

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

    const isTableEnabled = useMemo(() => {
        try {
            const feats = typeof settings?.features === 'string'
                ? JSON.parse(settings.features)
                : (settings?.features || {});
            return feats.enableTables === true;
        } catch { return false; }
    }, [settings?.features]);

    const handleSpeedPrint = async () => {
        if (items.length === 0 || isPrinting) return;

        // Open ReceiptModal instead of printing directly
        setSpeedPrintData({
            items,
            tableName,
            customerName,
            customerBalance,
            customerPhone,
            date: new Date().toISOString(),
            invoiceNumber: "DRAFT",
            subTotal: subTotal,
            discountAmount: discountAmount,
            totalAmount: finalTotal
        });
        setIsSpeedPrintModalOpen(true);
    };

    // Handle adding a product — fetches bundle components if needed
    const handleAddProduct = async (p: any) => {
        if (p.isBundle) {
            try {
                const res = await getBundleComponents(p.id);
                const components = (res as any)?.components || [];
                // Add to cart with components attached
                const cartProduct = {
                    ...p,
                    bundleComponents: components.map((c: any) => ({
                        id: c.componentProductId,
                        name: c.name,
                        quantityIncluded: c.quantityIncluded
                    }))
                };
                addToCart(cartProduct);
            } catch {
                // Fallback: add without components
                addToCart(p);
            }
        } else {
            addToCart(p);
        }
    };

    const handleSelectTable = (newTableId: string, newTableName: string, action: 'resume' | 'new' = 'resume') => {
        if (tableId === newTableId && action !== 'new') {
            setIsTableModalOpen(false);
            return;
        }

        if (items.length > 0) {
            const cartName = customerName || `${tableName || 'Cart'} - ${new Date().toLocaleTimeString()}`;
            holdCart(cartName);
        }

        setOrderMode('dine-in');
        setIsTableModalOpen(false);

        if (action === 'resume') {
            const existingCartForTable = heldCarts.find(c => c.tableId === newTableId);
            if (existingCartForTable) {
                resumeCart(existingCartForTable.id);
                return;
            }
        }

        // Action is 'new' or no existing cart
        setTable(newTableId, newTableName);
    };

    const subTotal = getTotal();
    const effectiveSubTotal = Math.max(0, subTotal - discountAmount);
    const taxRate = Number(settings?.taxRate || 0);
    const taxAmount = effectiveSubTotal * (taxRate / 100);
    const finalTotal = effectiveSubTotal + taxAmount;

    if (!isMounted) return null;

    return (
        <div className="flex h-full w-full gap-0">
            {/* LEFT: Cart Sidebar - UNCHANGED */}
            <div className="w-full md:w-[400px] flex flex-col h-full bg-card border-r border-border z-20 shadow-2xl shrink-0">
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Top Panel: Table Selection / Order Mode Toggle */}
                    <div className="p-4 border-b border-border bg-card z-10 shadow-sm flex flex-col gap-3">
                        <div className="flex bg-black/40 rounded-xl p-1 border border-white/10 shrink-0">
                            <button
                                onClick={() => {
                                    setTable(undefined, undefined);
                                    setOrderMode('takeaway');
                                }}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${orderMode === 'takeaway' && !tableId ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-500 hover:text-white'}`}
                            >
                                {t('takeaway') || 'Takeaway'}
                            </button>
                            <button
                                onClick={() => {
                                    setOrderMode('dine-in');
                                    if (!tableId) setIsTableModalOpen(true);
                                }}
                                disabled={!permissions.canDineIn}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${orderMode === 'dine-in' || tableId ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-500 hover:text-white'}`}
                            >
                                {t('dineIn') || 'Dine-In'}
                            </button>
                        </div>

                        {(orderMode === 'dine-in' || tableId) && (
                            <button
                                onClick={() => setIsTableModalOpen(true)}
                                className="bg-black/50 border border-white/10 hover:border-cyan-500/50 rounded-xl p-3 text-white text-md font-bold w-full transition-colors flex items-center justify-between animate-in fade-in slide-in-from-top-1"
                            >
                                <span>{tableId ? tableName : (t('selectTable') || "Select Table (Required)")}</span>
                                <span className="text-zinc-500 text-xs">{t('change') || 'Change'}</span>
                            </button>
                        )}
                    </div>

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
                            <div key={item.id} className="relative bg-muted/30 border border-border p-4 rounded-2xl group overflow-hidden shadow-lg mb-3">
                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                                {/* Bundle header row */}
                                <div className="relative z-10 flex justify-between items-center">
                                    <div>
                                        <div className="font-black text-lg text-foreground mb-1 truncate max-w-[180px]">
                                            {item.isBundle ? '📦 ' : ''}{item.name}
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            <div className="text-cyan-400 font-black text-base font-mono">{formatCurrency(item.price)}</div>
                                            <div className="text-zinc-500 text-xs font-bold">x {item.quantity}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 bg-background/50 rounded-xl p-1.5 border border-border shadow-inner">
                                            <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-colors border border-white/5"><Minus className="w-4 h-4" /></button>
                                            <span className="w-8 text-center text-lg font-black font-mono text-white tracking-tight">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition-colors border border-white/5 shadow-[0_0_10px_rgba(6,182,212,0.3)]"><Plus className="w-4 h-4" /></button>
                                        </div>
                                        <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 flex items-center justify-center border border-red-500/20 transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-5 h-5" /></button>
                                    </div>
                                </div>
                                {/* Bundle components listed below */}
                                {item.bundleComponents && item.bundleComponents.length > 0 && (
                                    <div className="relative z-10 mt-2 pt-2 border-t border-border/50 space-y-0.5">
                                        {item.bundleComponents.map((c) => (
                                            <div key={c.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <span className="text-amber-400">‣</span>
                                                <span>{c.name}</span>
                                                {c.quantityIncluded > 1 && (
                                                    <span className="text-zinc-600">x{c.quantityIncluded}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Discount Input in Cart */}
                    {items.length > 0 && permissions.canDiscount && (
                        <div className="px-4 py-3 bg-muted/20 border-t border-border">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">{t('discount')}</span>
                                    {(discountAmount > 0 || discountPercentage > 0) && (
                                        <button
                                            onClick={() => setDiscount(0, 0)}
                                            className="text-zinc-500 hover:text-red-400 transition-all font-bold text-[10px] uppercase"
                                        >
                                            {t('clear')}
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="relative">
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px] font-bold">ج.م</span>
                                        <input
                                            type="number"
                                            value={discountAmount || ''}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                const maxAllowedFromPct = subTotal * ((permissions.maxDiscount || 0) / 100);
                                                const maxAllowedFixed = permissions.maxDiscountAmount || 0;

                                                // The absolute maximum allowed amount is the *lower* of the two limits
                                                const actualMaxAllowed = Math.min(
                                                    maxAllowedFromPct > 0 ? maxAllowedFromPct : Number.POSITIVE_INFINITY,
                                                    maxAllowedFixed > 0 ? maxAllowedFixed : Number.POSITIVE_INFINITY
                                                );

                                                let cappedVal = Math.min(val, subTotal);
                                                if (actualMaxAllowed !== Number.POSITIVE_INFINITY && cappedVal > actualMaxAllowed) {
                                                    cappedVal = actualMaxAllowed;
                                                    toast.error(`Discount limit reached (Max Amount: ${maxAllowedFixed}, Max %: ${permissions.maxDiscount}%)`);
                                                }
                                                setDiscount(cappedVal, subTotal > 0 ? (cappedVal / subTotal) * 100 : 0);
                                            }}
                                            placeholder={t('amount')}
                                            className="w-full bg-background border border-border rounded-lg h-9 text-sm px-3 pr-8 focus:outline-none focus:border-cyan-500/50 text-foreground"
                                        />
                                    </div>
                                    <div className="relative">
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">%</span>
                                        <input
                                            type="number"
                                            value={discountPercentage || ''}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                const limitPct = permissions.maxDiscount || 0;
                                                const limitFixed = permissions.maxDiscountAmount || 0;

                                                const maxAllowedFromFixedAsPct = subTotal > 0 && limitFixed > 0 ? (limitFixed / subTotal) * 100 : Number.POSITIVE_INFINITY;

                                                const actualMaxPct = Math.min(
                                                    limitPct > 0 ? limitPct : Number.POSITIVE_INFINITY,
                                                    maxAllowedFromFixedAsPct
                                                );

                                                let cappedPct = Math.min(val, 100);
                                                if (actualMaxPct !== Number.POSITIVE_INFINITY && cappedPct > actualMaxPct) {
                                                    cappedPct = actualMaxPct;
                                                    toast.error(`Discount limit reached (Max %: ${limitPct}%, Max Amount: ${limitFixed})`);
                                                }
                                                setDiscount(subTotal * (cappedPct / 100), cappedPct);
                                            }}
                                            placeholder={t('percentage')}
                                            className="w-full bg-background border border-border rounded-lg h-9 text-sm px-3 pr-8 focus:outline-none focus:border-cyan-500/50 text-foreground"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="p-5 border-t border-border bg-card shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10">
                        {/* ... Footer content same as before ... */}
                        <div className="flex flex-col items-end mb-4 px-2 text-right">
                            <div className="flex justify-between w-full text-zinc-500 text-xs font-bold uppercase tracking-wider">
                                <span>{t('subtotal')}</span>
                                <span>{formatCurrency(subTotal)}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between w-full text-green-400 text-xs font-bold uppercase tracking-wider mt-1">
                                    <span>{t('discount')}</span>
                                    <span>- {formatCurrency(discountAmount)}</span>
                                </div>
                            )}
                            {taxRate > 0 && (
                                <div className="flex justify-between w-full text-cyan-400 text-xs font-bold uppercase tracking-wider mt-1">
                                    <span>{t('tax')} ({taxRate}%)</span>
                                    <span>{formatCurrency(taxAmount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between w-full items-end mt-2">
                                <span className="text-zinc-400 text-sm font-bold uppercase tracking-wider">{t('total')}</span>
                                <span className="text-4xl font-black text-foreground tracking-tighter">
                                    {formatCurrency(finalTotal)}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex gap-2 h-14 w-full">
                                <button
                                    onClick={handleSpeedPrint}
                                    disabled={items.length === 0 || isPrinting || !permissions.canPrintReceipt}
                                    className="w-16 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 font-bold rounded-xl flex items-center justify-center border border-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    title={t('speedPrint') || "Speed Print"}
                                >
                                    {isPrinting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-6 h-6" />}
                                </button>
                                <button onClick={() => holdCart()} disabled={items.length === 0 || isPrinting || !permissions.canHoldCart} className="w-16 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 font-bold rounded-xl flex items-center justify-center border border-yellow-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="Hold Cart">
                                    <PauseCircle className="w-6 h-6" />
                                </button>
                                <button
                                    onClick={() => setIsCheckoutOpen(true)}
                                    disabled={items.length === 0 || isPrinting || !permissions.canCheckout}
                                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xl tracking-wide rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(0,242,255,0.3)] hover:shadow-[0_0_30px_rgba(0,242,255,0.5)] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                >
                                    <Banknote className="w-6 h-6" />{t('checkout')}
                                </button>
                            </div>
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

            {isSpeedPrintModalOpen && speedPrintData && (
                <ReceiptModal
                    isOpen={isSpeedPrintModalOpen}
                    onClose={() => {
                        setIsSpeedPrintModalOpen(false);
                        setSpeedPrintData(null);
                    }}
                    saleData={speedPrintData}
                    settings={settings}
                />
            )}

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
                        <div className="flex justify-between items-center">
                            <DesktopStatus />
                        </div>
                        <div className="flex gap-3">
                            <div className="bg-card rounded-xl flex items-center gap-3 py-3 px-4 flex-[2] border border-border transition-all focus-within:border-cyan-500/50">
                                <Search className="w-5 h-5 text-muted-foreground" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchPlaceholder')} className="bg-transparent outline-none w-full placeholder:text-muted-foreground text-foreground" />
                            </div>

                            {/* New Customer Search Component */}
                            <div className="flex-[2]">
                                <CustomerSearch />
                            </div>

                            {/* Zoom Controls */}
                            <div className="flex bg-card border border-border rounded-xl overflow-hidden shadow-sm shrink-0 items-center">
                                <button
                                    onClick={() => setGridCols(prev => Math.min(8, prev + 1))}
                                    disabled={gridCols >= 8}
                                    title="Zoom Out (Smaller Items)"
                                    className="p-3 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ZoomOut className="w-5 h-5" />
                                </button>
                                <div className="w-px h-6 bg-border mx-1"></div>
                                <button
                                    onClick={() => setGridCols(prev => Math.max(2, prev - 1))}
                                    disabled={gridCols <= 2}
                                    title="Zoom In (Larger Items)"
                                    className="p-3 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ZoomIn className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* VIRTUALIZED GRID (Virtuoso) */}
                    <div className="flex-1 -mx-4 px-4"> {/* Negative margin to allow full scroll but padding for look */}
                        <VirtuosoGrid
                            style={{ height: '100%', width: '100%' }}
                            data={filteredProducts}
                            listClassName={`grid gap-3 pb-20`}
                            components={{
                                List: React.forwardRef<HTMLDivElement, any>((props, ref) => (
                                    <div
                                        {...props}
                                        ref={ref}
                                        className="grid gap-3 pb-20"
                                        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
                                    />
                                ))
                            }}
                            itemContent={(index, p) => (
                                <button
                                    key={p.id}
                                    onClick={() => handleAddProduct(p)}
                                    style={{ height: `${Math.max(120, 180 - gridCols * 10)}px` }}
                                    className="w-full bg-card hover:bg-muted/50 p-4 rounded-2xl flex flex-col items-start gap-2 transition-all text-left group relative overflow-hidden shadow-sm border border-border"
                                >
                                    <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Plus className="w-5 h-5 text-cyan-400 bg-black/50 rounded-full" />
                                    </div>

                                    <div className="flex justify-between w-full">
                                        <div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center text-xs font-bold text-muted-foreground">
                                            {(p.sku || "??").slice(0, 2)}
                                        </div>
                                        {p.trackStock === false ? (
                                            <span className="text-[10px] font-bold px-2 py-1 rounded-full h-fit bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20" title={t('service') || "Service"}>
                                                <Infinity className="w-3.5 h-3.5" />
                                            </span>
                                        ) : (
                                            <span className={clsx(
                                                "text-[10px] font-bold px-2 py-1 rounded-full h-fit",
                                                p.stock > 5 ? "bg-green-500/10 text-green-500" :
                                                    p.stock > 0 ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"
                                            )}>
                                                {p.stock}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-auto w-full">
                                        <div className={`font-bold line-clamp-2 text-foreground group-hover:text-primary transition-colors ${gridCols >= 6 ? 'text-xs' : 'text-sm'}`}>{p.name}</div>
                                        <div className="flex justify-between items-center mt-1">
                                            <div className="text-cyan-400 font-mono text-sm">{formatCurrency(p.sellPrice)}</div>
                                            {permissions.canViewCost && p.costPrice > 0 && (
                                                <div className="text-muted-foreground opacity-60 text-[10px] font-mono" title={t('costPrice') || "Cost"}>{formatCurrency(p.costPrice)}</div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            )}
                        />
                    </div>
                </div>
            </div>

            <TableSelectionModal
                isOpen={isTableModalOpen}
                onClose={() => setIsTableModalOpen(false)}
                floors={floors}
                currentTableId={tableId || undefined}
                heldCarts={heldCarts}
                activeCartItems={items}
                onSelectTable={handleSelectTable}
                t={t}
            />
        </div>
    );
}

