"use client"

import { useState } from "react"
import { AlertCircle, RotateCcw, Wrench, X, Loader2 } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useTranslations } from "@/lib/i18n-mock"

// Actions
import { markForReRepair, fullTicketReturn } from "@/actions/ticket-actions"
import clsx from "clsx"
import ConfirmationModal from "@/components/ui/ConfirmationModal"
import { useCSRF } from "@/contexts/CSRFContext"

interface ReturnInitiationModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticketId: string;
    barcode: string;
    onSuccess?: () => void;
}

export function ReturnInitiationModal({ isOpen, onClose, ticketId, barcode, onSuccess }: ReturnInitiationModalProps) {
    const t = useTranslations("Maintenance")
    const router = useRouter()
    const { token: csrfToken } = useCSRF()
    
    const [loadingAction, setLoadingAction] = useState<'NONE' | 'WARRANTY' | 'REFUND'>('NONE')
    const [reason, setReason] = useState("")
    const [error, setError] = useState("")
    const [showConfirmRefund, setShowConfirmRefund] = useState(false)

    const handleWarrantyRework = async () => {
        if (!reason.trim()) {
            setError("يرجى إدخال سبب إعادة العمل (مثال: عطل متكرر، مشكلة في القطعة)")
            return
        }
        setError("")
        setLoadingAction('WARRANTY')

        try {
            const res = await markForReRepair({
                ticketId,
                returnReason: reason,
                clawbackOption: 'FULL', // Default to full clawback to protect center funds
                csrfToken: csrfToken ?? undefined
            })

            if (!res.success) throw new Error(res.error || "Failed to initiate warranty rework")

            toast.success("تم إرجاع التذكرة للصيانة بنجاح")
            if (onSuccess) onSuccess()
            onClose()
            router.refresh()
        } catch (err: any) {
            toast.error(err.message || "حدث خطأ غير معروف")
        } finally {
            setLoadingAction('NONE')
        }
    }

    const handleFullRefundInitiate = async () => {
        if (!reason.trim()) {
            setError("يرجى إدخال سبب الإلغاء والاسترداد الكامل")
            return
        }
        setError("")
        setShowConfirmRefund(true)
    }

    const handleFullRefundExecute = async () => {
        setShowConfirmRefund(false)
        setLoadingAction('REFUND')

        try {
            const res = await fullTicketReturn({
                ticketId,
                reason,
                csrfToken: csrfToken ?? undefined
            })

            if (!res.success) throw new Error(res.error || "Failed to process full refund")

            toast.success("تم إرجاع التذكرة واسترداد المبلغ بنجاح")
            if (onSuccess) onSuccess()
            onClose()
            router.refresh()
        } catch (err: any) {
            toast.error(err.message || "حدث خطأ غير معروف")
        } finally {
            setLoadingAction('NONE')
        }
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-zinc-950 border-white/10 text-right" dir="rtl">
                    <div className="p-6 border-b border-white/5 bg-gradient-to-l from-rose-500/10 to-transparent">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                                <RotateCcw className="w-5 h-5 text-rose-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">إجراء مرتجع للتذكرة</h2>
                                <p className="text-sm text-zinc-400 mt-1">
                                    {barcode}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        <div>
                            <label className="text-sm font-bold text-zinc-300 mb-2 block">
                                سبب المرتجع / العطل <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="وصف موجز للمشكلة أو سبب إرجاع الجهاز..."
                                className="w-full h-24 bg-zinc-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
                            />
                            {error && (
                                <div className="flex items-center gap-2 mt-2 text-rose-400 text-xs">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={handleWarrantyRework}
                                disabled={loadingAction !== 'NONE'}
                                className={clsx(
                                    "relative overflow-hidden group p-4 rounded-2xl border text-right transition-all",
                                    loadingAction === 'WARRANTY' ? "border-cyan-500/50 bg-cyan-500/10" : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-500/30"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
                                        {loadingAction === 'WARRANTY' ? <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" /> : <Wrench className="w-4 h-4 text-cyan-400" />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-sm">إعادة للضمان (صيانة)</h3>
                                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                                            إرجاع الجهاز لورشة الصيانة لإصلاح العطل دون إلغاء المدفوعات السابقة.
                                        </p>
                                    </div>
                                </div>
                            </button>

                            <button
                                onClick={handleFullRefundInitiate}
                                disabled={loadingAction !== 'NONE'}
                                className={clsx(
                                    "relative overflow-hidden group p-4 rounded-2xl border text-right transition-all",
                                    loadingAction === 'REFUND' ? "border-rose-500/50 bg-rose-500/10" : "border-white/10 bg-white/5 hover:bg-rose-500/10 hover:border-rose-500/30"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0">
                                        {loadingAction === 'REFUND' ? <Loader2 className="w-4 h-4 text-rose-400 animate-spin" /> : <RotateCcw className="w-4 h-4 text-rose-400" />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-sm">استرداد وإلغاء كلي</h3>
                                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                                            إلغاء التذكرة بالكامل، إرجاع القطع للمخزون، ورد المبالغ للعميل.
                                        </p>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="p-4 bg-white/[0.02] border-t border-white/5 flex justify-end">
                        <button
                            onClick={onClose}
                            disabled={loadingAction !== 'NONE'}
                            className="px-6 py-2 rounded-xl text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            إلغاء
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmationModal
                isOpen={showConfirmRefund}
                onClose={() => setShowConfirmRefund(false)}
                onConfirm={handleFullRefundExecute}
                title="تأكيد المرتجع والخروج"
                message="هل أنت متأكد من رغبتك في إلغاء هذه التذكرة واسترداد المبلغ بالكامل؟ لا يمكن التراجع عن هذا الإجراء وسيتم إرجاع كافة القطع السليمة للمخزون."
                confirmText={t('confirmRefund') || "نعم، استرد المبلغ"}
                cancelText="تراجع"
                variant="danger"
            />
        </>
    )
}
