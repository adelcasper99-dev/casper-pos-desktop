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

    const tabBtn = (label: string, icon: React.ReactNode, v: View, color: string) => (
        <button
            onClick={() => setView(v)}
            className={clsx(
                'px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold transition-all',
                view === v ? `${color} text-black shadow-sm` : 'text-zinc-400 hover:text-white hover:bg-white/5'
            )}
        >
            {icon} {label}
        </button>
    )

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-3 items-center justify-between bg-card p-3 rounded-xl border border-white/5">
                {/* View Tabs */}
                <div className="flex gap-1 bg-black/30 p-1 rounded-lg">
                    {tabBtn(t("daily"), <List className="w-4 h-4" />, 'DAILY', 'bg-cyan-500')}
                    {tabBtn(t("monthly"), <CalendarDays className="w-4 h-4" />, 'MONTHLY', 'bg-purple-500')}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Month Nav (all views) */}
                    <div className="flex items-center gap-1 bg-black/30 rounded-lg p-1">
                        <button onClick={prevMonth} className="p-1.5 hover:bg-white/10 rounded transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium min-w-[110px] text-center">
                            {currentDate.toLocaleDateString('ar-AR', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={nextMonth} className="p-1.5 hover:bg-white/10 rounded transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Daily: date picker */}
                    {view === 'DAILY' && (
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="bg-black border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
                        />
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="min-h-[400px]">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <>
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
                    </>
                )}
            </div>
        </div>
    )
}
