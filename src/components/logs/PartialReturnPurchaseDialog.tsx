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
            <DialogContent className="sm:max-w-xl bg-zinc-950 border-white/10 text-white p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                        <RotateCcw className="w-6 h-6 text-orange-400" />
                        <span>مرتجع مشتريات جزئي</span>
                        <Badge variant="outline" className="ml-auto border-white/10 text-zinc-400 font-mono">
                            #{purchase.id.slice(0, 8).toUpperCase()}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <div className="px-6 py-2 bg-orange-500/10 border-y border-orange-500/20 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-400 shrink-0" />
                    <p className="text-xs text-orange-200/80 leading-relaxed font-medium">
                        حدد الكميات التي تريد إرجاعها للمورد. سيتم تقليل المخزون وتعديل حساب المورد تلقائياً.
                    </p>
                </div>

                <div className="flex-1 p-6 overflow-y-auto">
                    <div className="space-y-3">
                        {items.map((item: any) => {
                            const alreadyReturned = item.returnedQty || 0;
                            const availableQty = item.quantity - alreadyReturned;
                            const isSelected = selectedItems[item.id] > 0;

                            if (availableQty <= 0) return null;

                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "p-4 rounded-2xl border transition-all duration-200 flex items-center gap-4",
                                        isSelected
                                            ? "bg-orange-500/5 border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.05)]"
                                            : "bg-white/5 border-white/5 hover:border-white/10"
                                    )}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-zinc-100 truncate">{item.product?.name}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-tighter">
                                                السعر: {Number(item.unitCost).toLocaleString()}
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                            <span className="text-[10px] text-orange-400 font-bold uppercase tracking-tighter">
                                                المتاح: {availableQty}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Touch Optimized Stepper */}
                                    <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg active:scale-95 transition-transform"
                                            onClick={() => handleUpdateQty(item.id, -1, availableQty)}
                                        >
                                            <Minus className="w-4 h-4" />
                                        </Button>

                                        <div className="w-12 text-center font-mono font-bold text-lg select-none">
                                            {selectedItems[item.id] || 0}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 rounded-lg active:scale-95 transition-transform"
                                            onClick={() => handleUpdateQty(item.id, 1, availableQty)}
                                        >
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-6 bg-zinc-900/50 border-t border-white/5 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">سبب المرتجع</label>
                        <Input
                            placeholder="مثال: أصناف تالفة، خطأ في التوريد..."
                            className="h-12 bg-white/5 border-white/5 focus:border-orange-500/50 focus:ring-orange-500/20 rounded-xl text-sm"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-orange-500/10 rounded-2xl border border-orange-500/20">
                        <div className="space-y-0.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-400/80 block">إجمالي المرتجع</span>
                            <span className="text-2xl font-mono font-bold text-orange-400">
                                {totalToReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                className="h-14 px-6 text-zinc-400 hover:text-white font-bold rounded-xl"
                                onClick={onClose}
                                disabled={loading}
                            >
                                إلغاء
                            </Button>
                            <Button
                                className="h-14 px-8 bg-orange-500 hover:bg-orange-400 text-black font-black text-base rounded-xl gap-2 shadow-[0_0_30px_rgba(249,115,22,0.2)] active:scale-98 transition-all"
                                onClick={handleReturn}
                                disabled={loading || totalToReturn <= 0}
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-3 border-black/30 border-t-black rounded-full animate-spin" />
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
