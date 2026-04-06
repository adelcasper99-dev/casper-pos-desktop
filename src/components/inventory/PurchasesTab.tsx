"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPurchase, getPurchaseInvoices } from "@/actions/inventory";
import { voidPurchase } from "@/actions/purchase-actions";
import { getBranchTreasuriesForDropdown } from "@/actions/treasury";
import {
    Loader2, Edit, Pencil, Plus, ShoppingCart, FileText,
    Calendar, Trash2, X, Search, Wand2, Check, Box,
    Printer, Filter, Upload, Tag, ArrowUpDown, ChevronUp,
    Calendar as CalendarIcon
} from "lucide-react";
import { BarcodePrintDialog } from "@/components/inventory/BarcodePrintDialog";
import {
    startOfDay, endOfDay, subDays, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, isWithinInterval, format
} from 'date-fns';
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { PurchaseHeader } from "@/components/inventory/purchasing/PurchaseHeader";
import { PurchaseItemEntry } from "@/components/inventory/purchasing/PurchaseItemEntry";
import { PurchaseItemsTable } from "@/components/inventory/purchasing/PurchaseItemsTable";
import { BulkUploadDialog } from "@/components/inventory/purchasing/BulkUploadDialog";
import { generateA4PurchaseHTML } from "./purchasing/A4PurchaseTemplate";
import { printService } from "@/lib/print-service";
import { getStoreSettings } from "@/actions/settings";
import clsx from "clsx";
import BarcodeListener from "./BarcodeListener";
import { useTranslations } from "@/lib/i18n-mock";
import { usePurchaseForm } from "@/hooks/usePurchaseForm";
import type { InvoiceItem } from "@/hooks/usePurchaseForm";
import { toast } from "sonner";
import { safeRandomUUID, formatCurrency, cn } from "@/lib/utils";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface Product {
    id: string;
    name: string;
    sku: string;
    costPrice: number;
    stock: number;
    sellPrice: number;
    sellPrice2?: number;
    sellPrice3?: number;
}

interface Supplier {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
}

interface CartItem extends InvoiceItem { }

interface Category {
    id: string;
    name: string;
}

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string | null;
    supplier: { name: string };
    totalAmount: number;
    paidAmount: number;
    deliveryCharge?: number;
    status: string;
    purchaseDate: Date;
    isReturn?: boolean;
    warehouse?: {
        name: string;
        branch?: {
            name: string;
            code: string;
        }
    };
}

interface Branch {
    id: string;
    name: string;
    code: string;
    type: string;
}

interface Warehouse {
    id: string;
    name: string;
    address: string | null;
    isDefault: boolean;
    branchId: string;
    branch: {
        id: string;
        name: string;
        code: string;
    };
}

import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";

