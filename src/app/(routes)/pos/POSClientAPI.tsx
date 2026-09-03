"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, PauseCircle, PlayCircle, XCircle, User, Phone, Printer, Infinity, Loader2, ZoomIn, ZoomOut, Database, ChevronRight, Eye, EyeOff } from "lucide-react";

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
import { toNumber } from "@/lib/decimal-utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useDebouncedCallback } from "use-debounce";

// ... (other imports remain, remove unused if any)

export interface POSProduct {
    id: string;
    sku: string;
    name: string;
    stock: number;
    costPrice: number;
    sellPrice: number;
    sellPrice2: number;
    sellPrice3: number;
    minStock?: number;
    trackStock: boolean;
    isBundle: boolean;
    bundleComponents?: Array<{ id: string; name: string; quantityIncluded: number }>;
    categoryId: string | null;
    modelId?: string | null;
    modelName?: string;
    barcode?: string | null;
    maxQuantity?: number;
    color?: string | null;
    image?: string | null;
    [key: string]: unknown;
}

export interface POSCategory {
    id: string;
    name: string;
    color: string;
    parentId?: string | null;
    isHidden?: boolean;
    [key: string]: unknown;
}

export interface POSTable {
    id: string;
    name: string;
    status: string;
    [key: string]: unknown;
}

export interface POSFloor {
    id: string;
    name: string;
    tables: POSTable[];
    [key: string]: unknown;
}

export interface POSPermissions {
    canCheckout: boolean;
    canHoldCart: boolean;
    canDineIn: boolean;
    canPrintReceipt: boolean;
    canChangePrice: boolean;
    canDiscount: boolean;
    canViewCost: boolean;
    canSelectPriceTier: boolean;
    maxDiscount: number;
    maxDiscountAmount: number;
    [key: string]: unknown;
}

export interface POSClientAPIProps {
    products: POSProduct[];
    categories?: POSCategory[];
    settings?: Record<string, unknown>;
    csrfToken: string;
    floors?: POSFloor[];
    permissions?: POSPermissions;
    posDefaultName?: string;
    disableHotkeys?: boolean;
}

