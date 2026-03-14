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
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import { 
    upsertEmployeeTransaction, 
    updateAttendanceEntry 
} from '@/actions/employee-ledger'

interface TransactionModalProps {
    isOpen: boolean
    onClose: () => void
    userId: string
    transaction?: any // If provided, we're in Edit mode
    mode?: 'MANUAL' | 'ATTENDANCE'
    onSuccess?: () => void
}

export default function EmployeeTransactionModal({
    isOpen,
    onClose,
    userId,
    transaction,
    mode = 'MANUAL',
    onSuccess
}: TransactionModalProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        type: 'ADDITION',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        reason: '' // For audit logs
    })

    useEffect(() => {
        if (transaction) {
            setFormData({
                type: transaction.type,
                amount: Math.abs(transaction.amount).toString(),
                description: transaction.description || '',
                date: transaction.date || new Date().toISOString().split('T')[0],
                reason: ''
            })
        } else {
            setFormData({
                type: 'ADDITION',
                amount: '',
                description: '',
                date: new Date().toISOString().split('T')[0],
                reason: ''
            })
        }
    }, [transaction, isOpen])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.amount || !formData.description) {
            toast.error("يرجى ملء البيانات المطلوبة")
            return
        }

        setLoading(true)
        try {
            let res;
            if (mode === 'ATTENDANCE') {
                res = await updateAttendanceEntry({
                    id: transaction.id,
                    bonus: formData.type === 'BONUS' ? parseFloat(formData.amount) : undefined,
                    deduction: formData.type === 'DEDUCTION' ? parseFloat(formData.amount) : undefined,
                    bonusNote: formData.type === 'BONUS' ? formData.description : undefined,
                    deductionNote: formData.type === 'DEDUCTION' ? formData.description : undefined,
                }, userId, formData.reason)
            } else {
                res = await upsertEmployeeTransaction({
                    id: transaction?.id,
                    userId,
                    type: formData.type as any,
                    amount: parseFloat(formData.amount),
                    description: formData.description,
                    createdAt: new Date(formData.date)
                }, formData.reason)
            }

            if (res.success) {
                toast.success(transaction ? "تم تحديث الحركة بنجاح" : "تم إضافة الحركة بنجاح")
                onSuccess?.()
                onClose()
            } else {
                toast.error(res.error || "فشل حفظ الحركة")
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
                        {transaction ? <Pencil className="w-5 h-5 text-cyan-400" /> : <Plus className="w-5 h-5 text-cyan-400" />}
                        {transaction ? 'تعديل حركة مالية' : 'إضافة حركة مالية جديدة'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="type" className="text-xs font-bold text-zinc-500 uppercase tracking-widest">نوع الحركة</Label>
                            <Select 
                                value={formData.type} 
                                onValueChange={(v) => setFormData(prev => ({ ...prev, type: v }))}
                            >
                                <SelectTrigger className="bg-white/5 border-white/10 rounded-xl focus:ring-cyan-500/50">
                                    <SelectValue placeholder="اختر النوع" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                    <SelectItem value="ADDITION">إضافة (مستحق)</SelectItem>
                                    <SelectItem value="BONUS">مكافأة</SelectItem>
                                    <SelectItem value="DEDUCTION">خصم</SelectItem>
                                    <SelectItem value="PENALTY">جزاء</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount" className="text-xs font-bold text-zinc-500 uppercase tracking-widest">المبلغ (EGP)</Label>
                            <Input 
                                id="amount"
                                type="number"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                placeholder="0.00"
                                className="bg-white/5 border-white/10 rounded-xl focus:ring-cyan-500/50"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date" className="text-xs font-bold text-zinc-500 uppercase tracking-widest">التاريخ</Label>
                        <Input 
                            id="date"
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                            className="bg-white/5 border-white/10 rounded-xl focus:ring-cyan-500/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-xs font-bold text-zinc-500 uppercase tracking-widest">البيان / التفاصيل</Label>
                        <Input 
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="مثال: مكافأة الأداء المتميز"
                            className="bg-white/5 border-white/10 rounded-xl focus:ring-cyan-500/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reason" className="text-xs font-bold text-zinc-500 uppercase tracking-widest">سبب التعديل (اختياري)</Label>
                        <Textarea 
                            id="reason"
                            value={formData.reason}
                            onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                            placeholder="اكتب سبب إجراء هذه العملية للتوثيق..."
                            className="bg-white/5 border-white/10 rounded-xl focus:ring-cyan-500/50 min-h-[80px]"
                        />
                    </div>

                    <DialogFooter className="pt-4 border-t border-white/5 gap-2">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            onClick={onClose}
                            className="rounded-xl border border-white/5 hover:bg-white/5"
                            disabled={loading}
                        >
                            إلغاء
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-cyan-500 text-black hover:bg-cyan-400 font-bold rounded-xl px-8 shadow-lg shadow-cyan-500/20"
                            disabled={loading}
                        >
                            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {transaction ? 'حفظ التعديلات' : 'إضافة الحركة'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
