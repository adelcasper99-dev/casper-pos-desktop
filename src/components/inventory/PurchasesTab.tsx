"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPurchase, getPurchaseInvoices } from "@/actions/inventory";
import { voidPurchase } from "@/actions/purchase-actions";
import { getBranchTreasuriesForDropdown } from "@/actions/treasury";
import {
    Loader2, Plus, ShoppingCart, FileText,
    Calendar, Trash2, Printer, Filter, Barcode, ChevronUp, ChevronDown, X, RotateCcw, Pencil
} from "lucide-react";
import { BarcodePrintDialog } from "@/components/inventory/BarcodePrintDialog";
import {
    startOfDay, endOfDay, subDays, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, isWithinInterval, format
} from 'date-fns';
import { ar } from "date-fns/locale";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { NewPurchaseOverlay } from "./purchasing/NewPurchaseOverlay";
import { gridRowsToCartItems, cartItemsToGridRows } from "@/components/inventory/purchasing/PurchaseDataGrid";
import type { GridRow } from "@/components/inventory/purchasing/PurchaseDataGrid";
import { BulkUploadDialog } from "@/components/inventory/purchasing/BulkUploadDialog";
import { generateA4PurchaseHTML } from "./purchasing/A4PurchaseTemplate";
import { generateThermalPurchaseHTML } from "./purchasing/ThermalPurchaseTemplate";
import { printService } from "@/lib/print-service";
import { getStoreSettings } from "@/actions/settings";
import { useTranslations } from "@/lib/i18n-mock";
import { usePurchaseForm } from "@/hooks/usePurchaseForm";
import type { InvoiceItem } from "@/hooks/usePurchaseForm";
import { toast } from "sonner";
import { safeRandomUUID, formatCurrency, cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

import { Product, Supplier, Category, Model, PurchaseInvoice, Branch, Warehouse } from "@/types/product";

export default function PurchasesTab({
    suppliers,
    products,
    categories,
    models = [],
    invoices = [],
    warehouses = [],
    branches = [],
    isHQUser = false,
    userBranchId,
    units: initialUnits = [],
    attributes = [],
    csrfToken,
    treasuries = []
}: {
    suppliers: Supplier[],
    products: Product[],
    categories: Category[],
    models?: Model[],
    invoices?: PurchaseInvoice[],
    warehouses?: Warehouse[],
    branches?: Branch[],
    isHQUser?: boolean,
    userBranchId?: string,
    units?: any[],
    attributes?: any[],
    csrfToken?: string,
    treasuries?: any[]
}) {
    const t = useTranslations('Purchasing');
    const tCommon = useTranslations('Common');

    const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'RETURNS'>('ACTIVE');
    const [dateFilter, setDateFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);

    // Real-time polling for invoices
    const { data: activeInvoices } = useQuery({
        queryKey: ['purchase-invoices', statusFilter],
        queryFn: async () => {
            const res = await getPurchaseInvoices(statusFilter);
            if (!res.success) throw new Error(res.error || 'Failed to fetch invoices');
            return res.data || [];
        },
        initialData: invoices,
        refetchInterval: 5000,
        staleTime: 4000
    });
    
    // Local State for Master Data (to support Quick Create)
    const [suppliersList, setSuppliersList] = useState<Supplier[]>(suppliers);
    const [categoriesList, setCategoriesList] = useState<Category[]>(categories);
    const [modelsList, setModelsList] = useState<Model[]>(models || []);
    const [attributesList, setAttributesList] = useState<any[]>(attributes || []);
    const [unitsList, setUnitsList] = useState<any[]>(initialUnits);

    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [showBarcodePrint, setShowBarcodePrint] = useState(false);
    const [selectedTableInvoice, setSelectedTableInvoice] = useState<any>(null);
    const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);
    const [selectedDetailsInvoice, setSelectedDetailsInvoice] = useState<any>(null);

    const handleViewDetails = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            const res = await getPurchase(id);
            if (res.success && res.data) {
                setSelectedDetailsInvoice(res.data);
            } else {
                toast.error("Failed to load invoice details");
            }
        } catch (err: any) {
             toast.error("Failed to load invoice details");
        }
    };

    const handleEditInvoice = (inv: any) => {
        form.setEditingInvoiceId(inv.id);
        form.setSelectedSupplierId(inv.supplierId || "");
        form.setSelectedWarehouseId(inv.warehouseId || "");
        if (inv.warehouse?.branchId) form.setSelectedBranchId(inv.warehouse.branchId);
        form.setPaymentMethod(inv.paymentMethod || "CASH");
        if (inv.treasuryId) {
            form.setTreasuryId(inv.treasuryId);
        }
        form.setPaidAmount(inv.paidAmount?.toString() || "0");
        form.setDeliveryCharge(inv.deliveryCharge?.toString() || "0");
        
        const newCart = inv.items.map((item: any) => ({
            id: item.productId || item.product?.id || `temp-${item.sku}`,
            productId: item.productId,
            name: item.product?.name || item.name,
            sku: item.product?.sku || item.sku,
            quantity: item.quantity,
            unitCost: Number(item.unitCost),
            sellPrice: Number(item.sellPrice || item.product?.sellPrice || 0),
            sellPrice2: Number(item.product?.sellPrice2 || 0),
            sellPrice3: Number(item.product?.sellPrice3 || 0),
            categoryId: item.product?.categoryId,
            modelId: item.product?.modelId,
            modelName: item.product?.model?.name,
            attributeId: item.product?.attributeId,
            attributeName: item.product?.attribute?.name,
            unitOfMeasureId: item.product?.unitOfMeasureId,
            conversionFactor: item.product?.conversionFactor ?? 1,
            isDevice: item.isDevice,
            deviceType: item.deviceType,
            condition: item.condition,
            imei: item.imei,
        }));
        
        form.setCart(newCart);
        setGridRows(cartItemsToGridRows(newCart));
        
        if (inv.isWalkin) {
            form.setIsWalkin(true);
            form.setWalkinName(inv.walkinName || "");
            form.setWalkinPhone(inv.walkinPhone || "");
            form.setWalkinNationalId(inv.walkinNationalId || "");
        } else {
            form.setIsWalkin(false);
        }

        setSelectedDetailsInvoice(null);
        form.setIsNewPurchaseOpen(true);
    };

    // Sorting State
    const [sortBy, setSortBy] = useState<'purchaseDate' | 'invoiceNumber' | 'totalAmount' | 'paidAmount' | 'balance'>('purchaseDate');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const handleSort = (key: any) => {
        if (sortBy === key) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('asc');
        }
    };

    const getSortIcon = (key: string) => {
        if (sortBy !== key) return <ChevronDown className="w-3 h-3 opacity-20" />;
        return sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-cyan-400" /> : <ChevronDown className="w-3 h-3 text-cyan-400" />;
    };

    useEffect(() => {
        getStoreSettings().then(res => {
            if (res.success) setSettings(res.data);
        });
    }, []);

    // Also sync props if they change (e.g. on full revalidation)
    useEffect(() => { setSuppliersList(suppliers); }, [suppliers]);
    useEffect(() => { setCategoriesList(categories); }, [categories]);
    useEffect(() => { setModelsList(models || []); }, [models]);
    useEffect(() => { setAttributesList(attributes || []); }, [attributes]);
    useEffect(() => { setUnitsList(initialUnits); }, [initialUnits]);

    const queryClient = useQueryClient();

    const form = usePurchaseForm({
        products,
        isHQUser,
        userBranchId,
        branches,
        warehouses,
        csrfToken,
        onSaveSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
        }
    });

    const {
        isNewPurchaseOpen, setIsNewPurchaseOpen,
        setEditingInvoiceId,
        setSelectedSupplierId,
        setSelectedBranchId,
        setSelectedWarehouseId,
        setPaymentMethod,
        setPaidAmount,
        setDeliveryCharge,
        setCart,
        cart,
        addToCartExisting,
        setEntryMode,
        setNewItemSku,
        setNewItemName,
        setNewItemCost,
        setNewItemQty,
        handleAutoSku,
        setErrorResult
    } = form;

    const [gridRows, setGridRows] = useState<GridRow[]>([]);
    const [showNewItemPanel, setShowNewItemPanel] = useState(false);

    useEffect(() => {
        const cartItems = gridRowsToCartItems(gridRows);
        setCart(cartItems);
    }, [gridRows, setCart]);

    // Persistence: Data remains in gridRows even when overlay is closed
    // as requested by the user.

    const handlePrint = async (id: string) => {
        setLoadingInvoiceId(id);
        try {
            const res = await getPurchase(id);
            if (!res.success || !res.data) throw new Error(res.error || "Failed to fetch invoice");
            const inv = res.data;
            const purchaseData = {
                invoiceNumber: inv.invoiceNumber,
                supplierName: inv.supplier?.name || "N/A",
                supplierPhone: inv.supplier?.phone || "",
                supplierAddress: inv.supplier?.address || "",
                date: new Date(inv.purchaseDate),
                status: inv.status,
                items: inv.items.map((item: any) => ({
                    productId: item.productId,
                    name: item.product?.name || item.name || "N/A",
                    sku: item.product?.sku || item.sku || "N/A",
                    unitCost: Number(item.unitCost),
                    quantity: item.quantity
                })),
                totalAmount: Number(inv.totalAmount),
                paidAmount: Number(inv.paidAmount),
                deliveryCharge: Number(inv.deliveryCharge)
            };

            const html = generateA4PurchaseHTML({ purchaseData, settings });
            const registry = printService.getRegistry();
            const printer = registry?.a4Printer && registry.a4Printer !== 'none' ? registry.a4Printer : undefined;
            await printService.printHTML(html, printer, { paperWidthMm: 210 });
            toast.success(t('printSuccess') || "تم إرسال الفاتورة للطابعة");
        } catch (error: any) {
            toast.error(error.message || "Failed to print invoice");
        } finally {
            setLoadingInvoiceId(null);
        }
    };

    const handleThermalPrint = async (id: string) => {
        setLoadingInvoiceId(id);
        try {
            const res = await getPurchase(id);
            if (!res.success || !res.data) throw new Error(res.error || "Failed to fetch invoice");
            const inv = res.data;
            const purchaseData = {
                invoiceNumber: inv.invoiceNumber,
                supplierName: inv.supplier?.name || "N/A",
                supplierPhone: inv.supplier?.phone || "",
                supplierAddress: inv.supplier?.address || "",
                date: new Date(inv.purchaseDate),
                status: inv.status,
                items: inv.items.map((item: any) => ({
                    productId: item.productId,
                    name: item.product?.name || item.name || "N/A",
                    sku: item.product?.sku || item.sku || "N/A",
                    unitCost: Number(item.unitCost),
                    quantity: item.quantity
                })),
                totalAmount: Number(inv.totalAmount),
                paidAmount: Number(inv.paidAmount),
                deliveryCharge: Number(inv.deliveryCharge)
            };

            const html = generateThermalPurchaseHTML({ purchaseData, settings });
            const registry = printService.getRegistry();
            const printer = registry?.receiptPrinter && registry.receiptPrinter !== 'none' ? registry.receiptPrinter : undefined;
            await printService.printHTML(html, printer, { paperWidthMm: 80 });
            toast.success(t('printSuccess') || "تم إرسال الفاتورة للطابعة");
        } catch (error: any) {
            toast.error(error.message || "Failed to print receipt");
        } finally {
            setLoadingInvoiceId(null);
        }
    };

    const voidInvoice = async (id: string) => {
        if (!confirm(t('confirmRefund') || "هل أنت متأكد من إلغاء هذه الفاتورة؟")) return;
        const res = await voidPurchase({ id, csrfToken });
        if (res.success) {
            toast.success(t('voidSuccess') || "تم إلغاء الفاتورة");
            queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
        } else {
            toast.error(res.error || "فشل إلغاء الفاتورة");
        }
    };

    const handleScan = (code: string) => {
        if (!isNewPurchaseOpen) return;
        const product = products.find(p => p.sku === code);
        if (product) {
            addToCartExisting(product);
        } else {
            setEntryMode('NEW');
            setNewItemSku(code);
            setNewItemName("");
            setNewItemCost("");
            setNewItemQty("1");
        }
    };

    const handleQuickCreateSupplier = async (data: { name: string; phone?: string }) => {
        const { createSupplier } = await import("@/actions/inventory");
        const res = await createSupplier({
            name: data.name,
            phone: data.phone || "",
            openingBalance: 0,
            csrfToken: csrfToken
        });

        if (res.success && res.supplier) {
            const newSupp = res.supplier as any;
            setSuppliersList(prev => [newSupp, ...prev]);
            setSelectedSupplierId(newSupp.id);
            toast.success("تم إضافة المورد واختياره");
        } else {
            toast.error(res.error || "فشل إضافة المورد");
        }
    };

    const handleQuickCreateCategory = async (name: string, callback: (id: string) => void) => {
        const { createCategory } = await import("@/actions/inventory");
        const res = await createCategory({ 
            name, 
            isHidden: false,
            color: "#06b6d4", // Add default color to satisfy schema
            csrfToken: csrfToken
        });

        if (res.success && res.category) {
            const newCat = res.category as any;
            setCategoriesList(prev => [newCat, ...prev]);
            callback(newCat.id);
            toast.success("تم إضافة الفئة");
        } else {
            toast.error(res.error || "فشل إضافة الفئة");
        }
    };

    const handleQuickCreateUnit = async (name: string, callback: (id: string, name: string) => void) => {
        const { createUnitOfMeasure } = await import("@/actions/inventory");
        const res = await createUnitOfMeasure({ 
            name, 
            code: name.toUpperCase().substring(0, 3) + Math.floor(Math.random() * 1000), // Generate a fallback code
            abbreviation: name.substring(0, 2),
            conversionFactor: 1.0,
            isActive: true,
            csrfToken: csrfToken
        });

        if (res.success && res.unit) {
            const newUnit = res.unit as any;
            setUnitsList(prev => [newUnit, ...prev]);
            callback(newUnit.id, newUnit.name);
            toast.success("تم إضافة الوحدة");
        } else {
            toast.error(res.error || "فشل إضافة الوحدة");
        }
    };
    const handleQuickCreateModel = async (name: string, categoryId: string, callback: (id: string) => void) => {
        const { createModel } = await import("@/actions/inventory");
        const res = await createModel({ 
            name, 
            categoryId,
            csrfToken: csrfToken
        });

        if (res.success && res.model) {
            const newMod = res.model as any;
            setModelsList(prev => [newMod, ...prev]);
            callback(newMod.id);
            toast.success("تم إضافة الموديل");
        } else {
            const err = (res as any).error || "فشل إضافة الموديل";
            toast.error(err);
        }
    };

    const handleQuickCreateAttribute = async (name: string, callback: (id: string) => void) => {
        const { createAttribute } = await import("@/actions/inventory");
        const res = await createAttribute({ 
            name, 
            csrfToken: csrfToken
        });

        if (res.success && res.attribute) {
            const newAttr = res.attribute as any;
            setAttributesList(prev => [newAttr, ...prev]);
            callback(newAttr.id);
            toast.success("تم إضافة الصفة");
        } else {
            const err = (res as any).error || "فشل إضافة الصفة";
            toast.error(err);
        }
    };

    const filteredInvoices = [...(activeInvoices || [])]
        .filter((inv: any) => {
            const isCancelled = ['CANCELLED', 'VOIDED', 'RETURNED', 'RETURN', 'PARTIAL_RETURN'].includes(inv.status) || inv.isReturn;
            if (statusFilter === 'ACTIVE' && isCancelled) return false;
            // The RETURNS tab acts as a catch-all for anything canceled or returned
            if (statusFilter === 'RETURNS' && !isCancelled) return false;

            if (dateRange?.from && dateRange?.to) {
                return isWithinInterval(new Date(inv.purchaseDate), {
                    start: dateRange.from,
                    end: dateRange.to
                });
            }
            return true;
        })
        .sort((a, b) => {
            let aValue: any = (a as any)[sortBy];
            let bValue: any = (b as any)[sortBy];
            if (sortBy === 'balance') {
                aValue = Number(a.totalAmount) - Number(a.paidAmount);
                bValue = Number(b.totalAmount) - Number(b.paidAmount);
            } else if (sortBy === 'purchaseDate') {
                aValue = new Date(a.purchaseDate).getTime();
                bValue = new Date(b.purchaseDate).getTime();
            } else if (sortBy === 'totalAmount' || sortBy === 'paidAmount') {
                aValue = Number(aValue);
                bValue = Number(bValue);
            }
            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

    const stats = {
        totalPurchases: filteredInvoices.reduce((acc, inv) => acc + (!['CANCELLED', 'VOIDED', 'RETURNED', 'RETURN'].includes(inv.status) ? Number(inv.totalAmount) : 0), 0),
        totalPaid: filteredInvoices.reduce((acc, inv) => acc + (!['CANCELLED', 'VOIDED', 'RETURNED', 'RETURN'].includes(inv.status) ? Number(inv.paidAmount) : 0), 0),
    };

    const barcodeItems = selectedTableInvoice ? selectedTableInvoice.items : cart;
    const barcodeProducts = (barcodeItems || []).map((item: any) => ({
        id: item.productId || item.product?.id || `temp-${item.sku}`,
        name: item.product?.name || item.name || "N/A",
        sku: item.product?.sku || item.sku || "N/A",
        sellPrice: Number(item.product?.sellPrice || item.sellPrice || 0)
    }));
    const barcodeQuantities = (barcodeItems || []).reduce((acc: any, item: any) => {
        const id = item.productId || item.product?.id || `temp-${item.sku}`;
        acc[id] = Number(item.quantity);
        return acc;
    }, {});

    return (
        <div className="h-full flex flex-col overflow-hidden animate-fly-in font-cairo" dir="rtl">
            
            {/* Header Section */}
            <div className="flex-none space-y-4 mb-4">
                <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-sm">
                    <div>
                        <h2 className="text-2xl font-black flex items-center gap-3 text-zinc-900 dark:text-white uppercase tracking-tight">
                            <div className="p-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/20">
                                <ShoppingCart className="w-6 h-6" />
                            </div>
                            {t('title')}
                        </h2>
                        <p className="text-zinc-500 mt-1.5 font-medium text-sm">{t('subtitle')}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowBulkUpload(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            {t('bulkCsv')}
                        </button>
                        <button
                            onClick={() => {
                                form.resetForm();
                                setIsNewPurchaseOpen(true);
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-zinc-900/20"
                        >
                            <Plus className="w-4 h-4" />
                            {t('newPurchase')}
                        </button>
                    </div>
                </div>

                {/* Stats & Filters Row */}
                <div className="flex justify-between items-center gap-4">
                    {/* Status Tabs */}
                    <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-white/5">
                        {['ACTIVE', 'ALL', 'RETURNS'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status as any)}
                                className={cn(
                                    "px-5 py-2 rounded-xl text-xs font-bold transition-all",
                                    statusFilter === status
                                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                )}
                            >
                                {status === 'ACTIVE' ? t('filter.active') :
                                 status === 'ALL' ? t('filter.all') :
                                 'ملغى / مرتجع'}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <FlatpickrRangePicker
                            onRangeChange={(dates: Date[]) => {
                                if (dates.length === 2) {
                                    setDateRange({ from: dates[0], to: dates[1] });
                                    setDateFilter("custom");
                                } else if (dates.length === 0) {
                                    setDateRange(undefined);
                                    setDateFilter("all");
                                }
                            }}
                            onClear={() => {
                                setDateRange(undefined);
                                setDateFilter("all");
                            }}
                            initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                            className="w-56 bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 text-xs h-10 px-4 rounded-xl font-bold"
                        />
                    </div>
                </div>
            </div>

            {/* Invoices Table Area */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-zinc-900/50 rounded-3xl border border-zinc-200 dark:border-white/5 shadow-sm">
                {filteredInvoices.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                            <FileText className="w-10 h-10 text-zinc-300" />
                        </div>
                        <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-1">{t('noPurchases')}</h3>
                        <p className="text-zinc-500 text-sm max-w-sm">{t('noPurchasesDesc')}</p>
                    </div>
                ) : (
                    <div className="h-full overflow-auto custom-scrollbar">
                        <table className="w-full text-right border-collapse">
                            <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/5 text-[10px] text-zinc-400 font-black uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-4 cursor-pointer hover:text-zinc-600" onClick={() => handleSort('purchaseDate')}>
                                        <div className="flex items-center gap-2">التاريخ {getSortIcon('purchaseDate')}</div>
                                    </th>
                                    <th className="px-6 py-4 cursor-pointer hover:text-zinc-600" onClick={() => handleSort('invoiceNumber')}>
                                        <div className="flex items-center gap-2">رقم الفاتورة {getSortIcon('invoiceNumber')}</div>
                                    </th>
                                    <th className="px-6 py-4 text-start">المورد</th>
                                    <th className="px-6 py-4 cursor-pointer hover:text-zinc-600" onClick={() => handleSort('totalAmount')}>
                                        <div className="flex items-center gap-2 justify-end">الإجمالي {getSortIcon('totalAmount')}</div>
                                    </th>
                                    <th className="px-6 py-4 text-end">المدفوع</th>
                                    <th className="px-6 py-4 text-start">الخزنة</th>
                                    <th className="px-6 py-4 text-start">المخزن</th>
                                    <th className="px-6 py-4 text-center">الحالة</th>
                                    <th className="px-6 py-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                {filteredInvoices.map((inv) => (
                                    <tr 
                                        key={inv.id} 
                                        className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                                        onClick={() => handleViewDetails(inv.id)}
                                    >
                                        <td className="px-6 py-4 text-sm font-bold text-zinc-500">
                                            {format(new Date(inv.purchaseDate), 'yyyy-MM-dd')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-sm font-black text-zinc-900 dark:text-white">
                                                #{inv.invoiceNumber || 'Auto'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-start">
                                            <div>
                                                <div className="font-black text-zinc-900 dark:text-white text-sm">{inv.supplier?.name}</div>
                                                <div className="text-[10px] text-zinc-500 font-bold uppercase">{inv.branch?.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-end">
                                            <div className="font-black text-zinc-900 dark:text-white text-sm">
                                                {formatCurrency(Number(inv.totalAmount))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-end font-bold text-emerald-500 text-sm">
                                            {formatCurrency(Number(inv.paidAmount))}
                                        </td>
                                        <td className="px-6 py-4 text-start">
                                            <div className="flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-300">
                                                {inv.paymentMethod === 'VISA' || inv.paymentMethod === 'CARD' ? 'فيزا (بنك)' : 
                                                 inv.paymentMethod === 'INSTAPAY' ? 'انستا باي' : 
                                                 inv.paymentMethod === 'WALLET' ? 'محفظة' : 
                                                 inv.paymentMethod === 'TRANSFER' ? 'تحويل' : 'كاش (صندوق)'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-start">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                                                {inv.warehouse?.name || "-"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className={cn(
                                                "inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                                inv.status === 'PAID' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                                                inv.status === 'PENDING' ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
                                                inv.status === 'PARTIAL' ? "bg-blue-500/10 border-blue-500/20 text-blue-500" :
                                                inv.status === 'PARTIAL_RETURN' ? "bg-purple-500/10 border-purple-500/20 text-purple-500" :
                                                "bg-rose-500/10 border-rose-500/20 text-rose-500"
                                            )}>
                                                {inv.status === 'PAID' ? 'تم السداد' : 
                                                 inv.status === 'PENDING' ? 'آجل' : 
                                                 inv.status === 'PARTIAL' ? 'سداد جزئي' :
                                                 inv.status === 'PARTIAL_RETURN' ? 'مرتجع جزئي' :
                                                 'ملغي'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePrint(inv.id); }}
                                                    className="p-2 hover:bg-zinc-900 hover:text-white rounded-lg transition-all"
                                                    title={t('print')}
                                                >
                                                    <Printer className="w-4 h-4" />
                                                </button>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTableInvoice(inv);
                                                    setShowBarcodePrint(true);
                                                  }}
                                                  className="p-2 hover:bg-zinc-900 hover:text-white rounded-lg transition-all"
                                                >
                                                  <Barcode className="w-4 h-4" />
                                                </button>
                                                {(!['CANCELLED', 'VOIDED', 'RETURNED', 'RETURN'].includes(inv.status)) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); voidInvoice(inv.id); }}
                                                        className="p-2 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <NewPurchaseOverlay 
                isOpen={isNewPurchaseOpen}
                onClose={() => setIsNewPurchaseOpen(false)}
                form={form}
                gridRows={gridRows}
                onRowsChange={setGridRows}
                handleScan={handleScan}
                handleAutoSku={handleAutoSku}
                showNewItemPanel={showNewItemPanel}
                setShowNewItemPanel={setShowNewItemPanel}
                suppliers={suppliersList}
                products={products}
                categories={categoriesList}
                models={modelsList}
                attributes={attributesList}
                warehouses={warehouses}
                branches={branches}
                isHQUser={isHQUser}
                units={unitsList}
                csrfToken={csrfToken}
                onQuickCreateSupplier={handleQuickCreateSupplier}
                onQuickCreateCategory={handleQuickCreateCategory}
                onQuickCreateModel={handleQuickCreateModel}
                onQuickCreateAttribute={handleQuickCreateAttribute}
                onQuickCreateUnit={handleQuickCreateUnit}
                treasuries={treasuries}
            />

            <BulkUploadDialog
                open={showBulkUpload}
                onOpenChange={setShowBulkUpload}
                onUploadComplete={() => queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] })}
                csrfToken={csrfToken}
                suppliers={suppliersList}
                warehouses={warehouses}
            />

            {selectedDetailsInvoice && (
                <Dialog open={!!selectedDetailsInvoice} onOpenChange={() => setSelectedDetailsInvoice(null)}>
                    <DialogContent className="sm:max-w-xl bg-card border-border text-foreground shadow-2xl rounded-3xl p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-8 space-y-6">
                            <DialogHeader className="pb-4 border-b border-border">
                                <DialogTitle className="flex items-center justify-between">
                                    <span className="text-2xl font-black flex items-center gap-3">
                                        <div className="p-2.5 rounded-2xl bg-secondary/10 border border-secondary/20">
                                            <FileText className="w-6 h-6 text-secondary" />
                                        </div>
                                        تفاصيل فاتورة شراء
                                    </span>
                                    <Badge variant="outline" className="border-border bg-muted/50 text-xs px-3 py-1 font-mono rounded-lg">
                                        {selectedDetailsInvoice.invoiceNumber || `#${selectedDetailsInvoice.id.slice(0, 8).toUpperCase()}`}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription className="sr-only">
                                    عرض تفاصيل فاتورة المشتريات.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-1 group hover:border-secondary/30 transition-all">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">التاريخ والوقت</span>
                                    <span className="font-bold text-sm block italic">{format(new Date(selectedDetailsInvoice.purchaseDate || selectedDetailsInvoice.createdAt), 'yyyy/MM/dd HH:mm')}</span>
                                </div>
                                <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-1 group hover:border-secondary/30 transition-all">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">المورد المعتمد</span>
                                    <span className="font-bold text-sm block">{selectedDetailsInvoice.supplier?.name || "مورد نقدي"}</span>
                                </div>
                                <div className="bg-muted/40 p-5 rounded-2xl border border-border space-y-2 col-span-2 group hover:border-secondary/30 transition-all">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block opacity-60">موقع التخزين (المستودع)</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary/20 text-secondary font-bold text-xs uppercase">
                                            {(selectedDetailsInvoice.warehouse?.name?.[0] || 'W').toUpperCase()}
                                        </div>
                                        <span className="font-black text-lg italic">{selectedDetailsInvoice.warehouse?.name || "المستودع الافتراضي"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">الأصناف الموردة ({selectedDetailsInvoice.items?.length})</span>
                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">تكلفة التوريد</span>
                                </div>
                                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {selectedDetailsInvoice.items?.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center p-4 rounded-2xl bg-muted/20 border border-border group hover:bg-muted/40 hover:border-secondary/20 transition-all">
                                            <div className="flex-1">
                                                <div className="font-black text-sm text-foreground">{item.product?.name || "صنف غير محدد"}</div>
                                                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 opacity-80">
                                                    {item.quantity} وحدة {item.unitCost ? <span className="mx-1.5 opacity-30">×</span> : ''} {item.unitCost ? Number(item.unitCost).toLocaleString() : ''}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono font-black text-secondary text-sm">
                                                    {(item.quantity * Number(item.unitCost || 0)).toLocaleString()}
                                                </div>
                                                <div className="text-[9px] font-black uppercase text-muted-foreground opacity-40">صافي التكلفة</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Summary & Totals */}
                            <div className="bg-muted/50 rounded-3xl p-6 border border-border space-y-4 shadow-inner">
                                <div className="grid grid-cols-2 gap-y-3">
                                    <div className="flex justify-between items-center text-muted-foreground text-xs px-2">
                                        <span className="font-medium opacity-60 uppercase tracking-widest text-[10px]">إجمالي الفاتورة</span>
                                        <span className="font-bold italic">{formatCurrency(selectedDetailsInvoice.totalAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs px-2 border-r border-border ml-2 pl-4">
                                        <span className="font-medium text-muted-foreground opacity-60 uppercase tracking-widest text-[10px]">الحالة المالية</span>
                                        <Badge variant="outline" className={cn(
                                            "font-black text-[9px] uppercase px-2 py-0.5 rounded-md",
                                            selectedDetailsInvoice.status === 'PAID' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                        )}>
                                            {selectedDetailsInvoice.status === 'PAID' ? 'تم الدفع بالكامل' : 'مدفوع جزئياً'}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 text-xs px-2 col-span-2 pt-1 border-t border-border mt-1">
                                        <span className="font-black uppercase tracking-widest text-[10px] opacity-60">المدفوع للمورد</span>
                                        <span className="font-black">+{formatCurrency(selectedDetailsInvoice.paidAmount)}</span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-border flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest text-rose-500">المبلغ الآجل (مديونية)</span>
                                        <span className="text-xs text-muted-foreground font-medium italic">القيمة المستحقة للمورد لاحقاً</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-4xl font-black font-mono tracking-tighter text-rose-600 dark:text-rose-400">
                                            {(Number(selectedDetailsInvoice.totalAmount) - Number(selectedDetailsInvoice.paidAmount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            <span className="text-xs font-bold text-muted-foreground mr-1.5 opacity-50 uppercase tracking-tighter">jod/egp</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 h-12 bg-background border-border hover:bg-muted font-black rounded-2xl gap-2 text-sm shadow-sm"
                                    onClick={() => setSelectedDetailsInvoice(null)}
                                >
                                    إغلاق النافذة
                                </Button>
                                {!['VOIDED', 'CANCELLED'].includes(selectedDetailsInvoice.status) && !selectedDetailsInvoice.isReturn && (
                                    <>
                                        <Button
                                            variant="outline"
                                            className="h-12 border-border bg-background hover:bg-muted text-foreground font-black rounded-2xl gap-2 px-4 whitespace-nowrap text-xs shadow-sm flex-1 sm:flex-none"
                                            onClick={() => {
                                                setSelectedDetailsInvoice(null);
                                                handleThermalPrint(selectedDetailsInvoice.id);
                                            }}
                                        >
                                            <Printer className="w-4 h-4 text-cyan-500" />
                                            طباعة ريسيت 80mm
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="h-12 border-border bg-background hover:bg-muted text-foreground font-black rounded-2xl gap-2 px-4 whitespace-nowrap text-xs shadow-sm flex-1 sm:flex-none"
                                            onClick={() => handleEditInvoice(selectedDetailsInvoice)}
                                        >
                                            <Pencil className="w-4 h-4 text-emerald-500" />
                                            تعديل الفاتورة
                                        </Button>
                                        <Button
                                            className="h-12 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg shadow-secondary/20 font-black rounded-2xl gap-2 text-sm px-4 flex-1 sm:flex-none"
                                            onClick={() => { 
                                                setSelectedDetailsInvoice(null);
                                                handlePrint(selectedDetailsInvoice.id);
                                            }}
                                        >
                                            <Printer className="w-4 h-4" />
                                            طباعة الفاتورة A4
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {showBarcodePrint && barcodeItems.length > 0 && (
                <BarcodePrintDialog
                    products={barcodeProducts}
                    initialQuantities={barcodeQuantities}
                    onClose={() => {
                        setShowBarcodePrint(false);
                        setSelectedTableInvoice(null);
                    }}
                />
            )}
        </div>
    );
}