export default function POSClientAPI({ 
    products, 
    categories: initialCategories, 
    settings, 
    csrfToken, 
    floors = [], 
    permissions = { canCheckout: true, canHoldCart: true, canDineIn: true, canPrintReceipt: true, canChangePrice: true, canDiscount: true, canViewCost: false, canSelectPriceTier: false, maxDiscount: 0, maxDiscountAmount: 0 },
    posDefaultName,
    disableHotkeys = false
}: POSClientAPIProps) {
    const t = useTranslations("POS");
    const router = useRouter();
    const formatCurrency = useFormatCurrency();
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [activeParentId, setActiveParentId] = useState<string | null>(null);
    const [showHidden, setShowHidden] = useState(false);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [showHeldCarts, setShowHeldCarts] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState<POSCategory | null>(null);
    // Local categories state for instant UI updates after create/edit
    const [localCategories, setLocalCategories] = useState<POSCategory[]>(initialCategories || []);

    // Sync local state when server data changes (RSC Revalidation)
    useEffect(() => {
        setLocalCategories(initialCategories || []);
    }, [initialCategories]);

    const [isPrinting, setIsPrinting] = useState(false);
    const [gridCols, setGridCols] = useState(5); // Default grid columns

    // Always use SSR products — the Next.js server is local (127.0.0.1 in Electron),
    // so navigator.onLine (WAN internet) must never gate access to DB data.
    const displayProducts = products;

    const [isSpeedPrintModalOpen, setIsSpeedPrintModalOpen] = useState(false);
    const [speedPrintData, setSpeedPrintData] = useState<unknown>(null);
    const [isSpeedPrintEnabled, setIsSpeedPrintEnabled] = useState(true);

    // Initial load of speed print setting from registry
    useEffect(() => {
        const registry = printService.getRegistry();
        if (registry) {
            setIsSpeedPrintEnabled(registry.enableSpeedPrint !== false);
        }
    }, []);

    // Keyboard Shortcuts State
    const [qtyModeId, setQtyModeId] = useState<string | null>(null);
    const [qtyString, setQtyString] = useState<string | null>(null);

    const {
        items, addToCart, removeFromCart, updateQuantity, setItemQuantity, getTotal, clearCart,
        holdCart, heldCarts, resumeCart, removeHeldCart,
        customerId, customerName, customerPhone, customerBalance, setCustomer,
        tableId, tableName, setTable,
        discountAmount, discountPercentage, setDiscount,
        lastAddedId, priceTier, setPriceTier, showCostPrice, toggleCostPrice
    } = useCartStore();

    const [orderMode, setOrderMode] = useState<"takeaway" | "dine-in">("takeaway");
    const [isMounted, setIsMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Feature flag kill-switch check (Gap #7)
    const features = useMemo(() => {
        try {
            return typeof settings?.features === 'string'
                ? JSON.parse(settings.features)
                : (settings?.features || {});
        } catch {
            return {};
        }
    }, [settings?.features]);
    const isMobileLayoutEnabled = features?.mobile_layout_enabled !== false;

    // Stable debounced resize handler (Bug #2 fix)
    const handleResize = useDebouncedCallback(() => {
        const mobile = isMobileLayoutEnabled && typeof window !== 'undefined' && window.innerWidth < 768;
        setIsMobile(mobile);
        setGridCols(mobile ? 2 : 5);
    }, 150);

    // Single mount effect: hydration-safe initialization (Bug #14 fix)
    useEffect(() => {
        const mobile = isMobileLayoutEnabled && typeof window !== 'undefined' && window.innerWidth < 768;
        setIsMounted(true);
        setIsMobile(mobile);
        setGridCols(mobile ? 2 : 5);

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [handleResize, isMobileLayoutEnabled]);

    const effectiveIsMobile = isMounted && isMobile;


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
        if (disableHotkeys || effectiveIsMobile) return;

        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isInput = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
            const isSearchInput = activeElement === searchInputRef.current;
            
            // Detect if ANY modal is currently open to prevent global shortcut interference
            // We check both internal state and DOM role for robustness with sibling components
            const isAnyModalOpen = 
                isCheckoutOpen || isTableModalOpen || isCategoryModalOpen || isSpeedPrintModalOpen || showHeldCarts ||
                !!document.querySelector('[role="dialog"]');

            // 🛡️ BLOCK NATIVE BROWSER PRINT (Ctrl+P)
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                if (isSpeedPrintEnabled) {
                    handleSpeedPrint();
                } else {
                    toast.info(t('speedPrintDisabled') || "Quick Print is disabled");
                }
                return;
            }

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

            // 1. Numeric Entry (0-9) and Decimal Point (.)
            const isDecimalPoint = e.key === '.' || e.key === ',';
            if (isNumeric || isDecimalPoint) {
                e.preventDefault();
                const currentStr = qtyString || "";
                
                // Prevent multiple decimal points
                if (isDecimalPoint && currentStr.includes('.')) return;
                
                const newQtyString = currentStr + (isDecimalPoint ? '.' : e.key);
                const newQty = parseFloat(newQtyString);
                
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
                } else if (isDecimalPoint) {
                    // Start a new sequence with "0."
                    setQtyString("0.");
                    setItemQuantity(activeId, 0);
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
    }, [isCheckoutOpen, isTableModalOpen, showHeldCarts, isCategoryModalOpen, isSpeedPrintModalOpen, qtyModeId, qtyString, items, search, disableHotkeys, effectiveIsMobile]);

    // Focus Search Input on Mount and after Modals Close (Auto-restoration)
    useEffect(() => {
        let focusTimer: ReturnType<typeof setTimeout>;

        const restoreFocus = () => {
            clearTimeout(focusTimer);
            
            // Touch-device guard: do NOT restore focus on mobile touch devices
            if (effectiveIsMobile || (typeof window !== 'undefined' && 'ontouchstart' in window)) return;

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
        return displayProducts.filter((p: POSProduct) => {
            // Hide items with 0 stock unless they are services (trackStock === false)
            if (p.trackStock !== false && p.stock <= 0) {
                return false;
            }
            const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                                 (p.sku && p.sku.includes(search)) || 
                                 (p.barcode && p.barcode.includes(search)) ||
                                 (p.modelName && p.modelName.toLowerCase().includes(search.toLowerCase()));
            
            // If searching, ignore category filter
            if (search.length > 0) return matchesSearch;

            // Updated category filtering: RECURSIVE
            // If selectedCategory is a parent, include products from its subcategories
            if (selectedCategory) {
                const subIds = localCategories
                    .filter(c => c.parentId === selectedCategory)
                    .map(c => c.id);
                const matches = p.categoryId === selectedCategory || (p.categoryId ? subIds.includes(p.categoryId) : false);
                return matchesSearch && matches;
            }
            
            return matchesSearch;
        });
    }, [displayProducts, search, selectedCategory, localCategories]);

    const topLevelCategories = useMemo(() => {
        return localCategories.filter(c => c.parentId === null && (showHidden ? true : !c.isHidden));
    }, [localCategories, showHidden]);

    const activeSubCategories = useMemo(() => {
        if (!activeParentId) return [];
        return localCategories.filter(c => c.parentId === activeParentId && (showHidden ? true : !c.isHidden));
    }, [localCategories, activeParentId, showHidden]);

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
    //                     <div className="text-cyan-400 font-mono text-sm">${toNumber(p.sellPrice).toFixed(2)}</div>
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
    
    const isPriceTiersEnabled = useMemo(() => {
        try {
            const feats = typeof settings?.features === 'string'
                ? JSON.parse(settings.features)
                : (settings?.features || {});
            return feats.pos_price_tiers === true && permissions.canSelectPriceTier;
        } catch { return false; }
    }, [settings?.features, permissions.canSelectPriceTier]);

    const handleSpeedPrint = async () => {
        if (items.length === 0 || isPrinting || !isSpeedPrintEnabled) return;

        setIsPrinting(true);
        try {
            const { printService } = await import('@/lib/print-service');
            const { generateThermalReceiptHTML } = await import('@/components/pos/ThermalReceiptTemplate');
            
            const registry = printService.getRegistry();
            const widthToUse = settings?.paperSize === '58mm' ? 58 : 80;
            const thermalPrinter = registry?.thermalPrinter || registry?.receiptPrinter || localStorage.getItem('printer_receipt') || '';
            
            if (!thermalPrinter || thermalPrinter === 'none') {
                toast.error("يرجى تعيين الطابعة من إعدادات الطابعات");
                return;
            }

            const saleData = {
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
            };

            const html = generateThermalReceiptHTML({ saleData, settings });
            const copies = parseInt(localStorage.getItem('casper_default_print_copies') || '1', 10);

            for (let i = 0; i < copies; i++) {
                await printService.printStrictlySilent(html, thermalPrinter, { paperWidthMm: widthToUse });
            }
            
            toast.success("تم إرسال الطباعة السريعة بنجاح");
        } catch (error) {
            console.error("Speed print failed:", error);
            toast.error("فشلت الطباعة السريعة");
        } finally {
            setIsPrinting(false);
        }
    };

    // Handle adding a product — fetches bundle components if needed
    const handleAddProduct = async (p: POSProduct) => {
        if (p.isBundle) {
            try {
                const res = await getBundleComponents(p.id);
                const components = (res as { components?: Array<{ componentProductId: string; name: string; quantityIncluded: number }> })?.components || [];
                // Add to cart with components attached
                const cartProduct = {
                    ...p,
                    bundleComponents: components.map((c) => ({
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
    const effectiveSubTotal = Math.max(0, subTotal - toNumber(discountAmount));
    const taxRate = toNumber(settings?.taxRate || 0);
    const taxAmount = effectiveSubTotal * (taxRate / 100);
    const finalTotal = effectiveSubTotal + taxAmount;

    return (
        <div className="flex h-full w-full gap-2 font-cairo overflow-hidden" dir="rtl">
            {/* RIGHT (in RTL): Cart Sidebar */}
            <div className={clsx(
                "flex flex-col h-full bg-white dark:bg-zinc-950 border border-slate-200/80 dark:border-white/10 z-20 shrink-0 rounded-2xl shadow-sm overflow-hidden",
                effectiveIsMobile ? "hidden" : "w-full md:w-[380px]"
            )}>
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Top Panel: Table Selection / Order Mode Toggle */}
                    <div className="p-2.5 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-zinc-900/50 flex flex-col gap-2 shrink-0">
                        <div className="flex bg-slate-200/60 dark:bg-black/40 rounded-xl p-0.5 border border-slate-200/80 dark:border-white/10 shrink-0">
                            <button
                                onClick={() => {
                                    setTable(undefined, undefined);
                                    setOrderMode('takeaway');
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${orderMode === 'takeaway' && !tableId ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
                            >
                                {t('takeaway') || 'Takeaway'}
                            </button>
                            <button
                                onClick={() => {
                                    setOrderMode('dine-in');
                                    if (!tableId) setIsTableModalOpen(true);
                                }}
                                disabled={!permissions.canDineIn}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${orderMode === 'dine-in' || tableId ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
                            >
                                {t('dineIn') || 'Dine-In'}
                            </button>
                        </div>
                        
                        {isPriceTiersEnabled && (
                             <div className="flex bg-slate-200/60 dark:bg-black/40 rounded-xl p-0.5 border border-slate-200/80 dark:border-white/10 shrink-0">
                                {[
                                    { id: 'sellPrice', label: 'جملة' },
                                    { id: 'sellPrice2', label: 'نصف جملة' },
                                    { id: 'sellPrice3', label: 'قطاعي' }
                                ].map((tier) => (
                                    <button
                                        key={tier.id}
                                        onClick={() => setPriceTier(tier.id as 'sellPrice' | 'sellPrice2' | 'sellPrice3')}
                                        className={clsx(
                                            "flex-1 py-1 text-[10px] font-black rounded-md transition-all uppercase",
                                            priceTier === tier.id 
                                                ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white" 
                                                : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                                        )}
                                    >
                                        {tier.label}
                                    </button>
                                ))}
                             </div>
                        )}

                        {(orderMode === 'dine-in' || tableId) && (
                            <button
                                onClick={() => setIsTableModalOpen(true)}
                                className="bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 hover:border-slate-400 rounded-xl p-2 text-slate-800 dark:text-white text-xs font-bold w-full transition-colors flex items-center justify-between"
                            >
                                <span>{tableId ? tableName : (t('selectTable') || "اختر الطاولة")}</span>
                                <span className="text-slate-400 text-[10px]">{t('change') || 'تغيير'}</span>
                            </button>
                        )}
                    </div>

                    {/* Header */}
                    <div className="px-3 py-2 border-b border-slate-200/80 dark:border-white/10 flex justify-between items-center bg-white dark:bg-zinc-900/60 shrink-0">
                        <h2 className="font-black flex items-center gap-1.5 text-xs text-slate-800 dark:text-zinc-200 uppercase">
                            <ShoppingCart className="w-4 h-4 text-slate-500 dark:text-zinc-400" strokeWidth={2} />
                            <span>{t('items')}</span>
                            <span className="bg-slate-900 dark:bg-white text-white dark:text-black font-black text-[10px] px-2 py-0.5 rounded-full font-mono">{items.length}</span>
                        </h2>
                        <div className="flex items-center gap-1.5">
                            {heldCarts.length > 0 && (
                                <button
                                    onClick={() => setShowHeldCarts(!showHeldCarts)}
                                    className="flex items-center gap-1 text-amber-500 text-[10px] font-bold px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20"
                                >
                                    <PauseCircle className="w-3 h-3" />
                                    {heldCarts.length} {t('held')}
                                </button>
                            )}
                            {permissions.canViewCost && (
                                <button
                                    onClick={() => toggleCostPrice()}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-md text-zinc-400 hover:text-cyan-500 transition-colors"
                                    title={showCostPrice ? t('hideCost') : t('showCost')}
                                >
                                    {showCostPrice ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                            )}
                            <button onClick={clearCart} className="text-zinc-400 hover:text-red-500 text-[11px] font-bold px-1.5 transition-colors">
                                {t('clear')}
                            </button>
                        </div>
                    </div>

                    {/* Held Carts Overlay */}
                    {showHeldCarts && (
                        <div className="absolute top-14 left-0 w-full bg-white dark:bg-black/60 dark:backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-xl rounded-b-2xl z-30 border-b p-3 space-y-2 animate-fly-in">
                            <div className="flex justify-between items-center px-2">
                                <span className="text-xs font-bold text-slate-400 dark:text-zinc-400">{t('heldCartsTitle')}</span>
                                <button onClick={() => setShowHeldCarts(false)}><XCircle className="w-4 h-4 text-slate-400 dark:text-zinc-500" /></button>
                            </div>
                            {heldCarts.map(cart => (
                                <div key={cart.id} className="bg-slate-50 dark:bg-white/5 p-2 rounded-lg flex justify-between items-center border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20 transition-colors">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800 dark:text-white">{cart.name}</div>
                                        <div className="text-xs text-slate-400 dark:text-zinc-500">{new Date(cart.date).toLocaleTimeString()} • {cart.items.length} Items</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { resumeCart(cart.id); setShowHeldCarts(false); }} className="p-1 bg-slate-800 dark:bg-cyan-500/20 text-white dark:text-cyan-400 rounded hover:bg-slate-700 dark:hover:bg-cyan-500/30">
                                            <PlayCircle className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => removeHeldCart(cart.id)} className="p-1 bg-red-50 dark:bg-red-500/20 text-red-500 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-500/30 border border-red-200 dark:border-transparent">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Cart Items List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar bg-slate-50 dark:bg-transparent">
                        {items.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-zinc-700">
                                <ShoppingCart className="w-16 h-16 mb-4 opacity-50" strokeWidth={1.25} />
                                <p className="text-sm font-semibold tracking-widest text-slate-400 dark:text-zinc-500">{t('emptyCart')}</p>
                            </div>
                        )}
                        {items.map((item) => (
                            <div key={item.id} className="relative bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 shadow-sm p-2.5 group overflow-hidden rounded-xl mb-1.5 transition-all">
                                {/* Bundle header row */}
                                <div className="relative z-10 flex justify-between items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-xs text-slate-800 dark:text-zinc-100 truncate">
                                            {item.isBundle ? '📦 ' : ''}{item.name}
                                        </div>
                                        <div className="flex items-baseline gap-2 mt-0.5">
                                            <div className="text-slate-900 dark:text-cyan-400 font-black text-xs font-mono">{formatCurrency(item.price)}</div>
                                            <div className="text-slate-400 text-[10px]">× {item.quantity}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className={clsx("flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-1 border transition-all", qtyModeId === item.id ? "border-cyan-500 ring-1 ring-cyan-500/20" : "border-slate-200 dark:border-white/5")}>
                                            <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 rounded-md bg-white dark:bg-zinc-700 hover:bg-slate-50 text-slate-700 dark:text-zinc-300 flex items-center justify-center border border-slate-200 dark:border-white/5 shrink-0 relative order-1">
                                                <Minus className="w-3 h-3" />
                                                {qtyModeId === item.id && (
                                                    <span className="absolute -top-1 -left-1 text-[7px] bg-black/60 text-zinc-400 px-0.5 rounded font-bold uppercase pointer-events-none">BS</span>
                                                )}
                                            </button>
                                            <input
                                                type="number"
                                                step="any"
                                                value={qtyModeId === item.id && qtyString !== null ? qtyString : item.quantity.toString()}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setQtyModeId(item.id);
                                                    
                                                    const num = parseFloat(val);
                                                    if (!isNaN(num) && num >= 0) {
                                                        if (item.trackStock !== false && num > item.maxQuantity) {
                                                            toast.error(`أقصى كمية متاحة هي ${item.maxQuantity}`);
                                                            setQtyString(item.maxQuantity.toString());
                                                            setItemQuantity(item.id, item.maxQuantity);
                                                        } else {
                                                            setQtyString(val);
                                                            setItemQuantity(item.id, num);
                                                        }
                                                    } else if (val === "" || val === ".") {
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
                                                className={clsx("w-8 text-center text-xs font-black font-mono tracking-tight bg-transparent border-none outline-none focus:ring-0 order-2", qtyModeId === item.id ? "text-cyan-500" : "text-slate-800 dark:text-white")}
                                            />
                                            <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 rounded-md bg-slate-900 dark:bg-zinc-700 hover:bg-slate-700 text-white flex items-center justify-center border border-slate-700 dark:border-white/5 shrink-0 order-3">
                                                <Plus className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
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
                        <div className="px-4 py-3 bg-white dark:bg-black/20 border-t-2 border-dashed border-zinc-100 dark:border-white/5">
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
                    <div className="p-3 border-t border-slate-200/80 dark:border-white/10 bg-white dark:bg-zinc-950 shrink-0">
                        <div className="flex flex-col items-end mb-2.5 px-1 text-right space-y-0.5">
                            <div className="flex justify-between w-full text-slate-500 dark:text-zinc-400 text-[11px] font-bold">
                                <span>{t('subtotal')}</span>
                                <span className="font-mono">{formatCurrency(subTotal)}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between w-full text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                                    <span>{t('discount')}</span>
                                    <span className="font-mono">- {formatCurrency(discountAmount)}</span>
                                </div>
                            )}
                            {taxRate > 0 && (
                                <div className="flex justify-between w-full text-slate-500 dark:text-zinc-400 text-[11px] font-medium">
                                    <span>{t('tax')} ({taxRate}%)</span>
                                    <span className="font-mono">{formatCurrency(taxAmount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between w-full items-baseline pt-1 border-t border-slate-100 dark:border-white/5">
                                <span className="text-slate-700 dark:text-zinc-300 text-xs font-black">{t('total')}</span>
                                <span className="text-2xl font-black text-slate-950 dark:text-white font-mono tracking-tight">
                                    {formatCurrency(finalTotal)}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-1.5 w-full">
                            <button
                                onClick={() => isSpeedPrintEnabled && handleSpeedPrint()}
                                disabled={items.length === 0 || isPrinting || !permissions.canPrintReceipt || !isSpeedPrintEnabled}
                                className={clsx(
                                    "w-11 h-11 font-bold rounded-xl flex items-center justify-center border transition-all active:scale-95 relative shrink-0",
                                    isSpeedPrintEnabled 
                                        ? "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 border-indigo-500/30 shadow-sm" 
                                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-white/5 opacity-40 hover:opacity-100"
                                )}
                                title={isSpeedPrintEnabled ? (t('speedPrint') || "Speed Print") : (t('speedPrintDisabled') || "Speed Print Disabled")}
                            >
                                {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-5 h-5 stroke-[1.75]" />}
                                <span className="absolute -top-1 -left-1 text-[7px] bg-indigo-600 text-white px-1 py-0.2 rounded-full font-mono font-black uppercase pointer-events-none">CTRL</span>
                                
                                <div 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newVal = !isSpeedPrintEnabled;
                                        setIsSpeedPrintEnabled(newVal);
                                        printService.updateRegistry({ enableSpeedPrint: newVal });
                                        toast.info(newVal ? t('speedPrintEnabled') : t('speedPrintDisabled'));
                                    }}
                                    className={clsx(
                                        "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-black flex items-center justify-center cursor-pointer transition-colors z-30",
                                        isSpeedPrintEnabled ? "bg-emerald-500" : "bg-zinc-500"
                                    )}
                                >
                                    <div className="w-1 h-1 bg-white rounded-full" />
                                </div>
                            </button>
                            <button 
                                onClick={() => holdCart()} 
                                disabled={items.length === 0 || isPrinting || !permissions.canHoldCart} 
                                className="w-11 h-11 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold rounded-xl flex items-center justify-center border border-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 relative shrink-0" 
                                title="Hold Cart"
                            >
                                <PauseCircle className="w-5 h-5 stroke-[1.75]" />
                                <span className="absolute -top-1 -left-1 text-[7px] bg-amber-600 text-white px-1 py-0.2 rounded-full font-mono font-black uppercase pointer-events-none">SPACE</span>
                            </button>
                            <button
                                onClick={() => setIsCheckoutOpen(true)}
                                disabled={items.length === 0 || isPrinting || !permissions.canCheckout}
                                className="flex-1 h-11 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:opacity-95 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all transform active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none relative"
                            >
                                <Banknote className="w-5 h-5" />
                                <span>{t('checkout')}</span>
                                <span className="absolute top-2 right-2 text-[8px] bg-white/20 text-white px-1.5 py-0.5 rounded font-mono font-black uppercase">ENTER</span>
                            </button>
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
                onAddSubCategory={(parentId) => {
                    setCategoryToEdit({ id: "", name: "", color: "#06b6d4", parentId });
                }}
            />

            {/* RIGHT SIDE (in RTL, left area): Product Grid & Category Rail */}
            <div
                className="flex-1 flex bg-white dark:bg-zinc-950 border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden h-full"
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
                {/* Compact Categories Rail (Top Level Only) */}
                <div className={clsx(
                    "border-l border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-zinc-900/40 p-2 flex flex-col gap-1.5 overflow-y-auto no-scrollbar z-10 h-full shrink-0",
                    effectiveIsMobile ? "hidden" : "w-32"
                )}>
                    <button 
                        onClick={() => {
                            setSelectedCategory(null);
                            setActiveParentId(null);
                            setSearch("");
                        }} 
                        className={clsx(
                            "w-full h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all shadow-sm relative overflow-hidden group shrink-0 border", 
                            selectedCategory === null && activeParentId === null 
                                ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-black dark:border-white" 
                                : "bg-white dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border-slate-200/80 dark:border-white/10"
                        )}
                    >
                        {t('allCategories')}
                    </button>

                    {topLevelCategories.map((c: POSCategory) => (
                        <button
                            key={c.id}
                            onClick={() => {
                                setActiveParentId(c.id);
                                setSelectedCategory(c.id);
                                setSearch("");
                            }}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setCategoryToEdit(c);
                                setIsCategoryModalOpen(true);
                            }}
                            className={clsx(
                                "w-full h-12 rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all shadow-sm relative overflow-hidden group shrink-0 text-center break-words p-1 border", 
                                activeParentId === c.id 
                                    ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-black dark:border-white scale-[1.02] shadow" 
                                    : "bg-white dark:bg-white/5 text-slate-700 dark:text-zinc-300 border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10",
                                c.isHidden && "opacity-40 grayscale"
                            )}
                            style={{ 
                                borderRight: activeParentId === c.id ? `4px solid ${c.color || "#06b6d4"}` : `3px solid ${c.color || "#94a3b8"}`
                            }}
                        >
                            <span className="relative z-10 truncate max-w-[100px]">{c.name}</span>
                        </button>
                    ))}

                    <button 
                        onClick={() => setShowHidden(!showHidden)}
                        className="mt-auto p-1 text-[9px] text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors font-semibold text-center"
                    >
                        {showHidden ? (t('hideHidden') || "إخفاء") : (t('showHidden') || "عرض الكل")}
                    </button>

                    <button
                        onClick={() => {
                            setCategoryToEdit(null);
                            setIsCategoryModalOpen(true);
                        }}
                        className="w-full h-9 rounded-xl flex items-center justify-center bg-white dark:bg-zinc-800/50 border border-dashed border-slate-300 dark:border-zinc-700 text-slate-400 dark:text-zinc-500 hover:text-cyan-500 hover:border-cyan-500 hover:bg-cyan-50/50 dark:hover:bg-zinc-800 transition-all shrink-0 group"
                        title="إضافة فئة"
                    >
                        <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </button>
                </div>

                {/* Products Grid & Search Column */}
                <div className="flex-1 flex flex-col gap-2 h-full overflow-hidden p-2.5">
                    {/* Compact Search Header & Warehouse Bar */}
                    <div className="flex flex-col gap-2 shrink-0">
                        <div className="flex justify-between items-center bg-slate-50/70 dark:bg-zinc-900/50 px-2.5 py-1 rounded-xl border border-slate-200/80 dark:border-white/5 shrink-0">
                            {posDefaultName && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-md border border-cyan-500/20 text-[10px] font-black">
                                    <Database className="w-3 h-3" />
                                    <span>المخزن: {posDefaultName}</span>
                                </div>
                            )}
                            <div className="mr-auto">
                                <DesktopStatus />
                            </div>
                        </div>

                        {/* Horizontal Categories Rail for Mobile */}
                        {effectiveIsMobile && topLevelCategories.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 shrink-0 px-1 border-b border-slate-200/60 dark:border-white/5">
                                <button
                                    onClick={() => {
                                        setSelectedCategory(null);
                                        setActiveParentId(null);
                                        setSearch("");
                                    }}
                                    className={clsx(
                                        "px-3 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap shrink-0 border",
                                        selectedCategory === null && activeParentId === null
                                            ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-black"
                                            : "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-white/5"
                                    )}
                                >
                                    {t('allCategories') || "كل الفئات"}
                                </button>
                                {topLevelCategories.map((c: POSCategory) => (
                                    <button
                                        key={c.id}
                                        onClick={() => {
                                            setActiveParentId(c.id);
                                            setSelectedCategory(c.id);
                                            setSearch("");
                                        }}
                                        className={clsx(
                                            "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 border",
                                            activeParentId === c.id
                                                ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-black"
                                                : "bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-white/5"
                                        )}
                                        style={{
                                            borderBottom: activeParentId === c.id ? `3px solid ${c.color || "#06b6d4"}` : undefined
                                        }}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2 shrink-0">
                            <div className="bg-slate-50/70 dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 shadow-sm flex items-center gap-2 h-10 px-3 flex-[2] rounded-xl focus-within:border-cyan-500/50 transition-all">
                                <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" strokeWidth={2} />
                                <input
                                    ref={searchInputRef}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={t('searchPlaceholder')}
                                    className="bg-transparent outline-none w-full placeholder:text-slate-400 dark:placeholder:text-zinc-500 text-xs text-slate-800 dark:text-zinc-100 font-medium"
                                />
                            </div>
                            <div className="flex-[2]">
                                <CustomerSearch />
                            </div>
                            <div className="flex bg-slate-50/70 dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 rounded-xl overflow-hidden shadow-sm shrink-0 items-center h-10">
                                <button onClick={() => setGridCols(prev => Math.min(8, prev + 1))} disabled={gridCols >= 8} className="px-2.5 h-full text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors disabled:opacity-30" title="تصغير البطاقات">
                                    <ZoomOut className="w-4 h-4" />
                                </button>
                                <div className="w-px h-4 bg-slate-200 dark:bg-white/10"></div>
                                <button onClick={() => setGridCols(prev => Math.max(2, prev - 1))} disabled={gridCols <= 2} className="px-2.5 h-full text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors disabled:opacity-30" title="تكبير البطاقات">
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Horizontal Pill Bar for Subcategories */}
                        {activeSubCategories.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0">
                                <button
                                    onClick={() => setSelectedCategory(activeParentId)}
                                    className={clsx(
                                        "px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap border shrink-0",
                                        selectedCategory === activeParentId 
                                            ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-black" 
                                            : "bg-slate-50/70 dark:bg-white/5 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-white/5 hover:bg-slate-100"
                                    )}
                                >
                                    {t('all') || "الكل"}
                                </button>
                                {activeSubCategories.map((sub: POSCategory) => (
                                    <button
                                        key={sub.id}
                                        onClick={() => setSelectedCategory(sub.id)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setCategoryToEdit(sub);
                                            setIsCategoryModalOpen(true);
                                        }}
                                        className={clsx(
                                            "px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap border shrink-0",
                                            selectedCategory === sub.id 
                                                ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-black" 
                                                : "bg-slate-50/70 dark:bg-white/5 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-white/5 hover:bg-slate-100"
                                        )}
                                    >
                                        {sub.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* VIRTUALIZED GRID (Virtuoso) */}
                    <div className="flex-1 -mx-4 px-4"> {/* Negative margin to allow full scroll but padding for look */}
                        <VirtuosoGrid
                            key={effectiveIsMobile ? 'grid-mobile' : 'grid-desktop'}
                            style={{ height: '100%', width: '100%' }}
                            data={filteredProducts}
                            listClassName={`grid gap-3 pb-24`}
                            components={{
                                List: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
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
                                    style={{ height: `${Math.max(110, 160 - gridCols * 8)}px` }}
                                    className="w-full bg-white dark:bg-zinc-900/90 hover:bg-slate-50 dark:hover:bg-zinc-800/90 p-3 rounded-2xl flex flex-col items-start gap-1.5 transition-all text-right group relative overflow-hidden shadow-sm border border-slate-200/80 dark:border-white/10 active:scale-[0.98] hover:border-cyan-500/40 hover:shadow-md"
                                >
                                    <div className="absolute top-2 left-2 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-cyan-500 text-black rounded-lg shadow-sm">
                                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                                    </div>

                                    <div className="flex justify-between w-full items-center">
                                        <div className="h-6 px-1.5 bg-slate-100 dark:bg-white/5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-white/5">
                                            {(p.sku || "??").slice(0, 4)}
                                        </div>
                                        {p.trackStock === false ? (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full h-fit bg-cyan-500/10 text-cyan-500 flex items-center justify-center border border-cyan-500/20" title={t('service') || "خدمة"}>
                                                <Infinity className="w-3 h-3" />
                                            </span>
                                        ) : (
                                            <span className={clsx(
                                                "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md h-fit border",
                                                p.stock > 1 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                                                    p.stock > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                            )}>
                                                {Number.isInteger(Number(p.stock)) ? p.stock : Number(p.stock).toFixed(3).replace(/\.?0+$/, '')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-auto w-full text-right">
                                        <div className={`font-bold line-clamp-2 text-slate-800 dark:text-zinc-200 group-hover:text-slate-950 dark:group-hover:text-white transition-colors ${gridCols >= 6 ? 'text-[11px]' : 'text-xs'}`}>
                                            {p.name}
                                            {p.modelName && p.modelName !== '-' && (
                                                <span className="block text-[9px] text-muted-foreground mt-0.5">{p.modelName}</span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center mt-1">
                                            <div className="text-slate-950 dark:text-emerald-400 font-black font-mono text-xs">{formatCurrency((p[priceTier] as number) ?? p.sellPrice)}</div>
                                            {permissions.canViewCost && showCostPrice && toNumber(p.costPrice) > 0 && (
                                                <div className="text-muted-foreground opacity-60 text-[9px] font-mono" title={t('costPrice') || "Cost"}>{formatCurrency(p.costPrice)}</div>
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

            {/* Mobile Sticky Bottom Cart Bar */}
            {effectiveIsMobile && (
                <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200 dark:border-white/10 p-2.5 pb-safe shadow-2xl flex items-center justify-between gap-2.5">
                    <button
                        type="button"
                        onClick={() => setIsMobileCartOpen(true)}
                        className="flex items-center gap-2.5 flex-1 text-right bg-slate-100 dark:bg-zinc-800/90 p-2 rounded-xl active:scale-[0.98] transition-all"
                    >
                        <div className="relative p-2 bg-slate-900 dark:bg-white text-white dark:text-black rounded-lg shrink-0">
                            <ShoppingCart className="w-5 h-5" />
                            {items.length > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-cyan-500 text-black text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-sm">
                                    {items.length}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">{t('cart') || 'السلة'} ({items.length})</span>
                            <span className="text-sm font-black font-mono text-slate-950 dark:text-cyan-400 truncate">
                                {formatCurrency(finalTotal)}
                            </span>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsCheckoutOpen(true)}
                        disabled={items.length === 0 || isPrinting || !permissions.canCheckout}
                        className="min-h-[44px] px-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white font-black text-sm rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 shrink-0 flex items-center justify-center gap-1.5"
                    >
                        <Banknote className="w-4 h-4" />
                        <span>{t('checkout') || 'دفع'}</span>
                    </button>
                </div>
            )}

            {/* Mobile Cart Bottom Sheet Drawer */}
            <DialogPrimitive.Root open={isMobileCartOpen} onOpenChange={setIsMobileCartOpen}>
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                    <DialogPrimitive.Content
                        className="fixed inset-x-0 bottom-0 top-auto z-50 max-h-[90dvh] bg-white dark:bg-zinc-950 rounded-t-2xl border-t border-slate-200 dark:border-white/10 shadow-2xl flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-200 pb-safe outline-none"
                        dir="rtl"
                    >
                        <div className="p-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <ShoppingCart className="w-5 h-5 text-cyan-500" />
                                <h3 className="font-black text-sm text-foreground">{t('cart') || 'سلة المشتريات'}</h3>
                                <span className="bg-slate-900 dark:bg-white text-white dark:text-black font-black text-[10px] px-2 py-0.5 rounded-full font-mono">{items.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {items.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => clearCart()}
                                        className="text-rose-500 hover:text-rose-600 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                                    >
                                        {t('clear') || 'مسح'}
                                    </button>
                                )}
                                <DialogPrimitive.Close asChild>
                                    <button
                                        type="button"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/10"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                </DialogPrimitive.Close>
                            </div>
                        </div>

                        {/* Cart Items List with 44x44 touch targets */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            {items.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center text-slate-400 dark:text-zinc-600">
                                    <ShoppingCart className="w-12 h-12 mb-2 opacity-40" />
                                    <p className="text-xs font-bold">{t('emptyCart') || 'السلة فارغة'}</p>
                                </div>
                            ) : (
                                items.map((item) => (
                                    <div key={item.id} className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5 flex items-center justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-xs text-foreground truncate">{item.name}</div>
                                            <div className="text-cyan-600 dark:text-cyan-400 font-black text-xs font-mono mt-0.5">{formatCurrency(item.price)}</div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 rounded-lg p-0.5 border border-slate-200 dark:border-white/10">
                                                <button
                                                    type="button"
                                                    onClick={() => updateQuantity(item.id, -1)}
                                                    className="w-10 h-10 rounded-md bg-slate-100 dark:bg-zinc-700 text-foreground flex items-center justify-center active:scale-95"
                                                >
                                                    <Minus className="w-4 h-4" />
                                                </button>
                                                <span className="w-8 text-center text-xs font-black font-mono">{item.quantity}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => updateQuantity(item.id, 1)}
                                                    className="w-10 h-10 rounded-md bg-slate-900 dark:bg-zinc-700 text-white flex items-center justify-center active:scale-95"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeFromCart(item.id)}
                                                className="w-10 h-10 text-rose-500 hover:bg-rose-500/10 rounded-lg flex items-center justify-center transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Drawer Footer with Total and Checkout */}
                        <div className="p-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-zinc-900/70 shrink-0 space-y-2">
                            <div className="flex justify-between items-baseline px-1">
                                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">{t('total') || 'الإجمالي'}:</span>
                                <span className="text-xl font-black font-mono text-foreground">{formatCurrency(finalTotal)}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        holdCart();
                                        setIsMobileCartOpen(false);
                                    }}
                                    disabled={items.length === 0 || isPrinting || !permissions.canHoldCart}
                                    className="h-12 px-4 rounded-xl border border-amber-500/30 text-amber-500 bg-amber-500/10 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-30"
                                >
                                    <PauseCircle className="w-4 h-4" />
                                    <span>{t('hold') || 'تعليق'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMobileCartOpen(false);
                                        setIsCheckoutOpen(true);
                                    }}
                                    disabled={items.length === 0 || isPrinting || !permissions.canCheckout}
                                    className="flex-1 h-12 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-md active:scale-98 disabled:opacity-30"
                                >
                                    <Banknote className="w-5 h-5" />
                                    <span>{t('checkout') || 'إتمام البيع'}</span>
                                </button>
                            </div>
                        </div>
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
        </div>
    );
}

