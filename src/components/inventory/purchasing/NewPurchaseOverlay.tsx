"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ShoppingCart, X, Check, Loader2 } from "lucide-react";
import { PurchaseHeader } from "./PurchaseHeader";
import { PurchaseDataGrid } from "./PurchaseDataGrid";
import BarcodeListener from "../BarcodeListener";
import { useTranslations } from "@/lib/i18n-mock";
import { formatCurrency } from "@/lib/utils";
import { Combobox } from "@/components/ui/combobox";
import type { GridRow } from "./PurchaseDataGrid";

interface NewPurchaseOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    // Form Hook Props
    form: any;
    gridRows: GridRow[];
    onRowsChange: (rows: GridRow[]) => void;
    handleScan: (barcode: string) => void;
    handleAutoSku: () => void;
    showNewItemPanel: boolean;
    setShowNewItemPanel: (show: boolean) => void;
    // Master Data
    suppliers: any[];
    products: any[];
    categories: any[];
    models: any[];
    warehouses: any[];
    branches: any[];
    isHQUser: boolean;
    attributes: any[];
    units: any[];
    treasuries: any[];
    csrfToken?: string;
    onQuickCreateSupplier?: (data: { name: string; phone?: string }) => void;
    onQuickCreateCategory?: (name: string, callback: (id: string) => void) => void;
    onQuickCreateModel?: (name: string, categoryId: string, callback: (id: string) => void) => void;
    onQuickCreateAttribute?: (name: string, callback: (id: string) => void) => void;
    onQuickCreateUnit?: (name: string, callback: (id: string, name: string) => void) => void;
    features?: any;
}

