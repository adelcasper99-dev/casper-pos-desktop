'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { rejectTicket } from '@/actions/ticket-actions';
import { useTranslations } from '@/lib/i18n-mock';
import { useCSRF } from "@/contexts/CSRFContext";
import { toast } from "sonner";

interface RejectTicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: {
        id: string;
        barcode: string;
        customerName?: string;
        deviceBrand?: string;
        deviceModel?: string;
        status?: string;
    };
    onSuccess?: () => void;
}

export default function RejectTicketModal({ isOpen, onClose, ticket, onSuccess }: RejectTicketModalProps) {
    const t = useTranslations('Tickets.details');
    const { token: csrfToken } = useCSRF();

    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            const res = await rejectTicket({
                ticketId: ticket.id,
                reason: reason,
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                toast.success('تم رفض التذكرة بنجاح');
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

                {/* Warning */}
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200">
                        بعد رفض التذكرة، لن يمكن تغيير حالتها إلا عن طريق المرتجع.
                        تأكد من صحة هذا الإجراء.
                    </p>
                </div>

                {/* Reason Input */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                        سبب الرفض <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            setError(null);
                        }}
                        placeholder="يرجى إدخال سبب رفض التذكرة..."
                        className="w-full h-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none"
                        disabled={loading}
                    />
                    {error && (
                        <p className="text-red-500 text-sm mt-1">{error}</p>
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