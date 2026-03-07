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

type ClawbackOption = 'NONE' | 'PARTIAL' | 'FULL';

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
    const [clawbackOption, setClawbackOption] = useState<ClawbackOption>('NONE');

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
                clawbackOption,
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
                        setClawbackOption('NONE');
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
        setClawbackOption('NONE');
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

                    {/* Commission Clawback Options */}
                    {originalCommission > 0 && (
                        <div className="pt-2 border-t border-white/10">
                            <div className="flex justify-between items-end mb-3">
                                <label className="text-sm font-bold text-white flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-orange-400" />
                                    خصم العمولة - Commission Clawback
                                </label>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setClawbackOption('NONE')}
                                    className={`p-3 rounded-xl border-2 text-center transition-all ${clawbackOption === 'NONE'
                                        ? 'bg-green-600 border-green-400 text-white shadow-lg shadow-green-900/40 scale-[1.02]'
                                        : 'bg-white/5 border-white/10 text-zinc-300 opacity-60 hover:opacity-100 hover:text-white'
                                        }`}
                                >
                                    <span className="text-lg font-black block">بدون</span>
                                    <span className="text-[10px] font-bold uppercase">No Clawback</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setClawbackOption('PARTIAL')}
                                    className={`p-3 rounded-xl border-2 text-center transition-all ${clawbackOption === 'PARTIAL'
                                        ? 'bg-yellow-600 border-yellow-400 text-white shadow-lg shadow-yellow-900/40 scale-[1.02]'
                                        : 'bg-white/5 border-white/10 text-zinc-300 opacity-60 hover:opacity-100 hover:text-white'
                                        }`}
                                >
                                    <span className="text-lg font-black block">50%</span>
                                    <span className="text-[10px] font-bold uppercase">{formatCurrency(originalCommission * 0.5)}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setClawbackOption('FULL')}
                                    className={`p-3 rounded-xl border-2 text-center transition-all ${clawbackOption === 'FULL'
                                        ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-900/40 scale-[1.02]'
                                        : 'bg-white/5 border-white/10 text-zinc-300 opacity-60 hover:opacity-100 hover:text-white'
                                        }`}
                                >
                                    <span className="text-lg font-black block">كامل</span>
                                    <span className="text-[10px] font-bold uppercase">{formatCurrency(originalCommission)}</span>
                                </button>
                            </div>
                            <p className="mt-3 text-[11px] text-zinc-500 bg-white/5 p-2 rounded italic text-center border border-white/5">
                                * This action will reopen the ticket and create a commission deduction record for the technician.
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
