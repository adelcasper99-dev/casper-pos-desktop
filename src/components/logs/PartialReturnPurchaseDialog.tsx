'use client';

import { useState, useEffect } from 'react';
import {
    Dialog, DialogContent,
    DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    AlertCircle, Minus, Plus,
    RotateCcw, Package, Trash2,
    CheckCircle2, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { partialReturnPurchase } from '@/actions/purchase-actions';
import { cn, formatCurrency } from '@/lib/utils';

interface PartialReturnPurchaseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    purchase: any;
    onReturnDone: (purchaseId: string, returnedAmount: number, allReturned: boolean, returnedItems: any[], newTotal: number, updatedItems: any[]) => void;
    csrfToken?: string;
}

export default function PartialReturnPurchaseDialog({
    isOpen,
    onClose,
    purchase,
    onReturnDone,
    csrfToken
}: PartialReturnPurchaseDialogProps) {
    const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [reason, setReason] = useState("");

    // Reset state when dialog opens with a new purchase
    useEffect(() => {
        if (isOpen && purchase) {
            setSelectedItems({});
            setReason("");
        }
    }, [isOpen, purchase]);

    if (!purchase) return null;

    const items = purchase.items || [];

    const handleUpdateQty = (itemId: string, delta: number, max: number) => {
        setSelectedItems(prev => {
            const current = prev[itemId] || 0;
            const next = current + delta;

            if (next <= 0) {
                const newState = { ...prev };
                delete newState[itemId];
                return newState;
            }

            if (next > max) return prev;

            return { ...prev, [itemId]: next };
        });
    };

    const totalToReturn = Object.entries(selectedItems).reduce((acc, [itemId, qty]) => {
        const item = items.find((i: any) => i.id === itemId);
        return acc + (item ? Number(item.unitCost) * qty : 0);
    }, 0);

    const handleReturn = async () => {
        const returnData = Object.entries(selectedItems).map(([itemId, quantity]) => ({
            itemId,
            quantity
        }));

        if (returnData.length === 0) {
            toast.error("يرجى اختيار صنف واحد على الأقل للإرجاع");
            return;
        }

        setLoading(true);
        try {
            const res = await partialReturnPurchase({
                purchaseId: purchase.id,
                items: returnData,
                reason,
                csrfToken
            });

            if (res.success) {
                toast.success(res.message || "تم تنفيذ الارتجاع بنجاح");

                // Prepare updated items for the parent UI
                const returnedDetails = returnData.map(r => ({
                    ...items.find((i: any) => i.id === r.itemId),
                    quantity: r.quantity
                }));

                const updatedItems = items.map((i: any) => {
                    const r = returnData.find(ri => ri.itemId === i.id);
                    if (r) {
                        return { ...i, quantity: i.quantity - r.quantity };
                    }
                    return i;
                }).filter((i: any) => i.quantity > 0);

                onReturnDone(
                    purchase.id,
                    res.returnedAmount || totalToReturn,
                    !!res.allReturned,
                    returnedDetails,
                    res.newTotal || 0,
                    updatedItems
                );
                onClose();
            } else {
                toast.error(res.error || "فشل تنفيذ الارتجاع");
            }
        } catch (error: any) {
            toast.error(error.message || "خطأ في الخادم");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !loading && !open && onClose()}>
            <DialogContent className="sm:max-w-xl bg-card border-border text-foreground p-0 overflow-hidden flex flex-col max-h-[90vh] rounded-3xl shadow-2xl">
                <div className="p-8 pb-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-2xl font-black">
                            <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/20">
                                <RotateCcw className="w-6 h-6 text-orange-500" />
                            </div>
                            <span>مرتجع مشتريات جزئي</span>
                            <Badge variant="outline" className="mr-auto border-border bg-muted/50 text-xs px-3 py-1 font-mono rounded-lg">
                                #{purchase.id.slice(0, 8).toUpperCase()}
                            </Badge>
                        </DialogTitle>
                    </DialogHeader>
                </div>

                <div className="mx-8 px-5 py-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center gap-3 shadow-inner">
                    <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
                    <p className="text-[11px] text-orange-800 dark:text-orange-200/80 leading-relaxed font-bold">
                        حدد الكميات المراد إرجاعها للمورد. سيتم تحديث المخزون وموازنة حساب المورد تلقائياً فور التأكيد.
                    </p>
                </div>

                <div className="flex-1 px-8 py-6 overflow-y-auto space-y-3 custom-scrollbar">
                    {items.map((item: any) => {
                        const alreadyReturned = item.returnedQty || 0;
                        const availableQty = item.quantity - alreadyReturned;
                        const isSelected = selectedItems[item.id] > 0;

                        if (availableQty <= 0) return null;

                        return (
                            <div
                                key={item.id}
                                className={cn(
                                    "p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4 group cursor-pointer",
                                    isSelected
                                        ? "bg-orange-500/10 border-orange-500/30 shadow-lg shadow-orange-500/5 scale-[1.01]"
                                        : "bg-muted/40 border-border hover:bg-muted/60 hover:border-border/80"
                                )}
                                onClick={() => handleUpdateQty(item.id, 1, availableQty)}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className={cn("font-black text-sm transition-colors", isSelected ? "text-orange-700 dark:text-orange-400" : "text-foreground")}>
                                        {item.product?.name || "صنف غير معروف"}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-muted-foreground font-mono font-bold uppercase tracking-tighter opacity-80">
                                            التكلفة: {Number(item.unitCost).toLocaleString()}
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-border" />
                                        <span className="text-[10px] text-orange-600 dark:text-orange-400 font-black uppercase tracking-tighter">
                                            المتاح: {availableQty} وحدة
                                        </span>
                                    </div>
                                </div>

                                {/* Stepper */}
                                <div className="flex items-center bg-card shadow-sm border border-border rounded-2xl p-1 gap-1" onClick={e => e.stopPropagation()}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-10 w-10 text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 rounded-xl active:scale-95 transition-all"
                                        onClick={() => handleUpdateQty(item.id, -1, availableQty)}
                                    >
                                        <Minus className="w-4 h-4" />
                                    </Button>

                                    <div className="w-8 text-center font-mono font-black text-lg text-foreground">
                                        {selectedItems[item.id] || 0}
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-10 w-10 text-orange-500 hover:bg-orange-500/10 rounded-xl active:scale-95 transition-all"
                                        onClick={() => handleUpdateQty(item.id, 1, availableQty)}
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-8 bg-muted/30 border-t border-border space-y-5">
                    <div className="space-y-2 group">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">سبب المرتجع</label>
                        <Input
                            placeholder="وثق السبب هنا (مثال: أصناف تالفة، خطأ توريد)..."
                            className="h-12 glass-input focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center justify-between p-5 bg-orange-500/10 rounded-3xl border border-orange-500/20 shadow-inner">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400 opacity-60">سيتم خصم مالي بقيمة</span>
                            <span className="text-3xl font-black font-mono text-orange-600 dark:text-orange-400">
                                {totalToReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="h-12 px-6 border-border bg-background hover:bg-muted font-black rounded-2xl text-sm transition-all"
                                onClick={onClose}
                                disabled={loading}
                            >
                                إغلاق
                            </Button>
                            <Button
                                className="h-12 px-8 bg-orange-500 text-black hover:bg-orange-400 shadow-lg shadow-orange-500/20 font-black rounded-2xl gap-2 transition-all active:scale-95"
                                onClick={handleReturn}
                                disabled={loading || totalToReturn <= 0}
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-3 border-black/20 border-t-black rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <RotateCcw className="w-5 h-5" />
                                        تأكيد المرتجع
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
