'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { ArrowLeftRight, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { refundTicket } from '@/actions/ticket-actions';
import { useTranslations } from '@/lib/i18n-mock';
import { useFormatCurrency } from "@/contexts/SettingsContext";
import { useCSRF } from "@/contexts/CSRFContext";

interface RefundTicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: {
        id: string;
        barcode: string;
        amountPaid: number;
        repairPrice: number;
    };
    onSuccess?: () => void;
}

export default function RefundTicketModal({ isOpen, onClose, ticket, onSuccess }: RefundTicketModalProps) {
    const t = useTranslations('Ticket.refund');
    const tCommon = useTranslations('Common');
    const formatCurrency = useFormatCurrency();
    const { token: csrfToken } = useCSRF();

    const [amount, setAmount] = useState<string>('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const maxRefund = ticket.amountPaid;

    const handleRefund = async () => {
        setLoading(true);
        setError(null);

        const refundAmount = parseFloat(amount);

        if (isNaN(refundAmount) || refundAmount <= 0) {
            setError(t('paymentError') || 'Please enter a valid amount');
            setLoading(false);
            return;
        }

        if (refundAmount > maxRefund) {
            setError(`Cannot refund more than paid amount (${formatCurrency(maxRefund)})`);
            setLoading(false);
            return;
        }

        if (!reason.trim()) {
            setError(t('reasonRequired'));
            setLoading(false);
            return;
        }

        try {
            const res = await refundTicket({
                ticketId: ticket.id,
                amount: refundAmount,
                reason: reason,
                csrfToken: csrfToken ?? undefined
            });
            if (res.success) {
                setSuccess(true);
                setTimeout(() => {
                    onSuccess?.();
                    onClose();
                    // Reset state after closing
                    setTimeout(() => {
                        setSuccess(false);
                        setAmount('');
                        setReason('');
                    }, 500);
                }, 1500);
            } else {
                setError(res.error || res.message || 'Refund failed');
            }
        } catch (err: any) {
            setError(err.message || 'Refund failed');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <GlassModal isOpen={isOpen} onClose={() => { }} title={t('successTitle')}>
                <div className="flex flex-col items-center justify-center p-8 space-y-4">
                    <CheckCircle className="w-16 h-16 text-green-500 animate-bounce" />
                    <h2 className="text-xl font-bold text-white">{t('processed')}</h2>
                    <p className="text-zinc-400">{t('inventoryUpdated')}</p>
                </div>
            </GlassModal>
        )
    }

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title={`${t('refundAmount')} #${ticket.barcode}`}>
            <div className="space-y-6">
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 flex gap-3 text-orange-200 text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-orange-500" />
                    <div>
                        <p className="font-bold text-orange-500 mb-1">{t('warning')}</p>
                        {t('deductWarning')}
                        <br />
                        {t('maxRefundable')}: <span className="font-bold">{formatCurrency(maxRefund)}</span>
                    </div>
                </div>

                <div>
                    <label className="text-sm text-zinc-400 mb-2 block">{t('refundAmount')}</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            max={maxRefund}
                            className="glass-input w-full pl-8 text-xl font-bold text-white bg-transparent border-white/10"
                            placeholder="0.00"
                        />
                        <button
                            onClick={() => setAmount(maxRefund.toString())}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-zinc-300"
                        >
                            {t('max')}
                        </button>
                    </div>
                </div>

                <div>
                    <label className="text-sm text-zinc-400 mb-2 block">{t('reasonRequired')}</label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="glass-input w-full min-h-[80px] text-white bg-transparent border-white/10"
                        placeholder="e.g. Customer cancelled, Service failed..."
                    />
                </div>

                {error && (
                    <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded border border-red-500/20">
                        {error}
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors border border-white/10"
                    >
                        {tCommon('cancel')}
                    </button>
                    <button
                        onClick={handleRefund}
                        disabled={loading || !amount || !reason}
                        className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
                    >
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                            <>
                                <ArrowLeftRight className="w-5 h-5" />
                                {t('processed').replace(' Processed', '')}
                                Confirm Refund
                            </>
                        )}
                    </button>
                </div>
            </div>
        </GlassModal>
    );
}
