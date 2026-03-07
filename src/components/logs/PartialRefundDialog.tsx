'use client';

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
    RotateCcw, Printer, Package, CheckCircle2,
    Minus, Plus, AlertCircle, XCircle, UserCheck
} from 'lucide-react';
import { partialRefundSale } from '@/actions/sales-actions';
import { getStoreSettings } from '@/actions/settings';
import { getBranchTreasuriesForDropdown } from '@/actions/treasury';
import { printService } from '@/lib/print-service';
import { formatArabicPrintText } from '@/lib/arabic-reshaper';
import { cn, formatCurrency } from '@/lib/utils';

// Virtual ID — deduct from customer credit balance without touching any treasury
const ACCOUNT_VIRTUAL_ID = '__ACCOUNT__';

interface PartialRefundDialogProps {
    isOpen: boolean;
    onClose: () => void;
    sale: any;
    csrfToken?: string;
    onRefundDone: (saleId: string, refundedAmount: number, allReturned: boolean, returnedItems: any[], newTotal: number, updatedItems: any[]) => void;
}

export default function PartialRefundDialog({ isOpen, onClose, sale, csrfToken, onRefundDone }: PartialRefundDialogProps) {
    const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; quantity: number }>>({});
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [refundDone, setRefundDone] = useState(false);
    const [refundSummary, setRefundSummary] = useState<{ total: number; items: any[] } | null>(null);
    const [treasuries, setTreasuries] = useState<any[]>([]);
    const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>('');
    const receiptRef = useRef<HTMLDivElement>(null);

    // Fetch treasuries
    useEffect(() => {
        if (isOpen) {
            const isCredit = sale?.paymentMethod === 'ACCOUNT' || sale?.paymentMethod === 'DEFERRED';
            getBranchTreasuriesForDropdown().then(res => {
                if (res.success) {
                    setTreasuries(res.data);
                    if (isCredit) {
                        // Default to account deduction for credit sales
                        setSelectedTreasuryId(ACCOUNT_VIRTUAL_ID);
                    } else {
                        const def = res.data.find((t: any) => t.isDefault);
                        if (def) setSelectedTreasuryId(def.id);
                    }
                }
            });
        }
    }, [isOpen, sale?.paymentMethod]);

    const items = sale?.items || [];

    const toggleItem = (itemId: string) => {
        setSelectedItems(prev => ({
            ...prev,
            [itemId]: {
                selected: !prev[itemId]?.selected,
                quantity: prev[itemId]?.quantity ?? 1
            }
        }));
    };

    const setItemQty = (itemId: string, qty: number, maxQty: number) => {
        const clampedQty = Math.max(1, Math.min(qty, maxQty));
        setSelectedItems(prev => ({
            ...prev,
            [itemId]: { selected: true, quantity: clampedQty }
        }));
    };

    const selectedCount = Object.values(selectedItems).filter(i => i.selected).length;

    const refundTotal = items.reduce((sum: number, item: any) => {
        const sel = selectedItems[item.id];
        if (!sel?.selected) return sum;
        return sum + (Number(item.unitPrice) * sel.quantity);
    }, 0);

    // How much cash the customer actually paid (relevant for DEFERRED validation)
    const originalPaidCash: number = (sale?.payments || [])
        .filter((p: any) => p.method !== 'ACCOUNT' && p.method !== 'DEFERRED')
        .reduce((s: number, p: any) => s + Number(p.amount), 0);
    const isCredit = sale?.paymentMethod === 'ACCOUNT' || sale?.paymentMethod === 'DEFERRED';

    const handleSelectAll = () => {
        const allSelected = items.every((i: any) => selectedItems[i.id]?.selected);
        if (allSelected) {
            setSelectedItems({});
        } else {
            const all: Record<string, { selected: boolean; quantity: number }> = {};
            items.forEach((i: any) => { all[i.id] = { selected: true, quantity: i.quantity }; });
            setSelectedItems(all);
        }
    };

    const handleRefund = async () => {
        const itemsToRefund = items
            .filter((i: any) => selectedItems[i.id]?.selected)
            .map((i: any) => ({ itemId: i.id, quantity: selectedItems[i.id].quantity }));

        if (itemsToRefund.length === 0) {
            toast.error('يرجى اختيار صنف واحد على الأقل');
            return;
        }

        const isAccountOption = selectedTreasuryId === ACCOUNT_VIRTUAL_ID;

        // Validate: if paying back cash on a DEFERRED invoice, cap at what was paid
        if (!isAccountOption && isCredit && sale?.paymentMethod === 'DEFERRED') {
            if (refundTotal > originalPaidCash) {
                toast.error(`المبلغ المسترد (${refundTotal.toFixed(2)}) يتجاوز ما دفعه العميل نقداً (${originalPaidCash.toFixed(2)}). اختر "حساب العميل" أو قلل الكمية.`);
                return;
            }
        }

        setLoading(true);
        try {
            const selectedTreasury = treasuries.find(t => t.id === selectedTreasuryId);
            const result = await partialRefundSale({
                saleId: sale.id,
                items: itemsToRefund,
                reason: reason || undefined,
                paymentMethod: isAccountOption ? 'ACCOUNT' : selectedTreasury?.paymentMethod,
                treasuryId: isAccountOption ? undefined : selectedTreasuryId,
                csrfToken,
            });

            if (result.success) {
                const returnedItems = items
                    .filter((i: any) => selectedItems[i.id]?.selected)
                    .map((i: any) => ({
                        name: i.product?.name ?? i.name ?? 'صنف',
                        quantity: selectedItems[i.id].quantity,
                        unitPrice: Number(i.unitPrice),
                        lineTotal: Number(i.unitPrice) * selectedItems[i.id].quantity,
                    }));

                setRefundSummary({ total: result.refundedAmount ?? 0, items: returnedItems });
                setRefundDone(true);
                toast.success(result.message || 'تم تنفيذ المرتجع بنجاح');
                onRefundDone(
                    sale.id,
                    result.refundedAmount ?? 0,
                    result.allReturned ?? false,
                    returnedItems,
                    result.newTotal ?? 0,
                    result.updatedItems ?? []
                );
            } else {
                toast.error((result as any).error || 'فشل تنفيذ المرتجع');
            }
        } catch (err: any) {
            toast.error(err.message || 'خطأ في الخادم');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = async () => {
        if (!receiptRef.current || !refundSummary) return;

        const settingsRes = await getStoreSettings();
        const settings = settingsRes.success ? settingsRes.data : null;
        const paperWidthMm = settings?.paperSize === '58mm' ? 58 : (settings?.paperSize === '100mm' ? 100 : 80);

        const htmlContent = `<!DOCTYPE html>
<html dir="ltr">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  body { font-family: Arial, sans-serif; width: ${paperWidthMm || 80}mm; margin: 0 auto; padding: 0mm; direction: ltr; text-align: right; background: white; color: black; font-size: 14px; box-sizing: border-box; }
  .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .store-name { font-size: 18px; font-weight: 900; }
  .label { font-size: 14px; color: #555; }
  .refund-badge { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 2px 8px; border-radius: 4px; font-weight: 900; font-size: 14px; display: inline-block; margin: 4px 0; }
  .item { display: flex; justify-content: space-between; flex-direction: row-reverse; padding: 3px 0; border-bottom: 1px dotted #ccc; font-weight: bold; }
  .item-name { flex: 1; text-align: right; padding-right: 5px; }
  .total { font-weight: 900; font-size: 16px; display: flex; justify-content: space-between; flex-direction: row-reverse; border-top: 2px dashed #000; padding-top: 6px; margin-top: 6px; }
  .footer { text-align: center; font-size: 10px; color: #666; margin-top: 15px; }
</style>
</head>
<body>
  <div class="header">
    <div class="store-name">${formatArabicPrintText(settings?.name || 'CASPER ERP')}</div>
    <div class="label">${formatArabicPrintText(settings?.address || '')}</div>
    <div class="refund-badge">${formatArabicPrintText('↩ إيصال مرتجع')}</div>
    <div class="label">${formatArabicPrintText('فاتورة')}: #${sale.id.slice(0, 8).toUpperCase()}</div>
    <div class="label">${new Date().toLocaleString('ar-EG')}</div>
  </div>

  <div>
    ${refundSummary.items.map(i => `
      <div class="item">
        <span class="item-name">${formatArabicPrintText(i.name)} x${i.quantity}</span>
        <span>${i.lineTotal.toFixed(2)}</span>
      </div>
    `).join('')}
  </div>

  <div class="total">
    <span>${refundSummary.total.toFixed(2)} ${formatArabicPrintText(settings?.currency || 'ج.م')}</span>
    <span>${formatArabicPrintText('المجموع المسترد')}</span>
  </div>

  ${reason ? `<div class="footer">${formatArabicPrintText('السبب')}: ${formatArabicPrintText(reason)}</div>` : ''}
  <div class="footer">${formatArabicPrintText(settings?.receiptFooter || 'شكراً لتعاملكم معنا')}</div>
</body>
</html>`;

        const receiptPrinter = typeof window !== 'undefined' ? localStorage.getItem('casper_receipt_printer') : null;
        toast.promise(printService.printHTML(htmlContent, receiptPrinter || undefined, { paperWidthMm }), {
            loading: 'جارى الطباعة...',
            success: 'تم الإرسال للطابعة',
            error: (err) => `فشل الطباعة: ${err.message}`
        });
    };

    const handleClose = () => {
        setSelectedItems({});
        setReason('');
        setRefundDone(false);
        setRefundSummary(null);
        onClose();
    };

    if (!sale) return null;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-zinc-950 border border-white/10 text-white max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                        <RotateCcw className="w-5 h-5 text-red-400" />
                        مرتجع جزئي — #{sale.id.slice(0, 8).toUpperCase()}
                    </DialogTitle>
                </DialogHeader>

                {!refundDone ? (
                    <>
                        {/* Select All */}
                        <div className="flex items-center justify-between pb-2 border-b border-white/10">
                            <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
                                اختر الأصناف المراد إرجاعها
                            </span>
                            <button
                                onClick={handleSelectAll}
                                className="text-xs text-cyan-400 hover:text-cyan-300 font-bold transition-colors"
                            >
                                {items.every((i: any) => selectedItems[i.id]?.selected) ? 'إلغاء الكل' : 'اختيار الكل'}
                            </button>
                        </div>

                        {/* Items list */}
                        <div className="space-y-3 py-2">
                            {items.map((item: any) => {
                                const sel = selectedItems[item.id];
                                const isSelected = sel?.selected ?? false;
                                const qty = sel?.quantity ?? 1;
                                const productName = item.product?.name ?? item.name ?? 'صنف';

                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "p-4 rounded-2xl border transition-all duration-200 flex items-center gap-4",
                                            isSelected
                                                ? "bg-red-500/5 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.05)]"
                                                : "bg-white/5 border-white/5 hover:border-white/10"
                                        )}
                                    >
                                        <button
                                            onClick={() => toggleItem(item.id)}
                                            className="flex-shrink-0 active:scale-95 transition-transform"
                                        >
                                            {isSelected
                                                ? <CheckCircle2 className="w-6 h-6 text-red-400" />
                                                : <div className="w-6 h-6 rounded-full border-2 border-zinc-700" />
                                            }
                                        </button>

                                        <div className="flex-1 min-w-0" onClick={() => toggleItem(item.id)}>
                                            <div className="font-bold text-sm text-zinc-100 truncate">{productName}</div>
                                            <div className="text-[10px] text-zinc-500 font-mono tracking-tighter">
                                                السعر: {Number(item.unitPrice).toFixed(2)} | الكمية: {item.quantity}
                                            </div>
                                        </div>

                                        {/* Touch Optimized Stepper */}
                                        {isSelected && (
                                            <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-10 w-10 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg active:scale-95 transition-transform"
                                                    onClick={(e) => { e.stopPropagation(); setItemQty(item.id, qty - 1, item.quantity); }}
                                                >
                                                    <Minus className="w-4 h-4" />
                                                </Button>

                                                <div className="w-10 text-center font-mono font-bold text-lg select-none">
                                                    {qty}
                                                </div>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-10 w-10 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg active:scale-95 transition-transform"
                                                    onClick={(e) => { e.stopPropagation(); setItemQty(item.id, qty + 1, item.quantity); }}
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Reason & Treasury */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase ml-1">وجهة المرتجع</span>
                                <select
                                    value={selectedTreasuryId}
                                    onChange={(e) => setSelectedTreasuryId(e.target.value)}
                                    className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 h-12 text-sm text-zinc-200 focus:outline-none focus:border-red-500/30 appearance-none cursor-pointer"
                                >
                                    {/* Account option for credit sales */}
                                    {isCredit && (
                                        <option value={ACCOUNT_VIRTUAL_ID} className="bg-zinc-950">
                                            ⊖ خصم من حساب العميل (آجل)
                                        </option>
                                    )}
                                    {treasuries.map(t => (
                                        <option key={t.id} value={t.id} className="bg-zinc-950">
                                            {t.name} ({t.paymentMethod})
                                        </option>
                                    ))}
                                </select>
                                {/* Validation warning for DEFERRED — cash exceeds paid amount */}
                                {selectedTreasuryId !== ACCOUNT_VIRTUAL_ID && isCredit && sale?.paymentMethod === 'DEFERRED' && refundTotal > originalPaidCash && selectedCount > 0 && (
                                    <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        المبلغ أكبر من المدفوع نقداً ({originalPaidCash.toFixed(2)})
                                    </p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase ml-1">سبب الإرجاع</span>
                                <Input
                                    placeholder="سبب الإرجاع (اختياري)..."
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 h-12 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500/30"
                                />
                            </div>
                        </div>

                        {/* Summary bar */}
                        {selectedCount > 0 && (
                            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                                <div className="flex items-center gap-2 text-sm text-red-400">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>{selectedCount} صنف محدد</span>
                                </div>
                                <span className="font-black text-red-400">
                                    إجمالي المرتجع: {refundTotal.toFixed(2)}
                                </span>
                            </div>
                        )}

                        <DialogFooter className="gap-2 flex-row pt-4">
                            <Button variant="ghost" onClick={handleClose} className="flex-1 h-12 text-zinc-400">
                                إلغاء
                            </Button>
                            <Button
                                onClick={handleRefund}
                                disabled={loading || selectedCount === 0}
                                className="flex-1 h-12 bg-red-500 hover:bg-red-400 text-white font-bold gap-2 active:scale-95 transition-all"
                            >
                                <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                {loading ? 'جارى التنفيذ...' : `تأكيد المرتجع`}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    /* ─── Success Screen ─── */
                    <div className="space-y-4 py-2">
                        <div className="text-center space-y-1">
                            <div className="w-16 h-16 bg-red-500/20 border border-red-500/30 rounded-full flex items-center justify-center mx-auto">
                                <RotateCcw className="w-8 h-8 text-red-400" />
                            </div>
                            <p className="text-lg font-bold text-white">تم تنفيذ المرتجع</p>
                            <p className="text-3xl font-black text-red-400">
                                -{refundSummary?.total.toFixed(2)}
                            </p>
                        </div>

                        {/* Refund receipt preview */}
                        <div ref={receiptRef} className="bg-white text-black rounded-xl p-4 font-mono text-xs space-y-1 border border-white/10">
                            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
                                <div className="font-black text-sm">↩ مرتجع جزئي</div>
                                <div className="text-gray-600">#{sale.id.slice(0, 8).toUpperCase()}</div>
                                <div className="text-gray-500 text-[10px]">{new Date().toLocaleString('ar-EG')}</div>
                            </div>
                            {refundSummary?.items.map((item, i) => (
                                <div key={i} className="flex justify-between">
                                    <span>{item.name} x{item.quantity}</span>
                                    <span>{item.lineTotal.toFixed(2)}</span>
                                </div>
                            ))}
                            <div className="border-t border-dashed border-gray-400 pt-2 mt-2 flex justify-between font-black">
                                <span>الإجمالي المرتجع</span>
                                <span>{refundSummary?.total.toFixed(2)}</span>
                            </div>
                            {reason && <div className="text-center text-gray-500 text-[10px]">السبب: {reason}</div>}
                        </div>

                        <div className="flex gap-2">
                            <Button onClick={handleClose} variant="ghost" className="flex-1 text-zinc-400">
                                إغلاق
                            </Button>
                            <Button
                                onClick={handlePrint}
                                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white gap-2"
                            >
                                <Printer className="w-4 h-4" />
                                طباعة الإيصال
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
