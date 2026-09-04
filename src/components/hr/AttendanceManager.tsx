'use client'

import { useState, useEffect } from 'react'
import { getMonthlyLogs } from '@/actions/attendance'
import { getUsersForAttendancePage } from '@/actions/hr'
import { List, CalendarDays, Loader2 } from 'lucide-react'
import { useTranslations } from '@/lib/i18n-mock'
import { toast } from 'sonner'
import clsx from 'clsx'
import DailyAttendance from './DailyAttendance'

import AttendanceGrid from './AttendanceGrid'

type AttendanceUser = {
    id: string
    name: string
    roleStr: string
    salary: number
    monthlyOffDays: number
}

type View = 'DAILY' | 'MONTHLY'

export default function AttendanceManager({ csrfToken, filterDate }: { csrfToken: string, filterDate: Date }) {
    const t = useTranslations("HR.attendance")
    const [view, setView] = useState<View>('DAILY')
    const [selectedDate, setSelectedDate] = useState(filterDate.toISOString().split('T')[0])
    const [selectedUserId, setSelectedUserId] = useState('')
    const [users, setUsers] = useState<AttendanceUser[]>([])
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const monthStr = `${filterDate.getFullYear()}-${String(filterDate.getMonth() + 1).padStart(2, '0')}`

    const loadData = async () => {
        setLoading(true)
        try {
            const [logsRes, usersData] = await Promise.all([
                getMonthlyLogs(monthStr),
                getUsersForAttendancePage(),
            ])
            if (logsRes.success && logsRes.data) setLogs(logsRes.data)
            if (Array.isArray(usersData)) {
                setUsers(usersData)
            }
        } catch {
            toast.error(t('failedToLoadData'))
        }
        setLoading(false)
    }

    useEffect(() => { loadData() }, [monthStr])

    // Filter logs for the selected date (DAILY view)
    const dailyLogs = logs.filter(l => {
        const d = l.date instanceof Date ? l.date.toISOString().split('T')[0] : l.date.toString().substring(0, 10)
        return d === selectedDate
    })

    const selectedUser = users.find(u => u.id === selectedUserId) ?? null

    const tabBtn = (label: string, icon: React.ReactNode, v: View) => (
        <button
            onClick={() => setView(v)}
            className={clsx(
                'px-3.5 h-8 rounded-lg flex items-center gap-2 text-xs font-bold transition-all font-cairo tracking-wide',
                view === v 
                    ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs' 
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/5'
            )}
        >
            {icon} {label}
        </button>
    )

    return (
        <div className="space-y-2.5 animate-in fade-in duration-300 font-cairo">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-2.5 justify-between items-center bg-zinc-50/80 dark:bg-white/[0.02] p-2 px-3 rounded-xl border border-zinc-200/80 dark:border-white/5 shadow-xs">
                {/* View Tabs */}
                <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-inner">
                    {tabBtn(t("daily"), <List className="w-3.5 h-3.5" />, 'DAILY')}
                    {tabBtn(t("monthly"), <CalendarDays className="w-3.5 h-3.5" />, 'MONTHLY')}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                    {/* Daily: date picker */}
                    {view === 'DAILY' && (
                        <div className="relative group">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 rounded-lg h-8 px-3 text-zinc-900 dark:text-white font-bold text-xs outline-none focus:ring-1 focus:ring-primary/50 transition-all shadow-xs tabular-nums"
                            />
                        </div>
                    )}
                </div>
            </div>

            {users.length >= 500 && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 p-4 rounded-2xl flex items-center gap-3 text-sm font-black uppercase tracking-widest shadow-inner">
                    ⚠️ تم الوصول للحد الأقصى للعرض (500 موظف). يرجى البحث أو استخدام الفلاتر.
                </div>
            )}

            {/* Content area */}
            <div className="min-h-[400px]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-80 gap-4">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full border-4 border-zinc-200 dark:border-white/5 border-t-primary animate-spin" />
                            <Loader2 className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <p className="text-zinc-500 font-black uppercase tracking-widest text-[10px] animate-pulse">جاري تحميل البيانات...</p>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {view === 'DAILY' && (
                            <DailyAttendance
                                key={`daily-${selectedDate}`}
                                users={users}
                                dateStr={selectedDate}
                                initialLogs={dailyLogs}
                                csrfToken={csrfToken}
                                refreshData={loadData}
                            />
                        )}
                        {view === 'MONTHLY' && (
                            <AttendanceGrid
                                key={`monthly-${monthStr}`}
                                users={users}
                                monthStr={monthStr}
                                initialLogs={logs}
                                csrfToken={csrfToken}
                                refreshData={loadData}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
