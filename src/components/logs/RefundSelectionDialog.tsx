'use client';

import { useState, useEffect } from 'react';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcw, Wallet, Landmark, CreditCard, AlertCircle, UserCheck } from 'lucide-react';
import { getBranchTreasuriesForDropdown } from '@/actions/treasury';
import { cn } from '@/lib/utils';

// Virtual ID to represent "deduct from customer account balance" (no physical treasury)
const ACCOUNT_VIRTUAL_ID = '__ACCOUNT__';
const STORE_CREDIT_VIRTUAL_ID = '__STORE_CREDIT__';

interface RefundSelectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /** treasuryId will be an empty string when the account option is selected */
    onConfirm: (data: { treasuryId: string; paymentMethod: string; reason: string; refundMethod?: 'CASH' | 'STORE_CREDIT' }) => void;
    sale: any;
    loading?: boolean;
}

export default function RefundSelectionDialog({ isOpen, onClose, onConfirm, sale, loading }: RefundSelectionDialogProps) {
    const [reason, setReason] = useState('');
    const [treasuries, setTreasuries] = useState<any[]>([]);
    const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>('');
    const [fetching, setFetching] = useState(false);

    // True when original sale was on credit (pure account or deferred/mixed)
    const isAccountSale = sale?.paymentMethod === 'ACCOUNT' || sale?.paymentMethod === 'DEFERRED';

    useEffect(() => {
        if (isOpen) {
            setFetching(true);
            getBranchTreasuriesForDropdown().then(res => {
                if (res.success) {
                    setTreasuries(res.data);
                    // Default to "account" option for credit sales, otherwise first treasury
                    if (isAccountSale) {
                        setSelectedTreasuryId(ACCOUNT_VIRTUAL_ID);
                    } else {
                        const def = res.data.find((t: any) => t.isDefault) || res.data[0];
                        if (def) setSelectedTreasuryId(def.id);
                    }
                }
                setFetching(false);
            });
        }
    }, [isOpen, isAccountSale]);

    const handleConfirm = () => {
        const isAccountOption = selectedTreasuryId === ACCOUNT_VIRTUAL_ID;
        const isStoreCredit = selectedTreasuryId === STORE_CREDIT_VIRTUAL_ID;
        const treasury = treasuries.find(t => t.id === selectedTreasuryId);
        onConfirm({
            treasuryId: (isAccountOption || isStoreCredit) ? '' : selectedTreasuryId,
            paymentMethod: isStoreCredit ? 'STORE_CREDIT' : (isAccountOption ? 'ACCOUNT' : (treasury?.paymentMethod || 'CASH')),
            refundMethod: isStoreCredit ? 'STORE_CREDIT' : 'CASH',
            reason
        });
    };

    const getIcon = (method: string) => {
        switch (method) {
            case 'CASH': return <Wallet className="w-4 h-4" />;
            case 'VISA': return <CreditCard className="w-4 h-4" />;
            case 'ACCOUNT': return <UserCheck className="w-4 h-4" />;
            case 'STORE_CREDIT': return <RotateCcw className="w-4 h-4" />;
            default: return <Landmark className="w-4 h-4" />;
        }
    };

    const selectedTreasuryName =
        selectedTreasuryId === ACCOUNT_VIRTUAL_ID
            ? 'حساب العميل (آجل)'
            : selectedTreasuryId === STORE_CREDIT_VIRTUAL_ID
                ? 'رصيد المتجر (Store Credit)'
                : treasuries.find(t => t.id === selectedTreasuryId)?.name || '...';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-card border-border text-foreground shadow-2xl rounded-3xl p-0 overflow-hidden">
                <div className="p-8 space-y-6">
                    <DialogHeader className="pb-4 border-b border-border">
                        <DialogTitle className="flex items-center gap-3 text-2xl font-black">
                            <div className="p-2.5 rounded-2xl bg-red-500/10 border border-red-500/20">
                                <RotateCcw className="w-6 h-6 text-red-500" />
                            </div>
                            مرتجع مبيعات كامل
                        </DialogTitle>
                        <div className="flex items-center justify-between mt-2 pt-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60 font-mono">
                                فاتورة #{sale?.id.slice(0, 8).toUpperCase()}
                            </span>
                            <div className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                                {sale?.totalAmount.toLocaleString()} EGP
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Treasury Selection */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">
                                وجهة استرداد المبلغ المالي
                            </label>
                            <div className="grid grid-cols-1 gap-2.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {fetching ? (
                                    <div className="space-y-2">
                                        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/40 animate-pulse rounded-2xl border border-border" />)}
                                    </div>
                                ) : (
                                    <>
                                        {/* Store Credit Option */}
                                        {sale?.customerId && (
                                            <button
                                                key={STORE_CREDIT_VIRTUAL_ID}
                                                onClick={() => setSelectedTreasuryId(STORE_CREDIT_VIRTUAL_ID)}
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 group text-right",
                                                    selectedTreasuryId === STORE_CREDIT_VIRTUAL_ID
                                                        ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/5"
                                                        : "bg-muted/40 border-border hover:bg-muted/60 hover:border-border/80"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                                        selectedTreasuryId === STORE_CREDIT_VIRTUAL_ID ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "bg-card border border-border text-muted-foreground group-hover:border-primary/40"
                                                    )}>
                                                        <RotateCcw className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className={cn("text-sm font-black transition-colors", selectedTreasuryId === STORE_CREDIT_VIRTUAL_ID ? "text-primary" : "text-foreground")}>رصيد المتجر (محفظة)</div>
                                                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">STORE CREDIT — للاستخدام اللاحق</div>
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                                    selectedTreasuryId === STORE_CREDIT_VIRTUAL_ID ? "bg-primary scale-110 shadow-[0_0_10px_theme(colors.primary.DEFAULT)]" : "bg-border scale-75"
                                                )} />
                                            </button>
                                        )}

                                        {/* Account option */}
                                        {isAccountSale && (
                                            <button
                                                key={ACCOUNT_VIRTUAL_ID}
                                                onClick={() => setSelectedTreasuryId(ACCOUNT_VIRTUAL_ID)}
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 group text-right",
                                                    selectedTreasuryId === ACCOUNT_VIRTUAL_ID
                                                        ? "bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5"
                                                        : "bg-muted/40 border-border hover:bg-muted/60 hover:border-border/80"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                                        selectedTreasuryId === ACCOUNT_VIRTUAL_ID ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30" : "bg-card border border-border text-muted-foreground group-hover:border-amber-500/40"
                                                    )}>
                                                        <UserCheck className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className={cn("text-sm font-black transition-colors", selectedTreasuryId === ACCOUNT_VIRTUAL_ID ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>حساب العميل (آجل)</div>
                                                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">ACCOUNT — خصم من المديونية</div>
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                                    selectedTreasuryId === ACCOUNT_VIRTUAL_ID ? "bg-amber-500 scale-110 shadow-[0_0_10px_#f59e0b]" : "bg-border scale-75"
                                                )} />
                                            </button>
                                        )}

                                        {/* Physical treasuries */}
                                        {treasuries.map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => setSelectedTreasuryId(t.id)}
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 group text-right",
                                                    selectedTreasuryId === t.id
                                                        ? "bg-secondary/10 border-secondary/30 shadow-lg shadow-secondary/5"
                                                        : "bg-muted/40 border-border hover:bg-muted/60 hover:border-border/80"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                                        selectedTreasuryId === t.id ? "bg-secondary text-secondary-foreground shadow-lg shadow-secondary/30" : "bg-card border border-border text-muted-foreground group-hover:border-secondary/40"
                                                    )}>
                                                        {getIcon(t.paymentMethod)}
                                                    </div>
                                                    <div>
                                                        <div className={cn("text-sm font-black transition-colors", selectedTreasuryId === t.id ? "text-secondary" : "text-foreground")}>{t.name}</div>
                                                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{t.paymentMethod} — صرف نقدي</div>
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                                    selectedTreasuryId === t.id ? "bg-secondary scale-110 shadow-[0_0_10px_theme(colors.secondary.DEFAULT)]" : "bg-border scale-75"
                                                )} />
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Reason Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">
                                تعليق أو سبب الارتجاع (اختياري)
                            </label>
                            <Input
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="وثق سبب الإرجاع هنا..."
                                className="h-12 glass-input focus:ring-2 focus:ring-red-500/20 transition-all font-medium"
                            />
                        </div>

                        <div className={cn(
                            "p-5 border rounded-2xl flex items-start gap-3 shadow-inner",
                            selectedTreasuryId === ACCOUNT_VIRTUAL_ID
                                ? "bg-amber-500/10 border-amber-500/20"
                                : "bg-red-500/10 border-red-500/20"
                        )}>
                            <AlertCircle className={cn("w-5 h-5 shrink-0 mt-0.5", selectedTreasuryId === ACCOUNT_VIRTUAL_ID ? "text-amber-500" : "text-red-500")} />
                            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                                {selectedTreasuryId === ACCOUNT_VIRTUAL_ID
                                    ? <>سيتم تخفيض مديونية العميل بقيمة <span className="text-amber-700 dark:text-amber-400 font-black px-1">{sale?.totalAmount.toLocaleString()}</span> ولن يتم صرف أي مبالغ نقدية من الخزينة.</>
                                    : <>سيتم صرف مبلغ <span className="text-red-600 dark:text-red-400 font-black px-1">{sale?.totalAmount.toLocaleString()}</span> من خزينة <span className="font-black italic px-0.5 underline decoration-red-500/30">{selectedTreasuryName}</span> وتسجيل الفاتورة كمرتجع نهائي.</>
                                }
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-3 sm:flex-row-reverse sm:justify-start pt-4 border-t border-border">
                        <Button
                            onClick={handleConfirm}
                            disabled={loading || !selectedTreasuryId}
                            className="flex-1 h-14 bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 font-black rounded-2xl gap-2 transition-all active:scale-95"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <RotateCcw className="w-5 h-5" />
                            )}
                            {loading ? 'جاري التنفيذ...' : 'تأكيد الارتجاع النهائي'}
                        </Button>
                        <Button variant="ghost" onClick={onClose} className="h-14 px-8 rounded-2xl text-muted-foreground hover:bg-muted font-bold transition-all">
                            إلغاء النافذة
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
