import { useState, useMemo, useEffect } from "react";
import { generateNextSku, createPurchase, updatePurchase } from "@/actions/inventory";
import { useTranslations } from "@/lib/i18n-mock";
import { toast } from "sonner";
import { safeRandomUUID } from "@/lib/utils";

// Define strict types for the hook
export interface InvoiceItem {
    id: string;
    productId?: string;
    isNew?: boolean;
    name: string;
    sku: string;
    categoryId?: string;
    quantity: number;
    unitCost: number;
    sellPrice?: number;
    sellPrice2?: number;
    sellPrice3?: number;
}

interface UsePurchaseFormProps {
    products: any[]; // Replace with specific Product type
    isHQUser: boolean;
    userBranchId?: string;
    branches: any[];
    csrfToken?: string;
    onSaveSuccess?: () => void;
}

export function usePurchaseForm({ products, isHQUser, userBranchId, branches, csrfToken, onSaveSuccess }: UsePurchaseFormProps) {
    const t = useTranslations('Purchasing');

    // UI State
    const [isNewPurchaseOpen, setIsNewPurchaseOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorResult, setErrorResult] = useState<string | null>(null);
    const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

    // CSRF Management
    const [internalCsrfToken, setInternalCsrfToken] = useState(csrfToken || "");
    const [csrfLoading, setCsrfLoading] = useState(!csrfToken);

    useEffect(() => {
        if (!internalCsrfToken) {
            setCsrfLoading(true);
            // Try to fetch existing token first (GET)
            fetch('/api/csrf/generate')
                .then(async (res) => {
                    if (res.ok) return res.json();
                    // If 404, try generating new one (POST)
                    const gen = await fetch('/api/csrf/generate', { method: 'POST' });
                    return gen.json();
                })
                .then(data => {
                    if (data.token) setInternalCsrfToken(data.token);
                })
                .catch(e => console.error("CSRF Fetch Error:", e))
                .finally(() => setCsrfLoading(false));
        }
    }, [internalCsrfToken]);

    // Form State - Header
    const [selectedSupplierId, setSelectedSupplierId] = useState("");
    const [selectedBranchId, setSelectedBranchId] = useState(() => {
        if (userBranchId) return userBranchId;
        if (!isHQUser && branches.length === 1) return branches[0].id;
        return "";
    });
    const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("CASH");

    // Form State - Totals
    const [deliveryCharge, setDeliveryCharge] = useState("");
    const [paidAmount, setPaidAmount] = useState("");

    // Form State - Item Entry
    const [entryMode, setEntryMode] = useState<'SEARCH' | 'NEW'>('SEARCH');
    const [itemSearch, setItemSearch] = useState("");

    // New Item Fields
    const [newItemSku, setNewItemSku] = useState("");
    const [newItemName, setNewItemName] = useState("");
    const [newItemCategoryId, setNewItemCategoryId] = useState("");
    const [newItemCost, setNewItemCost] = useState("");
    const [newItemQty, setNewItemQty] = useState("");
    const [newItemSellPrice, setNewItemSellPrice] = useState("");
    const [newItemSellPrice2, setNewItemSellPrice2] = useState("");
    const [newItemSellPrice3, setNewItemSellPrice3] = useState("");

    // Cart
    const [cart, setCart] = useState<InvoiceItem[]>([]);

    // Computed
    const subtotal = useMemo(() => {
        return cart.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);
    }, [cart]);

    const totalAmount = useMemo(() => {
        const del = parseFloat(deliveryCharge) || 0;
        return subtotal + del;
    }, [subtotal, deliveryCharge]);

    // --- Persistence Logic ---
    const STORAGE_KEY = 'purchase_form_draft';

    // Load from storage on mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.selectedSupplierId) setSelectedSupplierId(data.selectedSupplierId);
                if (data.selectedBranchId) setSelectedBranchId(data.selectedBranchId);
                if (data.selectedWarehouseId) setSelectedWarehouseId(data.selectedWarehouseId);
                if (data.paymentMethod) setPaymentMethod(data.paymentMethod);
                if (data.deliveryCharge) setDeliveryCharge(data.deliveryCharge);
                if (data.paidAmount) setPaidAmount(data.paidAmount);
                if (data.cart && Array.isArray(data.cart)) setCart(data.cart);

                // Only open if we have significant data
                if (data.selectedSupplierId || (data.cart && data.cart.length > 0)) {
                    setIsNewPurchaseOpen(true);
                }
            } catch (e) {
                console.error("Failed to load draft", e);
            }
        }
    }, []);

    // Save to storage on change
    useEffect(() => {
        // Don't save if editing an existing invoice
        if (editingInvoiceId) return;

        const draft = {
            selectedSupplierId,
            selectedBranchId,
            selectedWarehouseId,
            paymentMethod,
            deliveryCharge,
            paidAmount,
            cart
        };

        // Debounce slightly or just save
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }, [
        selectedSupplierId,
        selectedBranchId,
        selectedWarehouseId,
        paymentMethod,
        deliveryCharge,
        paidAmount,
        cart,
        editingInvoiceId
    ]);

    // Reset Form
    const resetForm = () => {
        setEditingInvoiceId(null);
        localStorage.removeItem(STORAGE_KEY); // Clear draft

        setSelectedSupplierId("");
        // Keep branch if user is not HQ, otherwise reset
        if (isHQUser) setSelectedBranchId("");
        setSelectedWarehouseId("");
        setPaymentMethod("CASH");
        setCart([]);
        setDeliveryCharge("");
        setPaidAmount("");
        setItemSearch("");
        setEntryMode("SEARCH");
        setErrorResult(null);
    };

    // Actions
    const handleAutoSku = async () => {
        // Extract SKUs from current cart to avoid duplicates in the same session
        const cartSKUs = cart
            .filter(item => item.sku) // Only items with SKUs
            .map(item => item.sku);

        const res: any = await generateNextSku({ existingSKUs: cartSKUs });
        if (res.success && res.sku) {
            setNewItemSku(res.sku);
        } else {
            toast.error("Failed to generate SKU");
        }
    };

    const addToCartExisting = (product: any) => {
        const existing = cart.find(i => i.productId === product.id);
        if (existing) {
            const newCart = cart.map(i =>
                i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
            );
            setCart(newCart);
            toast.success("Quantity updated");
        } else {
            setCart([...cart, {
                id: safeRandomUUID(),
                productId: product.id,
                name: product.name,
                sku: product.sku,
                quantity: 1,
                unitCost: product.costPrice,
                sellPrice: product.sellPrice,
                sellPrice2: product.sellPrice2,
                sellPrice3: product.sellPrice3
            }]);
            toast.success("Item added to cart");
        }
        setItemSearch(""); // Clear search
    };

    const addToCartNew = () => {
        if (!newItemName || !newItemSku || !newItemCategoryId || !newItemCost || !newItemQty || !newItemSellPrice) {
            toast.error(t('validation.missing', { fields: "Name, SKU, Category, Cost, Qty, Price" })); // Ideally use sonner
            return;
        }

        const cost = parseFloat(newItemCost);
        const qty = parseFloat(newItemQty);
        const price = parseFloat(newItemSellPrice);

        if (cost > price) {
            toast.error(t('validation.costError', { names: newItemName }));
            return;
        }

        setCart([...cart, {
            id: safeRandomUUID(),
            isNew: true,
            name: newItemName,
            sku: newItemSku,
            categoryId: newItemCategoryId,
            unitCost: cost,
            quantity: qty,
            sellPrice: price,
            sellPrice2: parseFloat(newItemSellPrice2) || undefined,
            sellPrice3: parseFloat(newItemSellPrice3) || undefined,
        }]);

        // Reset new item fields
        setNewItemName("");
        setNewItemSku("");
        setNewItemCost("");
        setNewItemQty("");
        setNewItemSellPrice("");
        setNewItemSellPrice2("");
        setNewItemSellPrice3("");
        setEntryMode("SEARCH");
        toast.success("New Item Added");
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(i => i.id !== id));
    };

    const updateCartItem = (id: string, updates: Partial<InvoiceItem>) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newItem = { ...item, ...updates };

                // Price Variance Check (Only for existing products)
                if (updates.unitCost !== undefined && item.productId) {
                    const originalProduct = products.find(p => p.id === item.productId);
                    if (originalProduct && originalProduct.costPrice > 0) {
                        const oldPrice = originalProduct.costPrice;
                        const newPrice = updates.unitCost;
                        const variance = ((newPrice - oldPrice) / oldPrice) * 100;

                        if (variance > 5) {
                            toast.warning(t('validation.priceVarianceWarning', {
                                name: item.name,
                                percentage: variance.toFixed(1),
                                oldPrice: oldPrice.toFixed(2)
                            }), { duration: 5000 });
                        }
                    }
                }

                return newItem;
            }
            return item;
        }));
    };

    const handleSubmit = async () => {
        // Block submission while CSRF token is loading
        if (csrfLoading) {
            toast.error("Security token loading, please wait...");
            return;
        }

        if (!internalCsrfToken) {
            toast.error("Security token expired. Please refresh the page.");
            return;
        }

        if (!selectedSupplierId || cart.length === 0) return;

        // Validation: Cost <= Price
        const invalidItems = cart.filter(item => {
            const cost = item.unitCost;
            if ((item.sellPrice || 0) > 0 && (item.sellPrice || 0) < cost) return true;
            if ((item.sellPrice2 || 0) > 0 && (item.sellPrice2 || 0) < cost) return true;
            if ((item.sellPrice3 || 0) > 0 && (item.sellPrice3 || 0) < cost) return true;
            return false;
        });

        if (invalidItems.length > 0) {
            const names = invalidItems.map(i => i.name).join(", ");
            toast.error(t('validation.costError', { names }));
            return;
        }

        setLoading(true);

        let result;
        const payload = {
            supplierId: selectedSupplierId,
            warehouseId: selectedWarehouseId || undefined,
            items: cart.map(i => ({
                productId: i.productId, // Might be undefined if new
                name: i.name,
                sku: i.sku,
                categoryId: i.categoryId,
                sellPrice: i.sellPrice,
                sellPrice2: i.sellPrice2,
                sellPrice3: i.sellPrice3,
                quantity: i.quantity,
                unitCost: i.unitCost
            })),
            paidAmount: parseFloat(paidAmount) || 0,
            deliveryCharge: parseFloat(deliveryCharge) || 0,
            paymentMethod,
            csrfToken: internalCsrfToken
        };

        if (editingInvoiceId) {
            result = await updatePurchase(editingInvoiceId, payload);
        } else {
            result = await createPurchase(payload);
        }

        setLoading(false);
        if (result.success) {
            setIsNewPurchaseOpen(false);
            resetForm(); // This will also clear localStorage
            toast.success(editingInvoiceId ? "Purchase updated" : "Purchase created");
            if (onSaveSuccess) onSaveSuccess();
        } else {
            const msg = (result as any).error || (result as any).message || "Unknown error occurred";
            setErrorResult(msg);
            toast.error(msg);
        }
    };

    return {
        // UI Controls
        isNewPurchaseOpen, setIsNewPurchaseOpen,
        loading, setLoading,
        csrfLoading, // CSRF token loading state
        errorResult, setErrorResult,
        editingInvoiceId, setEditingInvoiceId,

        // Form Data
        selectedSupplierId, setSelectedSupplierId,
        selectedBranchId, setSelectedBranchId,
        selectedWarehouseId, setSelectedWarehouseId,
        paymentMethod, setPaymentMethod,
        deliveryCharge, setDeliveryCharge,
        paidAmount, setPaidAmount,

        // Entry
        entryMode, setEntryMode,
        itemSearch, setItemSearch,

        // New Item Fields
        newItemSku, setNewItemSku,
        newItemName, setNewItemName,
        newItemCategoryId, setNewItemCategoryId,
        newItemCost, setNewItemCost,
        newItemQty, setNewItemQty,
        newItemSellPrice, setNewItemSellPrice,
        newItemSellPrice2, setNewItemSellPrice2,
        newItemSellPrice3, setNewItemSellPrice3,

        // Cart
        cart, setCart,
        removeFromCart,
        updateCartItem,
        addToCartExisting,
        addToCartNew,

        // Actions
        handleAutoSku,
        resetForm,
        handleSubmit,

        // Computeds
        subtotal,
        totalAmount
    };
}
