import { useState, useRef, useEffect } from 'react'
import { upsertDailyLog } from '@/actions/attendance'
import { Check, X, Clock, Coffee, DollarSign, Save } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useTranslations } from '@/lib/i18n-mock'

type User = {
    id: string
    name: string
    roleStr: string
    monthlyOffDays: number
}

type DailyLog = {
    userId: string
    status: string
    note?: string
    bonusNote?: string
    deductionNote?: string
    bonus?: number
    deduction?: number
    checkIn?: string
    checkOut?: string
    shift?: string
}

function PlusIcon({ className }: { className?: string }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}

function MinusIcon({ className }: { className?: string }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
}

export default function DailyAttendance({
    users,
    dateStr,
    initialLogs,
    csrfToken,
    refreshData,
}: {
    users: User[]
    dateStr: string
    initialLogs: DailyLog[]
    csrfToken: string
    refreshData?: () => void
}) {
    const t = useTranslations("HR.attendance")

    const [logs, setLogs] = useState<Record<string, DailyLog>>(() => {
        const map: Record<string, DailyLog> = {}
        initialLogs.forEach(log => { if (log.userId) map[log.userId] = log })
        return map
    })

    const [loadingId, setLoadingId] = useState<string | null>(null)
    const [lateEntryUserId, setLateEntryUserId] = useState<string | null>(null)
    const [lateTime, setLateTime] = useState('')
    const [financialUserId, setFinancialUserId] = useState<string | null>(null)
    const [financials, setFinancials] = useState({ 
        bonus: '0', 
        bonusNote: '',
        deduction: '0', 
        deductionNote: '',
        shift: 'DAY' 
    })

    const previousStates = useRef<Record<string, DailyLog | undefined>>({})
    const pendingTimeouts = useRef<Record<string, NodeJS.Timeout>>({})

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            Object.values(pendingTimeouts.current).forEach(clearTimeout)
        }
    }, [])

    const handleStatusChange = (userId: string, newStatus: string, additionalData?: Record<string, unknown>) => {
        // Save prev state if not already pending
        if (!pendingTimeouts.current[userId]) {
            previousStates.current[userId] = logs[userId] ? { ...logs[userId] } : undefined
        }

        // Clear existing timeout
        if (pendingTimeouts.current[userId]) {
            clearTimeout(pendingTimeouts.current[userId])
        }

        // Optimistic update
        setLogs(prev => ({
            ...prev,
            [userId]: {
                userId,
                status: newStatus,
                note: (additionalData?.note as string) ?? prev[userId]?.note,
                bonusNote: (additionalData?.bonusNote as string) ?? prev[userId]?.bonusNote,
                deductionNote: (additionalData?.deductionNote as string) ?? prev[userId]?.deductionNote,
                bonus: additionalData?.bonus !== undefined ? Number(additionalData.bonus) : prev[userId]?.bonus,
                deduction: additionalData?.deduction !== undefined ? Number(additionalData.deduction) : prev[userId]?.deduction,
                shift: (additionalData?.shift as string) ?? prev[userId]?.shift,
                checkIn: (additionalData?.checkIn as string) ?? prev[userId]?.checkIn,
                checkOut: (additionalData?.checkOut as string) ?? prev[userId]?.checkOut,
            },
        }))

        setLateEntryUserId(null)
        setFinancialUserId(null)

        // Show undo toast
        toast.success(`تم التحديث: ${t(newStatus.toLowerCase()) || newStatus}`, {
            duration: 5000,
            action: {
                label: 'تراجع',
                onClick: () => {
                    if (pendingTimeouts.current[userId]) {
                        clearTimeout(pendingTimeouts.current[userId])
                        delete pendingTimeouts.current[userId]
                    }
                    setLogs(prev => {
                        const newLogs = { ...prev }
                        if (previousStates.current[userId]) {
                            newLogs[userId] = previousStates.current[userId]!
                        } else {
                            delete newLogs[userId]
                        }
                        return newLogs
                    })
                    toast('تم التراجع عن الإجراء')
                }
            }
        })

        // Execute after 5s
        pendingTimeouts.current[userId] = setTimeout(async () => {
            setLoadingId(userId)
            const res = await upsertDailyLog({ userId, dateStr, data: { status: newStatus, ...additionalData }, csrfToken })
            if (!res.success) {
                toast.error('Failed to save attendance')
                // Revert on failure
                setLogs(prev => {
                    const newLogs = { ...prev }
                    if (previousStates.current[userId]) {
                        newLogs[userId] = previousStates.current[userId]!
                    } else {
                        delete newLogs[userId]
                    }
                    return newLogs
                })
            }
            setLoadingId(null)
            delete pendingTimeouts.current[userId]
            delete previousStates.current[userId]
            if (res.success && refreshData) {
                refreshData()
            }
        }, 1000)
    }

    const openFinancials = (userId: string, currentLog?: DailyLog) => {
        setFinancialUserId(userId)
        setFinancials({
            bonus: currentLog?.bonus?.toString() || '0',
            bonusNote: currentLog?.bonusNote || '',
            deduction: currentLog?.deduction?.toString() || '0',
            deductionNote: currentLog?.deductionNote || '',
            shift: currentLog?.shift || 'DAY',
        })
        setLateEntryUserId(null)
    }

    const handleQuickAdjustment = (userId: string, type: 'BONUS' | 'DEDUCTION') => {
        const currentLog = logs[userId]
        const amount = 50
        if (type === 'BONUS') {
            const newVal = (Number(currentLog?.bonus || 0) + amount).toString()
            handleStatusChange(userId, currentLog?.status || 'PRESENT', { bonus: newVal })
        } else {
            const newVal = (Number(currentLog?.deduction || 0) + amount).toString()
            handleStatusChange(userId, currentLog?.status || 'PRESENT', { deduction: newVal })
        }
    }

    const saveFinancials = (userId: string) => {
        const currentLog = logs[userId]
        handleStatusChange(userId, currentLog?.status || 'PRESENT', {
            bonus: financials.bonus,
            bonusNote: financials.bonusNote,
            deduction: financials.deduction,
            deductionNote: financials.deductionNote,
            shift: financials.shift,
        })
        setFinancialUserId(null)
    }

    const presentCount = Object.values(logs).filter(l => l.status === 'PRESENT').length + (users.length - Object.keys(logs).length)
    const absentCount = Object.values(logs).filter(l => l.status === 'ABSENT').length

    return (
        <div className="space-y-2.5 animate-in fade-in duration-200">
            {/* Popover Backdrop */}
            {(lateEntryUserId || financialUserId) && (
                <div 
                    className="fixed inset-0 z-40"
                    onClick={() => {
                        setLateEntryUserId(null)
                        setFinancialUserId(null)
                    }}
                />
            )}
            {/* Compact Header */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-zinc-50/80 dark:bg-zinc-900/40 p-2.5 px-3.5 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-xs font-cairo gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs">
                        <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                            {t("title")}
                            <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                                ({dateStr} — {new Date(dateStr + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long' })})
                            </span>
                        </h2>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 rounded-lg p-1 shadow-inner">
                    <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 shadow-xs">
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-500" />
                        <span className="text-[11px] font-black uppercase text-emerald-600 dark:text-emerald-500 font-cairo">
                            {t("present")}: <span className="font-mono tabular-nums">{presentCount}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-rose-500/10 border border-rose-500/20 shadow-xs">
                        <X className="w-3 h-3 text-rose-600 dark:text-rose-500" />
                        <span className="text-[11px] font-black uppercase text-rose-600 dark:text-rose-500 font-cairo">
                            {t("absent")}: <span className="font-mono tabular-nums">{absentCount}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Attendance Table */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-white/10 rounded-xl overflow-hidden shadow-xs font-cairo">
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] custom-scrollbar">
                    <table className="w-full border-collapse text-right zebra-table" dir="rtl">
                        <thead className="sticky top-0 z-20 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs border-b border-zinc-200/80 dark:border-white/10">
                            <tr>
                                <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("employee")}</th>
                                <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-center">{t("presence")}</th>
                                <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-center">{t("adjustments")}</th>
                                <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-center">{t("status")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200/80 dark:divide-white/[0.04]">
                            {users.map(user => {
                                const currentStatus = logs[user.id]?.status || 'PRESENT'
                                const currentLog = logs[user.id]
                                const isLoading = loadingId === user.id
                                const hasFinancials = (currentLog?.bonus || 0) > 0 || (currentLog?.deduction || 0) > 0

                                const avatarColor =
                                    currentStatus === 'PRESENT' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                                    currentStatus === 'ABSENT' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' :
                                    currentStatus === 'LATE' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                                    'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-white/10'

                                return (
                                    <tr key={user.id} className="group hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                                        {/* 1. Employee Info */}
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-black ${avatarColor}`}>
                                                    {(user.name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap text-right">
                                                        <span className="font-bold text-xs text-zinc-900 dark:text-white leading-tight">{user.name}</span>
                                                        <span className="text-[10px] font-semibold text-zinc-400">· {user.roleStr}</span>
                                                        {((currentLog?.bonus || 0) > 0) && (
                                                            <span className="text-[9px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/20 font-mono">
                                                                +{currentLog?.bonus}
                                                            </span>
                                                        )}
                                                        {((currentLog?.deduction || 0) > 0) && (
                                                            <span className="text-[9px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 px-1.5 py-0.2 rounded border border-rose-500/20 font-mono">
                                                                -{currentLog?.deduction}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {(currentLog?.bonusNote || currentLog?.deductionNote || currentLog?.note) && (
                                                        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-zinc-400">
                                                            {currentLog?.deductionNote && <span className="text-rose-500 truncate max-w-[150px]">خصم: {currentLog.deductionNote}</span>}
                                                            {currentLog?.bonusNote && <span className="text-emerald-500 truncate max-w-[150px]">مكافأة: {currentLog.bonusNote}</span>}
                                                            {currentLog?.note && <span className="italic truncate max-w-[150px]">ملاحظة: {currentLog.note}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* 2. Presence Toggles */}
                                        <td className="px-3 py-1.5 text-center whitespace-nowrap">
                                            <div className="inline-flex items-center gap-0.5 p-0.5 bg-zinc-100 dark:bg-zinc-900/60 rounded-lg border border-zinc-200/80 dark:border-white/10 shadow-inner">
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'PRESENT')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "w-7 h-7 rounded-md flex items-center justify-center transition-all active:scale-95",
                                                        currentStatus === 'PRESENT'
                                                            ? "bg-emerald-500 text-black shadow-xs font-bold"
                                                            : "hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-500"
                                                    )}
                                                    title={t("present")}
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'ABSENT')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "w-7 h-7 rounded-md flex items-center justify-center transition-all active:scale-95",
                                                        currentStatus === 'ABSENT'
                                                            ? "bg-rose-500 text-white shadow-xs font-bold"
                                                            : "hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500"
                                                    )}
                                                    title={t("absent")}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (lateEntryUserId === user.id) setLateEntryUserId(null)
                                                        else { setLateEntryUserId(user.id); setLateTime(""); setFinancialUserId(null); }
                                                    }}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "w-7 h-7 rounded-md flex items-center justify-center transition-all active:scale-95 relative",
                                                        currentStatus === 'LATE'
                                                            ? "bg-amber-500 text-black shadow-xs font-bold"
                                                            : "hover:bg-amber-500/10 text-zinc-400 hover:text-amber-500"
                                                    )}
                                                    title={t("late")}
                                                >
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {lateEntryUserId === user.id && (
                                                        <div className="absolute bottom-full right-0 mb-1.5 z-50 bg-zinc-950 border border-white/15 p-2 rounded-xl shadow-2xl flex items-center gap-1.5 min-w-[200px] animate-in slide-in-from-bottom-1 text-right">
                                                            <input
                                                                type="text"
                                                                autoFocus
                                                                placeholder="السبب / الوقت"
                                                                className="bg-zinc-900 border border-white/10 rounded-lg h-7 px-2 text-xs text-white w-full outline-none focus:ring-1 focus:ring-amber-500/50"
                                                                value={lateTime}
                                                                onChange={e => setLateTime(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && handleStatusChange(user.id, 'LATE', { note: lateTime })}
                                                            />
                                                            <button 
                                                                className="h-7 w-7 shrink-0 rounded-lg bg-amber-500 text-black flex items-center justify-center active:scale-95 transition-transform" 
                                                                onClick={() => handleStatusChange(user.id, 'LATE', { note: lateTime })}
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'OFF')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "w-7 h-7 rounded-md flex items-center justify-center transition-all active:scale-95",
                                                        currentStatus === 'OFF'
                                                            ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs font-bold"
                                                            : "hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                                                    )}
                                                    title={t("offday")}
                                                >
                                                    <Coffee className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>

                                        {/* 3. Financial Action */}
                                        <td className="px-3 py-1.5 text-center whitespace-nowrap">
                                            <div className="relative inline-flex items-center justify-center">
                                                <button
                                                    onClick={() => openFinancials(user.id, currentLog)}
                                                    className={clsx(
                                                        "w-7 h-7 rounded-lg border transition-all active:scale-95 flex items-center justify-center shadow-xs",
                                                        financialUserId === user.id ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent" :
                                                        (currentLog?.note || hasFinancials) ? 
                                                            "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20" : 
                                                            "bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                                                    )}
                                                    title={t("adjustments")}
                                                >
                                                    <DollarSign className="w-3.5 h-3.5" />
                                                    {(currentLog?.note || hasFinancials) && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-500 rounded-full border border-white dark:border-zinc-950" />}
                                                </button>
                                                {financialUserId === user.id && (
                                                    <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-white/15 p-3 rounded-xl shadow-2xl w-64 animate-in slide-in-from-top-1 text-right">
                                                        <div className="space-y-2.5">
                                                            <div className="flex justify-between items-center border-b border-zinc-100 dark:border-white/5 pb-1.5">
                                                                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">{t("adjustments")} ({user.name})</span>
                                                                <button onClick={() => setFinancialUserId(null)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>
                                                            </div>

                                                            <div className="flex gap-1.5">
                                                                <button 
                                                                    onClick={() => handleQuickAdjustment(user.id, 'BONUS')}
                                                                    className="flex-1 h-7 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-bold transition-all"
                                                                >
                                                                    + 50 {t("bonus")}
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleQuickAdjustment(user.id, 'DEDUCTION')}
                                                                    className="flex-1 h-7 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg text-[10px] font-bold transition-all"
                                                                >
                                                                    - 50 {t("deduction")}
                                                                </button>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="space-y-1">
                                                                    <Label className="text-[9px] font-bold text-zinc-400 px-0.5">{t("bonus")}</Label>
                                                                    <Input type="number" value={financials.bonus} onChange={e => setFinancials(p => ({ ...p, bonus: e.target.value }))} className="h-7 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-500/50" />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <Label className="text-[9px] font-bold text-zinc-400 px-0.5">{t("deduction")}</Label>
                                                                    <Input type="number" value={financials.deduction} onChange={e => setFinancials(p => ({ ...p, deduction: e.target.value }))} className="h-7 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-rose-500/50" />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-1.5">
                                                                <div className="space-y-0.5">
                                                                    <Label className="text-[9px] font-bold text-zinc-400 px-0.5">{t("reason")} ({t("bonus")})</Label>
                                                                    <Input value={financials.bonusNote} onChange={e => setFinancials(p => ({ ...p, bonusNote: e.target.value }))} placeholder="..." className="h-7 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 rounded-lg text-xs font-medium" />
                                                                </div>
                                                                <div className="space-y-0.5">
                                                                    <Label className="text-[9px] font-bold text-zinc-400 px-0.5">{t("reason")} ({t("deduction")})</Label>
                                                                    <Input value={financials.deductionNote} onChange={e => setFinancials(p => ({ ...p, deductionNote: e.target.value }))} placeholder="..." className="h-7 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 rounded-lg text-xs font-medium" />
                                                                </div>
                                                            </div>

                                                            <button className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-1 rounded-lg transition-all shadow-xs active:scale-95 text-xs h-7 flex items-center justify-center gap-1.5" onClick={() => saveFinancials(user.id)}>
                                                                <Save className="w-3.5 h-3.5" />
                                                                {t("save")}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* 4. Status Badge */}
                                        <td className="px-3 py-1.5 text-center whitespace-nowrap">
                                            <span className={clsx(
                                                "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border",
                                                currentStatus === 'PRESENT' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                                                currentStatus === 'ABSENT' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' :
                                                currentStatus === 'LATE' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 
                                                'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/5'
                                            )}>
                                                {t(currentStatus.toLowerCase())}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
