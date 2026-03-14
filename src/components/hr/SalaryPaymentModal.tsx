'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, DollarSign, Wallet } from 'lucide-react'
import { payEmployeeSalary } from '@/actions/hr'

interface SalaryPaymentModalProps {
    isOpen: boolean
    onClose: () => void
    userId: string
    suggestedAmount: number
    userName: string
    onSuccess?: () => void
}

export default function SalaryPaymentModal({
    isOpen,
    onClose,
    userId,
    suggestedAmount,
    userName,
    onSuccess
}: SalaryPaymentModalProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [treasuries, setTreasuries] = useState<any[]>([])
    const [formData, setFormData] = useState({
        amount: suggestedAmount.toString(),
        paymentMethod: 'CASH',
        treasuryId: '',
        notes: ''
    })

    useEffect(() => {
        if (isOpen) {
            setFormData(prev => ({ ...prev, amount: suggestedAmount.toString() }))
            import('@/actions/hr').then(mod => {
                mod.getAllTreasuries().then(res => {
                    if (res.success && res.data) {
                        setTreasuries(res.data)
                        if (res.data.length > 0) {
                            setFormData(prev => ({ ...prev, treasuryId: res.data[0].id }))
                        }
                    }
                })
            })
        }
    }, [isOpen, suggestedAmount])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.amount || (formData.paymentMethod === 'CASH' && !formData.treasuryId)) {
            toast.error("يرجى ملء البيانات المطلوبة")
            return
        }

        setLoading(true)
        try {
            const res = await payEmployeeSalary({
                userId,
                amount: parseFloat(formData.amount),
                paymentMethod: formData.paymentMethod,
                notes: formData.notes,
                treasuryId: formData.paymentMethod === 'CASH' ? formData.treasuryId : undefined
            })

            if (res.success) {
                toast.success("تم تسجيل سداد المرتب بنجاح")
                onSuccess?.()
                onClose()
            } else {
                toast.error(res.error || "فشل تسجيل السداد")
            }
        } catch (error) {
            toast.error("حدث خطأ غير متوقع")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(v) => !loading && !v && onClose()}>
            <DialogContent className="sm:max-w-[450px] bg-zinc-950 border-white/10 text-white backdrop-blur-3xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-emerald-400" />
                        سداد مرتب: {userName}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 py-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">المبلغ (EGP)</Label>
                        <Input 
                            type="number"
                            step="0.01"
                            value={formData.amount}
                            onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                            className="bg-white/5 border-white/10 rounded-xl focus:ring-emerald-500/50 text-emerald-400 font-mono text-lg"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">طريقة الدفع</Label>
                            <Select 
                                value={formData.paymentMethod} 
                                onValueChange={(v) => setFormData(prev => ({ ...prev, paymentMethod: v }))}
                            >
                                <SelectTrigger className="bg-white/5 border-white/10 rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                    <SelectItem value="CASH">نقدي</SelectItem>
                                    <SelectItem value="BANK">تحويل بنكي</SelectItem>
                                    <SelectItem value="INSTAPAY">انستا باي</SelectItem>
                                    <SelectItem value="WALLET">محفظة الكترونية</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.paymentMethod === 'CASH' && (
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">الخزينة</Label>
                                <Select 
                                    value={formData.treasuryId} 
                                    onValueChange={(v) => setFormData(prev => ({ ...prev, treasuryId: v }))}
                                >
                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl">
                                        <SelectValue placeholder="اختر الخزينة" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                        {treasuries.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name} ({Number(t.balance).toLocaleString()} EGP)</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">ملاحظات</Label>
                        <Textarea 
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="أي تفاصيل إضافية..."
                            className="bg-white/5 border-white/10 rounded-xl min-h-[80px]"
                        />
                    </div>

                    <DialogFooter className="pt-4 border-t border-white/5 gap-2">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            onClick={onClose}
                            className="rounded-xl border border-white/5"
                            disabled={loading}
                        >
                            تراجع
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-emerald-500 text-black hover:bg-emerald-400 font-bold rounded-xl px-8"
                            disabled={loading}
                        >
                            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            تأكيد السداد
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
