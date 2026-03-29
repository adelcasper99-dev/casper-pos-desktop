'use client'

import { useState, useEffect } from 'react'
import { getMonthlyLogs } from '@/actions/attendance'
import { getUsersForAttendancePage } from '@/actions/hr'
import { ChevronLeft, ChevronRight, List, CalendarDays, User, Loader2 } from 'lucide-react'
import { useTranslations } from '@/lib/i18n-mock'
import { toast } from 'sonner'
import clsx from 'clsx'
import DailyAttendance from './DailyAttendance'
import EmployeeAttendanceDetail from './EmployeeAttendanceDetail'
import AttendanceGrid from './AttendanceGrid'

type AttendanceUser = {
    id: string
    name: string
    roleStr: string
    salary: number
    monthlyOffDays: number
}

type View = 'DAILY' | 'MONTHLY'

export default function AttendanceManager({ csrfToken }: { csrfToken: string }) {
    const t = useTranslations("HR.attendance")
    const [view, setView] = useState<View>('DAILY')
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
    const [selectedUserId, setSelectedUserId] = useState('')
    const [users, setUsers] = useState<AttendanceUser[]>([])
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`

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

    const prevMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    const nextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

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
                'px-8 py-3 rounded-xl flex items-center gap-3 text-sm font-black transition-all font-cairo tracking-wide',
                view === v 
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10' 
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
            )}
        >
            {icon} {label}
        </button>
    )

    return (
        <div className="space-y-8 animate-in fade-in duration-300 font-cairo">
            {/* Toolbar */}
            <div className="flex flex-col xl:flex-row gap-6 justify-between items-center bg-zinc-50 dark:bg-white/[0.02] p-6 rounded-[2rem] border border-zinc-200 dark:border-white/5 shadow-sm">
                {/* View Tabs */}
                <div className="flex gap-2 p-1.5 bg-zinc-100 dark:bg-white/5 rounded-2xl border border-zinc-200 dark:border-white/10 shadow-inner">
                    {tabBtn(t("daily"), <List className="w-5 h-5" />, 'DAILY')}
                    {tabBtn(t("monthly"), <CalendarDays className="w-5 h-5" />, 'MONTHLY')}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-4 flex-wrap w-full md:w-auto">
                    {/* Month Nav (all views) */}
                    <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-2xl p-1.5 shadow-sm">
                        <button 
                            onClick={prevMonth} 
                            className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-xl transition-all text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white active:scale-95"
                        >
                            <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
                        </button>
                        <div className="flex items-center gap-3 px-6 py-2 h-10 text-sm font-black min-w-[180px] justify-center text-zinc-900 dark:text-white bg-white dark:bg-zinc-900 rounded-xl shadow-inner border border-zinc-100 dark:border-white/5 uppercase tracking-widest">
                            <CalendarDays className="w-4 h-4 text-zinc-400" />
                            {currentDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
                        </div>
                        <button 
                            onClick={nextMonth} 
                            className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-xl transition-all text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white active:scale-95"
                        >
                            <ChevronRight className="w-5 h-5 rtl:rotate-180" />
                        </button>
                    </div>

                    {/* Daily: date picker */}
                    {view === 'DAILY' && (
                        <div className="relative group">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl h-14 px-6 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-inner tabular-nums"
                            />
                        </div>
                    )}
                </div>
            </div>

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
                                users={users}
                                dateStr={selectedDate}
                                initialLogs={dailyLogs}
                                csrfToken={csrfToken}
                            />
                        )}
                        {view === 'MONTHLY' && (
                            <AttendanceGrid
                                users={users}
                                monthStr={monthStr}
                                initialLogs={logs}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
