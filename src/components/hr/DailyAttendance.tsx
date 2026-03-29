import { useState, useTransition } from 'react'
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
}: {
    users: User[]
    dateStr: string
    initialLogs: DailyLog[]
    csrfToken: string
}) {
    const t = useTranslations("HR.attendance")
    const [isPending, startTransition] = useTransition()
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

    async function handleStatusChange(userId: string, newStatus: string, additionalData?: Record<string, unknown>) {
        setLoadingId(userId)
        setLateEntryUserId(null)
        setFinancialUserId(null)

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

        const res = await upsertDailyLog({ userId, dateStr, data: { status: newStatus, ...additionalData }, csrfToken })
        if (!res.success) toast.error('Failed to save attendance')
        setLoadingId(null)
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
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-zinc-50 dark:bg-zinc-900/40 p-6 rounded-[2rem] border border-zinc-200 dark:border-white/10 shadow-sm font-cairo gap-6">
                <div className="flex flex-col gap-1 items-center md:items-start text-center md:text-right">
                    <h2 className="text-3xl font-black flex items-center gap-3 text-zinc-900 dark:text-white uppercase tracking-tight">
                        <div className="p-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/20">
                            <Clock className="w-6 h-6" />
                        </div>
                        {t("title")}
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm font-bold mt-1 tracking-wide">
                        {dateStr} — {new Date(dateStr + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long' })}
                    </p>
                </div>
                <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl p-2 shadow-inner">
                    <div className="flex items-center gap-2 px-6 py-2 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-sm">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                        <span className="text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500 font-cairo">
                            {t("present")}: <span className="text-sm font-mono ml-1 tabular-nums">{presentCount}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2 px-6 py-2 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 shadow-sm">
                        <X className="w-4 h-4 text-rose-600 dark:text-rose-500" />
                        <span className="text-[11px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-500 font-cairo">
                            {t("absent")}: <span className="text-sm font-mono ml-1 tabular-nums">{absentCount}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Attendance Table */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-[2.5rem] overflow-hidden shadow-sm font-cairo">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full border-collapse text-right zebra-table" dir="rtl">
                        <thead>
                            <tr className="bg-zinc-100/50 dark:bg-white/[0.03] border-b-2 border-zinc-200 dark:border-white/5">
                                <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">{t("employee")}</th>
                                <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] text-center">{t("presence")}</th>
                                <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] text-center">{t("adjustments")}</th>
                                <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] text-center">{t("status")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-white/[0.04]">
                            {users.map(user => {
                                const currentStatus = logs[user.id]?.status || 'PRESENT'
                                const currentLog = logs[user.id]
                                const isLoading = loadingId === user.id
                                const hasFinancials = (currentLog?.bonus || 0) > 0 || (currentLog?.deduction || 0) > 0

                                const avatarColor =
                                    currentStatus === 'PRESENT' ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]' :
                                    currentStatus === 'ABSENT' ? 'bg-red-500 text-black shadow-[0_0_15px_rgba(239,68,68,0.3)]' :
                                    currentStatus === 'LATE' ? 'bg-orange-500 text-black shadow-[0_0_15px_rgba(249,115,22,0.3)]' :
                                    'bg-zinc-600 text-white'

                                return (
                                    <tr key={user.id} className="group hover:bg-zinc-100 dark:hover:bg-white/[0.03] transition-all duration-300">
                                        {/* 1. Employee Info */}
                                        <td className="px-6 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 shrink-0 rounded-[1rem] flex items-center justify-center text-sm font-black transition-all group-hover:scale-110 group-hover:rotate-6 ${avatarColor}`}>
                                                    {(user.name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 space-y-0.5">
                                                    <div className="flex items-center gap-3 flex-wrap text-right">
                                                        <p className="font-black text-base tracking-tight text-zinc-900 dark:text-white leading-none">{user.name}</p>
                                                        {((currentLog?.bonus || 0) > 0) && (
                                                            <span className="text-[10px] font-black bg-emerald-500 text-black px-2 py-0.5 rounded-lg shadow-lg shadow-emerald-500/10 uppercase tracking-widest">
                                                                +{currentLog?.bonus}
                                                            </span>
                                                        )}
                                                        {((currentLog?.deduction || 0) > 0) && (
                                                            <span className="text-[10px] font-black bg-rose-500 text-white px-2 py-0.5 rounded-lg shadow-lg shadow-rose-500/10 uppercase tracking-widest">
                                                                -{currentLog?.deduction}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{user.roleStr}</p>
                                                    {(currentLog?.bonusNote || currentLog?.deductionNote || currentLog?.note) && (
                                                        <div className="flex flex-col gap-1 mt-2">
                                                            {((currentLog?.deduction || 0) > 0) && currentLog?.deductionNote && (
                                                                <div className="text-[9px] font-black bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded-lg flex items-center gap-2 w-fit uppercase tracking-widest">
                                                                    <div className="w-1 h-1 rounded-full bg-rose-500" />
                                                                    <span>{currentLog.deductionNote}</span>
                                                                </div>
                                                            )}
                                                            {((currentLog?.bonus || 0) > 0) && currentLog?.bonusNote && (
                                                                <div className="text-[9px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-lg flex items-center gap-2 w-fit uppercase tracking-widest">
                                                                    <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                                                    <span>{currentLog.bonusNote}</span>
                                                                </div>
                                                            )}
                                                            {currentLog?.note && (
                                                                <div className="text-[9px] font-black bg-zinc-500/10 border border-zinc-500/20 text-zinc-500 dark:text-zinc-400 px-2.5 py-1 rounded-lg flex items-center gap-2 w-fit uppercase tracking-widest italic">
                                                                    <span>{currentLog.note}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>



                                        {/* 3. Presence Toggles */}
                                        <td className="px-6 py-6 text-center">
                                            <div className="flex items-center justify-center gap-2 p-2 bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-white/5 w-fit mx-auto shadow-inner">
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'PRESENT')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "p-3 rounded-xl transition-all active:scale-90",
                                                        currentStatus === 'PRESENT'
                                                            ? "bg-emerald-500 text-black shadow-xl shadow-emerald-500/20 scale-110 rotate-3"
                                                            : "hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-500"
                                                    )}
                                                    title={t("present")}
                                                >
                                                    <Check className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'ABSENT')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "p-3 rounded-xl transition-all active:scale-90",
                                                        currentStatus === 'ABSENT'
                                                            ? "bg-rose-500 text-white shadow-xl shadow-rose-500/20 scale-110 rotate-3"
                                                            : "hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500"
                                                    )}
                                                    title={t("absent")}
                                                >
                                                    <X className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (lateEntryUserId === user.id) setLateEntryUserId(null)
                                                        else { setLateEntryUserId(user.id); setLateTime(""); setFinancialUserId(null); }
                                                    }}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "p-3 rounded-xl transition-all active:scale-90 relative",
                                                        currentStatus === 'LATE'
                                                            ? "bg-amber-500 text-black shadow-xl shadow-amber-500/20 scale-110 rotate-3"
                                                            : "hover:bg-amber-500/10 text-zinc-400 hover:text-amber-500"
                                                    )}
                                                    title={t("late")}
                                                >
                                                    <Clock className="w-5 h-5" />
                                                    {lateEntryUserId === user.id && (
                                                        <div className="absolute bottom-full right-0 mb-4 z-50 bg-zinc-950 border border-white/10 p-4 rounded-[1.5rem] shadow-2xl flex items-center gap-3 min-w-[220px] animate-in slide-in-from-bottom-3">
                                                            <input
                                                                type="text"
                                                                autoFocus
                                                                placeholder="السبب / الوقت"
                                                                className="bg-zinc-900 border border-white/5 rounded-xl h-12 px-4 text-xs text-white w-full outline-none focus:ring-2 focus:ring-amber-500/50"
                                                                value={lateTime}
                                                                onChange={e => setLateTime(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && handleStatusChange(user.id, 'LATE', { note: lateTime })}
                                                            />
                                                            <button 
                                                                className="h-12 w-12 shrink-0 rounded-xl bg-amber-500 text-black flex items-center justify-center active:scale-95 transition-transform" 
                                                                onClick={() => handleStatusChange(user.id, 'LATE', { note: lateTime })}
                                                            >
                                                                <Check className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'OFF')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "p-3 rounded-xl transition-all active:scale-90",
                                                        currentStatus === 'OFF'
                                                            ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10 scale-110 -rotate-3"
                                                            : "hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                                                    )}
                                                    title={t("offday")}
                                                >
                                                    <Coffee className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>

                                        {/* 4. Financial Action */}
                                        <td className="px-6 py-6 text-center">
                                            <div className="flex items-center justify-center gap-3">
                                                <div className="relative">
                                                    <button
                                                        onClick={() => openFinancials(user.id, currentLog)}
                                                        className={clsx(
                                                            "w-12 h-12 rounded-2xl border transition-all duration-300 active:scale-95 flex items-center justify-center shadow-lg group/pay",
                                                            financialUserId === user.id ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent shadow-zinc-900/20" :
                                                            (currentLog?.note || hasFinancials) ? 
                                                                "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20" : 
                                                                "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                                                        )}
                                                    >
                                                        <DollarSign className="w-6 h-6" />
                                                        {(currentLog?.note) && <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-white dark:border-zinc-950" />}
                                                    </button>
                                                    {financialUserId === user.id && (
                                                        <div className="absolute top-full left-0 mt-4 z-50 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 p-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] w-[320px] animate-in slide-in-from-top-4 text-right">
                                                            <div className="space-y-5">
                                                                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-white/5 pb-3">
                                                                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">{t("adjustments")}</span>
                                                                    <button onClick={() => setFinancialUserId(null)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                                                                </div>

                                                                <div className="flex gap-2">
                                                                    <button 
                                                                        onClick={() => handleQuickAdjustment(user.id, 'BONUS')}
                                                                        className="flex-1 h-12 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                                                                    >
                                                                        + {t("bonus")}
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleQuickAdjustment(user.id, 'DEDUCTION')}
                                                                        className="flex-1 h-12 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                                                                    >
                                                                        - {t("deduction")}
                                                                    </button>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest px-1">{t("bonus")}</Label>
                                                                        <Input type="number" value={financials.bonus} onChange={e => setFinancials(p => ({ ...p, bonus: e.target.value }))} className="h-12 bg-zinc-50 dark:bg-zinc-900 border-none rounded-xl text-sm font-black focus:ring-2 focus:ring-emerald-500/50 shadow-inner" />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest px-1">{t("deduction")}</Label>
                                                                        <Input type="number" value={financials.deduction} onChange={e => setFinancials(p => ({ ...p, deduction: e.target.value }))} className="h-12 bg-zinc-50 dark:bg-zinc-900 border-none rounded-xl text-sm font-black focus:ring-2 focus:ring-rose-500/50 shadow-inner" />
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-4">
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest px-1">{t("reason")} ({t("bonus")})</Label>
                                                                        <Input value={financials.bonusNote} onChange={e => setFinancials(p => ({ ...p, bonusNote: e.target.value }))} placeholder="..." className="h-12 bg-zinc-50 dark:bg-zinc-900 border-none rounded-xl text-sm font-black shadow-inner" />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest px-1">{t("reason")} ({t("deduction")})</Label>
                                                                        <Input value={financials.deductionNote} onChange={e => setFinancials(p => ({ ...p, deductionNote: e.target.value }))} placeholder="..." className="h-12 bg-zinc-50 dark:bg-zinc-900 border-none rounded-xl text-sm font-black shadow-inner" />
                                                                    </div>
                                                                </div>

                                                                <button className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-xl shadow-zinc-900/10 active:scale-95 text-xs h-16" onClick={() => saveFinancials(user.id)}>
                                                                    {t("save")}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* 5. Status Badge */}
                                        <td className="px-6 py-6 text-center">
                                            <span className={clsx(
                                                "inline-flex px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all border",
                                                currentStatus === 'PRESENT' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-emerald-500/5' :
                                                currentStatus === 'ABSENT' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shadow-rose-500/5' :
                                                currentStatus === 'LATE' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shadow-amber-500/5' : 
                                                'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/5 shadow-zinc-900/5'
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
