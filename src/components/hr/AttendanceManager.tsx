"use client"

import { useState, useMemo, useEffect } from "react"
import { getMonthlyLogs, upsertDailyLog } from "@/actions/attendance"
import { getStaffDirectory } from "@/actions/hr"
import { ChevronLeft, ChevronRight, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

export default function AttendanceManager({ csrfToken }: { csrfToken: string }) {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [logs, setLogs] = useState<any[]>([])
    const [staff, setStaff] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Modal state
    const [selectedCell, setSelectedCell] = useState<{ userId: string, date: Date, existingLog: any } | null>(null)

    const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`

    const loadData = async () => {
        setLoading(true)
        const [logsRes, staffRes] = await Promise.all([
            getMonthlyLogs(monthStr),
            getStaffDirectory()
        ])

        if (logsRes.success && logsRes.data) setLogs(logsRes.data)
        if (staffRes.success && staffRes.data) setStaff(staffRes.data)
        setLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [monthStr])

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)

    const getLogForCell = (userId: string, day: number) => {
        const targetDateStr = `${monthStr}-${String(day).padStart(2, '0')}T00:00:00.000Z`
        return logs.find(l => l.userId === userId && new Date(l.date).toISOString() === targetDateStr)
    }

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Context Header */}
            <div className="flex items-center justify-between bg-card p-4 rounded-xl border border-white/5">
                <div className="flex items-center gap-4">
                    <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-xl font-bold min-w-[150px] text-center">
                        {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h2>
                    <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500"></div> Present</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500"></div> Absent</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><div className="w-3 h-3 rounded-full bg-zinc-500/20 border border-zinc-500"></div> Off</span>
                </div>
            </div>

            {/* Grid */}
            <div className="bg-card border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-12 flex justify-center items-center h-64">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-white/5 text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 sticky left-0 z-10 bg-card border-r border-white/5 min-w-[200px]">Employee</th>
                                    {daysArray.map(day => (
                                        <th key={day} className="px-2 py-3 text-center min-w-[40px] border-b border-white/5">{day}</th>
                                    ))}
                                    <th className="px-4 py-3 text-right border-l border-white/5 min-w-[120px]">Net ($)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staff.map(member => {
                                    // Calculate row totals
                                    let totalBonus = 0
                                    let totalDeduction = 0

                                    daysArray.forEach(day => {
                                        const log = getLogForCell(member.id, day)
                                        if (log) {
                                            totalBonus += Number(log.bonus || 0)
                                            totalDeduction += Number(log.deduction || 0)
                                        }
                                    })

                                    const netEffect = totalBonus - totalDeduction

                                    return (
                                        <tr key={member.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                            <td className="px-4 py-3 sticky left-0 z-10 bg-card/95 backdrop-blur-sm border-r border-white/5 font-medium whitespace-nowrap">
                                                {member.name}
                                                <div className="text-xs text-muted-foreground font-normal">{member.role}</div>
                                            </td>
                                            {daysArray.map(day => {
                                                const log = getLogForCell(member.id, day)
                                                let bgColor = "hover:bg-white/5"
                                                let text = "-"

                                                if (log) {
                                                    if (log.status === 'PRESENT') {
                                                        bgColor = "bg-green-500/10 hover:bg-green-500/20 text-green-400"
                                                        text = "P"
                                                    } else if (log.status === 'ABSENT') {
                                                        bgColor = "bg-red-500/10 hover:bg-red-500/20 text-red-400"
                                                        text = "A"
                                                    } else if (log.status === 'OFF') {
                                                        bgColor = "bg-zinc-500/10 hover:bg-zinc-500/20 text-zinc-400"
                                                        text = "O"
                                                    }
                                                }

                                                // Highlight if it has financial impact
                                                const hasMoney = log && (Number(log.bonus) > 0 || Number(log.deduction) > 0)

                                                return (
                                                    <td
                                                        key={day}
                                                        onClick={() => setSelectedCell({
                                                            userId: member.id,
                                                            date: new Date(currentDate.getFullYear(), currentDate.getMonth(), day, 12, 0, 0),
                                                            existingLog: log
                                                        })}
                                                        className={clsx(
                                                            "px-1 py-1 text-center cursor-pointer transition-colors border-r border-white/5 last:border-0",
                                                            bgColor,
                                                            hasMoney && "ring-1 ring-inset ring-amber-500/50"
                                                        )}
                                                    >
                                                        <div className="w-8 h-8 flex items-center justify-center rounded-md font-medium mx-auto">
                                                            {text}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                            <td className={clsx(
                                                "px-4 py-3 text-right font-mono font-medium border-l border-white/5",
                                                netEffect > 0 ? "text-green-400" : netEffect < 0 ? "text-red-400" : "text-zinc-500"
                                            )}>
                                                {netEffect > 0 ? '+' : ''}{netEffect.toFixed(2)}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {selectedCell && (
                <EditLogModal
                    cell={selectedCell}
                    onClose={() => setSelectedCell(null)}
                    onSave={loadData}
                    csrfToken={csrfToken}
                />
            )}
        </div>
    )
}

function EditLogModal({ cell, onClose, onSave, csrfToken }: { cell: any, onClose: () => void, onSave: () => void, csrfToken: string }) {
    const [status, setStatus] = useState(cell.existingLog?.status || 'PRESENT')
    const [bonus, setBonus] = useState(cell.existingLog?.bonus || '')
    const [deduction, setDeduction] = useState(cell.existingLog?.deduction || '')
    const [note, setNote] = useState(cell.existingLog?.note || '')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        const dateStr = cell.date.toISOString().split('T')[0] // YYYY-MM-DD

        const res = await upsertDailyLog({
            userId: cell.userId,
            dateStr,
            csrfToken,
            data: {
                status,
                bonus: bonus ? Number(bonus) : 0,
                deduction: deduction ? Number(deduction) : 0,
                note
            }
        })

        setSaving(false)
        if (res.success) {
            toast.success("Log updated")
            onSave()
            onClose()
        } else {
            toast.error(res.error || "Failed to update log")
        }
    }

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit Attendance</DialogTitle>
                    <p className="text-sm text-muted-foreground">{cell.date.toLocaleDateString()}</p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">Status</label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PRESENT">Present</SelectItem>
                                <SelectItem value="ABSENT">Absent</SelectItem>
                                <SelectItem value="OFF">Off Day</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium text-green-500">Bonus ($)</label>
                            <Input
                                type="number"
                                value={bonus}
                                onChange={(e) => setBonus(e.target.value)}
                                placeholder="0.00"
                                className="bg-green-500/5 border-green-500/20"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium text-red-500">Deduction ($)</label>
                            <Input
                                type="number"
                                value={deduction}
                                onChange={(e) => setDeduction(e.target.value)}
                                placeholder="0.00"
                                className="bg-red-500/5 border-red-500/20"
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm font-medium">Note / Reason</label>
                        <Input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Optional explanation..."
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                    <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Changes
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
