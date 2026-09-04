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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

    const handleQuickCreateCategory = async (name: string, callback: (id: string, name: string) => void) => {
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
            callback(newCat.id, newCat.name);
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
    const handleQuickCreateModel = async (name: string, categoryId: string, callback: (id: string, name: string) => void) => {
        const { createModel } = await import("@/actions/inventory");
        const res = await createModel({ 
            name, 
            categoryId,
            csrfToken: csrfToken
        });

        if (res.success && res.model) {
            const newMod = res.model as any;
            setModelsList(prev => [newMod, ...prev]);
            callback(newMod.id, newMod.name);
            toast.success("تم إضافة الموديل");
        } else {
            const err = (res as any).error || "فشل إضافة الموديل";
            toast.error(err);
        }
    };

    const handleQuickCreateAttribute = async (name: string, callback: (id: string, name: string) => void) => {
        const { createAttribute } = await import("@/actions/inventory");
        const res = await createAttribute({ 
            name, 
            csrfToken: csrfToken
        });

        if (res.success && res.attribute) {
            const newAttr = res.attribute as any;
            setAttributesList(prev => [newAttr, ...prev]);
            callback(newAttr.id, newAttr.name);
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
            
            {/* Unified Action & Filters Bar */}
            <div className="flex-none mb-2.5 flex flex-wrap justify-between items-center gap-2">
                {/* Right: Status Tabs & Date Picker */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Status Tabs */}
                    <div className="flex gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-white/5">
                        {['ACTIVE', 'ALL', 'RETURNS'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status as any)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
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
                        className="w-52 bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 text-xs h-8.5 px-3 rounded-xl font-bold"
                    />
                </div>

                {/* Left: Action Buttons */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowBulkUpload(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-sm h-8.5"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {t('bulkCsv')}
                    </button>
                    <button
                        onClick={() => {
                            form.resetForm();
                            setIsNewPurchaseOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold text-xs transition-all hover:scale-[1.02] active:scale-95 shadow-md cursor-pointer h-8.5"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {t('newPurchase')}
                    </button>
                </div>
            </div>

            {/* Invoices Table Area */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm">
                {filteredInvoices.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-14 h-14 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-3">
                            <FileText className="w-7 h-7 text-zinc-300" />
                        </div>
                        <h3 className="text-base font-black text-zinc-900 dark:text-white mb-1">{t('noPurchases')}</h3>
                        <p className="text-zinc-500 text-xs max-w-sm">{t('noPurchasesDesc')}</p>
                    </div>
                ) : (
                    <div className="h-full overflow-auto custom-scrollbar">
                        <table className="w-full text-right border-collapse">
                            <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/5 text-[10px] text-zinc-400 font-black uppercase tracking-widest">
                                <tr>
                                    <th className="px-3.5 py-2.5 cursor-pointer hover:text-zinc-600" onClick={() => handleSort('purchaseDate')}>
                                        <div className="flex items-center gap-1.5">التاريخ {getSortIcon('purchaseDate')}</div>
                                    </th>
                                    <th className="px-3.5 py-2.5 cursor-pointer hover:text-zinc-600" onClick={() => handleSort('invoiceNumber')}>
                                        <div className="flex items-center gap-1.5">رقم الفاتورة {getSortIcon('invoiceNumber')}</div>
                                    </th>
                                    <th className="px-3.5 py-2.5 text-start">المورد</th>
                                    <th className="px-3.5 py-2.5 cursor-pointer hover:text-zinc-600" onClick={() => handleSort('totalAmount')}>
                                        <div className="flex items-center gap-1.5 justify-end">الإجمالي {getSortIcon('totalAmount')}</div>
                                    </th>
                                    <th className="px-3.5 py-2.5 text-end">المدفوع</th>
                                    <th className="px-3.5 py-2.5 text-start">الخزنة</th>
                                    <th className="px-3.5 py-2.5 text-start">المخزن</th>
                                    <th className="px-3.5 py-2.5 text-center">الحالة</th>
                                    <th className="px-3.5 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                {filteredInvoices.map((inv) => (
                                    <tr 
                                        key={inv.id} 
                                        className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                                        onClick={() => handleViewDetails(inv.id)}
                                    >
                                        <td className="px-3.5 py-2 text-xs font-bold text-zinc-500">
                                            {format(new Date(inv.purchaseDate), 'yyyy-MM-dd')}
                                        </td>
                                        <td className="px-3.5 py-2">
                                            <span className="font-mono text-xs font-black text-zinc-900 dark:text-white">
                                                #{inv.invoiceNumber || 'Auto'}
                                            </span>
                                        </td>
                                        <td className="px-3.5 py-2 text-start">
                                            <div>
                                                <div className="font-black text-zinc-900 dark:text-white text-xs">{inv.supplier?.name}</div>
                                                <div className="text-[9px] text-zinc-500 font-bold uppercase">{inv.branch?.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-3.5 py-2 text-end">
                                            <div className="font-black text-zinc-900 dark:text-white text-xs">
                                                {formatCurrency(Number(inv.totalAmount))}
                                            </div>
                                        </td>
                                        <td className="px-3.5 py-2 text-end font-bold text-emerald-500 text-xs">
                                            {formatCurrency(Number(inv.paidAmount))}
                                        </td>
                                        <td className="px-3.5 py-2 text-start">
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                                {inv.paymentMethod === 'VISA' || inv.paymentMethod === 'CARD' ? 'فيزا (بنك)' : 
                                                 inv.paymentMethod === 'INSTAPAY' ? 'انستا باي' : 
                                                 inv.paymentMethod === 'WALLET' ? 'محفظة' : 
                                                 inv.paymentMethod === 'TRANSFER' ? 'تحويل' : 'كاش (صندوق)'}
                                            </div>
                                        </td>
                                        <td className="px-3.5 py-2 text-start">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                                                {inv.warehouse?.name || "-"}
                                            </span>
                                        </td>
                                        <td className="px-3.5 py-2 text-center">
                                            <div className={cn(
                                                "inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border",
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
                                        <td className="px-3.5 py-2">
                                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePrint(inv.id); }}
                                                    className="p-1.5 hover:bg-zinc-900 hover:text-white rounded-lg transition-all"
                                                    title={t('print')}
                                                >
                                                    <Printer className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTableInvoice(inv);
                                                    setShowBarcodePrint(true);
                                                  }}
                                                  className="p-1.5 hover:bg-zinc-900 hover:text-white rounded-lg transition-all"
                                                >
                                                  <Barcode className="w-3.5 h-3.5" />
                                                </button>
                                                {(!['CANCELLED', 'VOIDED', 'RETURNED', 'RETURN'].includes(inv.status)) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); voidInvoice(inv.id); }}
                                                        className="p-1.5 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
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
                    <DialogContent className="sm:max-w-xl max-h-[92dvh] overflow-y-auto custom-scrollbar bg-card border-border text-foreground shadow-2xl rounded-2xl p-0" onClick={e => e.stopPropagation()}>
                        <div className="p-4 sm:p-5 space-y-3">
                            <DialogHeader className="pb-2.5 border-b border-border">
                                <DialogTitle className="flex items-center justify-between">
                                    <span className="text-base sm:text-lg font-black flex items-center gap-2">
                                        <div className="p-1.5 rounded-xl bg-secondary/10 border border-secondary/20">
                                            <FileText className="w-4 h-4 text-secondary" />
                                        </div>
                                        تفاصيل فاتورة شراء
                                    </span>
                                    <Badge variant="outline" className="border-border bg-muted/50 text-xs px-2 py-0.5 font-mono rounded-lg">
                                        {selectedDetailsInvoice.invoiceNumber || `#${selectedDetailsInvoice.id.slice(0, 8).toUpperCase()}`}
                                    </Badge>
                                </DialogTitle>
                            </DialogHeader>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-muted/40 p-2.5 rounded-xl border border-border space-y-0.5 group hover:border-secondary/30 transition-all">
                                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block opacity-60">التاريخ والوقت</span>
                                    <span className="font-bold text-xs block">{format(new Date(selectedDetailsInvoice.purchaseDate || selectedDetailsInvoice.createdAt), 'yyyy/MM/dd HH:mm')}</span>
                                </div>
                                <div className="bg-muted/40 p-2.5 rounded-xl border border-border space-y-0.5 group hover:border-secondary/30 transition-all">
                                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block opacity-60">المورد المعتمد</span>
                                    <span className="font-bold text-xs block">{selectedDetailsInvoice.supplier?.name || "مورد نقدي"}</span>
                                </div>
                                <div className="bg-muted/40 p-2.5 rounded-xl border border-border col-span-2 group hover:border-secondary/30 transition-all flex items-center justify-between">
                                    <div>
                                        <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block opacity-60">موقع التخزين (المستودع)</span>
                                        <span className="font-black text-xs">{selectedDetailsInvoice.warehouse?.name || "المستودع الافتراضي"}</span>
                                    </div>
                                    <div className="w-6 h-6 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary/20 text-secondary font-bold text-[10px] uppercase">
                                        {(selectedDetailsInvoice.warehouse?.name?.[0] || 'W').toUpperCase()}
                                    </div>
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider">الأصناف الموردة ({selectedDetailsInvoice.items?.length})</span>
                                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider">تكلفة التوريد</span>
                                </div>
                                <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar">
                                    {selectedDetailsInvoice.items?.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center p-2 rounded-xl bg-muted/20 border border-border group hover:bg-muted/40 transition-all text-xs">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-black text-foreground truncate">{item.product?.name || "صنف غير محدد"}</div>
                                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-80">
                                                    {item.quantity} وحدة {item.unitCost ? <span className="mx-1 opacity-30">×</span> : ''} {item.unitCost ? Number(item.unitCost).toLocaleString() : ''}
                                                </div>
                                            </div>
                                            <div className="text-end shrink-0 ps-2">
                                                <div className="font-mono font-black text-secondary text-xs">
                                                    {(item.quantity * Number(item.unitCost || 0)).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Summary & Totals */}
                            <div className="bg-muted/50 rounded-xl p-3 border border-border space-y-2 shadow-inner">
                                <div className="grid grid-cols-2 gap-y-2">
                                    <div className="flex justify-between items-center text-muted-foreground text-xs px-1">
                                        <span className="font-medium opacity-60 uppercase tracking-wider text-[9px]">إجمالي الفاتورة</span>
                                        <span className="font-bold">{formatCurrency(selectedDetailsInvoice.totalAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs px-1 border-s border-border ps-3">
                                        <span className="font-medium text-muted-foreground opacity-60 uppercase tracking-wider text-[9px]">الحالة</span>
                                        <Badge variant="outline" className={cn(
                                            "font-black text-[8px] uppercase px-1.5 py-0.5 rounded-md",
                                            selectedDetailsInvoice.status === 'PAID' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                        )}>
                                            {selectedDetailsInvoice.status === 'PAID' ? 'تم الدفع' : 'مدفوع جزئياً'}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 text-xs px-1 col-span-2 pt-1 border-t border-border">
                                        <span className="font-black uppercase tracking-wider text-[9px] opacity-70">المدفوع للمورد</span>
                                        <span className="font-black">+{formatCurrency(selectedDetailsInvoice.paidAmount)}</span>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-border flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase text-rose-500 tracking-wider">المبلغ الآجل</span>
                                        <span className="text-[10px] text-muted-foreground font-medium">القيمة المستحقة</span>
                                    </div>
                                    <div className="text-end">
                                        <div className="text-xl font-black font-mono tracking-tight text-rose-600 dark:text-rose-400">
                                            {(Number(selectedDetailsInvoice.totalAmount) - Number(selectedDetailsInvoice.paidAmount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            <span className="text-[10px] font-bold text-muted-foreground mr-1 opacity-50 uppercase">EGP</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                    variant="outline"
                                    className="flex-1 h-8.5 bg-background border-border hover:bg-muted font-bold rounded-xl text-xs shadow-sm cursor-pointer"
                                    onClick={() => setSelectedDetailsInvoice(null)}
                                >
                                    إغلاق
                                </Button>
                                {!['VOIDED', 'CANCELLED'].includes(selectedDetailsInvoice.status) && !selectedDetailsInvoice.isReturn && (
                                    <>
                                        <Button
                                            variant="outline"
                                            className="h-8.5 border-border bg-background hover:bg-muted text-foreground font-bold rounded-xl gap-1.5 px-3 text-xs shadow-sm flex-1 sm:flex-none cursor-pointer"
                                            onClick={() => {
                                                setSelectedDetailsInvoice(null);
                                                handleThermalPrint(selectedDetailsInvoice.id);
                                            }}
                                        >
                                            <Printer className="w-3.5 h-3.5 text-cyan-500" />
                                            طباعة ريسيت 80mm
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="h-8.5 border-border bg-background hover:bg-muted text-foreground font-bold rounded-xl gap-1.5 px-3 text-xs shadow-sm flex-1 sm:flex-none cursor-pointer"
                                            onClick={() => handleEditInvoice(selectedDetailsInvoice)}
                                        >
                                            <Pencil className="w-3.5 h-3.5 text-emerald-500" />
                                            تعديل الفاتورة
                                        </Button>
                                        <Button
                                            className="h-8.5 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-md font-bold rounded-xl gap-1.5 text-xs px-4 flex-1 sm:flex-none cursor-pointer"
                                            onClick={() => { 
                                                setSelectedDetailsInvoice(null);
                                                handlePrint(selectedDetailsInvoice.id);
                                            }}
                                        >
                                            <Printer className="w-3.5 h-3.5" />
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
