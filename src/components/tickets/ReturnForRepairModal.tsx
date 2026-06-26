'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import GlassModal from '@/components/ui/GlassModal';
import {
    Loader2, AlertTriangle, CheckCircle, RefreshCw,
    DollarSign, Calendar, Info, MoreHorizontal
} from 'lucide-react';
import { markForReRepair } from '@/actions/ticket-actions';
import { useFormatCurrency } from "@/contexts/SettingsContext";
import { useTranslations } from '@/lib/i18n-mock';
import { useCSRF } from "@/contexts/CSRFContext";

interface ReturnForRepairModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: any;
    onSuccess?: () => void;
}

const RETURN_REASONS = [
    { value: 'same_issue', label: 'نفس المشكلة لم تُحل', labelEn: 'Same issue not fixed', icon: AlertTriangle },
    { value: 'new_issue', label: 'مشكلة جديدة ظهرت', labelEn: 'New issue appeared', icon: RefreshCw },
    { value: 'quality_issue', label: 'جودة الإصلاح غير مرضية', labelEn: 'Repair quality unsatisfactory', icon: Info },
    { value: 'wrong_part', label: 'قطعة غيار خاطئة', labelEn: 'Wrong part installed', icon: Calendar },
    { value: 'other', label: 'سبب آخر', labelEn: 'Other', icon: MoreHorizontal }
];

