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
    startOfMonth, endOfMonth, isWithinInterval
} from 'date-fns';
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { PurchaseHeader } from "@/components/inventory/purchasing/PurchaseHeader";
import { PurchaseItemEntry } from "@/components/inventory/purchasing/PurchaseItemEntry";
import { PurchaseItemsTable } from "@/components/inventory/purchasing/PurchaseItemsTable";
import { BulkUploadDialog } from "@/components/inventory/purchasing/BulkUploadDialog";
import clsx from "clsx";
import BarcodeListener from "./BarcodeListener";
import { useTranslations } from "@/lib/i18n-mock";
import { usePurchaseForm } from "@/hooks/usePurchaseForm";
import type { InvoiceItem } from "@/hooks/usePurchaseForm";
import { toast } from "sonner";
import { safeRandomUUID } from "@/lib/utils";

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

    const queryClient = useQueryClient();

    const form = usePurchaseForm({
        products,
        isHQUser,
        userBranchId,
        branches,
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

    // Content moved up

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

    const handleRefund = async (id: string) => {
        const reason = prompt(t('voidReasonPrompt') || "Reason for voiding (optional):");
        if (reason === null) return;

        if (!confirm(t('confirmRefund'))) return;

        setLoading(true);
        const res = await refundPurchase(id, reason || undefined);
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
    const handlePrint = () => {
        const supplier = suppliers.find(s => s.id === selectedSupplierId);

        const printContent = `
             <!DOCTYPE html>
             <html dir="${document.dir || 'ltr'}">
             <head>
                 <title>${t('Print.title')}</title>
                 <style>
                     @media print { @page { margin: 0.5in; } }
                     body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
                     h1 { text-align: center; margin-bottom: 20px; }
                     .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px; }
                     .info { margin: 5px 0; }
                     table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                     th, td { border: 1px solid #ddd; padding: 10px; text-align: start; }
                     th { background-color: #f0f0f0; font-weight: bold; }
                     .totals { text-align: end; font-size: 18px; font-weight: bold; margin-top: 20px; }
                     .text-end { text-align: end; } 
                 </style>
             </head>
             <body>
                 <h1>${t('Print.title')}</h1>
                 <div class="header">
                     <div>
                         <div class="info"><strong>${t('Print.supplier')}</strong> ${supplier?.name || 'N/A'}</div>
                         <div class="info"><strong>${t('Print.date')}</strong> ${new Date().toLocaleDateString()}</div>
                     </div>
                     <div>
                         <div class="info"><strong>${t('Print.payment')}</strong> ${paymentMethod}</div>
                         <div class="info"><strong>${t('Print.status')}</strong> ${parseFloat(paidAmount || '0') >= totalAmount ? 'PAID' : parseFloat(paidAmount || '0') > 0 ? 'PARTIAL' : 'PENDING'}</div>
                     </div>
                 </div>
                 <table>
                     <thead>
                         <tr>
                             <th>${t('Print.item')}</th>
                             <th>${t('Print.sku')}</th>
                             <th class="text-end">${t('Print.qty')}</th>
                             <th class="text-end">${t('Print.cost')}</th>
                             <th class="text-end">${t('Print.total')}</th>
                         </tr>
                     </thead>
                     <tbody>
                         ${cart.map(item => `
                             <tr>
                                 <td>${item.name}</td>
                                 <td>${item.sku}</td>
                                 <td class="text-end">${item.quantity}</td>
                                 <td class="text-end">$${item.unitCost.toFixed(2)}</td>
                                 <td class="text-end">$${(item.quantity * item.unitCost).toFixed(2)}</td>
                             </tr>
                         `).join('')}
                     </tbody>
                 </table>
                 <div class="totals">
                     <div>${t('Print.totalAmount')} $${totalAmount.toFixed(2)}</div>
                     <div>${t('Print.paidAmount')} $${parseFloat(paidAmount || '0').toFixed(2)}</div>
                     <div style="color: ${totalAmount - parseFloat(paidAmount || '0') > 0 ? 'red' : 'green'};">
                          ${t('Print.balance')} $${(totalAmount - parseFloat(paidAmount || '0')).toFixed(2)}
                     </div>
                 </div>
             </body>
             </html>
         `;

        const printWindow = window.open('', '', 'width=800,height=600');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };


    const filteredProducts = itemSearch
        ? products.filter(p =>
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
                        onRangeChange={(dates) => {
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
                                    <div className="flex items-center gap-2" suppressHydrationWarning>
                                        <Calendar className="w-3 h-3" />
                                        {new Date(inv.purchaseDate).toLocaleDateString()}
                                    </div>
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
                                        ${Number(inv.deliveryCharge || 0).toFixed(2)}
                                    </td>
                                    <td className="p-4 text-end font-mono text-cyan-500 font-bold">
                                        {Number(inv.totalAmount).toFixed(2)}
                                    </td>
                                    <td className="p-4 text-end font-mono text-muted-foreground">
                                        {Number(inv.paidAmount).toFixed(2)}
                                    </td>
                                    <td className="p-4 text-end font-mono text-red-400">
                                        {(Number(inv.totalAmount) - Number(inv.paidAmount)).toFixed(2)}
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
                                                onClick={() => handleRefund(inv.id)}
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
                                    {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-sm text-muted-foreground">SAR</span>
                                </div>
                                <div className="text-xs text-muted-foreground">{t('itemsCount', { count: cart.length })}</div>
                            </div>

                            <div className="flex gap-4 items-end">
                                <div>
                                    <div className="text-xs text-muted-foreground uppercase font-bold mb-1">{tCommon('subtotal')}</div>
                                    <div className="bg-background border border-border px-3 py-2 rounded-lg w-32 font-mono text-right text-muted-foreground">
                                        {subtotal.toFixed(2)}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('deliveryCharge')}</label>
                                    <input
                                        type="number"
                                        value={deliveryCharge}
                                        onChange={e => setDeliveryCharge(e.target.value)}
                                        className="bg-background border border-border px-3 py-2 rounded-lg w-32 font-mono focus:border-cyan-500 outline-none transition-colors"
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className="text-2xl font-light text-muted-foreground/50 pb-2">+</div>

                                <div>
                                    <div className="text-xs text-muted-foreground uppercase font-bold mb-1">{t('totalAmount')}</div>
                                    <div className="bg-background border border-border px-3 py-2 rounded-lg w-32 font-mono text-right font-bold text-foreground">
                                        {totalAmount.toFixed(2)}
                                    </div>
                                </div>

                                <div className="text-2xl font-light text-muted-foreground/50 pb-2">=</div>

                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('paymentMethod') || 'Bank / Treasury'}</label>
                                    <select
                                        value={treasuryId}
                                        onChange={e => {
                                            const selectedId = e.target.value;
                                            setTreasuryId(selectedId);
                                            const selectedT = treasuries.find(t => t.id === selectedId);
                                            if (selectedT) {
                                                setPaymentMethod(selectedT.paymentMethod || 'CASH');
                                            }
                                        }}
                                        className="bg-background border border-border px-3 py-2 rounded-lg w-48 font-mono focus:border-cyan-500 outline-none transition-colors h-[42px] [&>option]:text-black"
                                    >
                                        <option value="">-- Select Treasury --</option>
                                        {treasuries.map(t => (
                                            <option key={t.id} value={t.id}>{t.name} ({t.paymentMethod})</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('paidAmount')}</label>
                                    <input
                                        type="number"
                                        value={paidAmount}
                                        onChange={e => setPaidAmount(e.target.value)}
                                        className={clsx(
                                            "bg-background border px-3 py-2 rounded-lg w-32 font-mono focus:border-cyan-500 outline-none transition-colors h-[42px]",
                                            parseFloat(paidAmount || '0') >= totalAmount ? "border-green-500 text-green-500" : "border-border"
                                        )}
                                        placeholder="0.00"
                                    />
                                </div>

                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || cart.length === 0}
                                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-lg px-8 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] h-[46px]"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                    {tCommon('save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
    );
}
