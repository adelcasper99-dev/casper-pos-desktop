'use client'

import { useState, useEffect } from 'react'
import GlassModal from '@/components/ui/GlassModal'
import { updateEmployeeData, getBranchesAndRoles } from '@/actions/hr'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { User, Shield, MapPin, DollarSign, Calendar, Save } from 'lucide-react'

interface EmployeeDataModalProps {
    isOpen: boolean
    onClose: () => void
    userId: string
    initialData: {
        name: string
        roleId: string
        branchId: string
        salary: number
        monthlyOffDays: number
        hireDate: string | null
    }
}

export default function EmployeeDataModal({
    isOpen,
    onClose,
    userId,
    initialData
}: EmployeeDataModalProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [branches, setBranches] = useState<{ id: string, name: string }[]>([])
    const [roles, setRoles] = useState<{ id: string, name: string }[]>([])
    
    const [formData, setFormData] = useState(initialData)

    useEffect(() => {
        if (isOpen) {
            setFormData(initialData)
            const fetchOptions = async () => {
                try {
                    const data = await getBranchesAndRoles()
                    setBranches(data.branches)
                    setRoles(data.roles)
                } catch (err) {
                    console.error("Failed to fetch branches/roles", err)
                }
            }
            fetchOptions()
        }
    }, [isOpen, initialData])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await updateEmployeeData(userId, formData)
            if (res.success) {
                toast.success('تم تحديث بيانات الموظف بنجاح')
                router.refresh()
                onClose()
            } else {
                toast.error(res.error || 'فشل تحديث البيانات')
            }
        } catch (err) {
            toast.error('حدث خطأ غير متوقع')
        } finally {
            setLoading(false)
        }
    }

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title="تعديل بيانات الموظف">
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right" dir="rtl">
                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 flex items-center gap-2 justify-end">
                            الاسم الكامل <User className="w-3 h-3" />
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    {/* Role */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 flex items-center gap-2 justify-end">
                            المسمى الوظيفي <Shield className="w-3 h-3" />
                        </label>
                        <select
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-cyan-500/50 outline-none transition-all appearance-none"
                            value={formData.roleId}
                            onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                        >
                            {roles.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Branch */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 flex items-center gap-2 justify-end">
                            الفرع <MapPin className="w-3 h-3" />
                        </label>
                        <select
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-cyan-500/50 outline-none transition-all appearance-none"
                            value={formData.branchId}
                            onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                        >
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Salary */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 flex items-center gap-2 justify-end">
                            الراتب الأساسي <DollarSign className="w-3 h-3" />
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            required
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-cyan-500/50 outline-none transition-all text-left"
                            value={formData.salary}
                            onChange={(e) => {
                                const val = e.target.value;
                                setFormData({ ...formData, salary: val === "" ? 0 : parseFloat(val) })
                            }}
                        />
                    </div>

                    {/* Off Days */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 flex items-center gap-2 justify-end">
                            الإجازات الشهرية <Calendar className="w-3 h-3" />
                        </label>
                        <input
                            type="number"
                            required
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-cyan-500/50 outline-none transition-all text-left"
                            value={formData.monthlyOffDays}
                            onChange={(e) => {
                                const val = e.target.value;
                                setFormData({ ...formData, monthlyOffDays: val === "" ? 0 : parseInt(val) })
                            }}
                        />
                    </div>

                    {/* Hire Date */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 flex items-center gap-2 justify-end">
                            تاريخ التعيين <Calendar className="w-3 h-3" />
                        </label>
                        <input
                            type="date"
                            required
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-cyan-500/50 outline-none transition-all text-right"
                            value={formData.hireDate ? formData.hireDate.split('T')[0] : ''}
                            onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                        />
                    </div>
                </div>

                <div className="pt-4 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 bg-zinc-900 border border-white/5 py-3 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all"
                    >
                        إلغاء
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-3 bg-cyan-500 text-black py-3 rounded-xl text-sm font-bold hover:bg-cyan-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                    >
                        {loading ? 'جاري الحفظ...' : (
                            <>
                                <Save className="w-4 h-4" />
                                حفظ التغييرات
                            </>
                        )}
                    </button>
                </div>
            </form>
        </GlassModal>
    )
}
