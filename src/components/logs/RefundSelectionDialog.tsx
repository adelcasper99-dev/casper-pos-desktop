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

interface RefundSelectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /** treasuryId will be an empty string when the account option is selected */
    onConfirm: (data: { treasuryId: string; paymentMethod: string; reason: string }) => void;
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
        const treasury = treasuries.find(t => t.id === selectedTreasuryId);
        onConfirm({
            treasuryId: isAccountOption ? '' : selectedTreasuryId,
            paymentMethod: isAccountOption ? 'ACCOUNT' : (treasury?.paymentMethod || 'CASH'),
            reason
        });
    };

    const getIcon = (method: string) => {
        switch (method) {
            case 'CASH': return <Wallet className="w-4 h-4" />;
            case 'VISA': return <CreditCard className="w-4 h-4" />;
            case 'ACCOUNT': return <UserCheck className="w-4 h-4" />;
            default: return <Landmark className="w-4 h-4" />;
        }
    };

    const selectedTreasuryName =
        selectedTreasuryId === ACCOUNT_VIRTUAL_ID
            ? 'حساب العميل (آجل)'
            : treasuries.find(t => t.id === selectedTreasuryId)?.name || '...';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border border-white/10 text-white shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-black">
                        <RotateCcw className="w-5 h-5 text-red-400" />
                        تأكيد المرتجع الكامل
                    </DialogTitle>
                    <p className="text-xs text-zinc-500 font-mono">
                        فاتورة #{sale?.id.slice(0, 8).toUpperCase()} — إجمالي: {sale?.totalAmount.toLocaleString()}
                    </p>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Treasury Selection */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">
                            وجهة استرداد المبلغ
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {fetching ? (
                                <div className="h-20 bg-white/5 animate-pulse rounded-xl" />
                            ) : (
                                <>
                                    {/* ── Account option for credit sales ── */}
                                    {isAccountSale && (
                                        <button
                                            key={ACCOUNT_VIRTUAL_ID}
                                            onClick={() => setSelectedTreasuryId(ACCOUNT_VIRTUAL_ID)}
                                            className={cn(
                                                "flex items-center justify-between p-3 rounded-xl border transition-all duration-200 text-right",
                                                selectedTreasuryId === ACCOUNT_VIRTUAL_ID
                                                    ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                                                    : "bg-white/5 border-white/5 hover:bg-white/10"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                                    selectedTreasuryId === ACCOUNT_VIRTUAL_ID ? "bg-amber-500 text-white" : "bg-zinc-800 text-zinc-400"
                                                )}>
                                                    <UserCheck className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold">خصم من حساب العميل (آجل)</div>
                                                    <div className="text-[10px] text-zinc-500 uppercase">ACCOUNT — لا يمس الخزنة</div>
                                                </div>
                                            </div>
                                            {selectedTreasuryId === ACCOUNT_VIRTUAL_ID && (
                                                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
                                            )}
                                        </button>
                                    )}

                                    {/* ── Physical treasuries ── */}
                                    {treasuries.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSelectedTreasuryId(t.id)}
                                            className={cn(
                                                "flex items-center justify-between p-3 rounded-xl border transition-all duration-200 text-right",
                                                selectedTreasuryId === t.id
                                                    ? "bg-red-500/10 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                                                    : "bg-white/5 border-white/5 hover:bg-white/10"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                                    selectedTreasuryId === t.id ? "bg-red-500 text-white" : "bg-zinc-800 text-zinc-400"
                                                )}>
                                                    {getIcon(t.paymentMethod)}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold">{t.name}</div>
                                                    <div className="text-[10px] text-zinc-500 uppercase">{t.paymentMethod}</div>
                                                </div>
                                            </div>
                                            {selectedTreasuryId === t.id && (
                                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
                                            )}
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Reason Input */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">
                            سبب المرتجع (اختياري)
                        </label>
                        <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="لماذا تم إرجاع هذه الفاتورة؟"
                            className="bg-zinc-900 border-white/10 h-12 rounded-xl text-sm focus:border-red-500/50"
                        />
                    </div>

                    <div className={cn(
                        "p-3 border rounded-xl flex items-start gap-3",
                        selectedTreasuryId === ACCOUNT_VIRTUAL_ID
                            ? "bg-amber-500/5 border-amber-500/20"
                            : "bg-red-500/5 border-red-500/20"
                    )}>
                        <AlertCircle className={cn("w-4 h-4 shrink-0 mt-0.5", selectedTreasuryId === ACCOUNT_VIRTUAL_ID ? "text-amber-400" : "text-red-400")} />
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                            {selectedTreasuryId === ACCOUNT_VIRTUAL_ID
                                ? <>سيتم تخفيض رصيد العميل بمبلغ <b>{sale?.totalAmount.toLocaleString()}</b> — لن تتأثر أي خزنة نقدية.</>
                                : <>سيتم خصم مبلغ <b>{sale?.totalAmount.toLocaleString()}</b> من خزينة <b>{selectedTreasuryName}</b> وسيتم تغيير حالة الفاتورة إلى مرتجع.</>
                            }
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 flex-row">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="flex-1 h-12 text-zinc-400 hover:text-white"
                    >
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={loading || !selectedTreasuryId}
                        className="flex-1 h-12 bg-red-600 hover:bg-red-500 text-white font-black gap-2 shadow-lg shadow-red-900/20 active:scale-95 transition-all"
                    >
                        {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {loading ? 'جارى التنفيذ...' : 'تأكيد الارتجاع'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
