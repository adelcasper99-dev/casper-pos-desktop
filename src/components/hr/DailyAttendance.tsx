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
            <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-white/5">
                <div>
                    <h2 className="text-xl font-bold">{t("title")}</h2>
                    <p className="text-muted-foreground text-sm">
                        {dateStr} — {new Date(dateStr + 'T12:00:00').toLocaleDateString('ar-AR', { weekday: 'long' })}
                    </p>
                </div>
                <div className="text-sm text-right space-y-0.5">
                    <p className="text-green-400 font-medium">✓ {t("present")}: {presentCount}</p>
                    <p className="text-red-400 font-medium">✗ {t("absent")}: {absentCount}</p>
                </div>
            </div>

            {/* Attendance Table */}
            <div className="bg-card border border-white/5 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-right" dir="rtl">
                        <thead>
                            <tr className="bg-white/[0.03] border-b border-white/5">
                                <th className="px-6 py-5 text-sm font-black text-zinc-400 uppercase tracking-widest">{t("employee")}</th>
                                <th className="px-6 py-5 text-sm font-black text-zinc-400 uppercase tracking-widest text-center">{t("presence")}</th>
                                <th className="px-6 py-5 text-sm font-black text-zinc-400 uppercase tracking-widest text-center">{t("adjustments")}</th>
                                <th className="px-6 py-5 text-sm font-black text-zinc-400 uppercase tracking-widest text-center">{t("status")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04] bg-black/20 font-bold">
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
                                    <tr key={user.id} className="group hover:bg-cyan-500/[0.02] transition-all duration-300">
                                        {/* 1. Employee Info */}
                                        <td className="px-6 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-lg font-black transition-transform group-hover:scale-110 ${avatarColor}`}>
                                                    {(user.name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 space-y-0.5">
                                                    <div className="flex items-center gap-2 flex-wrap text-right">
                                                        <p className="font-extrabold text-lg tracking-tight text-white/90 whitespace-nowrap">{user.name}</p>
                                                        {((currentLog?.bonus || 0) > 0) && (
                                                            <span className="text-[11px] font-black bg-emerald-500 text-black px-2 py-0.5 rounded-md shadow-lg shadow-emerald-500/20">
                                                                +{currentLog?.bonus}
                                                            </span>
                                                        )}
                                                        {((currentLog?.deduction || 0) > 0) && (
                                                            <span className="text-[11px] font-black bg-rose-500 text-white px-2 py-0.5 rounded-md shadow-lg shadow-rose-500/20">
                                                                -{currentLog?.deduction}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{user.roleStr}</p>
                                                    {(currentLog?.bonusNote || currentLog?.deductionNote || currentLog?.note) && (
                                                        <div className="flex flex-col gap-1 mt-1.5">
                                                            {((currentLog?.deduction || 0) > 0) && currentLog?.deductionNote && (
                                                                <div className="text-[10px] font-black bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded flex items-center gap-1 w-fit shadow-sm shadow-rose-500/5">
                                                                    <span className="opacity-60">{t("deduction")}:</span>
                                                                    <span>{currentLog.deductionNote}</span>
                                                                </div>
                                                            )}
                                                            {((currentLog?.bonus || 0) > 0) && currentLog?.bonusNote && (
                                                                <div className="text-[10px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded flex items-center gap-1 w-fit shadow-sm shadow-emerald-500/5">
                                                                    <span className="opacity-60">{t("bonus")}:</span>
                                                                    <span>{currentLog.bonusNote}</span>
                                                                </div>
                                                            )}
                                                            {/* General notes */}
                                                            {currentLog?.note && (
                                                                <div className="text-[10px] font-black bg-zinc-500/10 border border-zinc-500/20 text-zinc-400 px-2 py-0.5 rounded flex items-center gap-1 w-fit italic">
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
                                            <div className="flex items-center justify-center gap-1.5 p-1.5 bg-black/40 rounded-xl border border-white/5 w-fit mx-auto">
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'PRESENT')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "p-2.5 rounded-lg transition-all border border-transparent",
                                                        currentStatus === 'PRESENT'
                                                            ? "bg-green-500 text-black shadow-lg shadow-green-500/30 scale-105"
                                                            : "hover:bg-green-500/10 text-zinc-500 hover:text-green-500"
                                                    )}
                                                >
                                                    <Check className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'ABSENT')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "p-2.5 rounded-lg transition-all border border-transparent",
                                                        currentStatus === 'ABSENT'
                                                            ? "bg-red-500 text-black shadow-lg shadow-red-500/30 scale-105"
                                                            : "hover:bg-red-500/10 text-zinc-500 hover:text-red-500"
                                                    )}
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
                                                        "p-2.5 rounded-lg transition-all border border-transparent relative",
                                                        currentStatus === 'LATE'
                                                            ? "bg-orange-500 text-black shadow-lg shadow-orange-500/30 scale-105"
                                                            : "hover:bg-orange-500/10 text-zinc-500 hover:text-orange-500"
                                                    )}
                                                >
                                                    <Clock className="w-5 h-5" />
                                                    {lateEntryUserId === user.id && (
                                                        <div className="absolute bottom-full right-0 mb-3 z-50 bg-zinc-900 border border-zinc-700 p-3 rounded-xl shadow-2xl flex items-center gap-2 min-w-[180px] animate-in slide-in-from-bottom-2">
                                                            <input
                                                                type="text"
                                                                autoFocus
                                                                placeholder="Reason/Time"
                                                                className="bg-black border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white w-full"
                                                                value={lateTime}
                                                                onChange={e => setLateTime(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && handleStatusChange(user.id, 'LATE', { note: lateTime })}
                                                            />
                                                            <Button size="sm" className="h-8 w-8 p-0 bg-green-600 hover:bg-green-500 text-white" onClick={() => handleStatusChange(user.id, 'LATE', { note: lateTime })}>
                                                                <Check className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'OFF')}
                                                    disabled={isLoading}
                                                    className={clsx(
                                                        "p-2.5 rounded-lg transition-all border border-transparent",
                                                        currentStatus === 'OFF'
                                                            ? "bg-zinc-500 text-black shadow-lg shadow-zinc-500/30 scale-105"
                                                            : "hover:bg-zinc-500/10 text-zinc-500 hover:text-zinc-400"
                                                    )}
                                                >
                                                    <Coffee className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>

                                        {/* 4. Financial Actions */}
                                        <td className="px-6 py-6 text-center">
                                            <div className="flex items-center justify-center gap-3">
                                                <div className="relative">
                                                    <button
                                                        onClick={() => openFinancials(user.id, currentLog)}
                                                        className={clsx(
                                                            "w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-300 active:scale-90",
                                                            financialUserId === user.id ? "bg-cyan-500 text-black border-cyan-500 shadow-lg shadow-cyan-500/30" :
                                                            (currentLog?.note || hasFinancials) ? 
                                                                "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20" : 
                                                                "bg-black/20 border-zinc-800 text-zinc-500 hover:border-cyan-500/50 hover:text-cyan-400"
                                                        )}
                                                    >
                                                        <DollarSign className="w-6 h-6" />
                                                        {(currentLog?.note) && <span className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-500 rounded-full border border-black animate-pulse" />}
                                                    </button>
                                                    {financialUserId === user.id && (
                                                        <div className="absolute top-full left-0 mt-3 z-50 bg-zinc-950 border border-white/10 p-5 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] w-[280px] animate-in slide-in-from-top-3 text-right">
                                                            <div className="space-y-4">
                                                                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                                    <span className="text-xs font-black uppercase text-zinc-400 tracking-widest">{t("adjustments")}</span>
                                                                    <button onClick={() => setFinancialUserId(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                                                                </div>

                                                                <div className="flex gap-2">
                                                                    <button 
                                                                        onClick={() => handleQuickAdjustment(user.id, 'BONUS')}
                                                                        className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold transition-all"
                                                                    >
                                                                        + {t("bonus")}
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleQuickAdjustment(user.id, 'DEDUCTION')}
                                                                        className="flex-1 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-lg text-xs font-bold transition-all"
                                                                    >
                                                                        - {t("deduction")}
                                                                    </button>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">{t("bonus")}</Label>
                                                                        <Input type="number" value={financials.bonus} onChange={e => setFinancials(p => ({ ...p, bonus: e.target.value }))} className="h-9 text-sm bg-black border-zinc-800 font-bold" />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-[10px] font-black uppercase text-rose-400 tracking-widest">{t("deduction")}</Label>
                                                                        <Input type="number" value={financials.deduction} onChange={e => setFinancials(p => ({ ...p, deduction: e.target.value }))} className="h-9 text-sm bg-black border-zinc-800 font-bold" />
                                                                    </div>
                                                                </div>



                                                                <div className="space-y-3">
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">{t("reason")} ({t("bonus")})</Label>
                                                                        <Input value={financials.bonusNote} onChange={e => setFinancials(p => ({ ...p, bonusNote: e.target.value }))} placeholder="..." className="h-9 text-sm bg-black border-zinc-800" />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-[10px] font-black uppercase text-rose-400 tracking-widest">{t("reason")} ({t("deduction")})</Label>
                                                                        <Input value={financials.deductionNote} onChange={e => setFinancials(p => ({ ...p, deductionNote: e.target.value }))} placeholder="..." className="h-9 text-sm bg-black border-zinc-800" />
                                                                    </div>
                                                                </div>

                                                                <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black uppercase tracking-widest py-5 rounded-xl transition-all shadow-lg shadow-cyan-500/20" onClick={() => saveFinancials(user.id)}>
                                                                    {t("save")}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* 5. Status Badge */}
                                        <td className="px-6 py-6 text-center">
                                            <span className={clsx(
                                                "inline-flex px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg",
                                                currentStatus === 'PRESENT' ? 'bg-green-500 text-black shadow-green-500/20' :
                                                currentStatus === 'ABSENT' ? 'bg-red-500 text-white shadow-red-500/20' :
                                                currentStatus === 'LATE' ? 'bg-orange-500 text-black shadow-orange-500/20' : 'bg-zinc-700 text-white shadow-zinc-900/40'
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
