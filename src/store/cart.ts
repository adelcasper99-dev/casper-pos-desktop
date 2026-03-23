import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartProduct } from '@/types/product';

export interface CartItem {
    id: string; // Product UUID
    sku: string;
    name: string;
    price: number;
    quantity: number;
    maxQuantity: number; // Added for Stock Protection
    trackStock?: boolean;
    isBundle?: boolean;
    bundleComponents?: { id: string; name: string; quantityIncluded: number }[];
    priceTier?: 'sellPrice' | 'sellPrice2' | 'sellPrice3';
    price1: number;
    price2: number;
    price3: number;
}

export interface HeldCart {
    id: string; // Timestamp or UUID
    name: string; // "Cart #1 - 12:30 PM"
    items: CartItem[];
    date: Date;
    customerName?: string;
    customerPhone?: string;
    customerId?: string; // 🆕 Added to HeldCart interface
    customerBalance?: number; // 🆕 Added to HeldCart interface
    customerAddress?: string; // 🆕 Added Customer Address
    linkedEmployeeId?: string; // 🆕 Added Employee Link
    isSupplier?: boolean; // 🆕 Added Supplier Flag
    tableId?: string;
    tableName?: string;
    discountAmount?: number;
    discountPercentage?: number;
}

interface CartState {
    items: CartItem[];
    customerName: string;
    customerPhone: string;
    customerAddress?: string; // 🆕 Added Customer Address
    customerId?: string; // 🆕 Added Customer ID
    customerBalance?: number; // 🆕 Added Customer Balance
    linkedEmployeeId?: string; // 🆕 Added Employee Link
    isSupplier?: boolean; // 🆕 Added Supplier Flag
    tableId?: string;
    tableName?: string;
    discountAmount: number;
    discountPercentage: number;
    lastAddedId: string | null; // 🆕 Track last added item for shortcuts

    addToCart: (product: CartProduct) => void;
    removeFromCart: (productId: string) => void;
    updateQuantity: (productId: string, delta: number) => void;
    setItemQuantity: (productId: string, quantity: number) => void;
    clearCart: () => void;
    setCustomer: (name: string, phone: string, id?: string, balance?: number, linkedEmployeeId?: string, isSupplier?: boolean, address?: string) => void;
    setTable: (id?: string, name?: string) => void;
    setDiscount: (amount: number, percentage: number) => void;
    toggleCostPrice: () => void;

    // Hold Cart Actions
    heldCarts: HeldCart[];
    holdCart: (cartName?: string) => void;
    resumeCart: (cartId: string) => void;
    removeHeldCart: (cartId: string) => void;

    // Computed
    getTotal: () => number;
    
    // Price Tier
    priceTier: 'sellPrice' | 'sellPrice2' | 'sellPrice3';
    setPriceTier: (tier: 'sellPrice' | 'sellPrice2' | 'sellPrice3') => void;
    showCostPrice: boolean;
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            customerName: '',
            customerPhone: '',
            customerAddress: undefined,
            customerId: undefined,
            customerBalance: undefined,
            tableId: undefined,
            tableName: undefined,
            discountAmount: 0,
            discountPercentage: 0,
            heldCarts: [],
            lastAddedId: null,
            priceTier: 'sellPrice3', // Default to Retail (قطاعى)
            showCostPrice: false,

            setCustomer: (name, phone, id, balance, linkedEmployeeId, isSupplier, address) => set({ 
                customerName: name, 
                customerPhone: phone, 
                customerId: id, 
                customerBalance: balance, 
                linkedEmployeeId, 
                isSupplier,
                customerAddress: address 
            }),
            setTable: (id, name) => set({ tableId: id, tableName: name }),
            setDiscount: (amount, percentage) => set({ discountAmount: amount, discountPercentage: percentage }),

            addToCart: (product: any) => {
                const items = get().items;
                const existingItem = items.find((i) => i.id === product.id);
                const currentQty = existingItem ? existingItem.quantity : 0;
                const maxQty = product.stock;

                if (product.trackStock !== false && currentQty >= maxQty) {
                    // Start of Stock Protection: Prevent adding if out of stock
                    // In a real app we'd trigger a toast here
                    return;
                }

                if (existingItem) {
                    set({
                        items: items.map((i) =>
                            i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
                        ),
                        lastAddedId: product.id,
                    });
                } else {
                    set({
                        items: [
                            ...items,
                            {
                                 id: product.id,
                                 sku: product.sku,
                                 name: product.name,
                                 price: Number(product[get().priceTier] || product.sellPrice),
                                 quantity: 1,
                                 maxQuantity: product.stock,
                                 trackStock: product.trackStock,
                                 isBundle: !!(product as any).isBundle,
                                 bundleComponents: (product as any).bundleComponents || undefined,
                                 priceTier: get().priceTier,
                                 price1: Number(product.sellPrice),
                                 price2: Number(product.sellPrice2),
                                 price3: Number(product.sellPrice3),
                             },
                         ],
                         lastAddedId: product.id,
                     });
                 }
             },

