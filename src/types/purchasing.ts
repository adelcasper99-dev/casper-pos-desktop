export interface ProductOption {
    id: string;
    name: string;
    sku: string;
    costPrice: number | string;
    sellPrice: number | string;
    sellPrice2?: number | string;
    sellPrice3?: number | string;
    stock: number | string;
    categoryId?: string | null;
    modelId?: string | null;
    attributeId?: string | null;
}

export interface BranchOption {
    id: string;
    name: string;
}

export interface WarehouseOption {
    id: string;
    name: string;
    isDefault?: boolean;
}

export interface CartItem {
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
    quantity: number | string;
    unitCost: number | string;
    sellPrice?: number | string;
    sellPrice2?: number | string;
    sellPrice3?: number | string;
    minQty?: number | string;
    isDevice?: boolean;
    condition?: string;
    imei?: string;
    deviceType?: string;
    unitOfMeasureId?: string;
    conversionFactor?: number | string;
}

export interface PurchaseFormReturn {
    isNewPurchaseOpen: boolean;
    setIsNewPurchaseOpen: (open: boolean) => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    csrfLoading: boolean;
    csrfError: boolean;
    errorResult: string | null;
    setErrorResult: (error: string | null) => void;
    editingInvoiceId: string | null;
    setEditingInvoiceId: (id: string | null) => void;
    isDraftLoaded: boolean;

    selectedSupplierId: string;
    setSelectedSupplierId: (id: string) => void;
    selectedBranchId: string;
    setSelectedBranchId: (id: string) => void;
    selectedWarehouseId: string;
    setSelectedWarehouseId: (id: string) => void;
    paymentMethod: string;
    setPaymentMethod: (method: string) => void;
    treasuryId: string;
    setTreasuryId: (id: string) => void;
    deliveryCharge: string;
    setDeliveryCharge: (charge: string) => void;
    paidAmount: string;
    setPaidAmount: (amount: string) => void;

    entryMode: 'SEARCH' | 'NEW';
    setEntryMode: (mode: 'SEARCH' | 'NEW') => void;
    itemSearch: string;
    setItemSearch: (search: string) => void;

    newItemSku: string;
    setNewItemSku: (sku: string) => void;
    newItemName: string;
    setNewItemName: (name: string) => void;
    newItemCategoryId: string;
    setNewItemCategoryId: (id: string) => void;
    newItemCost: string;
    setNewItemCost: (cost: string) => void;
    newItemQty: string;
    setNewItemQty: (qty: string) => void;
    newItemSellPrice: string;
    setNewItemSellPrice: (price: string) => void;
    newItemSellPrice2: string;
    setNewItemSellPrice2: (price: string) => void;
    newItemSellPrice3: string;
    setNewItemSellPrice3: (price: string) => void;
    newItemIsDevice: boolean;
    setNewItemIsDevice: (is: boolean) => void;
    newItemDeviceType: string;
    setNewItemDeviceType: (type: string) => void;
    newItemColor: string;
    setNewItemColor: (color: string) => void;
    newItemCondition: string;
    setNewItemCondition: (cond: string) => void;

    isWalkin: boolean;
    setIsWalkin: (is: boolean) => void;
    walkinName: string;
    setWalkinName: (name: string) => void;
    walkinPhone: string;
    setWalkinPhone: (phone: string) => void;
    walkinNationalId: string;
    setWalkinNationalId: (id: string) => void;
    attachmentUrl: string | null;
    setAttachmentUrl: (url: string | null, file?: File | null) => void;

    cart: CartItem[];
    setCart: (cart: CartItem[]) => void;
    removeFromCart: (id: string) => void;
    updateCartItem: (id: string, updates: Partial<CartItem>) => void;
    addToCartExisting: (product: any) => void;
    addToCartNew: () => void;

    handleAutoSku: () => Promise<void>;
    resetForm: () => void;
    handleSubmit: () => Promise<void>;

    subtotal: number;
    totalAmount: number;
}

export interface PurchaseInvoiceWithItems {
    id: string;
    warehouseId: string;
    items: Array<{
        id: string;
        quantity: number;
        unitCost: number | string;
        returnedQty?: number;
        product?: {
            name: string;
            stocks?: Array<{
                warehouseId: string;
                quantity: number | string;
            }>;
        };
    }>;
}

export interface UnitOption {
    id: string;
    name: string;
    conversionFactor?: number;
}

export interface PriceHistoryEntry {
    id: string;
    supplierName: string;
    date: Date | string;
    unitCost: number | string;
    invoiceNumber: string | null;
}
