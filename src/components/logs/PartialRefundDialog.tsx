'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
    RotateCcw, Printer, Package, CheckSquare, Square,
    MinusCircle, PlusCircle, AlertCircle
} from 'lucide-react';
import { partialRefundSale } from '@/actions/sales-actions';
import { getStoreSettings } from '@/actions/settings';
import { printService } from '@/lib/print-service';
import { formatCurrency } from '@/lib/utils';

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
    const receiptRef = useRef<HTMLDivElement>(null);

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

        setLoading(true);
        try {
            const result = await partialRefundSale({
                saleId: sale.id,
                items: itemsToRefund,
                reason: reason || undefined,
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

        const htmlContent = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  body { font-family: 'Courier New', monospace; width: 80mm; margin: 0 auto; padding: 5mm; direction: rtl; background: white; font-size: 12px; }
  .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .store-name { font-size: 16px; font-weight: 900; }
  .label { font-size: 11px; color: #555; }
  .refund-badge { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 2px 8px; border-radius: 4px; font-weight: 900; font-size: 11px; display: inline-block; margin: 4px 0; }
  .item { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #ddd; }
  .total { font-weight: 900; font-size: 14px; display: flex; justify-content: space-between; border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; }
  .footer { text-align: center; font-size: 10px; color: #666; margin-top: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div class="store-name">${settings?.name || 'CASPER ERP'}</div>
    <div class="label">${settings?.address || ''}</div>
    <div class="refund-badge">↩ إيصال مرتجع</div>
    <div class="label">فاتورة: #${sale.id.slice(0, 8).toUpperCase()}</div>
    <div class="label">${new Date().toLocaleString('ar-EG')}</div>
  </div>

  <div>
    ${refundSummary.items.map(i => `
      <div class="item">
        <span>${i.name} x${i.quantity}</span>
        <span>${i.lineTotal.toFixed(2)}</span>
      </div>
    `).join('')}
  </div>

  <div class="total">
    <span>إجمالي المرتجع</span>
    <span>${refundSummary.total.toFixed(2)} ${settings?.currency || 'ج.م'}</span>
  </div>

  ${reason ? `<div class="footer">السبب: ${reason}</div>` : ''}
  <div class="footer">${settings?.receiptFooter || 'شكراً لتعاملكم معنا'}</div>
</body>
</html>`;

        const receiptPrinter = typeof window !== 'undefined' ? localStorage.getItem('casper_receipt_printer') : null;
        toast.promise(printService.printHTML(htmlContent, receiptPrinter || undefined), {
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
                        <div className="space-y-2 py-2">
                            {items.map((item: any) => {
                                const sel = selectedItems[item.id];
                                const isSelected = sel?.selected ?? false;
                                const qty = sel?.quantity ?? 1;
                                const productName = item.product?.name ?? item.name ?? 'صنف';

                                return (
                                    <div
                                        key={item.id}
                                        className={`p-3 rounded-xl border transition-all ${isSelected
                                            ? 'border-red-500/40 bg-red-500/5'
                                            : 'border-white/5 bg-zinc-900/40'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => toggleItem(item.id)} className="flex-shrink-0">
                                                {isSelected
                                                    ? <CheckSquare className="w-5 h-5 text-red-400" />
                                                    : <Square className="w-5 h-5 text-zinc-500" />
                                                }
                                            </button>

                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-sm text-zinc-100 truncate">{productName}</div>
                                                <div className="text-xs text-zinc-500">
                                                    الكمية الأصلية: {item.quantity} |
                                                    السعر: {Number(item.unitPrice).toFixed(2)}
                                                </div>
                                            </div>

                                            {/* Qty Stepper */}
                                            {isSelected && (
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <button
                                                        onClick={() => setItemQty(item.id, qty - 1, item.quantity)}
                                                        className="text-zinc-400 hover:text-white transition-colors"
                                                    >
                                                        <MinusCircle className="w-5 h-5" />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={item.quantity}
                                                        value={qty}
                                                        onChange={(e) => setItemQty(item.id, parseInt(e.target.value) || 1, item.quantity)}
                                                        className="w-12 text-center bg-zinc-900 border border-white/10 rounded-lg text-sm font-bold text-white py-1 focus:outline-none focus:border-red-500/40"
                                                    />
                                                    <button
                                                        onClick={() => setItemQty(item.id, qty + 1, item.quantity)}
                                                        className="text-zinc-400 hover:text-white transition-colors"
                                                    >
                                                        <PlusCircle className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Line total */}
                                        {isSelected && (
                                            <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-xs">
                                                <span className="text-zinc-500">إجمالي هذا الصنف</span>
                                                <span className="text-red-400 font-bold">
                                                    {(Number(item.unitPrice) * qty).toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Reason */}
                        <input
                            type="text"
                            placeholder="سبب الإرجاع (اختياري)..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500/30"
                        />

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

                        <DialogFooter className="gap-2 flex-row">
                            <Button variant="ghost" onClick={handleClose} className="flex-1 text-zinc-400">
                                إلغاء
                            </Button>
                            <Button
                                onClick={handleRefund}
                                disabled={loading || selectedCount === 0}
                                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold gap-2"
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
