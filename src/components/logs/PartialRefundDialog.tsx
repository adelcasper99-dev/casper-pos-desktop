'use client';

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
const STORE_CREDIT_VIRTUAL_ID = '__STORE_CREDIT__';

interface PartialRefundDialogProps {
    isOpen: boolean;
    onClose: () => void;
    sale: any;
    csrfToken?: string;
    onRefundDone: (saleId: string, refundedAmount: number, allReturned: boolean, returnedItems: any[], newTotal: number, updatedItems: any[]) => void;
}

export default function PartialRefundDialog({ isOpen, onClose, sale, csrfToken, onRefundDone }: PartialRefundDialogProps) {
    const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; quantity: number; isDamaged: boolean }>>({});
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
                quantity: prev[itemId]?.quantity ?? 1,
                isDamaged: prev[itemId]?.isDamaged ?? false
            }
        }));
    };

    const setItemQty = (itemId: string, qty: number, maxQty: number) => {
        const clampedQty = Math.max(1, Math.min(qty, maxQty));
        setSelectedItems(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], selected: true, quantity: clampedQty }
        }));
    };

    const toggleDamaged = (itemId: string) => {
        setSelectedItems(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], isDamaged: !prev[itemId]?.isDamaged }
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
            const all: Record<string, { selected: boolean; quantity: number; isDamaged: boolean }> = {};
            items.forEach((i: any) => { all[i.id] = { selected: true, quantity: Number(i.quantity), isDamaged: false }; });
            setSelectedItems(all);
        }
    };

    const handleRefund = async () => {
        const itemsToRefund = items
            .filter((i: any) => selectedItems[i.id]?.selected)
            .map((i: any) => ({ 
                itemId: i.id, 
                quantity: selectedItems[i.id].quantity,
                isDamaged: selectedItems[i.id].isDamaged
            }));

        if (itemsToRefund.length === 0) {
            toast.error('يرجى اختيار صنف واحد على الأقل');
            return;
        }

        const isAccountOption = selectedTreasuryId === ACCOUNT_VIRTUAL_ID;
        const isStoreCredit = selectedTreasuryId === STORE_CREDIT_VIRTUAL_ID;

        // Validate: if paying back cash on a DEFERRED invoice, cap at what was paid
        if (!isAccountOption && !isStoreCredit && isCredit && sale?.paymentMethod === 'DEFERRED') {
            if (refundTotal > originalPaidCash) {
                toast.error(`المبلغ المسترد (${refundTotal.toFixed(2)}) يتجاوز ما دفعه العميل نقداً (${originalPaidCash.toFixed(2)}). اختر "حساب العميل" أو "رصيد المتجر".`);
                return;
            }
        }

        setLoading(true);
        try {
            const selectedTreasury = treasuries.find(t => t.id === selectedTreasuryId);
            const result = await (partialRefundSale as any)({
                saleId: sale.id,
                items: itemsToRefund,
                reason: reason || undefined,
                refundMethod: isStoreCredit ? 'STORE_CREDIT' : 'CASH',
                treasuryId: (isAccountOption || isStoreCredit) ? undefined : selectedTreasuryId,
                csrfToken,
            });

            if (result.success) {
                const data = result.data || result;
                const returnedItems = items
                    .filter((i: any) => selectedItems[i.id]?.selected)
                    .map((i: any) => ({
                        name: i.product?.name ?? i.name ?? 'صنف',
                        quantity: selectedItems[i.id].quantity,
                        unitPrice: Number(i.unitPrice),
                        lineTotal: Number(i.unitPrice) * selectedItems[i.id].quantity,
                    }));

                setRefundSummary({ total: Number(data.refundedAmount ?? 0), items: returnedItems });
                setRefundDone(true);
                toast.success(data.message || 'تم تنفيذ المرتجع بنجاح');
                onRefundDone(
                    sale.id,
                    data.refundedAmount ?? 0,
                    data.allReturned ?? false,
                    returnedItems,
                    data.newTotal ?? 0,
                    data.updatedItems ?? []
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
        <span>${Number(i.lineTotal).toFixed(2)}</span>
      </div>
    `).join('')}
  </div>

  <div class="total">
    <span>${Number(refundSummary.total).toFixed(2)} ${formatArabicPrintText(settings?.currency || 'ج.م')}</span>
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
            <DialogContent className="bg-card border-border text-foreground max-w-xl max-h-[90vh] overflow-y-auto p-0 rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-8 space-y-6">
                    <DialogHeader className="pb-4 border-b border-border">
                        <DialogTitle className="text-2xl font-black flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-red-500/10 border border-red-500/20">
                                <RotateCcw className="w-6 h-6 text-red-500" />
                            </div>
                            مرتجع جزئي
                            <Badge variant="outline" className="mr-auto border-border bg-muted/50 text-xs px-3 py-1 font-mono rounded-lg">
                                #{sale.id.slice(0, 8).toUpperCase()}
                            </Badge>
                        </DialogTitle>
                    </DialogHeader>

                    {!refundDone ? (
                        <>
                            {/* Select All */}
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                                    الأصناف المشتراة في الفاتورة
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSelectAll}
                                    className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 px-3 h-7 rounded-lg"
                                >
                                    {items.every((i: any) => selectedItems[i.id]?.selected) ? 'إلغاء التحديد' : 'تحديد الكل'}
                                </Button>
                            </div>

                            {/* Items list */}
                            <div className="space-y-2 border-y border-border py-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {items.map((item: any) => {
                                    const sel = selectedItems[item.id];
                                    const isSelected = sel?.selected ?? false;
                                    const qty = sel?.quantity ?? 1;
                                    const productName = item.product?.name ?? item.name ?? 'صنف غير معروف';

                                    return (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4 group cursor-pointer",
                                                isSelected
                                                    ? "bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/5 scale-[1.01]"
                                                    : "bg-muted/40 border-border hover:bg-muted/60 hover:border-border/80"
                                            )}
                                            onClick={() => toggleItem(item.id)}
                                        >
                                            <div className="flex-shrink-0">
                                                <div className={cn(
                                                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
                                                    isSelected 
                                                        ? "bg-red-500 border-red-500 shadow-lg shadow-red-500/30" 
                                                        : "border-border bg-card group-hover:border-red-500/40"
                                                )}>
                                                    {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                                                </div>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className={cn("font-black text-sm transition-colors", isSelected ? "text-red-700 dark:text-red-400" : "text-foreground")}>
                                                    {productName}
                                                </div>
                                                <div className="text-[10px] font-bold text-muted-foreground mt-0.5 flex items-center gap-2">
                                                    <span className="font-mono">سعر الوحدة: {Number(item.unitPrice).toLocaleString()}</span>
                                                    <span className="w-1 h-1 rounded-full bg-border" />
                                                    <span className="font-mono">المباع: {Number(item.quantity)}</span>
                                                </div>
                                                {isSelected && item.product?.itemType !== 'SERVICE' && (
                                                    <Button 
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => { e.stopPropagation(); toggleDamaged(item.id); }}
                                                        className={cn(
                                                            "mt-2 h-7 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest gap-1.5 border transition-all",
                                                            sel.isDamaged 
                                                                ? "bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400"
                                                                : "bg-card border-border text-muted-foreground hover:bg-muted"
                                                        )}
                                                    >
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        {sel.isDamaged ? "صنف تالف / هالك" : "مرتجع سليم"}
                                                    </Button>
                                                )}
                                            </div>

                                            {/* Quantity Selector */}
                                            {isSelected && (
                                                <div className="flex items-center bg-card/80 backdrop-blur-md border border-red-500/20 rounded-2xl p-1 gap-1" onClick={e => e.stopPropagation()}>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-10 w-10 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl active:scale-95 transition-all"
                                                        onClick={() => setItemQty(item.id, qty - 1, Number(item.quantity))}
                                                    >
                                                        <Minus className="w-4 h-4" />
                                                    </Button>

                                                    <div className="w-8 text-center font-mono font-black text-lg text-foreground">
                                                        {qty}
                                                    </div>

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-10 w-10 text-red-500 hover:bg-red-500/10 rounded-xl active:scale-95 transition-all"
                                                        onClick={() => setItemQty(item.id, qty + 1, Number(item.quantity))}
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Configuration and Reason */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5 flex flex-col group">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 mb-1">جهة استرداد المبلغ</label>
                                    <div className="relative">
                                        <select
                                            value={selectedTreasuryId}
                                            onChange={(e) => setSelectedTreasuryId(e.target.value)}
                                            className="w-full glass-input pr-10 appearance-none cursor-pointer h-12"
                                        >
                                            {isCredit && (
                                                <option value={ACCOUNT_VIRTUAL_ID}>خصم من مديونية العميل (آجل)</option>
                                            )}
                                            {sale?.customerId && (
                                                <option value={STORE_CREDIT_VIRTUAL_ID}>محفظة المتجر (رصيد مستقبلي)</option>
                                            )}
                                            {treasuries.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} ({t.paymentMethod})</option>
                                            ))}
                                        </select>
                                        <UserCheck className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                                    </div>
                                    {selectedTreasuryId !== ACCOUNT_VIRTUAL_ID && isCredit && sale?.paymentMethod === 'DEFERRED' && refundTotal > originalPaidCash && selectedCount > 0 && (
                                        <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1 px-1">
                                            <AlertCircle className="w-3 h-3" />
                                            المبلغ يتجاوز المسدد نقداً ({Number(originalPaidCash).toFixed(2)})
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-1.5 flex flex-col group">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 mb-1">سبب المرتجع</label>
                                    <Input
                                        placeholder="وثق سبب الإرجاع هنا..."
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        className="h-12 glass-input focus:ring-2 focus:ring-red-500/20 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Impact Summary Bar */}
                            {selectedCount > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center justify-between shadow-inner">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 opacity-60">سيتم استرداد مالي بقيمة</span>
                                        <span className="text-sm font-bold text-red-700 dark:text-red-300">لعدد {selectedCount} صادر/أصناف</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-2xl font-black font-mono text-red-600 dark:text-red-400">
                                            {refundTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[10px] font-bold text-red-500 ml-1.5 opacity-60">EGP</span>
                                    </div>
                                </div>
                            )}

                            <DialogFooter className="gap-3 sm:flex-row-reverse sm:justify-start pt-4 border-t border-border">
                                <Button
                                    onClick={handleRefund}
                                    disabled={loading || selectedCount === 0}
                                    className="flex-1 h-12 bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 font-black rounded-2xl gap-2 transition-all active:scale-95"
                                >
                                    {loading ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <RotateCcw className="w-4 h-4" />
                                    )}
                                    {loading ? 'جاري الحفظ...' : `تأكيد عملية المرتجع`}
                                </Button>
                                <Button variant="ghost" onClick={handleClose} className="h-12 px-8 rounded-2xl text-muted-foreground hover:bg-muted font-bold transition-all">
                                    تراجـع
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        /* ─── Success Screen ─── */
                        <div className="space-y-6 py-6 animate-in fade-in zoom-in duration-300">
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/5">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-black tracking-tight">تمت العملية بنجاح</h2>
                                    <p className="text-muted-foreground text-sm font-medium">تم تسجيل المرتجع وتحديث الأرصدة والمديونيات</p>
                                </div>
                            </div>

                            <div className="bg-card border-none text-foreground rounded-2xl p-6 font-mono text-xs space-y-3 shadow-inner relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 rounded-bl-[100px] -mr-4 -mt-4 transition-all group-hover:w-20 group-hover:h-20" />
                                
                                <div className="flex justify-between items-center border-b border-border border-dashed pb-3">
                                    <div className="font-black text-[11px] uppercase tracking-widest text-red-500 opacity-60">إيصال مرتجع مبيعات</div>
                                    <div className="font-bold text-muted-foreground">#{sale.id.slice(0, 8).toUpperCase()}</div>
                                </div>
                                
                                <div className="space-y-2 py-2">
                                    {refundSummary?.items.map((item, i) => (
                                        <div key={i} className="flex justify-between items-center group/item hover:bg-muted/30 p-1.5 rounded-lg transition-colors">
                                            <span className="font-bold">{item.name} <span className="text-muted-foreground px-1.5">×</span> {item.quantity}</span>
                                            <span className="font-black">{item.lineTotal.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="border-t-2 border-border border-dashed pt-4 flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">إجمالي المبلغ المسترد</span>
                                        <span className="text-[10px] text-muted-foreground mt-0.5">{new Date().toLocaleString('ar-EG')}</span>
                                    </div>
                                    <span className="text-3xl font-black text-red-600 dark:text-red-400">
                                        {Number(refundSummary?.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Button onClick={handleClose} variant="outline" className="h-12 border-border bg-background hover:bg-muted font-black rounded-2xl text-sm transition-all shadow-sm">
                                    إغلاق
                                </Button>
                                <Button
                                    onClick={handlePrint}
                                    className="h-12 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg shadow-secondary/20 font-black rounded-2xl gap-2 text-sm transition-all active:scale-95"
                                >
                                    <Printer className="w-5 h-5" />
                                    طباعة الإيصال
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
