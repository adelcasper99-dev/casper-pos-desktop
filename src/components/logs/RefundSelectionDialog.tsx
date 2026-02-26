'use client';

import { useState, useEffect } from 'react';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcw, Wallet, Landmark, CreditCard, AlertCircle } from 'lucide-react';
import { getBranchTreasuriesForDropdown } from '@/actions/treasury';
import { cn } from '@/lib/utils';

interface RefundSelectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: { treasuryId: string, paymentMethod: string, reason: string }) => void;
    sale: any;
    loading?: boolean;
}

export default function RefundSelectionDialog({ isOpen, onClose, onConfirm, sale, loading }: RefundSelectionDialogProps) {
    const [reason, setReason] = useState('');
    const [treasuries, setTreasuries] = useState<any[]>([]);
    const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>('');
    const [fetching, setFetching] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFetching(true);
            getBranchTreasuriesForDropdown().then(res => {
                if (res.success) {
                    setTreasuries(res.data);
                    const def = res.data.find((t: any) => t.isDefault) || res.data[0];
                    if (def) setSelectedTreasuryId(def.id);
                }
                setFetching(false);
            });
        }
    }, [isOpen]);

    const handleConfirm = () => {
        const treasury = treasuries.find(t => t.id === selectedTreasuryId);
        onConfirm({
            treasuryId: selectedTreasuryId,
            paymentMethod: treasury?.paymentMethod || 'CASH',
            reason
        });
    };

    const getIcon = (method: string) => {
        switch (method) {
            case 'CASH': return <Wallet className="w-4 h-4" />;
            case 'VISA': return <CreditCard className="w-4 h-4" />;
            default: return <Landmark className="w-4 h-4" />;
        }
    };

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
                                treasuries.map((t) => (
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
                                ))
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

                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                            سيتم خصم مبلغ <b>{sale?.totalAmount.toLocaleString()}</b> من خزينة <b>{treasuries.find(t => t.id === selectedTreasuryId)?.name || '...'}</b> وسيتم تغيير حالة الفاتورة إلى مرتجع.
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
