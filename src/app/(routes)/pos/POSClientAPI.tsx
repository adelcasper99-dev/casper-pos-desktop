"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, PauseCircle, PlayCircle, XCircle, User, Phone, Printer, Infinity, Loader2, ZoomIn, ZoomOut, Database } from "lucide-react";

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

export default function POSClientAPI({ 
    products, 
    categories: initialCategories, 
    settings, 
    csrfToken, 
    floors = [], 
    permissions = { canCheckout: true, canHoldCart: true, canDineIn: true, canPrintReceipt: true, canChangePrice: true, canDiscount: true, canViewCost: false, maxDiscount: 0, maxDiscountAmount: 0 },
    posDefaultName
}: any) {
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

    // Keyboard Shortcuts State
    const [qtyModeId, setQtyModeId] = useState<string | null>(null);
    const [qtyString, setQtyString] = useState<string | null>(null);

    const {
        items, addToCart, removeFromCart, updateQuantity, setItemQuantity, getTotal, clearCart,
        holdCart, heldCarts, resumeCart, removeHeldCart,
        customerId, customerName, customerPhone, customerBalance, setCustomer,
        tableId, tableName, setTable,
        discountAmount, discountPercentage, setDiscount,
        lastAddedId
    } = useCartStore();

    const [orderMode, setOrderMode] = useState<"takeaway" | "dine-in">("takeaway");
    const [isMounted, setIsMounted] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);


    // Reset Qty Mode when a new item is added or cart cleared
    useEffect(() => {
        if (lastAddedId) {
            setQtyModeId(lastAddedId);
            setQtyString(null);
        }
    }, [lastAddedId]);

    useEffect(() => {
        if (items.length === 0) {
            setQtyModeId(null);
            setQtyString(null);
        }
    }, [items.length]);
    // Global Key Listener for Focus Restoration and Keyboard Shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isInput = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
            const isSearchInput = activeElement === searchInputRef.current;
            
            // Detect if ANY modal is currently open to prevent global shortcut interference
            // We check both internal state and DOM role for robustness with sibling components
            const isAnyModalOpen = 
                isCheckoutOpen || isTableModalOpen || isCategoryModalOpen || isSpeedPrintModalOpen || showHeldCarts ||
                !!document.querySelector('[role="dialog"]');

            // 0. Escape -> Clear overlays
            if (e.key === 'Escape') {
                if (isCheckoutOpen) setIsCheckoutOpen(false);
                else if (isTableModalOpen) setIsTableModalOpen(false);
                else if (showHeldCarts) setShowHeldCarts(false);
                else if (isCategoryModalOpen) {
                    setIsCategoryModalOpen(false);
                    setCategoryToEdit(null);
                }
                else if (isSpeedPrintModalOpen) setIsSpeedPrintModalOpen(false);

                // Always try to restore focus to main search after Escape
                setTimeout(() => {
                    searchInputRef.current?.focus();
                }, 100);
                return;
            }

            // Don't trigger shortcuts if generic inputs are focused (except search box)
            if (isInput && !isSearchInput) return;
            
            const isNumeric = /^[0-9]$/.test(e.key);
            
            // Allow 'Space' to hold cart from search anywhere
            if (e.code === 'Space') {
                if (!isAnyModalOpen && items.length > 0) {
                    // Only trigger if not in a deep input (like customer search name)
                    if (!isInput || isSearchInput) {
                        e.preventDefault(); // Stop Space from typing
                        if (permissions.canHoldCart) {
                            holdCart();
                            toast.success(t("Cart Held Successfully"));
                        } else {
                            toast.error(t("You don't have permission to hold carts"));
                        }
                    }
                }
                return;
            }
            
            // Allow 'Right Control' for Speed Print
            if (e.code === 'ControlRight') {
                if (!isAnyModalOpen && items.length > 0 && permissions.canPrintReceipt) {
                    e.preventDefault();
                    handleSpeedPrint();
                }
                return;
            }
            
            // If in search input and it has text, only allow shortcuts if it's a numeric key in qtyMode, or specific control keys.
            if (isSearchInput && search.length > 0) {
                if (!(qtyModeId && isNumeric) && !['Enter', 'Delete', 'Backspace'].includes(e.key)) {
                    return;
                }
            }
            
            // Shortcuts depend on having a selected item
            let activeId = qtyModeId;
            if (!activeId && items.length > 0) {
                activeId = items[items.length - 1].id;
                setQtyModeId(activeId);
            }
            if (!activeId) return;

            // 1. Numeric Entry (0-9)
            if (isNumeric) {
                e.preventDefault();
                const newQtyString = (qtyString || "") + e.key;
                const newQty = parseInt(newQtyString);
                if (!isNaN(newQty) && newQty > 0) {
                    const item = items.find(i => i.id === activeId);
                    if (item && item.trackStock !== false && newQty > item.maxQuantity) {
                         toast.error(`أقصى كمية متاحة هي ${item.maxQuantity}`);
                         setQtyString(item.maxQuantity.toString());
                         setItemQuantity(activeId, item.maxQuantity);
                    } else {
                         setQtyString(newQtyString);
                         setItemQuantity(activeId, newQty);
                    }
                }
            }

            // 2. Enter -> Finalize Qty Edit OR Open Checkout
            if (e.key === 'Enter') {
                if (qtyModeId && qtyString !== null) {
                    setQtyString(null);
                    // Do NOT clear qtyModeId here, so shortcuts still work if modal is closed
                    setIsCheckoutOpen(true);
                    e.preventDefault();
                } else if (!isAnyModalOpen) {
                    if (items.length > 0) {
                        // Open checkout if we aren't editing a quantity or searching
                        if (!isInput || (isSearchInput && search.length === 0)) {
                            setIsCheckoutOpen(true);
                            e.preventDefault();
                        }
                    } else if (heldCarts.length > 0) {
                        // Resume the last held cart if current cart is empty
                        if (!isInput || (isSearchInput && search.length === 0)) {
                            const lastHeldCart = heldCarts[heldCarts.length - 1];
                            resumeCart(lastHeldCart.id);
                            toast.success(t("Cart Resumed") || "تم استرجاع السلة");
                            setShowHeldCarts(false); // Close the list if it was open
                            e.preventDefault();
                        }
                    }
                }
            }

            // 3. Delete -> Remove Last Item and move focus to previous
            if (e.key === 'Delete') {
                const currentIndex = items.findIndex(i => i.id === activeId);
                removeFromCart(activeId);
                
                if (items.length > 1) {
                    // Try to select the previous item, otherwise the next item (which is now at the same index)
                    const nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
                    // The items array here is the one from the *previous* render, 
                    // but we know which one was removed. Let's just grab the ID.
                    const newItems = items.filter(i => i.id !== activeId);
                    if (newItems.length > 0) {
                        const targetId = newItems[nextIndex]?.id || newItems[newItems.length - 1].id;
                        setQtyModeId(targetId);
                        setQtyString(null);
                    } else {
                        setQtyModeId(null);
                        setQtyString(null);
                    }
                } else {
                    setQtyModeId(null);
                    setQtyString(null);
                }
                
                e.preventDefault();
            }

            // 4. Backspace -> Decrease by 1
            if (e.key === 'Backspace') {
                // If search is empty or focused element is not an input
                if (!isInput || (isSearchInput && search.length === 0)) {
                    updateQuantity(activeId, -1);
                    setQtyString(null); // Reset qty building string
                    e.preventDefault();
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isCheckoutOpen, isTableModalOpen, showHeldCarts, isCategoryModalOpen, isSpeedPrintModalOpen, qtyModeId, qtyString, items, search]);

    // Focus Search Input on Mount and after Modals Close (Auto-restoration)
    useEffect(() => {
        let focusTimer: NodeJS.Timeout;

        const restoreFocus = () => {
            clearTimeout(focusTimer);
            
            // Give React 50ms to apply autoFocus to newly mounted elements
            // before we decide to steal focus back to the main search bar.
            focusTimer = setTimeout(() => {
                const activeElement = document.activeElement;
                
                // Check if active element or ANY of its parents want to inhibit focus restoration
                const isInhibitingFocus = !!activeElement?.closest('[data-inhibit-pos-focus="true"]');

                // Check if ANY modal or overlay is open
                const isAnyModalVisible = 
                    isCheckoutOpen || isTableModalOpen || isCategoryModalOpen || 
                    showHeldCarts || isSpeedPrintModalOpen || 
                    !!document.querySelector('[role="dialog"]');

                const isInteractingWithOtherInput = 
                    activeElement?.tagName === 'INPUT' || 
                    activeElement?.tagName === 'TEXTAREA' || 
                    activeElement?.tagName === 'SELECT' ||
                    activeElement?.hasAttribute('contenteditable');

                // ONLY restore focus if no modal is visible AND we aren't already in another input/inhibited area
                if (!isAnyModalVisible && !isInhibitingFocus && !isInteractingWithOtherInput && isMounted) {
                    searchInputRef.current?.focus();
                }
            }, 50);
        };

        // Restore focus on window focus (regaining focus from another app/desktop)
        window.addEventListener('focus', restoreFocus);
        
        // Watch for DOM changes to detect when modals are removed from the DOM
        const observer = new MutationObserver(restoreFocus);
        observer.observe(document.body, { childList: true, subtree: true });

        // Initial focus call
        restoreFocus();

        return () => {
            clearTimeout(focusTimer);
            window.removeEventListener('focus', restoreFocus);
            observer.disconnect();
        };
    }, [isCheckoutOpen, isTableModalOpen, isCategoryModalOpen, showHeldCarts, isSpeedPrintModalOpen, isMounted]);

    // Sync orderMode with held carts that might have a table selected
    useEffect(() => {
        if (tableId) setOrderMode("dine-in");
    }, [tableId]);

    const filteredProducts = useMemo(() => {
        return displayProducts.filter((p: any) => {
            // Hide items with 0 stock unless they are services (trackStock === false)
            if (p.trackStock !== false && p.stock <= 0) {
                return false;
            }
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
            {/* LEFT: Cart Sidebar */}
            <div className="w-full md:w-[400px] flex flex-col h-full glass-card bg-black/40 border-r border-white/5 z-20 shadow-2xl shrink-0 rounded-none">
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Top Panel: Table Selection / Order Mode Toggle */}
                    <div className="p-4 border-b border-border bg-card z-10 shadow-sm flex flex-col gap-3">
                        <div className="flex bg-black/40 rounded-xl p-1 border border-white/10 shrink-0">
                            <button
                                onClick={() => {
                                    setTable(undefined, undefined);
                                    setOrderMode('takeaway');
                                }}
                                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-300 ${orderMode === 'takeaway' && !tableId ? 'bg-cyan-500 text-black shadow-[0_0_20px_rgba(0,242,255,0.4)]' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
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
                    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5 backdrop-blur-md">
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
                        <div className="absolute top-14 left-0 w-full glass-card bg-black/60 shadow-2xl z-30 border-b border-white/10 p-3 space-y-2 animate-fly-in">
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
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar bg-transparent">
                        {items.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-700 opacity-50">
                                <ShoppingCart className="w-16 h-16 mb-4 opacity-50" />
                                <p className="text-sm font-bold uppercase tracking-widest">{t('emptyCart')}</p>
                            </div>
                        )}
                        {items.map((item) => (
                            <div key={item.id} className="relative glass-card bg-white/5 backdrop-blur-md p-4 group overflow-hidden shadow-lg mb-3">
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
                                        <div className={clsx("flex items-center gap-2 bg-background/50 rounded-xl p-1.5 border transition-all duration-300 shadow-inner", qtyModeId === item.id ? "border-cyan-500 ring-2 ring-cyan-500/50 bg-cyan-950/20" : "border-border")}>
                                            <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-colors border border-white/5 shrink-0 relative order-1">
                                                <Minus className="w-4 h-4" />
                                                {qtyModeId === item.id && (
                                                    <span className="absolute -top-1 -left-1 text-[8px] bg-black/60 text-zinc-400 px-1 rounded border border-white/5 font-bold uppercase pointer-events-none">BS</span>
                                                )}
                                            </button>
                                            <input
                                                type="text"
                                                value={qtyModeId === item.id && qtyString !== null ? qtyString : item.quantity.toString()}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, ''); // Allow only digits
                                                    setQtyModeId(item.id);
                                                    
                                                    const num = parseInt(val);
                                                    if (!isNaN(num) && num > 0) {
                                                        if (item.trackStock !== false && num > item.maxQuantity) {
                                                            toast.error(`أقصى كمية متاحة هي ${item.maxQuantity}`);
                                                            setQtyString(item.maxQuantity.toString());
                                                            setItemQuantity(item.id, item.maxQuantity);
                                                        } else {
                                                            setQtyString(val);
                                                            setItemQuantity(item.id, num);
                                                        }
                                                    } else {
                                                        setQtyString(val);
                                                    }
                                                }}
                                                onFocus={(e) => {
                                                    setQtyModeId(item.id);
                                                    setQtyString(item.quantity.toString());
                                                    setTimeout(() => e.target.select(), 0);
                                                }}
                                                onBlur={() => {
                                                    setQtyString(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        setQtyString(null);
                                                        setQtyModeId(null);
                                                        setIsCheckoutOpen(true); // Open checkout directly
                                                    }
                                                }}
                                                className={clsx("w-10 text-center text-lg font-black font-mono tracking-tight bg-transparent border-none outline-none focus:ring-0", qtyModeId === item.id ? "text-cyan-400" : "text-white")}
                                            />
                                            <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition-colors border border-white/5 shadow-[0_0_10px_rgba(6,182,212,0.3)] shrink-0 order-3"><Plus className="w-4 h-4" /></button>
                                        </div>
                                        <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 flex items-center justify-center border border-red-500/20 transition-all opacity-0 group-hover:opacity-100 relative">
                                            <Trash2 className="w-5 h-5" />
                                            {qtyModeId === item.id && (
                                                <span className="absolute -top-1 -right-1 text-[8px] bg-red-500 text-white px-1 rounded font-bold uppercase pointer-events-none">DEL</span>
                                            )}
                                        </button>
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
                                    className="w-16 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 font-bold rounded-xl flex items-center justify-center border border-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all relative"
                                    title={t('speedPrint') || "Speed Print"}
                                >
                                    {isPrinting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-6 h-6" />}
                                    <span className="absolute -top-1 -left-1 text-[8px] bg-purple-500 text-white px-1 rounded font-bold uppercase pointer-events-none">R-CTRL</span>
                                </button>
                                <button onClick={() => holdCart()} disabled={items.length === 0 || isPrinting || !permissions.canHoldCart} className="w-16 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 font-bold rounded-xl flex items-center justify-center border border-yellow-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all relative" title="Hold Cart">
                                    <PauseCircle className="w-6 h-6" />
                                    <span className="absolute -top-1 -left-1 text-[8px] bg-yellow-600 text-white px-1 rounded font-bold uppercase pointer-events-none">SPACE</span>
                                </button>
                                <button
                                    onClick={() => setIsCheckoutOpen(true)}
                                    disabled={items.length === 0 || isPrinting || !permissions.canCheckout}
                                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xl tracking-wide rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(0,242,255,0.3)] hover:shadow-[0_0_30px_rgba(0,242,255,0.5)] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none relative"
                                >
                                    <Banknote className="w-6 h-6" />{t('checkout')}
                                    <span className="absolute top-2 right-3 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded border border-white/20 font-black uppercase">ENTER</span>
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
            <div
                className="flex-1 flex bg-muted/10"
                onClick={(e) => {
                    // Check if the click target or any parent is inhibiting focus (e.g., Customer Search)
                    if ((e.target as HTMLElement).closest('[data-inhibit-pos-focus="true"]')) {
                        return;
                    }

                    // Redirect clicks on the container background to the search input
                    if (e.target === e.currentTarget && !isCheckoutOpen && !isTableModalOpen) {
                        searchInputRef.current?.focus();
                    }
                }}
            >
                {/* Categories */}
                <div className="w-40 border-r border-white/5 glass-card bg-black/40 backdrop-blur-3xl px-2 py-4 flex flex-col gap-2 overflow-y-auto no-scrollbar z-10 h-full rounded-none">
                    <button onClick={() => setSelectedCategory(null)} className={clsx("w-full h-16 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-300 shadow-xl relative overflow-hidden group shrink-0 border border-white/5", selectedCategory === null ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(0,242,255,0.4)] scale-[1.02]" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground")}>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                        {t('allCategories')}
                    </button>
                    {localCategories.map((c: any) => (
                        <button
                            key={c.id}
                            onClick={() => setSelectedCategory(c.id)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setCategoryToEdit(c);
                                setIsCategoryModalOpen(true);
                            }}
                            className={clsx("w-full h-24 rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all duration-300 shadow-xl relative overflow-hidden group shrink-0 text-center break-words p-2 border border-white/10 backdrop-blur-xl", selectedCategory === c.id ? "scale-[1.02] ring-2 ring-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.2)]" : "hover:scale-[1.02] opacity-80 hover:opacity-100")}
                            style={{ 
                                backgroundColor: `${c.color || "#06b6d4"}33`, // Add 33 (20% alpha) to hex color
                                color: selectedCategory === c.id ? "#fff" : "rgba(255,255,255,0.7)", 
                                borderLeft: `4px solid ${c.color || "#06b6d4"}`
                            }}
                        >
                            <div className="absolute inset-0 bg-white/5 group-hover:bg-white/10 transition-colors pointer-events-none" />
                            <span className="relative z-10 drop-shadow-md text-sm uppercase tracking-wider font-black">{c.name}</span>
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
                        <div className="flex justify-between items-center bg-black/20 p-2 rounded-xl border border-white/5 mb-1">
                            {posDefaultName && (
                                <div className="flex items-center gap-2 px-3 py-1 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                    <Database className="w-3.5 h-3.5 text-cyan-400" />
                                    <span className="text-cyan-400 font-black text-[10px] uppercase tracking-widest">
                                        المخزن: {posDefaultName}
                                    </span>
                                </div>
                            )}
                            <div className="mr-auto">
                                <DesktopStatus />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="glass-card bg-white/5 backdrop-blur-md flex items-center gap-3 py-3 px-4 flex-[2] transition-all focus-within:border-cyan-500/50">
                                <Search className="w-5 h-5 text-muted-foreground" />
                                <input
                                    ref={searchInputRef}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={t('searchPlaceholder')}
                                    className="bg-transparent outline-none w-full placeholder:text-muted-foreground text-foreground"
                                />
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

