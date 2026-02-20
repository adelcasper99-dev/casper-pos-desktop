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
}

export interface HeldCart {
    id: string; // Timestamp or UUID
    name: string; // "Cart #1 - 12:30 PM"
    items: CartItem[];
    date: Date;
    customerName?: string;
    customerPhone?: string;
    customerId?: string; // 🆕 Added to HeldCart interface
}

interface CartState {
    items: CartItem[];
    customerName: string;
    customerPhone: string;
    customerId?: string; // 🆕 Added Customer ID

    addToCart: (product: CartProduct) => void;
    removeFromCart: (productId: string) => void;
    updateQuantity: (productId: string, delta: number) => void;
    clearCart: () => void;
    setCustomer: (name: string, phone: string, id?: string) => void;

    // Hold Cart Actions
    heldCarts: HeldCart[];
    holdCart: (cartName?: string) => void;
    resumeCart: (cartId: string) => void;
    removeHeldCart: (cartId: string) => void;

    // Computed
    getTotal: () => number;
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            customerName: '',
            customerPhone: '',
            customerId: undefined,
            heldCarts: [],

            setCustomer: (name, phone, id) => set({ customerName: name, customerPhone: phone, customerId: id }),

            addToCart: (product) => {
                const items = get().items;
                const existingItem = items.find((i) => i.id === product.id);
                const currentQty = existingItem ? existingItem.quantity : 0;
                const maxQty = product.stock;

                if (currentQty >= maxQty) {
                    // Start of Stock Protection: Prevent adding if out of stock
                    // In a real app we'd trigger a toast here
                    return;
                }

                if (existingItem) {
                    set({
                        items: items.map((i) =>
                            i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
                        ),
                    });
                } else {
                    set({
                        items: [
                            ...items,
                            {
                                id: product.id,
                                sku: product.sku,
                                name: product.name,
                                price: Number(product.sellPrice),
                                quantity: 1,
                                maxQuantity: product.stock
                            },
                        ],
                    });
                }
            },

            updateQuantity: (productId, delta) => {
                const items = get().items;
                set({
                    items: items.map((i) => {
                        if (i.id === productId) {
                            const newQty = i.quantity + delta;
                            if (newQty > i.maxQuantity) return i; // Block exceeding stock
                            return { ...i, quantity: Math.max(1, newQty) };
                        }
                        return i;
                    })
                });
            },

            removeFromCart: (productId) => {
                set({
                    items: get().items.filter((i) => i.id !== productId),
                });
            },

            clearCart: () => set({ items: [], customerName: '', customerPhone: '', customerId: undefined }),

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
                    customerId: get().customerId
                };

                set({
                    heldCarts: [...heldCarts, newHeldCart],
                    items: [], // Clear main cart
                    customerName: '',
                    customerPhone: ''
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
                        customerId: cartToResume.customerId, // Restore ID if exists
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
