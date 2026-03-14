'use client'

import { useState } from 'react'
import { upsertDailyLog } from '@/actions/attendance'
import { MessageSquare, Save, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from '@/lib/i18n-mock'
import clsx from 'clsx'

type DailyLog = {
    userId: string
    date: string | Date
    status: string
    deduction?: number
    bonus?: number
    note?: string
    id?: string
}

type User = {
    id: string
    name: string
    roleStr: string
    monthlyOffDays: number
}

export default function EmployeeAttendanceDetail({
    user,
    monthStr,
    logs,
    onRefresh,
}: {
    user: User | null
    monthStr: string
    logs: DailyLog[]
    onRefresh: () => void
}) {
    const t = useTranslations("HR.attendance")

    if (!user) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                <p>{t("noEmployeeSelected")}</p>
            </div>
        )
    }

    const [year, month] = monthStr.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month - 1, i + 1))

    const [editingDay, setEditingDay] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({ deduction: 0, bonus: 0, note: '' })
    const [saving, setSaving] = useState(false)

    function getLog(dateStr: string): DailyLog | undefined {
        return logs.find(l => {
            const d = l.date instanceof Date
                ? l.date.toISOString().split('T')[0]
                : l.date.toString().substring(0, 10)
            return d === dateStr
        })
    }

    function startEdit(dateStr: string, log?: DailyLog) {
        setEditingDay(dateStr)
        setEditForm({ deduction: log?.deduction || 0, bonus: log?.bonus || 0, note: log?.note || '' })
    }

    async function handleSave(dateStr: string) {
        setSaving(true)
        const log = getLog(dateStr)
        const res = await upsertDailyLog({
            userId: user!.id,
            dateStr,
            data: { status: log?.status || 'PRESENT', ...editForm },
        })
        setSaving(false)
        if (res.success) {
            toast.success(t('logSaved'))
            setEditingDay(null)
            onRefresh()
        } else {
            toast.error(res.error || t('failedToSave'))
        }
    }

    const statusBadge = (status?: string) => {
        const s = status || 'PRESENT'
        const map: Record<string, string> = {
            PRESENT: 'bg-green-500/10 text-green-400 ring-green-500/20',
            ABSENT: 'bg-red-500/10 text-red-400 ring-red-500/20',
            LATE: 'bg-orange-500/10 text-orange-400 ring-orange-500/20',
            OFF: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20',
            HALF_DAY: 'bg-yellow-500/10 text-yellow-400 ring-yellow-500/20',
        }
        return `px-2 py-0.5 rounded text-xs font-bold ring-1 ring-inset ${map[s] || map.PRESENT}`
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-bold">{user.name}</h2>
                        <p className="text-zinc-400 text-sm">{user.roleStr}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t("offDayQuota")}</p>
                        <div className="flex items-center gap-2 justify-end">
                            <span className="text-2xl font-bold text-white">{user.monthlyOffDays}</span>
                            <span className="text-zinc-600">/</span>
                            <span className="text-zinc-400">30</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-card overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 uppercase text-xs text-muted-foreground">
                        <tr>
                            <th className="p-3 font-medium">{t("date")}</th>
                            <th className="p-3 font-medium">{t("status")}</th>
                            <th className="p-3 font-medium">{t("adjustments")}</th>
                            <th className="p-3 font-medium">{t("note")}</th>
                            <th className="p-3 text-right font-medium">{t("edit")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {days.map(day => {
                            const dateStr = day.toISOString().split('T')[0]
                            const log = getLog(dateStr)
                            const isEditing = editingDay === dateStr
                            const isFriday = day.getDay() === 5

                            return (
                                <tr key={dateStr} className={`hover:bg-white/[0.02] transition-colors ${isFriday ? 'bg-white/[0.01]' : ''}`}>
                                    <td className="p-3 font-mono text-xs text-foreground">
                                        {dateStr}
                                        <span className="text-muted-foreground ml-2">
                                            {day.toLocaleDateString('ar-AR', { weekday: 'short' })}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <span className={statusBadge(log?.status)}>{t(log?.status?.toLowerCase() || 'present')}</span>
                                    </td>
                                    <td className="p-3">
                                        {isEditing ? (
                                            <div className="flex gap-2">
                                                <input type="number" placeholder={t("deduction")}
                                                    className="w-20 bg-background border border-input rounded p-1 text-red-400 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                                    value={editForm.deduction}
                                                    onChange={e => setEditForm(p => ({ ...p, deduction: Number(e.target.value) }))} />
                                                <input type="number" placeholder={t("bonus")}
                                                    className="w-20 bg-background border border-input rounded p-1 text-green-400 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                                    value={editForm.bonus}
                                                    onChange={e => setEditForm(p => ({ ...p, bonus: Number(e.target.value) }))} />
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 text-xs font-medium">
                                                {(log?.deduction ?? 0) > 0 && <span className="text-red-400">-${log!.deduction}</span>}
                                                {(log?.bonus ?? 0) > 0 && <span className="text-green-400">+${log!.bonus}</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 text-muted-foreground text-xs w-1/3">
                                        {isEditing ? (
                                            <input type="text"
                                                className="w-full bg-background border border-input rounded p-1 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                                value={editForm.note}
                                                onChange={e => setEditForm(p => ({ ...p, note: e.target.value }))} />
                                        ) : log?.note}
                                    </td>
                                    <td className="p-3 text-right">
                                        {isEditing ? (
                                            <button onClick={() => handleSave(dateStr)} disabled={saving}
                                                className="text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50">
                                                <Save className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button onClick={() => startEdit(dateStr, log)}
                                                className="text-muted-foreground hover:text-primary transition-colors">
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
