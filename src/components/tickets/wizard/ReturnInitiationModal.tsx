"use client"

import { useState } from "react"
import { AlertCircle, RotateCcw, Wrench, X, Loader2 } from "lucide-react"
import { 
    Dialog, 
    DialogContent, 
    DialogTitle, 
    DialogDescription 
} from "@/components/ui/dialog"
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
    parts?: any[]; // Allow passing parts if already available
    onSuccess?: () => void;
}

export function ReturnInitiationModal({ isOpen, onClose, ticketId, barcode, parts, onSuccess }: ReturnInitiationModalProps) {
    const t = useTranslations("Maintenance")
    const router = useRouter()
    const { token: csrfToken } = useCSRF()
    
    const [loadingAction, setLoadingAction] = useState<'NONE' | 'WARRANTY' | 'REFUND'>('NONE')
    const [reason, setReason] = useState("")
    const [error, setError] = useState("")
    const [showConfirmRefund, setShowConfirmRefund] = useState(false)
    const [responsibility, setResponsibility] = useState<'TECH' | 'CENTER' | 'SPLIT'>('CENTER')
    const [damagedPartIds, setDamagedPartIds] = useState<Set<string>>(new Set())
    const [ticketParts, setTicketParts] = useState<any[]>(parts || [])
    const [fetchingParts, setFetchingParts] = useState(false)

    // Fetch parts if not provided
    useState(() => {
        if (!parts && isOpen) {
            // We'll use a dynamic import or fetch here if needed, 
            // but for now let's assume we can fetch via ticketId
        }
    })

    const toggleDamaged = (id: string) => {
        const next = new Set(damagedPartIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setDamagedPartIds(next);
    }

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
                clawbackOption: responsibility === 'TECH' ? 'FULL' : responsibility === 'SPLIT' ? 'PARTIAL' : 'NONE',
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
                damagedPartIds: Array.from(damagedPartIds),
                lossResponsibility: responsibility,
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
                <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-background border-border text-right" dir="rtl">
                    <div className="p-6 border-b border-zinc-200 dark:border-white/10 bg-gradient-to-l from-rose-500/10 to-transparent">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center border border-rose-500/20 dark:border-rose-500/30 shadow-sm">
                                <RotateCcw className="w-5 h-5 text-rose-600 dark:text-rose-500" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-black text-zinc-950 dark:text-white tracking-tight">
                                    إجراء مرتجع للتذكرة
                                </DialogTitle>
                                <DialogDescription className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 font-bold">
                                    {barcode}
                                </DialogDescription>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        <div>
                            <label className="text-xs font-black text-zinc-800 dark:text-zinc-300 mb-3 block uppercase tracking-wide">
                                سبب المرتجع / العطل <span className="text-rose-600">*</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="وصف موجز للمشكلة أو سبب إرجاع الجهاز..."
                                className="w-full h-24 bg-white dark:bg-zinc-900/50 border-2 border-zinc-200 dark:border-white/10 rounded-xl p-4 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-bold resize-none shadow-sm focus:border-cyan-500/50"
                            />
                            {error && (
                                <div className="flex items-center gap-2 mt-2 text-rose-600 text-[11px] font-black">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/10 space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                                    توزيع المسؤولية (عند الحاجة لقطع غيار)
                                </label>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'TECH', label: 'الفني', desc: 'خصم كامل' },
                                    { id: 'SPLIT', label: 'مشاركة', desc: 'خصم جزئي' },
                                    { id: 'CENTER', label: 'المركز', desc: 'لا خصم' }
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setResponsibility(opt.id as any)}
                                        className={clsx(
                                            "p-3 rounded-xl border-2 text-center transition-all",
                                            responsibility === opt.id 
                                                ? "bg-cyan-600 border-cyan-500 text-white shadow-xl shadow-cyan-600/20 scale-105 z-10" 
                                                : "bg-white dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-500 hover:border-cyan-500/50"
                                        )}
                                    >
                                        <div className="text-sm font-black">{opt.label}</div>
                                        <div className={clsx("text-[10px] mt-1 font-bold", responsibility === opt.id ? "text-cyan-50" : "text-zinc-400")}>
                                            {opt.desc}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-100 dark:bg-black/20 border border-zinc-200 dark:border-transparent">
                                <AlertCircle className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 mt-0.5 shrink-0" />
                                <p className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-bold">
                                    سيتم امتصاص تكلفة القطع الجديدة من ربح المصنعية أولاً. يتم تطبيق المسؤولية المختارة فقط على "الخسارة الزائدة" إن وجدت.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={handleWarrantyRework}
                                disabled={loadingAction !== 'NONE'}
                                className={clsx(
                                    "relative overflow-hidden group p-5 rounded-2xl border-2 text-right transition-all",
                                    loadingAction === 'WARRANTY' ? "border-cyan-500 bg-cyan-600/10 shadow-lg" : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-cyan-500/5 hover:border-cyan-500/50"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-cyan-600/10 flex items-center justify-center shrink-0 border border-cyan-500/20">
                                        {loadingAction === 'WARRANTY' ? <Loader2 className="w-4 h-4 text-cyan-600 animate-spin" /> : <Wrench className="w-4 h-4 text-cyan-600" />}
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-zinc-900 dark:text-white text-sm">إعادة للضمان (صيانة)</h3>
                                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed font-bold">
                                            إرجاع الجهاز لورشة الصيانة لإصلاح العطل دون إلغاء المدفوعات السابقة.
                                        </p>
                                    </div>
                                </div>
                            </button>

                            <div className={clsx(
                                "relative overflow-hidden group p-5 rounded-2xl border-2 text-right transition-all",
                                loadingAction === 'REFUND' ? "border-rose-500 bg-rose-600/10 shadow-lg col-span-2" : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-rose-500/5 hover:border-rose-500/50 col-span-1"
                            )}
                            onClick={loadingAction === 'NONE' ? handleFullRefundInitiate : undefined}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-rose-600/10 flex items-center justify-center shrink-0 border border-rose-500/20">
                                        {loadingAction === 'REFUND' ? <Loader2 className="w-4 h-4 text-rose-600 animate-spin" /> : <RotateCcw className="w-4 h-4 text-rose-600" />}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-extrabold text-zinc-900 dark:text-white text-sm">استرداد وإلغاء كلي</h3>
                                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed font-bold">
                                            إلغاء التذكرة بالكامل، إرجاع القطع للمخزون، ورد المبالغ للعميل.
                                        </p>

                                        {loadingAction === 'REFUND' && (
                                            <div className="mt-4 pt-4 border-t border-rose-500/20 space-y-3">
                                                <label className="text-[10px] font-black text-rose-600 uppercase block">تحديد القطع التالفة (إن وجدت):</label>
                                                <div className="grid grid-cols-1 gap-1.5">
                                                    {ticketParts.filter(p => p.status === 'ACTIVE').map(part => (
                                                        <button
                                                            key={part.id}
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); toggleDamaged(part.id); }}
                                                            className={clsx(
                                                                "flex items-center justify-between p-2.5 rounded-lg border text-xs font-bold transition-all",
                                                                damagedPartIds.has(part.id)
                                                                    ? "bg-rose-500 border-rose-400 text-white shadow-sm"
                                                                    : "bg-white dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400"
                                                            )}
                                                        >
                                                            <span>{part.productName || part.description || "قطعة غيار"}</span>
                                                            <span className="text-[10px] opacity-70">
                                                                {damagedPartIds.has(part.id) ? "تالفة" : "سليمة"}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-zinc-50 dark:bg-muted/10 border-t-2 border-zinc-200 dark:border-border flex justify-end">
                        <button
                            onClick={onClose}
                            disabled={loadingAction !== 'NONE'}
                            className="px-8 py-2.5 rounded-xl text-sm font-black text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 transition-all"
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
