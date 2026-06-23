'use client'

import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import { upsertDailyLog } from '@/actions/attendance'
import { Check, X, Clock, Coffee, DollarSign, AlertCircle } from 'lucide-react'
import { useTranslations } from '@/lib/i18n-mock'

function getDaysInMonth(monthStr: string): Date[] {
    const [year, month] = monthStr.split('-').map(Number)
    const date = new Date(year, month - 1, 1)
    const days: Date[] = []
    while (date.getMonth() === month - 1) {
        days.push(new Date(date))
        date.setDate(date.getDate() + 1)
    }
    return days
}

type AttendanceUser = {
    id: string
    name: string
    monthlyOffDays: number
    salary?: number
}

export default function AttendanceGrid({
    users,
    monthStr,
    initialLogs,
    csrfToken,
    refreshData,
}: {
    users: AttendanceUser[]
    monthStr: string
    initialLogs: any[]
    csrfToken: string
    refreshData?: () => void
}) {
    const t = useTranslations("HR.attendance")
    const days = getDaysInMonth(monthStr)

    const [logs, setLogs] = useState<Record<string, any>>(() => {
        const map: Record<string, any> = {}
        initialLogs.forEach(log => {
            const dateKey = log.date instanceof Date
                ? log.date.toISOString().split('T')[0]
                : log.date.toString().substring(0, 10)
            map[`${log.userId}:${dateKey}`] = log
        })
        return map
    })

    async function handleCellClick(userId: string, dateStr: string) {
        const key = `${userId}:${dateStr}`
        const current = logs[key]?.status || 'PRESENT'
        const cycle: Record<string, string> = { PRESENT: 'ABSENT', ABSENT: 'OFF', OFF: 'PRESENT' }
        const next = cycle[current] ?? 'PRESENT'

        setLogs(prev => ({ ...prev, [key]: { ...prev[key], status: next } }))
        const res = await upsertDailyLog({ userId, dateStr, data: { status: next }, csrfToken })
        if (!res.success) {
            setLogs(prev => ({ ...prev, [key]: { ...prev[key], status: current } }))
        } else if (refreshData) {
            refreshData()
        }
    }

    const totalProjectedCost = useMemo(() => {
        return users.reduce((acc, user) => {
            const baseSalary = user.salary || 0
            if (baseSalary === 0) return acc
            const dailyRate = baseSalary / 30
            let adjustments = 0
            let offDays = 0

            days.forEach(day => {
                const dateKey = day.toISOString().split('T')[0]
                const log = logs[`${user.id}:${dateKey}`]
                if (log) {
                    if (log.status === 'ABSENT') adjustments -= dailyRate
                    if (log.status === 'OFF') offDays++
                    if (log.deduction) adjustments -= Number(log.deduction)
                    if (log.bonus) adjustments += Number(log.bonus)
                }
            })

            if (offDays > user.monthlyOffDays) {
                adjustments -= (offDays - user.monthlyOffDays) * dailyRate
            }

            return acc + Math.max(0, baseSalary + adjustments)
        }, 0)
    }, [users, days, logs])

    const cellStyle = (status: string) => clsx(
        'w-8 h-8 mx-auto rounded-md flex items-center justify-center transition-all duration-150 relative select-none',
        status === 'PRESENT' && 'bg-green-500/10 text-green-500 hover:bg-green-500/20 hover:scale-110',
        status === 'ABSENT' && 'bg-red-500/20 text-red-400',
        status === 'OFF' && 'bg-zinc-700 text-zinc-300',
        status === 'LATE' && 'bg-orange-500/20 text-orange-400',
    )

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Projected Cost Banner */}
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3 flex items-center justify-between text-cyan-400">
                <span className="text-sm font-medium uppercase tracking-wider">{t("projectedPayrollCost")}</span>
                <span className="font-mono font-bold text-lg">
                    {totalProjectedCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </span>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs text-muted-foreground px-1">
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-500/30 rounded-sm" /> {t("present")}</span>
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-500/30 rounded-sm" /> {t("absent")}</span>
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-zinc-700 rounded-sm" /> {t("off")}</span>
                <span className="flex items-center gap-1.5 ml-auto text-muted-foreground italic">{t("clickToCycle")}</span>
            </div>

            {/* Grid */}
            <div className="rounded-xl border border-white/5 bg-card overflow-x-auto shadow-sm">
                <table className="w-full text-center border-collapse text-sm">
                    <thead>
                        <tr>
                            <th className="p-3 text-left sticky left-0 z-20 bg-card/95 backdrop-blur-sm min-w-[160px] border-b border-white/5 shadow-[4px_0_10px_rgba(0,0,0,0.1)]">
                                {t("individual")}
                            </th>
                            {days.map(day => (
                                <th key={day.toISOString()} className="min-w-[38px] border-b border-white/5 bg-white/[0.02] p-1">
                                    <div className="flex flex-col items-center">
                                        <span className="font-bold text-foreground text-xs">{day.getDate()}</span>
                                        <span className="text-[10px] opacity-50">{day.toLocaleDateString('ar-AR', { weekday: 'narrow' })}</span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {users.map(user => {
                            let offCount = 0
                            days.forEach(d => {
                                const k = `${user.id}:${d.toISOString().split('T')[0]}`
                                if (logs[k]?.status === 'OFF') offCount++
                            })
                            const overQuota = offCount > user.monthlyOffDays

                            return (
                                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="p-3 text-left sticky left-0 z-10 bg-card/95 backdrop-blur-sm border-r border-white/5 shadow-[4px_0_10px_rgba(0,0,0,0.05)]">
                                        <div className="font-semibold text-sm whitespace-nowrap">{user.name}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            {overQuota && <AlertCircle className="w-3 h-3 text-red-400" />}
                                            {t("offDayQuota")}: <span className={overQuota ? 'text-red-400 font-bold' : ''}>{offCount}</span>/{user.monthlyOffDays}
                                        </div>
                                    </td>
                                    {days.map(day => {
                                        const dateStr = day.toISOString().split('T')[0]
                                        const key = `${user.id}:${dateStr}`
                                        const status = logs[key]?.status || 'PRESENT'
                                        const hasMoney = (logs[key]?.bonus > 0 || logs[key]?.deduction > 0)

                                        return (
                                            <td
                                                key={dateStr}
                                                onClick={() => handleCellClick(user.id, dateStr)}
                                                className="p-1 cursor-pointer border-r border-white/[0.03] last:border-0"
                                            >
                                                <div className={cellStyle(status)}>
                                                    {status === 'PRESENT' && <Check className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                                    {status === 'ABSENT' && <X className="w-3.5 h-3.5" />}
                                                    {status === 'OFF' && <Coffee className="w-3.5 h-3.5" />}
                                                    {status === 'LATE' && <Clock className="w-3.5 h-3.5" />}
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
