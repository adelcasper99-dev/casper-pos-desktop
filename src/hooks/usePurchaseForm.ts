import { useState, useMemo, useEffect, useRef } from "react";
import { generateNextSku, createPurchase, updatePurchase } from "@/actions/inventory";
import { useTranslations } from "@/lib/i18n-mock";
import { toast } from "sonner";
import { safeRandomUUID } from "@/lib/utils";
import { Decimal } from 'decimal.js';
import { toDecimal } from '@/lib/decimal-utils';
import { CartItem as InvoiceItem, PurchaseFormReturn } from "@/types/purchasing";
import { Product, Branch, Warehouse } from "@/types/product";
import { compressImage } from "@/lib/image-compressor";
export type { InvoiceItem };

interface UsePurchaseFormProps {
    products: Product[];
    isHQUser: boolean;
    userBranchId?: string;
    branches: Branch[];
    warehouses: Warehouse[];
    csrfToken?: string;
    onSaveSuccess?: () => void;
}

export function usePurchaseForm({ products, isHQUser, userBranchId, branches, warehouses, csrfToken, onSaveSuccess }: UsePurchaseFormProps): PurchaseFormReturn {
    const t = useTranslations('Purchasing');

    // UI State
    const [isNewPurchaseOpen, setIsNewPurchaseOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorResult, setErrorResult] = useState<string | null>(null);
    const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

    // CSRF Management
    const [internalCsrfToken, setInternalCsrfToken] = useState(csrfToken || "");
    const [csrfLoading, setCsrfLoading] = useState(!csrfToken);
    const [csrfError, setCsrfError] = useState(false);

    useEffect(() => {
        if (!internalCsrfToken) {
            setCsrfLoading(true);
            setCsrfError(false);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 5000);

            // Try to fetch existing token first (GET)
            fetch('/api/csrf/generate', { signal: controller.signal })
                .then(async (res) => {
                    if (res.ok) return res.json();
                    // If 404, try generating new one (POST)
                    const gen = await fetch('/api/csrf/generate', { method: 'POST', signal: controller.signal });
                    return gen.json();
                })
                .then(data => {
                    if (data.token) {
                        setInternalCsrfToken(data.token);
                        setCsrfError(false);
                    } else {
                        setCsrfError(true);
                    }
                })
                .catch(e => {
                    console.error("CSRF Fetch Error:", e);
                    setCsrfError(true);
                })
                .finally(() => {
                    clearTimeout(timeoutId);
                    setCsrfLoading(false);
                });
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
    const [attachmentUrl, _setAttachmentUrl] = useState<string | null>(null);
    const attachmentFileRef = useRef<File | null>(null);

    const setAttachmentUrl = (url: string | null, file?: File | null) => {
        _setAttachmentUrl(url);
        if (file !== undefined) {
            attachmentFileRef.current = file;
        } else if (url === null) {
            attachmentFileRef.current = null;
        }
    };

    // Cart
    const [cart, setCart] = useState<InvoiceItem[]>([]);

    // Computed
    const subtotal = useMemo(() => {
        return cart.reduce((acc, item) => acc.plus(toDecimal(item.quantity).times(toDecimal(item.unitCost))), new Decimal(0)).toNumber();
    }, [cart]);

    const totalAmount = useMemo(() => {
        return toDecimal(subtotal).plus(toDecimal(deliveryCharge)).toNumber();
    }, [subtotal, deliveryCharge]);

    // Ensure paid amount does not exceed total amount when items/delivery change
    useEffect(() => {
        const pDec = toDecimal(paidAmount);
        const tDec = toDecimal(totalAmount);
        if (pDec.gt(tDec)) {
            setPaidAmount(tDec.toString());
        }
    }, [totalAmount, paidAmount]);

    // --- Persistence Logic ---
    const STORAGE_KEY = 'purchase_form_draft_v2';
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from storage on mount
    useEffect(() => {
        if (editingInvoiceId) return;
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

                // Only open if we have significant data
                if (data.selectedSupplierId || (data.cart && data.cart.length > 0)) {
                    setIsNewPurchaseOpen(true);
                }
            } catch (e) {
                console.error("Failed to load draft", e);
            }
        }
        setIsLoaded(true);
    }, [editingInvoiceId]);

    // Save to storage on change
    useEffect(() => {
        // Don't save if editing an existing invoice or not fully loaded
        if (editingInvoiceId || !isLoaded) return;

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
            walkinNationalId
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
        editingInvoiceId,
        isLoaded
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
                i.productId === product.id ? { ...i, quantity: Number(i.quantity) + 1 } : i
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

        const cost = toDecimal(newItemCost).toNumber();
        const qty = newItemIsDevice ? 1 : toDecimal(newItemQty).toNumber();
        const price = toDecimal(newItemSellPrice).toNumber();

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
            sellPrice2: newItemSellPrice2 ? toDecimal(newItemSellPrice2).toNumber() : undefined,
            sellPrice3: newItemSellPrice3 ? toDecimal(newItemSellPrice3).toNumber() : undefined,
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
                    if (originalProduct) {
                        const oldPrice = toDecimal(originalProduct.costPrice);
                        if (oldPrice.gt(0)) {
                            const newPrice = toDecimal(updates.unitCost);
                            const variance = newPrice.minus(oldPrice).div(oldPrice).times(100);

                            if (variance.gt(5)) {
                                toast.warning(t('validation.priceVarianceWarning', {
                                    name: item.name,
                                    percentage: variance.toFixed(1),
                                    oldPrice: oldPrice.toFixed(2)
                                }), { duration: 5000 });
                            }
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
            const cost = Number(item.unitCost);
            if (Number(item.sellPrice || 0) > 0 && Number(item.sellPrice || 0) < cost) return true;
            if (Number(item.sellPrice2 || 0) > 0 && Number(item.sellPrice2 || 0) < cost) return true;
            if (Number(item.sellPrice3 || 0) > 0 && Number(item.sellPrice3 || 0) < cost) return true;
            return false;
        });

        if (invalidItems.length > 0) {
            const names = invalidItems.map(i => i.name).join(", ");
            toast.error(t('validation.costError', { names }));
            return;
        }

        setLoading(true);

        let finalAttachmentUrl: string | undefined = undefined;
        if (isWalkin) {
            if (attachmentFileRef.current) {
                try {
                    finalAttachmentUrl = await compressImage(attachmentFileRef.current, 1000, 1000, 0.7);
                } catch (err) {
                    console.error("Failed to compress image:", err);
                    toast.error("فشل في معالجة وضغط الصورة، سيتم الحفظ بدونها");
                }
            } else if (attachmentUrl && !attachmentUrl.startsWith("blob:")) {
                finalAttachmentUrl = attachmentUrl;
            }
        }

        let result;
        const payload = {
            supplierId: isWalkin ? "WALKIN" : selectedSupplierId,
            isWalkin,
            walkinName: isWalkin ? walkinName : undefined,
            walkinPhone: isWalkin ? walkinPhone : undefined,
            walkinNationalId: isWalkin ? walkinNationalId : undefined,
            attachmentUrl: finalAttachmentUrl,
            warehouseId: selectedWarehouseId || undefined,
            items: cart.map(i => ({
                productId: i.productId,
                name: i.name,
                sku: i.sku,
                categoryId: i.categoryId,
                modelId: i.modelId,
                attributeId: i.attributeId,
                sellPrice: toDecimal(i.sellPrice).toNumber(),
                sellPrice2: toDecimal(i.sellPrice2).toNumber(),
                sellPrice3: toDecimal(i.sellPrice3).toNumber(),
                quantity: Number(i.quantity),
                unitCost: toDecimal(i.unitCost).toFixed(4),
                isDevice: i.isDevice,
                deviceType: i.deviceType,
                condition: i.condition,
                imei: i.imei,
                description: i.description,
                unitOfMeasureId: i.unitOfMeasureId,
                conversionFactor: Number(i.conversionFactor || 1)
            })),
            paidAmount: toDecimal(paidAmount).toNumber(),
            deliveryCharge: toDecimal(deliveryCharge).toNumber(),
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
        csrfError,
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