export default function ReturnForRepairModal({
    isOpen,
    onClose,
    ticket,
    onSuccess
}: ReturnForRepairModalProps) {
    const t = useTranslations('Ticket.return');
    const formatCurrency = useFormatCurrency();
    const { token: csrfToken } = useCSRF();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedReason, setSelectedReason] = useState('');
    const [customReason, setCustomReason] = useState('');
    const [isPenaltyWaived, setIsPenaltyWaived] = useState(false);

    // Calculate warranty status
    const warrantyDays = 30; // TODO: Get from config
    const deliveredAt = ticket?.deliveredAt ? new Date(ticket.deliveredAt) : null;
    const warrantyExpiry = deliveredAt ? new Date(deliveredAt.getTime() + warrantyDays * 24 * 60 * 60 * 1000) : null;
    const isWithinWarranty = warrantyExpiry ? new Date() <= warrantyExpiry : true;
    const daysRemaining = warrantyExpiry ? Math.ceil((warrantyExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

    const handleSubmit = async () => {
        const reason = selectedReason === 'other' ? customReason :
            RETURN_REASONS.find(r => r.value === selectedReason)?.labelEn || customReason;

        if (!reason) {
            setError('الرجاء اختيار سبب الإرجاع');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await markForReRepair({
                ticketId: ticket.id,
                returnReason: selectedReason === 'other' ? customReason : selectedReason,
                isPenaltyWaived,
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                setSuccess(true);
                setTimeout(() => {
                    onSuccess?.();
                    onClose();
                    setTimeout(() => {
                        setSuccess(false);
                        setSelectedReason('');
                        setCustomReason('');
                        setIsPenaltyWaived(false);
                    }, 500);
                }, 1500);
            } else {
                setError((res as any).error || 'Failed to update ticket');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const resetAndClose = () => {
        setSelectedReason('');
        setCustomReason('');
        setIsPenaltyWaived(false);
        setSuccess(false);
        setError(null);
        onClose();
    };

    if (!ticket) return null;

    const originalCommission = Number(ticket?.commissionAmount) || 0;
    const returnCount = ticket?.returnCount || 0;

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={resetAndClose}
            title="إرجاع للإصلاح - Return for Re-Repair"
        >
            {success ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                    <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center animate-pulse">
                        <RefreshCw className="w-12 h-12 text-orange-500" />
                    </div>
                    <h3 className="text-xl font-bold text-orange-400">تم تسجيل الإرجاع</h3>
                    <p className="text-muted-foreground text-center">Ticket marked for re-repair</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Warranty Status Banner */}
                    <div className={`p-4 rounded-xl shadow-lg border-2 ${isWithinWarranty ? 'bg-green-600/20 border-green-500/50' : 'bg-red-600/20 border-red-500/50'}`}>
                        <div className="flex items-center gap-4">
                            <div className="bg-white/10 p-2 rounded-full">
                                {isWithinWarranty ? (
                                    <CheckCircle className="w-8 h-8 text-green-500" />
                                ) : (
                                    <AlertTriangle className="w-8 h-8 text-red-500" />
                                )}
                            </div>
                            <div>
                                <p className="font-black text-lg text-white leading-none mb-1">
                                    {isWithinWarranty ? 'ضمن فترة الضمان - Within Warranty' : 'انتهت فترة الضمان - Warranty Expired'}
                                </p>
                                <p className="text-zinc-300 font-medium text-sm">
                                    {warrantyExpiry ? (
                                        isWithinWarranty
                                            ? `${daysRemaining} days remaining (Until ${warrantyExpiry.toLocaleDateString()})`
                                            : `Expired on ${warrantyExpiry.toLocaleDateString()}`
                                    ) : 'Warranty period not set'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Return Count Warning */}
                    {returnCount > 0 && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2">
                            <Info className="w-5 h-5 text-yellow-500" />
                            <span className="text-yellow-400 text-sm font-bold">
                                هذا الجهاز تم إرجاعه {returnCount} مرة سابقاً
                            </span>
                        </div>
                    )}

                    {/* Return Reason Selection */}
                    <div>
                        <div className="flex justify-between items-end mb-3">
                            <label className="text-sm font-bold text-white">سبب الإرجاع - Return Reason *</label>
                            <span className="text-xs text-zinc-500 italic">Select best match</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {RETURN_REASONS.map((reason) => (
                                <button
                                    key={reason.value}
                                    type="button"
                                    onClick={() => setSelectedReason(reason.value)}
                                    className={`p-3 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center min-h-[90px] group ${selectedReason === reason.value
                                        ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-900/40 scale-[1.02]'
                                        : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                                        } ${reason.value === 'other' ? 'col-span-2' : ''}`}
                                >
                                    <reason.icon className={`w-6 h-6 mb-2 transition-transform group-hover:scale-110 ${selectedReason === reason.value ? 'text-white' : 'text-zinc-400 group-hover:text-white'
                                        }`} />
                                    <span className="font-black text-sm mb-1">{reason.label}</span>
                                    <span className="text-[10px] uppercase tracking-tighter opacity-80 font-bold">{reason.labelEn}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Custom Reason */}
                    {selectedReason === 'other' && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                            <label className="text-sm font-bold text-white mb-2 block">تفاصيل السبب - Details</label>
                            <Textarea
                                value={customReason}
                                onChange={(e) => setCustomReason(e.target.value)}
                                placeholder="اكتب سبب الإرجاع... Type reason here"
                                className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-orange-500 min-h-[100px]"
                            />
                        </div>
                    )}

                    {/* Penalty Waiver Checkbox */}
                    {originalCommission > 0 && (
                        <div className="pt-2 border-t border-white/10">
                            <label className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={isPenaltyWaived}
                                    onChange={(e) => setIsPenaltyWaived(e.target.checked)}
                                    className="w-5 h-5 rounded border-white/20 bg-black/50 text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
                                />
                                <div>
                                    <div className="text-white font-bold text-sm flex items-center gap-2">
                                        🛡️ إعفاء المهندس من غرامة الضمان (عيب مورد)
                                    </div>
                                    <div className="text-zinc-400 text-xs mt-1">
                                        Waive Technician Penalty (Supplier Defect)
                                    </div>
                                </div>
                            </label>
                            <p className="mt-3 text-[11px] text-zinc-500 bg-white/5 p-2 rounded italic text-center border border-white/5">
                                * سيتم تحميل خسارة القطع الجديدة على المركز بالكامل وإعفاء المهندس الأصلي.
                            </p>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !selectedReason}
                        className="w-full h-16 bg-orange-600 hover:bg-orange-500 hover:scale-[1.01] active:scale-[0.99] text-white font-black text-lg transition-all shadow-xl shadow-orange-900/20 rounded-xl"
                    >
                        {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <div className="flex items-center justify-center gap-3">
                                <RefreshCw className="w-6 h-6" />
                                <span>تأكيد الإرجاع للإصلاح - Confirm Return</span>
                            </div>
                        )}
                    </Button>
                </div>
            )}
        </GlassModal>
    );
}