export default function PurchasesTab({
    suppliers,
    products,
    categories,
    invoices = [],
    warehouses = [],
    branches = [],
    isHQUser = false,
    userBranchId,
    csrfToken
}: {
    suppliers: Supplier[],
    products: Product[],
    categories: Category[],
    invoices?: PurchaseInvoice[],
    warehouses?: Warehouse[],
    branches?: Branch[],
    isHQUser?: boolean,
    userBranchId?: string,
    csrfToken?: string
}) {
    const t = useTranslations('Purchasing');
    const tPOS = useTranslations("POS");
    const tCommon = useTranslations('Common');
    const { handleKeyDown, getNavProps } = useKeyboardNavigation();

    // Real-time polling for invoices
    const { data: activeInvoices } = useQuery({
        queryKey: ['purchase-invoices'],
        queryFn: async () => {
            const res = await getPurchaseInvoices();
            if (!res.success) throw new Error(res.error || 'Failed to fetch invoices');
            return res.data || [];
        },
        initialData: invoices,
        refetchInterval: 5000,
        staleTime: 4000
    });

    const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'VOIDED' | 'RETURNS'>('ACTIVE');
    const [dateFilter, setDateFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);
    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [refundInvoice, setRefundInvoice] = useState<{ id: string } | null>(null);
    const [showBarcodePrint, setShowBarcodePrint] = useState(false);
    const [selectedTableInvoice, setSelectedTableInvoice] = useState<any>(null);
    const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

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
        if (sortBy !== key) return <ChevronDown className="w-3.5 h-3.5 opacity-20" />;
        return sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-cyan-400" /> : <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />;
    };

    useEffect(() => {
        getStoreSettings().then(res => {
            if (res.success) setSettings(res.data);
        });
    }, []);

    const queryClient = useQueryClient();

    const form = usePurchaseForm({
        products,
        isHQUser,
        userBranchId,
        branches,
        warehouses,
        csrfToken,
        onSaveSuccess: () => {
            // Invalidate query to refetch immediately
            queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
        }
    });

    const {
        isNewPurchaseOpen, setIsNewPurchaseOpen,
        loading, setLoading, errorResult, setErrorResult,
        editingInvoiceId, setEditingInvoiceId,
        selectedSupplierId, setSelectedSupplierId,
        selectedBranchId, setSelectedBranchId,
        selectedWarehouseId, setSelectedWarehouseId,
        paymentMethod, setPaymentMethod,
        treasuryId, setTreasuryId,
        deliveryCharge, setDeliveryCharge,
        paidAmount, setPaidAmount,
        entryMode, setEntryMode,
        itemSearch, setItemSearch,
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
        newItemCondition, setNewItemCondition,
        newItemColor, setNewItemColor,
        isWalkin, setIsWalkin,
        walkinName, setWalkinName,
        walkinPhone, setWalkinPhone,
        walkinNationalId, setWalkinNationalId,
        attachmentUrl, setAttachmentUrl,
        cart, setCart,
        removeFromCart,
        updateCartItem,
        addToCartExisting,
        addToCartNew,
        handleAutoSku,
        handleSubmit,
        totalAmount
    } = form;

    // Fetch Treasuries
    const [treasuries, setTreasuries] = useState<any[]>([]);
    useEffect(() => {
        let isMounted = true;
        async function loadTreasuries() {
            setTreasuries([]); // Clear treasuries when branch changes

            // Prioritize the branch selected in the form, 
            // fallback to userBranchId, then to the first available branch.
            const branchToFetch = selectedBranchId || userBranchId || (branches.length > 0 ? branches[0].id : null);

            if (branchToFetch) {
                const res = await getBranchTreasuriesForDropdown(branchToFetch);
                if (res.success && res.data && isMounted) {
                    setTreasuries(res.data);

                    // Reset treasuryId if the currently selected one is not in the new branch's list
                    setTreasuryId((prevId: string) => {
                        if (prevId && !res.data.find((t: any) => t.id === prevId)) {
                            return "";
                        }
                        return prevId;
                    });
                }
            }
        }
        loadTreasuries();
        return () => { isMounted = false; };
    }, [selectedBranchId, userBranchId, branches, setTreasuryId]);

    // Calculate subtotal for display if needed
    const subtotal = cart.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

    // Filter warehouses by selected branch
    const filteredWarehouses = selectedBranchId
        ? warehouses.filter(w => w.branchId === selectedBranchId)
        : warehouses;

    const handleEdit = async (id: string) => {
        setLoading(true);
        const res = await getPurchase(id);
        setLoading(false);

        if (res.success && res.data) {
            const inv = res.data;
            setEditingInvoiceId(id);
            setSelectedSupplierId(inv.supplierId);
            setSelectedWarehouseId(inv.warehouseId || "");

            // If warehouse is set, ensure branch depends on it
            if (inv.warehouseId) {
                const wh = warehouses.find(w => w.id === inv.warehouseId);
                if (wh) setSelectedBranchId(wh.branchId);
            }

            setPaymentMethod(inv.paymentMethod);
            setPaidAmount(inv.paidAmount.toString());
            setDeliveryCharge(inv.deliveryCharge?.toString() || "0");

            // Populate Cart
            setCart(inv.items.map((i: any) => ({
                id: safeRandomUUID(),
                productId: i.productId,
                isNew: false,
                name: i.product?.name || i.name || "Unknown Item", // Fallback
                sku: i.product?.sku || i.sku || "N/A",
                categoryId: i.product?.categoryId || i.categoryId,
                quantity: i.quantity,
                unitCost: Number(i.unitCost),
                sellPrice: Number(i.sellPrice || i.product?.sellPrice || 0),
                sellPrice2: Number(i.sellPrice2 || i.product?.sellPrice2 || 0),
                sellPrice3: Number(i.sellPrice3 || i.product?.sellPrice3 || 0)
            })));

            setIsNewPurchaseOpen(true);
            setErrorResult(null); // Clear errors
        } else {
            toast.error(res.error || res.message || "Failed to load invoice");
        }
    };

    const handleRefund = async (id: string, reason?: string) => {
        if (!confirm(t('confirmRefund'))) return;

        setLoading(true);
        const res = await voidPurchase({ id, reason: reason || undefined, csrfToken });
        setLoading(false);

        if (!res.success) {
            toast.error(res.error || "Failed to void invoice");
        } else {
            toast.success(t('voidSuccess') || "Invoice voided successfully");
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

    // Print Logic
    const handlePrint = async () => {
        if (cart.length === 0) {
            toast.error(t('emptyCartPrint') || "Cannot print an empty invoice");
            return;
        }

        const supplier = suppliers.find(s => s.id === selectedSupplierId);

        // Prepare data for the A4 template
        const purchaseData = {
            invoiceNumber: editingInvoiceId ? activeInvoices.find((inv: any) => inv.id === editingInvoiceId)?.invoiceNumber : "Auto",
            supplierName: supplier?.name || "N/A",
            supplierPhone: supplier?.phone || "",
            supplierAddress: supplier?.address || "",
            date: new Date(),
            status: parseFloat(paidAmount || '0') >= totalAmount ? 'PAID' : parseFloat(paidAmount || '0') > 0 ? 'PARTIAL' : 'PENDING',
            items: cart,
            totalAmount: totalAmount,
            paidAmount: parseFloat(paidAmount || '0'),
            deliveryCharge: parseFloat(deliveryCharge || '0')
        };

        const html = generateA4PurchaseHTML({ purchaseData, settings });

        // Use printService for professional output (handles PDF/Electron/Browser)
        try {
            const registry = printService.getRegistry();
            const printer = registry?.a4Printer && registry.a4Printer !== 'none' ? registry.a4Printer : undefined;

            await toast.promise(
                printService.printHTML(html, printer, { paperWidthMm: 210 }),
                {
                    loading: t('printing') || "جاري الطباعة...",
                    success: t('printSuccess') || "تم إرسال الفاتورة للطابعة",
                    error: (err: any) => (err?.message || t('printError') || "فشل إرسال الفاتورة للطابعة")
                }
            );
        } catch (error) {
            console.error(error);
        }
    };

    const handleTablePrint = async (id: string) => {
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
                    name: item.product?.name || "N/A",
                    sku: item.product?.sku || "N/A",
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

    const handleTableBarcode = async (id: string) => {
        setLoadingInvoiceId(id);
        try {
            const res = await getPurchase(id);
            if (!res.success || !res.data) throw new Error(res.error || "Failed to fetch invoice");

            setSelectedTableInvoice(res.data);
            setShowBarcodePrint(true);
        } catch (error: any) {
            toast.error(error.message || "Failed to prepare barcode dialog");
        } finally {
            setLoadingInvoiceId(null);
        }
    };


    const filteredProducts = itemSearch
        ? products.filter((p: Product) =>
            p.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
            p.sku.toLowerCase().includes(itemSearch.toLowerCase())
        ).slice(0, 50)
        : [];

    const filteredInvoices = [...(activeInvoices || [])]
        .filter((inv: any) => {
            // Status Filter
            if (statusFilter === 'ACTIVE' && inv.status === 'VOIDED') return false;
            if (statusFilter === 'VOIDED' && inv.status !== 'VOIDED') return false;
            if (statusFilter === 'RETURNS' && !inv.isReturn && !['RETURN', 'RETURNED', 'PARTIAL_RETURN'].includes(inv.status)) return false;

            // Date Filter
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
        totalPurchases: filteredInvoices.reduce((acc, inv) => acc + (inv.status !== 'VOIDED' ? inv.totalAmount : 0), 0),
        totalPaid: filteredInvoices.reduce((acc, inv) => acc + (inv.status !== 'VOIDED' ? inv.paidAmount : 0), 0),
    };
    const totalPending = stats.totalPurchases - stats.totalPaid;

    const barcodeItems = selectedTableInvoice ? selectedTableInvoice.items : cart;
    const barcodeProducts = barcodeItems.map((item: any) => ({
        id: item.productId || item.product?.id || `temp-${item.sku}`,
        name: item.product?.name || item.name,
        sku: item.product?.sku || item.sku,
        sellPrice: Number(item.product?.sellPrice || item.sellPrice || 0)
    }));
    const barcodeQuantities = barcodeItems.reduce((acc: any, item: any) => {
        const id = item.productId || item.product?.id || `temp-${item.sku}`;
        acc[id] = item.quantity;
        return acc;
    }, {});

    return (
        <div className="space-y-6 animate-fly-in font-cairo" dir="rtl">
            {isNewPurchaseOpen && <BarcodeListener onScan={handleScan} />}
            <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black flex items-center gap-3 text-zinc-900 dark:text-white uppercase tracking-tight">
                        <div className="p-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/20">
                            <ShoppingCart className="w-6 h-6" />
                        </div>
                        {t('title')}
                    </h2>
                    <p className="text-muted-foreground font-bold text-sm mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowBulkUpload(true)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-3.5 rounded-2xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-500/10 text-[11px] uppercase tracking-widest"
                    >
                        <Upload className="w-4 h-4" />
                        {t('bulkCsv')}
                    </button>
                    <button
                        onClick={() => {
                            form.resetForm();
                            setIsNewPurchaseOpen(true);
                        }}
                        className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black px-6 py-3.5 rounded-2xl flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-zinc-900/10 text-[11px] uppercase tracking-widest"
                    >
                        <Plus className="w-4 h-4" />
                        {t('newPurchase')}
                    </button>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md">
                    <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">{t('stats.invoicesCount')}</span>
                    <span className="text-2xl font-black text-zinc-900 dark:text-white">{filteredInvoices.length}</span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-cyan-500/50">
                    <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">{t('stats.totalPurchases')}</span>
                    <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
                        {formatCurrency(stats.totalPurchases, settings?.currency || "EGP")}
                    </span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-emerald-500/50">
                    <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">{t('stats.totalPaid')}</span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatCurrency(stats.totalPaid, settings?.currency || "EGP")}
                    </span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-rose-500/50">
                    <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">{t('stats.totalPending')}</span>
                    <span className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
                        {formatCurrency(totalPending, settings?.currency || "EGP")}
                    </span>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex gap-4 items-center flex-wrap">
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-200 dark:border-white/10 flex-wrap shadow-inner">
                    <button
                        onClick={() => {
                            setDateFilter("today");
                            setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
                        }}
                        className={clsx(
                            "h-10 text-[11px] font-black px-5 rounded-xl transition-all uppercase tracking-widest",
                            dateFilter === "today" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-zinc-900/10" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        اليوم
                    </button>
                    <button
                        onClick={() => {
                            const yesterday = subDays(new Date(), 1);
                            setDateFilter("yesterday");
                            setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
                        }}
                        className={clsx(
                            "h-10 text-[11px] font-black px-5 rounded-xl transition-all uppercase tracking-widest",
                            dateFilter === "yesterday" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-zinc-900/10" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        أمس
                    </button>
                    <button
                        onClick={() => {
                            setDateFilter("week");
                            setDateRange({ from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) });
                        }}
                        className={clsx(
                            "h-10 text-[11px] font-black px-5 rounded-xl transition-all uppercase tracking-widest",
                            dateFilter === "week" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-zinc-900/10" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        الأسبوع
                    </button>
                    <button
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                        className={clsx(
                            "h-10 text-[11px] font-black px-5 rounded-xl transition-all uppercase tracking-widest",
                            dateFilter === "month" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-zinc-900/10" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        الشهر
                    </button>

                    <div className="w-px h-4 bg-zinc-200 dark:bg-white/10 mx-2 hidden sm:block" />

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
                        className="w-48 bg-transparent border-0 text-xs h-10 text-zinc-900 dark:text-zinc-300 placeholder:text-zinc-400 font-bold"
                    />
                </div>

                <div className="flex gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-zinc-200 dark:border-white/10 gap-3 h-12 px-6 bg-white dark:bg-zinc-900/50 rounded-xl shadow-sm">
                                <Filter className="w-4 h-4 text-primary" />
                                <span className="font-black text-xs uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
                                    {statusFilter === 'ALL' ? t('filter.all') : 
                                     statusFilter === 'ACTIVE' ? t('filter.active') : 
                                     statusFilter === 'RETURNS' ? t('filter.returns') :
                                     t('filter.voided')}
                                </span>
                                <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-2 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-400 mb-2 px-3">
                                {t('filter.status')}
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setStatusFilter('ACTIVE')} className={cn("rounded-lg font-bold px-3 py-2.5", statusFilter === 'ACTIVE' ? "bg-primary/10 text-primary" : "text-zinc-600 dark:text-zinc-300")}>
                                {t('filter.active')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('RETURNS')} className={cn("rounded-lg font-bold px-3 py-2.5", statusFilter === 'RETURNS' ? "bg-primary/10 text-primary" : "text-zinc-600 dark:text-zinc-300")}>
                                {t('filter.returns')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('ALL')} className={cn("rounded-lg font-bold px-3 py-2.5", statusFilter === 'ALL' ? "bg-primary/10 text-primary" : "text-zinc-600 dark:text-zinc-300")}>
                                {t('filter.all')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('VOIDED')} className={cn("rounded-lg font-bold px-3 py-2.5", statusFilter === 'VOIDED' ? "bg-rose-500/10 text-rose-500" : "text-zinc-600 dark:text-zinc-300")}>
                                {t('filter.voided')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {(dateFilter !== "all" || statusFilter !== 'ACTIVE') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setDateRange(undefined);
                                setDateFilter("all");
                                setStatusFilter('ACTIVE');
                            }}
                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 h-10 px-3 font-bold gap-2"
                        >
                            <X className="w-4 h-4" /> {t('filter.clear')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Invoices List */}
            {filteredInvoices.length === 0 ? (
                <div className="bg-white dark:bg-card/40 p-20 rounded-3xl border border-zinc-200 dark:border-white/5 text-center text-zinc-400 flex flex-col items-center shadow-sm">
                    <div className="p-6 rounded-3xl bg-zinc-50 dark:bg-white/5 mb-6">
                        <FileText className="w-16 h-16 opacity-20" />
                    </div>
                    <p className="text-lg font-bold">{t('noInvoices')}</p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/5 bg-white dark:bg-black/20 shadow-2xl">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-right text-sm text-zinc-600 dark:text-zinc-400 zebra-table">
                            <thead className="bg-zinc-100 dark:bg-white/5 text-zinc-900 dark:text-zinc-300 border-b border-zinc-200 dark:border-white/5">
                                <tr className="hover:bg-transparent border-none">
                                <th className="px-6 py-4 text-start font-black cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs uppercase tracking-widest group/head" onClick={() => handleSort('purchaseDate')}>
                                    <div className="flex items-center gap-2.5">
                                        {getSortIcon('purchaseDate')}
                                        <span className={cn(
                                            "group-hover/head:translate-x-[-4px] transition-transform",
                                            sortBy === 'purchaseDate' && "underline decoration-primary/40 underline-offset-8"
                                        )}>{t('table.date')}</span>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-start font-black cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs uppercase tracking-widest group/head" onClick={() => handleSort('invoiceNumber')}>
                                    <div className="flex items-center gap-2.5">
                                        {getSortIcon('invoiceNumber')}
                                        <span className={cn(
                                            "group-hover/head:translate-x-[-4px] transition-transform",
                                            sortBy === 'invoiceNumber' && "underline decoration-primary/40 underline-offset-8"
                                        )}>{t('table.invoice')}</span>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-start font-black text-xs uppercase tracking-widest">{t('table.supplier')}</th>
                                <th className="px-6 py-4 text-start font-black text-xs uppercase tracking-widest">{t('table.branch')}</th>
                                <th className="px-6 py-4 text-start font-black text-xs uppercase tracking-widest">{t('table.warehouse')}</th>
                                <th className="px-6 py-4 text-center font-black text-xs uppercase tracking-widest">{t('table.status')}</th>
                                <th className="px-6 py-4 text-end font-black text-xs uppercase tracking-widest">{t('table.delivery')}</th>
                                <th className="px-6 py-4 text-end font-black cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs uppercase tracking-widest group/head" onClick={() => handleSort('totalAmount')}>
                                    <div className="flex items-center justify-end gap-2.5">
                                        {getSortIcon('totalAmount')}
                                        <span className={cn(
                                            "group-hover/head:translate-x-[-4px] transition-transform",
                                            sortBy === 'totalAmount' && "underline decoration-primary/40 underline-offset-8"
                                        )}>{t('table.total')}</span>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-end font-black cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs uppercase tracking-widest group/head" onClick={() => handleSort('paidAmount')}>
                                    <div className="flex items-center justify-end gap-2.5">
                                        {getSortIcon('paidAmount')}
                                        <span className={cn(
                                            "group-hover/head:translate-x-[-4px] transition-transform",
                                            sortBy === 'paidAmount' && "underline decoration-primary/40 underline-offset-8"
                                        )}>{t('table.paid')}</span>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-end font-black cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs uppercase tracking-widest group/head" onClick={() => handleSort('balance')}>
                                    <div className="flex items-center justify-end gap-2.5">
                                        {getSortIcon('balance')}
                                        <span className={cn(
                                            "group-hover/head:translate-x-[-4px] transition-transform",
                                            sortBy === 'balance' && "underline decoration-primary/40 underline-offset-8"
                                        )}>{t('table.balance')}</span>
                                    </div>
                                </th>
                                <th className="px-6 py-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-black/10">
                            {filteredInvoices.map((inv: PurchaseInvoice) => (
                                <tr key={inv.id} className={cn(
                                    "group hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors border-none",
                                    inv.status === 'VOIDED' && "opacity-50 grayscale"
                                )}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-zinc-400 font-mono text-xs">
                                            <Calendar className="w-3.5 h-3.5 opacity-50" />
                                            {format(new Date(inv.purchaseDate), 'yyyy/MM/dd')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm text-cyan-500/80">
                                        {inv.invoiceNumber || <span className="opacity-30 italic">Auto</span>}
                                    </td>
                                    <td className="px-6 py-4 text-start">
                                        <div className="text-sm font-black text-zinc-900 dark:text-white group-hover:text-primary transition-colors">
                                            {inv.supplier.name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-bold text-zinc-800 dark:text-white/90">{inv.warehouse?.branch?.name || '-'}</div>
                                        <div className="text-[10px] text-zinc-400 dark:text-white/40 tracking-widest uppercase font-mono">{inv.warehouse?.branch?.code}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-bold text-zinc-600 dark:text-white/70">{inv.warehouse?.name || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={clsx(
                                            "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border",
                                            inv.status === 'VOIDED' ? "bg-rose-500/10 text-rose-400 border-rose-500/20 line-through opacity-60" :
                                            (inv.isReturn || ['RETURN', 'RETURNED', 'PARTIAL_RETURN'].includes(inv.status)) ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                            inv.status === 'PAID' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                            inv.status === 'PARTIAL' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                            "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                        )}>
                                            {t(`statuses.${inv.status}`) || inv.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-end font-mono text-zinc-400 dark:text-white/40 text-xs">
                                        {formatCurrency(inv.deliveryCharge || 0, settings?.currency)}
                                    </td>
                                    <td className="px-6 py-4 text-end font-mono text-zinc-900 dark:text-cyan-400 font-black">
                                        {formatCurrency(inv.totalAmount, settings?.currency)}
                                    </td>
                                    <td className="px-6 py-4 text-end font-mono text-zinc-500 dark:text-white/50 font-bold">
                                        {formatCurrency(inv.paidAmount, settings?.currency)}
                                    </td>
                                    <td className="px-6 py-4 text-end font-mono text-rose-600 dark:text-rose-400 font-black">
                                        {formatCurrency(Number(inv.totalAmount) - Number(inv.paidAmount), settings?.currency)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2 justify-end translate-x-1">
                                            <button
                                                onClick={() => handleTablePrint(inv.id)}
                                                disabled={loadingInvoiceId === inv.id}
                                                className="w-9 h-9 flex items-center justify-center bg-zinc-100 dark:bg-white/5 hover:bg-zinc-900 dark:hover:bg-white hover:text-white dark:hover:text-zinc-900 rounded-xl transition-all shadow-sm active:scale-90"
                                                title={t('printInvoice')}
                                            >
                                                {loadingInvoiceId === inv.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Printer className="w-4 h-4" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleTableBarcode(inv.id)}
                                                disabled={loadingInvoiceId === inv.id}
                                                className="w-9 h-9 flex items-center justify-center bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500 hover:text-white rounded-xl transition-all shadow-sm active:scale-90"
                                                title={t('printBarcodes')}
                                            >
                                                <Tag className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(inv.id)}
                                                className="w-9 h-9 flex items-center justify-center bg-zinc-100 dark:bg-white/5 hover:bg-zinc-900 dark:hover:bg-white hover:text-white dark:hover:text-zinc-900 rounded-xl transition-all shadow-sm active:scale-90"
                                                title={t('editInvoice')}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setRefundInvoice({ id: inv.id })}
                                                disabled={inv.status === 'VOIDED'}
                                                className={clsx(
                                                    "w-9 h-9 flex items-center justify-center rounded-xl transition-all shadow-sm active:scale-90",
                                                    inv.status === 'VOIDED'
                                                        ? "opacity-10 cursor-not-allowed bg-zinc-100 dark:bg-white/5 text-zinc-400"
                                                        : "bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white"
                                                )}
                                                title={inv.status === 'VOIDED' ? t('alreadyVoided') : t('voidInvoice')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* Void Reason Dialog */}
            <ReasonDialog
                isOpen={!!refundInvoice}
                onClose={() => setRefundInvoice(null)}
                onConfirm={(reason) => {
                    if (refundInvoice) handleRefund(refundInvoice.id, reason);
                }}
                title={t('voidInvoice') || "إلغاء الفاتورة"}
                placeholder={t('voidReasonPrompt') || "سبب الإلغاء (اختياري)..."}
            />

            {isNewPurchaseOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
                    onClick={() => setIsNewPurchaseOpen(false)}
                >
                    <div
                        className="bg-card border border-border sm:rounded-2xl w-full h-full sm:w-auto sm:min-w-[80vw] sm:max-w-7xl sm:h-[80vh] m-auto flex flex-col shadow-2xl text-foreground relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20 flex-shrink-0">
                            <h2 className="text-xl font-bold">
                                {editingInvoiceId ? t('editInvoice') : t('createInvoice')}
                            </h2>
                                <div className="flex items-center gap-2">
                                {cart.length > 0 && (
                                    <button
                                        onClick={() => setShowBarcodePrint(true)}
                                        className="p-2 hover:bg-muted rounded-full"
                                        title={t('printBarcodes') || "طباعة الباركود"}
                                    >
                                        <Tag className="w-5 h-5 text-cyan-400" />
                                    </button>
                                )}
                                <button onClick={handlePrint} className="p-2 hover:bg-muted rounded-full" title={t('printInvoice')}>
                                    <Printer className="w-5 h-5 text-muted-foreground" />
                                </button>
                                <button onClick={() => setIsNewPurchaseOpen(false)} className="p-2 hover:bg-muted rounded-full text-muted-foreground">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">

                            {/* Error Banner */}
                            {errorResult && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg flex items-center gap-2">
                                    <span className="font-bold">{t('error') || 'خطأ'}:</span> {errorResult}
                                </div>
                            )}

                            <PurchaseHeader
                                selectedSupplierId={selectedSupplierId}
                                onSupplierChange={setSelectedSupplierId}
                                selectedBranchId={selectedBranchId}
                                onBranchChange={setSelectedBranchId}
                                selectedWarehouseId={selectedWarehouseId}
                                onWarehouseChange={setSelectedWarehouseId}
                                suppliers={suppliers}
                                branches={branches}
                                warehouses={filteredWarehouses}
                                isHQUser={isHQUser}
                                isWalkin={isWalkin}
                                setIsWalkin={setIsWalkin}
                                walkinName={walkinName}
                                setWalkinName={setWalkinName}
                                walkinPhone={walkinPhone}
                                setWalkinPhone={setWalkinPhone}
                                walkinNationalId={walkinNationalId}
                                setWalkinNationalId={setWalkinNationalId}
                                attachmentUrl={attachmentUrl}
                                setAttachmentUrl={setAttachmentUrl}
                            />

                            {/* Add Items Section */}
                            <PurchaseItemEntry
                                entryMode={entryMode}
                                onModeChange={setEntryMode}
                                itemSearch={itemSearch}
                                onItemSearchChange={setItemSearch}
                                filteredProducts={filteredProducts}
                                onSelectExisting={(p) => addToCartExisting(p)}
                                newItemSku={newItemSku}
                                setNewItemSku={setNewItemSku}
                                newItemName={newItemName}
                                setNewItemName={setNewItemName}
                                newItemCategoryId={newItemCategoryId}
                                setNewItemCategoryId={setNewItemCategoryId}
                                newItemCost={newItemCost}
                                setNewItemCost={setNewItemCost}
                                newItemQty={newItemQty}
                                setNewItemQty={setNewItemQty}
                                newItemSellPrice={newItemSellPrice}
                                setNewItemSellPrice={setNewItemSellPrice}
                                newItemSellPrice2={newItemSellPrice2}
                                setNewItemSellPrice2={setNewItemSellPrice2}
                                newItemSellPrice3={newItemSellPrice3}
                                setNewItemSellPrice3={setNewItemSellPrice3}
                                newItemIsDevice={newItemIsDevice}
                                setNewItemIsDevice={setNewItemIsDevice}
                                newItemDeviceType={newItemDeviceType}
                                setNewItemDeviceType={setNewItemDeviceType}
                                newItemCondition={newItemCondition}
                                setNewItemCondition={setNewItemCondition}
                                newItemColor={newItemColor}
                                setNewItemColor={setNewItemColor}
                                categories={categories}
                                onAutoSku={handleAutoSku}
                                onAddNewSubmit={addToCartNew}
                                csrfToken={csrfToken}
                            />

                            <div className="h-px bg-white/10 my-4" />

                            <PurchaseItemsTable
                                items={cart}
                                onRemoveItem={removeFromCart}
                                onUpdateItem={updateCartItem}
                            />
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-border bg-muted/20 flex justify-between items-center flex-shrink-0">
                            <div className="flex flex-col gap-1">
                                <div className="text-xs text-muted-foreground uppercase">{t('total')}</div>
                                <div className="text-2xl font-bold font-mono text-cyan-500">
                                    {formatCurrency(totalAmount, settings?.currency)}
                                </div>
                                <div className="text-xs text-muted-foreground">{t('itemsCount', { count: cart.length })}</div>
                            </div>

                            <div className="flex flex-wrap gap-4 items-end justify-end">
                                <div>
                                    <div className="text-xs text-muted-foreground uppercase font-bold mb-1">{tCommon('subtotal')}</div>
                                    <div className="bg-background border border-border px-3 py-2 rounded-lg w-28 font-mono text-right text-muted-foreground">
                                        {subtotal.toFixed(2)}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('deliveryCharge')}</label>
                                    <input
                                        {...getNavProps(10)}
                                        type="number"
                                        value={deliveryCharge}
                                        onChange={e => setDeliveryCharge(e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, 10, 13, undefined)}
                                        className="bg-zinc-900 border border-white/10 px-3 py-2 rounded-lg w-28 font-mono text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className="text-2xl font-light text-muted-foreground/50 pb-2">+</div>

                                <div>
                                    <div className="text-xs text-muted-foreground uppercase font-bold mb-1">{t('totalAmount')}</div>
                                    <div className="bg-background border border-border px-3 py-2 rounded-lg w-32 font-mono text-right font-bold text-cyan-400">
                                        {totalAmount.toFixed(2)}
                                    </div>
                                </div>

                                {/* Paid Amount */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <label className="text-xs text-emerald-400 uppercase font-bold pl-2">{t('paidAmount') || "المدفوع"}</label>
                                        {cart.length > 0 && parseFloat(paidAmount || '0') < totalAmount && (
                                            <button
                                                onClick={() => setPaidAmount(totalAmount.toString())}
                                                className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded hover:bg-emerald-500/30 transition-colors cursor-pointer"
                                            >
                                                دفع كامل
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        {...getNavProps(11)}
                                        type="number"
                                        value={paidAmount}
                                        onKeyDown={(e) => handleKeyDown(e, 11, 13, handleSubmit)}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                setPaidAmount('');
                                                return;
                                            }
                                            const num = parseFloat(val);
                                            if (!isNaN(num) && num > totalAmount && totalAmount > 0) {
                                                setPaidAmount(totalAmount.toString());
                                            } else {
                                                setPaidAmount(val);
                                            }
                                        }}
                                        className="bg-zinc-900 border border-emerald-500/30 px-3 py-2 rounded-lg w-32 font-mono text-emerald-400 focus:border-emerald-500 outline-none transition-colors"
                                        placeholder="0.00"
                                        min="0"
                                    />
                                </div>

                                {/* Treasury Selection */}
                                {parseFloat(paidAmount || '0') > 0 && treasuries.length > 0 && (
                                    <div className="animate-in fade-in slide-in-from-right-4">
                                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">
                                            {t('treasury') || 'الخزينة'}
                                        </label>
                                        <select
                                            {...getNavProps(12)}
                                            value={treasuryId}
                                            onChange={(e) => setTreasuryId(e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, 12, 13, handleSubmit)}
                                            className="bg-zinc-900 border border-white/10 px-3 py-2 rounded-lg w-40 text-sm text-zinc-100 focus:border-cyan-500 outline-none transition-colors cursor-pointer"
                                        >
                                            <option value="">{t('selectTreasury') || 'الخزينة الافتراضية'}</option>
                                            {treasuries.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button
                                    onClick={() => handleSubmit()}
                                    disabled={loading || cart.length === 0}
                                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-2 rounded-lg shadow-lg shadow-cyan-500/20 active:scale-95 transition-all flex items-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                    {tCommon('save')}
                                </button>
                            </div>
                        </div>

                        {/* Bulk Upload Dialog */}
                        <BulkUploadDialog
                            open={showBulkUpload}
                            onOpenChange={setShowBulkUpload}
                            onUploadComplete={() => {
                                // Refresh page to show new invoices
                                window.location.reload();
                            }}
                            csrfToken={csrfToken}
                        />
                    </div>
                </div>
            )}

            {/* Barcode Print Dialog */}
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