             toggleCostPrice: () => set((state) => ({ showCostPrice: !state.showCostPrice })),

             setPriceTier: (tier) => {
                 const items = get().items;
                 const updatedItems = items.map(item => {
                     let newPrice = item.price;
                     if (tier === 'sellPrice') newPrice = item.price1;
                     else if (tier === 'sellPrice2') newPrice = item.price2 || item.price1;
                     else if (tier === 'sellPrice3') newPrice = item.price3 || item.price1;
                     
                     return { 
                         ...item, 
                         priceTier: tier,
                         price: newPrice 
                     };
                 });
                 
                 set({ 
                     priceTier: tier,
                     items: updatedItems
                 });
             },

            updateQuantity: (productId, delta) => {
                const items = get().items;
                set({
                    items: items.map((i) => {
                        if (i.id === productId) {
                            const newQty = i.quantity + delta;
                            if (i.trackStock !== false && newQty > i.maxQuantity) return i; // Block exceeding stock
                            return { ...i, quantity: Math.max(1, newQty) };
                        }
                        return i;
                    })
                });
            },

            setItemQuantity: (productId, quantity) => {
                const items = get().items;
                set({
                    items: items.map((i) => {
                        if (i.id === productId) {
                            if (i.trackStock !== false && quantity > i.maxQuantity) return i; // Block exceeding stock
                            return { ...i, quantity: Math.max(1, quantity) };
                        }
                        return i;
                    })
                });
            },

            removeFromCart: (productId) => {
                set({
                    items: get().items.filter((i) => i.id !== productId),
                    lastAddedId: get().lastAddedId === productId ? null : get().lastAddedId,
                });
            },

            clearCart: () => set({ items: [], customerName: '', customerPhone: '', customerAddress: undefined, customerId: undefined, customerBalance: undefined, linkedEmployeeId: undefined, isSupplier: undefined, tableId: undefined, tableName: undefined, discountAmount: 0, discountPercentage: 0 }),

            holdCart: (cartName) => {
                const { items, heldCarts, customerName, customerPhone } = get();
                if (items.length === 0) return;

                const newHeldCart: HeldCart = {
                    id: new Date().getTime().toString(),
                    name: cartName || `Cart #${heldCarts.length + 1}`,
                    items: [...items],
                    date: new Date(),
                    customerName,
                    customerPhone,
                    customerAddress: get().customerAddress,
                    customerId: get().customerId,
                    customerBalance: get().customerBalance,
                    linkedEmployeeId: get().linkedEmployeeId,
                    isSupplier: get().isSupplier,
                    tableId: get().tableId,
                    tableName: get().tableName,
                    discountAmount: get().discountAmount,
                    discountPercentage: get().discountPercentage
                };

                set({
                    heldCarts: [...heldCarts, newHeldCart],
                    items: [], // Clear main cart
                    customerName: '',
                    customerPhone: '',
                    customerAddress: undefined,
                    customerId: undefined,
                    customerBalance: undefined,
                    linkedEmployeeId: undefined,
                    isSupplier: undefined,
                    tableId: undefined,
                    tableName: undefined,
                    discountAmount: 0,
                    discountPercentage: 0
                });
            },

            resumeCart: (cartId) => {
                const { heldCarts } = get();
                const cartToResume = heldCarts.find(c => c.id === cartId);

                if (cartToResume) {
                    set({
                        items: cartToResume.items,
                        customerName: cartToResume.customerName || '',
                        customerPhone: cartToResume.customerPhone || '',
                        customerAddress: cartToResume.customerAddress,
                        customerId: cartToResume.customerId, // Restore ID if exists
                        customerBalance: cartToResume.customerBalance, // Restore balance
                        linkedEmployeeId: cartToResume.linkedEmployeeId,
                        isSupplier: cartToResume.isSupplier,
                        tableId: cartToResume.tableId,
                        tableName: cartToResume.tableName,
                        discountAmount: cartToResume.discountAmount || 0,
                        discountPercentage: cartToResume.discountPercentage || 0,
                        heldCarts: heldCarts.filter(c => c.id !== cartId)
                    });
                }
            },

            removeHeldCart: (cartId) => {
                set({
                    heldCarts: get().heldCarts.filter(c => c.id !== cartId)
                });
            },

            getTotal: () => {
                return get().items.reduce((total, item) => total + (item.price * item.quantity), 0);
            }
        }),
        {
            name: 'casper-pos-cart',
        }
    )
);