export function NewPurchaseOverlay({
    isOpen,
    onClose,
    form,
    gridRows,
    onRowsChange,
    handleScan,
    handleAutoSku,
    showNewItemPanel,
    setShowNewItemPanel,
    suppliers,
    products,
    categories,
    models,
    warehouses,
    branches,
    treasuries,
    isHQUser,
    units,
    attributes,
    csrfToken,
    onQuickCreateSupplier,
    onQuickCreateCategory,
    onQuickCreateModel,
    onQuickCreateAttribute,
    onQuickCreateUnit,
    features
}: NewPurchaseOverlayProps) {
    const t = useTranslations('Purchasing');
    const tCommon = useTranslations('Common');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const {
        loading, errorResult,
        selectedSupplierId, setSelectedSupplierId,
        selectedBranchId, setSelectedBranchId,
        selectedWarehouseId, setSelectedWarehouseId,
        isWalkin, setIsWalkin,
        walkinName, setWalkinName,
        walkinPhone, setWalkinPhone,
        walkinNationalId, setWalkinNationalId,
        attachmentUrl, setAttachmentUrl,
        handleSubmit,
        totalAmount,
        subtotal,
        deliveryCharge, setDeliveryCharge,
        paidAmount, setPaidAmount,
        treasuryId, setTreasuryId
    } = form;

    if (!isOpen || !mounted) return null;

    // Filtered data
    const filteredWarehouses = warehouses;

    const overlayContent = (
        <div 
            className="fixed inset-0 z-[99999] bg-black flex flex-col items-stretch overflow-hidden animate-in fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
        >
            {/* 1. TOP TITLE BAR (Fixed Height) */}
            <div className="flex-none px-4 py-3 border-b border-white/10 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white text-zinc-900 shadow-lg">
                        <ShoppingCart className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-tight text-white">{t('title')}</h2>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase">{t('subtitle')}</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* 2. MAIN CONTENT AREA (The Filling Body) */}
            <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden p-3 gap-3">
                {/* Error Banner */}
                {errorResult && (
                    <div className="flex-none p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl flex items-center gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        <span className="font-bold">{errorResult}</span>
                    </div>
                )}

                {/* THE GREY BOX (Expansion Engine) */}
                <div className="flex-1 flex flex-col min-h-0 bg-zinc-50 dark:bg-zinc-900/40 rounded-3xl border border-white/5 shadow-2xl">
                    <div className="flex-1 flex flex-col min-h-0 w-full p-4">
                        
                        {/* A. Header Inputs (Fixed) */}
                        <div className="flex-none mb-4">
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
                                onQuickCreateSupplier={onQuickCreateSupplier}
                            />
                        </div>

                        {/* B. THE DATA GRID (Master Expansion) */}
                        <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden rounded-2xl border border-white/5 bg-black/20">
                            <PurchaseDataGrid
                                products={products}
                                categories={categories}
                                models={models}
                                units={units}
                                rows={gridRows}
                                onRowsChange={onRowsChange}
                                onQuickCreateCategory={onQuickCreateCategory}
                                onQuickCreateModel={onQuickCreateModel}
                                onQuickCreateAttribute={onQuickCreateAttribute}
                                onQuickCreateUnit={onQuickCreateUnit}
                                attributes={attributes}
                                csrfToken={csrfToken}
                                features={features}
                            />
                        </div>

                        {/* C. Keyboard Hints (Fixed) */}
                        <div className="flex-none mt-3 flex justify-between items-center text-[10px] text-zinc-500 px-1 font-bold">
                            <span className="flex items-center gap-2">
                                <span className="p-1 rounded bg-zinc-800 text-zinc-400">Shift + N</span>
                                {t('newItem')}
                            </span>
                            <div className="flex items-center gap-4">
                                <span className="opacity-50">F2: {t('save')}</span>
                                <span className="opacity-50">F4: {t('bulkCsv')}</span>
                                <span className="opacity-50">ESC: {tCommon('close')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. FOOTER BAR (Pinned to Body Bottom) */}
            <div className="flex-none border-t border-white/5 px-6 py-3 bg-zinc-950/80 backdrop-blur-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.8)] z-50">
                <div className="w-full flex items-center justify-between gap-6">
                    {/* Totals Side */}
                    <div className="flex items-center gap-8 shrink-0">
                        <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-1">{tCommon('subtotal')}</span>
                            <span className="text-sm font-bold text-zinc-400 font-mono tabular-nums bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">{formatCurrency(subtotal)}</span>
                        </div>
                        
                        {/* Delivery Charge Input */}
                        <div className="flex flex-col border-s border-white/10 ps-6">
                            <span className="text-[8px] text-orange-500 uppercase font-black tracking-widest mb-1">مصاريف التوصيل</span>
                            <div className="relative">
                                <input 
                                    type="number"
                                    value={deliveryCharge}
                                    onChange={e => setDeliveryCharge(e.target.value)}
                                    className="bg-white/5 border border-white/10 text-sm font-bold text-orange-400 font-mono tabular-nums w-24 px-3 py-1.5 rounded-lg focus:ring-1 focus:ring-orange-500/50 outline-none transition-all"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {/* Paid Amount Input */}
                        <div className="flex flex-col border-s border-white/10 ps-6">
                            <span className="text-[8px] text-emerald-500 uppercase font-black tracking-widest mb-1">{t('paidAmount')}</span>
                            <div className="relative">
                                <input 
                                    type="number"
                                    value={paidAmount}
                                    onChange={e => setPaidAmount(e.target.value)}
                                    className="bg-white/5 border border-white/10 text-sm font-bold text-emerald-400 font-mono tabular-nums w-28 px-3 py-1.5 rounded-lg focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all font-black"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {/* Remaining / Balance */}
                        <div className="flex flex-col border-s border-white/10 ps-6">
                            <span className="text-[8px] text-rose-500 uppercase font-black tracking-widest mb-1">المبلغ الآجل</span>
                            <span className="text-sm font-bold text-rose-500 font-mono tabular-nums bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">{formatCurrency(Math.max(0, totalAmount - parseFloat(paidAmount || '0')))}</span>
                        </div>

                        {/* Treasury (Safe) Selector */}
                        <div className="flex flex-col border-s border-white/10 ps-6">
                            <span className="text-[8px] text-cyan-500 uppercase font-black tracking-widest mb-1">الخزينة المستلمة/الصادر منها</span>
                            <Combobox 
                                options={treasuries.map((t: any) => ({ label: t.name, value: t.id }))}
                                value={treasuryId}
                                onChange={setTreasuryId}
                                placeholder="اختر الخزينة..."
                                emptyText="لم يتم العثور على خزائن."
                                className="h-[34px] text-[10px] font-black min-w-[150px] shadow-2xl"
                                side="top"
                            />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex-1 flex justify-center">
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="h-12 px-12 bg-zinc-100 hover:bg-white text-zinc-900 rounded-2xl font-black text-sm uppercase tracking-tight flex items-center gap-3 transition-all active:scale-95 disabled:opacity-30 shadow-[0_10px_30px_rgba(255,255,255,0.1)]"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
                            {form.editingInvoiceId ? "تحديث الفاتورة" : tCommon('save')}
                        </button>
                    </div>

                    {/* Grand Total */}
                    <div className="flex items-center gap-6 shrink-0 bg-white/5 py-2 px-6 rounded-2xl border border-white/5">
                        <div className="text-right">
                            <span className="block text-[8px] text-zinc-500 uppercase font-black tracking-widest">{t('total')}</span>
                            <span className="text-3xl font-black text-white tracking-tighter tabular-nums">
                                {formatCurrency(totalAmount)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <BarcodeListener onScan={handleScan} />
        </div>
    );

    return createPortal(overlayContent, document.body);
}
