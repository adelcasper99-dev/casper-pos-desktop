"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPurchase, refundPurchase, getPurchaseInvoices } from "@/actions/inventory";
import { getBranchTreasuriesForDropdown } from "@/actions/treasury";
import {
    Loader2, Edit, Pencil, Plus, ShoppingCart, FileText,
    Calendar, Trash2, X, Search, Wand2, Check, Box,
    Printer, Filter, Upload,
    Calendar as CalendarIcon
} from "lucide-react";
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
import { safeRandomUUID, formatCurrency } from "@/lib/utils";
import { ReasonDialog } from "@/components/ui/ReasonDialog";

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

    const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'VOIDED'>('ACTIVE');
    const [dateFilter, setDateFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);
    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [refundInvoice, setRefundInvoice] = useState<{ id: string } | null>(null);

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
        const res = await refundPurchase({ id, reason: reason || undefined, csrfToken });
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
                printService.printHTML(html, printer || '', { paperWidthMm: 210 }),
                {
                    loading: tPOS('printing') || 'Printing...',
                    success: tPOS('sentToPrinter') || 'Sent to printer',
                    error: (err: any) => `Print failed: ${err?.message || 'Unknown error'}`
                }
            );
        } catch (e) {
            console.error("Print Error:", e);
            // Fallback for non-electron environments if printHTML fails
            const printWindow = window.open('', '', 'width=800,height=600');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            }
        }
    };


    const filteredProducts = itemSearch
        ? products.filter((p: Product) =>
            p.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
            p.sku.toLowerCase().includes(itemSearch.toLowerCase())
        ).slice(0, 50)
        : [];

    return (
        <div className="space-y-6 animate-fly-in" dir="rtl">
            {isNewPurchaseOpen && <BarcodeListener onScan={handleScan} />}
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl border border-border">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-indigo-400" />
                        {t('title')}
                    </h2>
                    <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
                </div>
                <div className="flex gap-2 ml-24">
                    <button
                        onClick={() => setShowBulkUpload(true)}
                        className="bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                    >
                        <Upload className="w-4 h-4" />
                        {t('bulkCsv')}
                    </button>
                    <button
                        onClick={() => {
                            form.resetForm();
                            setIsNewPurchaseOpen(true);
                        }}
                        className="bg-indigo-500 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-400 shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        {t('newPurchase')}
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-wrap gap-4 items-center bg-muted/30 p-4 rounded-xl border border-border">
                {/* Status Filter */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                            {t('filter.status')}
                        </span>
                    </div>

                    <div className="flex bg-background/50 p-1 rounded-lg border border-border/50">
                        <button
                            onClick={() => setStatusFilter('ACTIVE')}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-bold transition-all",
                                statusFilter === 'ACTIVE'
                                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            {t('filter.active')}
                        </button>
                        <button
                            onClick={() => setStatusFilter('ALL')}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-bold transition-all",
                                statusFilter === 'ALL'
                                    ? "bg-zinc-600 text-white shadow-lg shadow-zinc-600/30"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            {t('filter.all')}
                        </button>
                        <button
                            onClick={() => setStatusFilter('VOIDED')}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-bold transition-all",
                                statusFilter === 'VOIDED'
                                    ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            {t('filter.voided')}
                        </button>
                    </div>
                </div>

                <div className="h-6 w-px bg-border/50 mx-2" />

                {/* Date Filter & Presets */}
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border/50">
                        <button
                            onClick={() => {
                                setDateFilter("today");
                                setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
                            }}
                            className={clsx(
                                "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                                dateFilter === "today" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" : "text-muted-foreground hover:bg-white/5"
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
                                "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                                dateFilter === "yesterday" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" : "text-muted-foreground hover:bg-white/5"
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
                                "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                                dateFilter === "week" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" : "text-muted-foreground hover:bg-white/5"
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
                                "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                                dateFilter === "month" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" : "text-muted-foreground hover:bg-white/5"
                            )}
                        >
                            الشهر
                        </button>
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
                        className="w-64"
                    />

                    {(dateFilter !== "all" || statusFilter !== 'ACTIVE') && (
                        <button
                            onClick={() => {
                                setDateRange(undefined);
                                setDateFilter("all");
                                setStatusFilter('ACTIVE');
                            }}
                            className="flex items-center gap-1 text-xs text-orange-400 font-bold hover:text-orange-300 transition-colors"
                        >
                            <X className="w-3 h-3" /> مسح الفلاتر
                        </button>
                    )}
                </div>
            </div>

            {/* Invoices List */}
            {activeInvoices.filter((inv: any) => {
                // Status Filter
                if (statusFilter === 'ACTIVE' && inv.status === 'VOIDED') return false;
                if (statusFilter === 'VOIDED' && inv.status !== 'VOIDED') return false;

                // Date Filter
                if (dateRange?.from && dateRange?.to) {
                    return isWithinInterval(new Date(inv.purchaseDate), {
                        start: dateRange.from,
                        end: dateRange.to
                    });
                }

                return true;
            }).length === 0 ? (
                <div className="glass-card p-10 text-center text-zinc-500 flex flex-col items-center">
                    <FileText className="w-12 h-12 mb-3 opacity-20" />
                    <p>{t('noInvoices')}</p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-bold">
                            <tr>
                                <th className="p-4 text-start">{t('table.date')}</th>
                                <th className="p-4 text-start">{t('table.invoice')}</th>
                                <th className="p-4 text-start">{t('table.supplier')}</th>
                                <th className="p-4 text-start">{t('table.branch')}</th>
                                <th className="p-4 text-start">{t('table.warehouse')}</th>
                                <th className="p-4 text-center">{t('table.status')}</th>
                                <th className="p-4 text-end">{t('table.delivery')}</th>
                                <th className="p-4 text-end">{t('table.total')}</th>
                                <th className="p-4 text-end">{t('table.paid')}</th>
                                <th className="p-4 text-end">{t('table.balance')}</th>
                                <th className="p-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {activeInvoices.filter((inv: any) => {
                                // Status Filter
                                if (statusFilter === 'ACTIVE' && inv.status === 'VOIDED') return false;
                                if (statusFilter === 'VOIDED' && inv.status !== 'VOIDED') return false;

                                // Date Filter
                                if (dateRange?.from && dateRange?.to) {
                                    return isWithinInterval(new Date(inv.purchaseDate), {
                                        start: dateRange.from,
                                        end: dateRange.to
                                    });
                                }

                                return true;
                            }).map((inv: PurchaseInvoice) => (
                                <tr key={inv.id} className={clsx(
                                    "hover:bg-muted/30 transition-colors group",
                                    inv.status === 'VOIDED' && "opacity-50 bg-muted/10"
                                )}>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2 text-zinc-400">
                                            <Calendar className="w-3 h-3" />
                                            {format(new Date(inv.purchaseDate), 'yyyy/MM/dd')}
                                        </div>
                                    </td>
                                    <td className="p-4 font-mono text-xs text-muted-foreground">
                                        {inv.invoiceNumber || <span className="text-muted-foreground/50 italic">Auto</span>}
                                    </td>
                                    <td className="p-4 font-medium text-foreground">{inv.supplier.name}</td>
                                    <td className="p-4 text-muted-foreground">
                                        <div className="text-sm font-medium">{inv.warehouse?.branch?.name || '-'}</div>
                                        <div className="text-xs text-muted-foreground">{inv.warehouse?.branch?.code}</div>
                                    </td>
                                    <td className="p-4 text-muted-foreground">
                                        <div className="text-sm font-medium">{inv.warehouse?.name || '-'}</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={clsx(
                                            "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                                            inv.status === 'VOIDED' ? "bg-rose-500/20 text-rose-400 line-through opacity-60" :
                                                inv.status === 'PAID' ? "bg-emerald-500/20 text-emerald-400" :
                                                    inv.status === 'PARTIAL' ? "bg-amber-500/20 text-amber-400" :
                                                        "bg-blue-500/20 text-blue-400"
                                        )}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-end font-mono text-muted-foreground text-xs">
                                        {formatCurrency(inv.deliveryCharge || 0, settings?.currency)}
                                    </td>
                                    <td className="p-4 text-end font-mono text-cyan-500 font-bold">
                                        {formatCurrency(inv.totalAmount, settings?.currency)}
                                    </td>
                                    <td className="p-4 text-end font-mono text-muted-foreground">
                                        {formatCurrency(inv.paidAmount, settings?.currency)}
                                    </td>
                                    <td className="p-4 text-end font-mono text-red-400">
                                        {formatCurrency(Number(inv.totalAmount) - Number(inv.paidAmount), settings?.currency)}
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex gap-2 justify-center">
                                            <button
                                                onClick={() => handleEdit(inv.id)}
                                                className="bg-muted hover:bg-cyan-500 text-muted-foreground hover:text-black p-2 rounded-lg transition-colors"
                                                title={t('editInvoice')}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setRefundInvoice({ id: inv.id })}
                                                disabled={inv.status === 'VOIDED'}
                                                className={clsx(
                                                    "p-2 rounded-lg transition-colors",
                                                    inv.status === 'VOIDED'
                                                        ? "bg-muted/50 text-muted-foreground cursor-not-allowed opacity-30"
                                                        : "bg-muted hover:bg-orange-500 text-muted-foreground hover:text-black"
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
                        className="bg-card border border-border sm:rounded-2xl w-full h-full sm:w-auto sm:min-w-[80vw] sm:max-w-7xl sm:h-[80vh] m-auto flex flex-col shadow-2xl overflow-hidden text-foreground relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20 flex-shrink-0">
                            <h2 className="text-xl font-bold">
                                {editingInvoiceId ? t('editInvoice') : t('createInvoice')}
                            </h2>
                            <div className="flex items-center gap-2">
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

                            {/* Top Row: Supplier & Payment Method */}
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
                                        type="number"
                                        value={deliveryCharge}
                                        onChange={e => setDeliveryCharge(e.target.value)}
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
                                        type="number"
                                        value={paidAmount}
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
                                            value={treasuryId}
                                            onChange={(e) => setTreasuryId(e.target.value)}
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
        </div>
    );
}
