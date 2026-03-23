import { useEffect, useState, useCallback, useRef } from "react"
import { Search, MapPin, DollarSign, Clock, RefreshCw, ChevronRight, ChevronLeft, LayoutGrid, List } from "lucide-react"
import { getStaffDirectory } from "@/actions/hr"
import { useTranslations } from "@/lib/i18n-mock"
import clsx from "clsx"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

export default function EmployeeDirectory({ csrfToken }: { csrfToken: string }) {
    const t = useTranslations("HR.directory")
    const [staff, setStaff] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
    const [filterDate, setFilterDate] = useState(new Date())
    const [mounted, setMounted] = useState(false)
    const pollInterval = useRef<NodeJS.Timeout | null>(null)

    const nextMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 1))
    const prevMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() - 1, 1))

    useEffect(() => {
        setMounted(true)
    }, [])

    const loadStaff = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true)
        else setRefreshing(true)
        
        try {
            const res = await getStaffDirectory({
                month: filterDate.getMonth(),
                year: filterDate.getFullYear()
            })
            if (res.success && res.data) {
                setStaff(res.data)
                setLastUpdated(new Date())
            } else if (!res.success) {
                console.error("[EmployeeDirectory] Failed to load staff:", (res as any).error);
            }
        } catch (error) {
            console.error("[EmployeeDirectory] Error loading staff:", error);
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [filterDate])

    useEffect(() => {
        loadStaff()
        
        // Setup polling every 30 seconds
        pollInterval.current = setInterval(() => {
            loadStaff(true)
        }, 30000)

        return () => {
            if (pollInterval.current) clearInterval(pollInterval.current)
        }
    }, [loadStaff])

    const filteredStaff = staff.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.username.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Search */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card/50 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-sm">
                <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                    <div>
                        <h2 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">{t("title")}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-muted-foreground">{t("activeMembers", { count: staff.length })}</p>
                            <span className="w-1 h-1 rounded-full bg-zinc-700" />
                            <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                                {t("lastUpdate") || "Last updated"}: {mounted ? lastUpdated.toLocaleTimeString() : '--:--:--'}
                                {refreshing && <RefreshCw className="w-3 h-3 animate-spin text-primary" />}
                            </p>
                        </div>
                    </div>

                    {/* Date Navigation */}
                    <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1.5 backdrop-blur-md">
                        <button 
                            onClick={prevMonth}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-2 px-3 py-1 text-sm font-semibold min-w-[120px] justify-center text-white">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            {filterDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
                        </div>
                        <button 
                            onClick={nextMonth}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setFilterDate(new Date())}
                            className="ml-2 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-all"
                        >
                            {t("today") || "Today"}
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={t("searchPlaceholder")}
                            className="w-full glass-input pl-10 h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={() => loadStaff(true)}
                        disabled={refreshing}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors disabled:opacity-50 group"
                        title="Refresh"
                    >
                        <RefreshCw className={clsx("w-4 h-4 text-zinc-400 group-hover:text-white transition-colors", refreshing && "animate-spin")} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-14 rounded-xl bg-muted/10 animate-pulse border border-white/5" />
                    ))}
                </div>
            ) : (
                <div className="bg-card/30 backdrop-blur-xl rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left rtl:text-right border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/5">
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("table.employee") || "Employee"}</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("table.role") || "Role"}</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("table.branch") || "Branch"}</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("table.salary") || "Salary"}</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">الصافي المستحق</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">النجاح</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">الفجوات</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("table.status") || "Status"}</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-right rtl:text-left">{t("table.actions") || "Actions"}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence mode="popLayout">
                                    {filteredStaff.map((member) => (
                                        <TableRow key={member.id} member={member} t={t} />
                                    ))}
                                </AnimatePresence>
                                {filteredStaff.length > 0 && (
                                    <tr className="bg-white/5 font-bold border-t-2 border-white/10 sticky bottom-0 backdrop-blur-md">
                                        <td className="px-6 py-4 text-zinc-400">
                                            {t("table.total") || "Total"}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2.5 py-1 rounded-full bg-zinc-500/10 text-zinc-400 text-xs border border-zinc-500/20">
                                                {filteredStaff.length} {t("table.members") || "Members"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4"></td>
                                        <td className="px-6 py-4 text-zinc-400">
                                            <div className="font-mono text-sm">
                                                ${filteredStaff.reduce((sum, s) => sum + Number(s.salary || 0), 0).toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-emerald-400">
                                            <div className="font-mono text-sm font-bold">
                                                ${filteredStaff.reduce((sum, s) => sum + Number(s.netDue), 0).toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4" colSpan={4}></td>
                                    </tr>
                                )}
                                {filteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 italic">
                                            {t("noResults") || "No employees found matching your search."}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

function TableRow({ member, t }: { member: any, t: any }) {
    const isOnline = member.status === 'ONLINE'
    const router = useRouter()

    return (
        <motion.tr 
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={() => router.push(`/hr/employees/${member.id}`)}
            className="group border-b border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer active:scale-[0.995]"
        >
            <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-white/10 flex items-center justify-center text-sm font-bold text-white group-hover:scale-105 transition-transform">
                            {member.avatarSeed?.substring(0, 2).toUpperCase() || "CN"}
                        </div>
                        {isOnline && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-zinc-900 animate-pulse" />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-white group-hover:text-primary transition-colors">{member.name}</span>
                        <span className="text-[10px] text-zinc-500 font-mono italic">@{member.username}</span>
                    </div>
                </div>
            </td>
            <td className="px-6 py-4">
                <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/20">
                    {member.role}
                </span>
            </td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-1.5 text-zinc-300 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                    {member.branch}
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="font-mono text-white text-sm">
                    ${Number(member.salary || 0).toLocaleString()}
                </div>
            </td>
            <td className="px-6 py-4">
                <div className={clsx(
                    "font-mono text-sm font-bold",
                    member.netDue > 0 ? "text-emerald-400" : member.netDue < 0 ? "text-rose-400" : "text-zinc-500"
                )}>
                    ${Number(member.netDue).toLocaleString()}
                </div>
            </td>
            <td className="px-6 py-4">
                <div className={clsx(
                    "text-xs font-bold",
                    member.kpis?.successRatio >= 90 ? "text-emerald-400" : member.kpis?.successRatio >= 70 ? "text-amber-400" : "text-rose-400"
                )}>
                    {member.kpis?.successRatio}%
                </div>
            </td>
            <td className="px-6 py-4">
                <div className={clsx(
                    "font-mono text-xs font-bold",
                    member.kpis?.delayedTickets > 0 ? "text-rose-400" : "text-zinc-500"
                )}>
                    {member.kpis?.delayedTickets}
                </div>
            </td>
            <td className="px-6 py-4">
                <div className={clsx(
                    "flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-lg w-fit transition-all duration-500",
                    isOnline 
                        ? "bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_12px_rgba(34,197,94,0.1)]" 
                        : "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20"
                )}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", isOnline ? "bg-green-400 animate-pulse" : "bg-zinc-600")} />
                    {isOnline ? t("card.online") : t("card.offline")}
                </div>
            </td>
            <td className="px-6 py-4 text-right rtl:text-left">
                <button className="p-2 rounded-lg bg-white/5 group-hover:bg-primary group-hover:text-primary-foreground transition-all group/btn border border-white/5">
                    <ChevronRight className="w-4 h-4 rtl:rotate-180 transition-transform group-hover/btn:translate-x-0.5 rtl:group-hover/btn:-translate-x-0.5" />
                </button>
            </td>
        </motion.tr>
    )
}
