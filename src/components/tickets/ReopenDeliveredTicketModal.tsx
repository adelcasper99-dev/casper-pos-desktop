'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { RotateCcw, AlertTriangle, Loader2, ShieldAlert, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { reopenAccidentallyDeliveredTicket } from '@/actions/ticket-actions';
import { useCSRF } from "@/contexts/CSRFContext";
import { toast } from "sonner";

interface ReopenDeliveredTicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: {
        id: string;
        barcode: string;
        customerName?: string;
        repairPrice?: number;
    };
    onSuccess?: () => void;
}

export default function ReopenDeliveredTicketModal({
    isOpen,
    onClose,
    ticket,
    onSuccess
}: ReopenDeliveredTicketModalProps) {
    const { token: csrfToken } = useCSRF();
    const [reason, setReason] = useState('إلغاء تسليم مبكر واستئناف الصيانة');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirmReopen = async () => {
        if (!reason.trim()) {
            setError('يرجى كتابة سبب استئناف الصيانة.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await reopenAccidentallyDeliveredTicket({
                ticketId: ticket.id,
                targetStatus: 'IN_PROGRESS',
                reason: reason.trim(),
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                toast.success(res.message || 'تم إلغاء التسليم واستئناف مسار الصيانة بنجاح');
                onClose();
                if (onSuccess) onSuccess();
            } else {
                setError((res as { error?: string }).error || 'فشل استئناف الصيانة');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
        } finally {
            setLoading(false);
        }
    };

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={loading ? () => {} : onClose}
            title={
                <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400">
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <RotateCcw className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                        <span className="text-base sm:text-lg font-bold">استئناف مسار الصيانة</span>
                        <p className="text-xs text-muted-foreground font-normal">إلغاء التسليم المبكر للتذكرة #{ticket.barcode}</p>
                    </div>
                </div>
            }
            className="sm:max-w-lg"
        >
            <div className="space-y-4 pt-2 text-right" dir="rtl">
                {/* Warning Alert Banner */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 text-amber-950 dark:text-amber-200">
                    <div className="flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                        <div className="text-xs space-y-1.5 leading-relaxed">
                            <p className="font-bold text-sm text-amber-600 dark:text-amber-300">
                                تنبيه أمان محاسبي وتشغيلي
                            </p>
                            <p className="text-muted-foreground dark:text-slate-300">
                                سيتم اتخاذ الإجراءات التالية آلياً وبشكل ذري (Atomic Transaction):
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300 font-medium">
                                <li>إعادة حالة التذكرة إلى <b>قيد الصيانة (IN_PROGRESS)</b>.</li>
                                <li>تصفير تاريخ التسليم وإلغاء عداد فترة الضمان.</li>
                                <li>عكس قيود التوزيع المحاسبي وإلغاء استحقاق الأرباح.</li>
                                <li>تسجيل قيد عكس عمولة الفني المحتسبة تلقائياً.</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Reason Input */}
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                        <span>سبب الاستئناف / الإلغاء</span>
                        <span className="text-[10px] text-muted-foreground font-normal">سيوثق في سجل الرقابة</span>
                    </label>
                    <Textarea
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            if (error) setError(null);
                        }}
                        placeholder="اكتب سبب إلغاء التسليم واستئناف العمل..."
                        rows={2}
                        className="text-xs bg-background/50 border-input focus:border-amber-500 focus:ring-amber-500 resize-none"
                        disabled={loading}
                    />
                </div>

                {error && (
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 text-xs h-10 rounded-xl"
                    >
                        إلغاء الأمر
                    </Button>
                    <Button
                        type="button"
                        onClick={handleConfirmReopen}
                        disabled={loading}
                        className="flex-1 text-xs h-10 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold gap-2 shadow-lg shadow-amber-600/20"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>جاري الاستئناف والعكس...</span>
                            </>
                        ) : (
                            <>
                                <RotateCcw className="w-4 h-4" />
                                <span>تأكيد استئناف الصيانة</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </GlassModal>
    );
}
