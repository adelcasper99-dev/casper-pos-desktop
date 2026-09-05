'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { XCircle, Loader2, AlertTriangle, DollarSign } from 'lucide-react';
import { rejectTicket } from '@/actions/ticket-actions';
import { useTranslations } from '@/lib/i18n-mock';
import { useCSRF } from "@/contexts/CSRFContext";
import { toast } from "sonner";
import { useWhatsAppAutoNotify } from "@/hooks/useWhatsAppAutoNotify";
import { getEffectiveStoreSettings } from "@/actions/settings";

interface RejectTicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: {
        id: string;
        barcode: string;
        customerName?: string;
        customerPhone?: string;
        deviceBrand?: string;
        deviceModel?: string;
        status?: string;
        amountPaid?: number;
        issueDescription?: string | null;
    };
    onSuccess?: () => void;
}

export default function RejectTicketModal({ isOpen, onClose, ticket, onSuccess }: RejectTicketModalProps) {
    const t = useTranslations('Tickets.details');
    const { token: csrfToken } = useCSRF();
    const autoNotify = useWhatsAppAutoNotify();
    const [reason, setReason] = useState('');
    const [refundDeposit, setRefundDeposit] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
        if (isOpen) {
            getEffectiveStoreSettings().then(setSettings);
            setRefundDeposit(true);
        }
    }, [isOpen]);

    const handleReject = async () => {
        if (!reason.trim()) {
            setError(t('refund.reasonRequired') || 'يرجى إدخال سبب الرفض');
            return;
        }

        if (reason.trim().length < 5) {
            setError('يرجى إدخال سبب الرفض بشكل واضح (5 أحرف على الأقل)');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const hasDeposit = (ticket.amountPaid ?? 0) > 0;
            const res = await rejectTicket({
                ticketId: ticket.id,
                reason: reason,
                refundDeposit: hasDeposit ? refundDeposit : false,
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                toast.success('تم رفض التذكرة بنجاح');
                
                // 🚀 WhatsApp Auto-Notify (Non-blocking)
                if (ticket.customerPhone) {
                    autoNotify('REJECTED', {
                        customerPhone: ticket.customerPhone,
                        customerName: ticket.customerName || 'عميل',
                        barcode: ticket.barcode,
                        deviceBrand: ticket.deviceBrand || '',
                        deviceModel: ticket.deviceModel || '',
                        issueDescription: reason,
                        branchName: settings?.name ?? undefined
                    }, {
                        whatsappEnabled: settings?.whatsappEnabled,
                        whatsappTemplates: settings?.whatsappTemplates
                    });
                }

                setReason('');
                onSuccess?.();
                onClose();
            } else {
                setError(res.error || 'حدث خطأ أثناء رفض التذكرة');
            }
        } catch (err: any) {
            setError(err.message || 'حدث خطأ أثناء رفض التذكرة');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setReason('');
            setError(null);
            onClose();
        }
    };

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={handleClose}
            title="رفض التذكرة"
            className="max-w-md"
        >
            <div className="p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                        <XCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-red-600">رفض التذكرة</h2>
                        <p className="text-sm text-zinc-400">{ticket.barcode}</p>
                    </div>
                </div>

                {/* Ticket Info */}
                <div className="bg-zinc-800/50 rounded-lg p-3 mb-4">
                    <div className="text-sm">
                        <span className="text-zinc-400">العميل: </span>
                        <span className="text-white">{ticket.customerName || 'غير محدد'}</span>
                    </div>
                    <div className="text-sm mt-1">
                        <span className="text-zinc-400">الجهاز: </span>
                        <span className="text-white">
                            {ticket.deviceBrand} {ticket.deviceModel}
                        </span>
                    </div>
                </div>

                {/* Deposit Refund Banner & Checkbox */}
                {ticket.amountPaid !== undefined && ticket.amountPaid > 0 && (
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 flex flex-col gap-2.5 mb-4 text-right" dir="rtl">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4" />
                                عربون مسجل على التذكرة:
                            </span>
                            <span className="font-mono font-black text-xs text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                {ticket.amountPaid.toLocaleString()} ج.م
                            </span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground select-none pt-1 border-t border-amber-500/20">
                            <input 
                                type="checkbox" 
                                checked={refundDeposit} 
                                onChange={(e) => setRefundDeposit(e.target.checked)}
                                className="rounded border-amber-500 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                            />
                            <span>صرف واسترداد العربون للعميل نقداً من الدرج فوراً</span>
                        </label>
                    </div>
                )}

                {/* Warning */}
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4 text-right" dir="rtl">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200">
                        بعد رفض التذكرة، لن يمكن تغيير حالتها إلا عن طريق المرتجع.
                        تأكد من صحة هذا الإجراء.
                    </p>
                </div>

                {/* Reason Input */}
                <div className="mb-4 text-right" dir="rtl">
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        سبب الرفض <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            setError(null);
                        }}
                        placeholder="يرجى إدخال سبب رفض التذكرة..."
                        className="w-full h-20 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none text-xs"
                        disabled={loading}
                    />
                    {error && (
                        <p className="text-red-500 text-xs mt-1">{error}</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={handleClose}
                        disabled={loading}
                        className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        إلغاء
                    </button>
                    <button
                        onClick={handleReject}
                        disabled={loading || !reason.trim()}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                جاري الرفض...
                            </>
                        ) : (
                            <>
                                <XCircle className="w-4 h-4" />
                                رفض التذكرة
                            </>
                        )}
                    </button>
                </div>
            </div>
        </GlassModal>
    );
}