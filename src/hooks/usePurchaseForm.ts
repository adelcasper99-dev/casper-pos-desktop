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
    modelId?: string;
    modelName?: string;
    isNewModel?: boolean;
    attributeId?: string;
    attributeName?: string;
    isNewAttribute?: boolean;
    quantity: number;
    unitCost: number;
    sellPrice?: number;
    sellPrice2?: number;
    sellPrice3?: number;
    isDevice?: boolean;
    condition?: string;
    imei?: string;
    deviceType?: string;
    unitOfMeasureId?: string;
    conversionFactor?: number;
}

interface UsePurchaseFormProps {
    products: any[]; // Replace with specific Product type
    isHQUser: boolean;
    userBranchId?: string;
    branches: any[];
    warehouses: any[];
    csrfToken?: string;
    onSaveSuccess?: () => void;
}

export function usePurchaseForm({ products, isHQUser, userBranchId, branches, warehouses, csrfToken, onSaveSuccess }: UsePurchaseFormProps) {
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
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(() => {
        const main = warehouses.find(w => w.isDefault);
        return main?.id || "";
    });
    const [paymentMethod, setPaymentMethod] = useState("CASH");
    const [treasuryId, setTreasuryId] = useState<string>("");

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
    const [newItemIsDevice, setNewItemIsDevice] = useState(false);
    const [newItemDeviceType, setNewItemDeviceType] = useState<string>("OTHER");
    const [newItemColor, setNewItemColor] = useState("");
    const [newItemCondition, setNewItemCondition] = useState("NEW");

    // Walk-In Customer Fields
    const [isWalkin, setIsWalkin] = useState(false);
    const [walkinName, setWalkinName] = useState("");
    const [walkinPhone, setWalkinPhone] = useState("");
    const [walkinNationalId, setWalkinNationalId] = useState("");
    const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);

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

    // Ensure paid amount does not exceed total amount when items/delivery change
    useEffect(() => {
        const pAmount = parseFloat(paidAmount);
        if (!isNaN(pAmount) && pAmount > totalAmount) {
            setPaidAmount(totalAmount.toString());
        }
    }, [totalAmount, paidAmount]);

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
                if (data.treasuryId) setTreasuryId(data.treasuryId);
                if (data.deliveryCharge) setDeliveryCharge(data.deliveryCharge);
                if (data.paidAmount) setPaidAmount(data.paidAmount);
                if (data.cart && Array.isArray(data.cart)) setCart(data.cart);
                
                // New persistent fields
                if (data.isWalkin !== undefined) setIsWalkin(data.isWalkin);
                if (data.walkinName) setWalkinName(data.walkinName);
                if (data.walkinPhone) setWalkinPhone(data.walkinPhone);
                if (data.walkinNationalId) setWalkinNationalId(data.walkinNationalId);
                if (data.attachmentUrl) setAttachmentUrl(data.attachmentUrl);

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
            treasuryId,
            deliveryCharge,
            paidAmount,
            cart,
            isWalkin,
            walkinName,
            walkinPhone,
            walkinNationalId,
            attachmentUrl
        };

        // Debounce slightly or just save
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }, [
        selectedSupplierId,
        selectedBranchId,
        selectedWarehouseId,
        paymentMethod,
        treasuryId,
        deliveryCharge,
        paidAmount,
        cart,
        isWalkin,
        walkinName,
        walkinPhone,
        walkinNationalId,
        attachmentUrl,
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
        setTreasuryId("");
        setCart([]);
        setDeliveryCharge("");
        setPaidAmount("");
        setEntryMode("SEARCH");
        setErrorResult(null);
        setNewItemIsDevice(false);
        setNewItemDeviceType("OTHER");
        setNewItemColor("");
        setNewItemCondition("NEW");
        
        setIsWalkin(false);
        setWalkinName("");
        setWalkinPhone("");
        setWalkinNationalId("");
        setAttachmentUrl(null);
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

        if (newItemIsDevice && (!newItemCondition || !newItemColor)) {
            toast.error(t('validation.missing', { fields: "Condition, Color" }));
            return;
        }

        const cost = parseFloat(newItemCost);
        const qty = newItemIsDevice ? 1 : parseFloat(newItemQty);
        const price = parseFloat(newItemSellPrice);

        if (cost > price) {
            toast.error(t('validation.costError', { names: newItemName }));
            return;
        }

        const finalName = newItemIsDevice 
            ? `${newItemName} - اللون: ${newItemColor} - الحالة: ${newItemCondition}` 
            : newItemName;

        setCart([...cart, {
            id: safeRandomUUID(),
            isNew: true,
            name: finalName,
            sku: newItemSku,
            categoryId: newItemCategoryId,
            unitCost: cost,
            quantity: qty,
            sellPrice: price,
            sellPrice2: parseFloat(newItemSellPrice2) || undefined,
            sellPrice3: parseFloat(newItemSellPrice3) || undefined,
            isDevice: newItemIsDevice,
            deviceType: newItemDeviceType,
            condition: newItemIsDevice ? newItemCondition : undefined,
            imei: newItemIsDevice ? newItemSku : undefined, // SKU mapped as IMEI
        }]);

        // Reset new item fields
        setNewItemName("");
        setNewItemSku("");
        setNewItemCost("");
        setNewItemQty("");
        setNewItemSellPrice("");
        setNewItemSellPrice2("");
        setNewItemSellPrice3("");
        setNewItemColor("");
        setNewItemIsDevice(false);
        setNewItemDeviceType("OTHER");
        setNewItemCondition("NEW");
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

        if (isWalkin && (!walkinName || !walkinPhone)) {
            toast.error("يرجى إدخال اسم ورقم تليفون العميل المباشر");
            return;
        }

        if (!isWalkin && !selectedSupplierId) {
            toast.error("يرجى اختيار مورد");
            return;
        }

        if (cart.length === 0) return;

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
            supplierId: isWalkin ? "WALKIN" : selectedSupplierId,
            isWalkin,
            walkinName: isWalkin ? walkinName : undefined,
            walkinPhone: isWalkin ? walkinPhone : undefined,
            walkinNationalId: isWalkin ? walkinNationalId : undefined,
            attachmentUrl: (isWalkin && attachmentUrl) ? attachmentUrl : undefined,
            warehouseId: selectedWarehouseId || undefined,
            items: cart.map(i => ({
                productId: i.productId,
                name: i.name,
                sku: i.sku,
                categoryId: i.categoryId,
                modelId: i.modelId,
                attributeId: i.attributeId,
                sellPrice: i.sellPrice,
                sellPrice2: i.sellPrice2,
                sellPrice3: i.sellPrice3,
                quantity: i.quantity,
                unitCost: i.unitCost,
                isDevice: i.isDevice,
                deviceType: i.deviceType,
                condition: i.condition,
                imei: i.imei,
                unitOfMeasureId: i.unitOfMeasureId,
                conversionFactor: i.conversionFactor || 1
            })),
            paidAmount: parseFloat(paidAmount) || 0,
            deliveryCharge: parseFloat(deliveryCharge) || 0,
            paymentMethod,
            treasuryId: treasuryId || undefined,
            csrfToken: internalCsrfToken
        };

        if (editingInvoiceId) {
            result = await updatePurchase({ id: editingInvoiceId, data: payload, csrfToken: internalCsrfToken });
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
        treasuryId, setTreasuryId,
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
        newItemIsDevice, setNewItemIsDevice,
        newItemDeviceType, setNewItemDeviceType,
        newItemColor, setNewItemColor,
        newItemCondition, setNewItemCondition,

        // Walk-In
        isWalkin, setIsWalkin,
        walkinName, setWalkinName,
        walkinPhone, setWalkinPhone,
        walkinNationalId, setWalkinNationalId,
        attachmentUrl, setAttachmentUrl,

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
