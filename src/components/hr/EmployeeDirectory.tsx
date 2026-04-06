import { useEffect, useState, useCallback, useRef } from "react"
import { Search, MapPin, DollarSign, Clock, RefreshCw, ChevronRight, ChevronLeft, LayoutGrid, List, CalendarDays, Users } from "lucide-react"
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
            <div className="flex flex-col xl:flex-row gap-6 justify-between items-center bg-zinc-50 dark:bg-white/[0.02] p-6 rounded-[2rem] border border-zinc-200 dark:border-white/5 shadow-sm font-cairo">
                <div className="flex flex-col md:flex-row items-center gap-6 w-full md:w-auto">
                    <div className="transition-all">
                        <h2 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">{t("title")}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t("activeMembers", { count: staff.length })}</p>
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                {t("lastUpdate") || "تزامن"}: <span className="text-zinc-900 dark:text-white">{mounted ? lastUpdated.toLocaleTimeString() : '--:--:--'}</span>
                                {refreshing && <RefreshCw className="w-3 h-3 animate-spin text-primary" />}
                            </p>
                        </div>
                    </div>

                    {/* Date Navigation */}
                    <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-2xl p-1.5 shadow-sm">
                        <button 
                            onClick={prevMonth}
                            className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-xl transition-all text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white active:scale-95"
                        >
                            <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
                        </button>
                        <div className="flex items-center gap-3 px-6 py-2 h-10 text-sm font-black min-w-[180px] justify-center text-zinc-900 dark:text-white bg-white dark:bg-zinc-900 rounded-xl shadow-inner border border-zinc-100 dark:border-white/5 uppercase tracking-widest">
                            <CalendarDays className="w-4 h-4 text-zinc-400" />
                            {filterDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
                        </div>
                        <button 
                            onClick={nextMonth}
                            className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-xl transition-all text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white active:scale-95"
                        >
                            <ChevronRight className="w-5 h-5 rtl:rotate-180" />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                        <input
                            type="text"
                            placeholder={t("searchPlaceholder")}
                            className="w-full bg-white dark:bg-zinc-900 border-none rounded-2xl h-14 pl-12 pr-6 text-zinc-900 dark:text-white font-black text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-inner"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={() => loadStaff(true)}
                        disabled={refreshing}
                        className="p-4 rounded-2xl bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-none transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                        title="تحديث البيانات"
                    >
                        <RefreshCw className={clsx("w-6 h-6 text-zinc-500", refreshing && "animate-spin")} />
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
                <div className="bg-zinc-50 dark:bg-white/[0.02] rounded-[2rem] border border-zinc-200 dark:border-white/5 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left rtl:text-right border-collapse zebra-table sticky-header font-cairo">
                            <thead className="z-20">
                                <tr className="border-b-2 border-zinc-200 dark:border-white/5 bg-zinc-100/50 dark:bg-white/[0.03]">
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">{t("table.employee") || "الموظف"}</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">{t("table.role") || "الدور"}</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">{t("table.branch") || "الفرع"}</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">{t("table.salary") || "الاساسي"}</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">الصافي المستحق</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">النجاح</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">متأخرات</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">{t("table.status") || "الحالة"}</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] text-right rtl:text-left">{t("table.actions") || "الإجراءات"}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-white/5">
                                <AnimatePresence mode="popLayout">
                                    {filteredStaff.map((member) => (
                                        <TableRow key={member.id} member={member} t={t} />
                                    ))}
                                </AnimatePresence>
                                {filteredStaff.length > 0 && (
                                    <tr className="bg-zinc-100 dark:bg-white/[0.05] font-black border-t-2 border-zinc-200 dark:border-white/10 sticky bottom-0 backdrop-blur-md">
                                        <td className="px-6 py-6 text-zinc-500 text-xs uppercase tracking-widest">
                                            {t("table.total") || "الإجمالي"}
                                        </td>
                                        <td className="px-6 py-6">
                                            <span className="px-4 py-1 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[10px] font-black tracking-widest uppercase">
                                                {filteredStaff.length} {t("table.members") || "موظف"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-6"></td>
                                        <td className="px-6 py-6">
                                            <div className="font-mono text-sm font-black tracking-tighter text-zinc-900 dark:text-white tabular-nums">
                                                {filteredStaff.reduce((sum, s) => sum + Number(s.salary || 0), 0).toLocaleString()} EGP
                                            </div>
                                        </td>
                                        <td className="px-6 py-6">
                                            <div className="font-mono text-base font-black tracking-tighter text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                {filteredStaff.reduce((sum, s) => sum + Number(s.netDue), 0).toLocaleString()} EGP
                                            </div>
                                        </td>
                                        <td className="px-6 py-6" colSpan={4}></td>
                                    </tr>
                                )}
                                {filteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-24 text-center font-black font-cairo text-zinc-400 uppercase tracking-widest">
                                            {t("noResults") || "لم يتم العثور على موظفين"}
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
            className="group hover:bg-zinc-100 dark:hover:bg-white/[0.03] transition-all cursor-pointer"
        >
            <td className="px-6 py-6">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-[1rem] bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center text-sm font-black shadow-xl shadow-zinc-900/10 group-hover:scale-110 group-hover:rotate-6 transition-all">
                            {member.avatarSeed?.substring(0, 2).toUpperCase() || "CN"}
                        </div>
                        {isOnline && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-white dark:border-zinc-950 animate-pulse" />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-black text-zinc-900 dark:text-white text-base leading-tight">{member.name}</span>
                        <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mt-0.5">@{member.username}</span>
                    </div>
                </div>
            </td>
            <td className="px-6 py-6">
                <span className="px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                    {member.role}
                </span>
            </td>
            <td className="px-6 py-6">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs font-black uppercase tracking-tight">
                    <MapPin className="w-3.5 h-3.5" />
                    {member.branch}
                </div>
            </td>
            <td className="px-6 py-6">
                <div className="font-mono text-zinc-900 dark:text-white text-sm font-black tracking-tighter tabular-nums">
                    {Number(member.salary || 0).toLocaleString()} EGP
                </div>
            </td>
            <td className="px-6 py-6">
                <div className={clsx(
                    "font-mono text-base font-black tracking-tighter tabular-nums",
                    member.netDue > 0 ? "text-emerald-600 dark:text-emerald-500" : member.netDue < 0 ? "text-rose-600 dark:text-rose-500" : "text-zinc-500"
                )}>
                    {member.netDue > 0 ? "+" : ""}{Number(member.netDue).toLocaleString()} EGP
                </div>
            </td>
            <td className="px-6 py-6">
                <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className={clsx(
                                "h-full transition-all duration-1000",
                                member.kpis?.successRatio >= 90 ? "bg-emerald-500" : member.kpis?.successRatio >= 70 ? "bg-amber-500" : "bg-rose-500"
                            )}
                            style={{ width: `${member.kpis?.successRatio}%` }}
                        />
                    </div>
                    <span className={clsx(
                        "text-[10px] font-black font-mono tracking-tighter",
                        member.kpis?.successRatio >= 90 ? "text-emerald-600 dark:text-emerald-500" : member.kpis?.successRatio >= 70 ? "text-amber-600 dark:text-amber-500" : "text-rose-600 dark:text-rose-500"
                    )}>
                        {member.kpis?.successRatio}%
                    </span>
                </div>
            </td>
            <td className="px-6 py-6">
                {member.kpis?.delayedTickets > 0 ? (
                    <div className="px-3 py-1 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest border border-rose-500/20 shadow-sm flex items-center gap-2 w-fit">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        {member.kpis?.delayedTickets} خطر
                    </div>
                ) : (
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">لا يوجد</span>
                )}
            </td>
            <td className="px-6 py-6">
                <div className={clsx(
                    "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-xl w-fit transition-all duration-500 border shadow-sm",
                    isOnline 
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" 
                        : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                )}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
                    {isOnline ? "متصل" : "أوفلاين"}
                </div>
            </td>
            <td className="px-6 py-6 text-right rtl:text-left">
                <div className="flex items-center gap-2 justify-end">
                    <button 
                        onClick={(e) => { e.stopPropagation(); router.push(`/hr/employees/${member.id}`); }}
                        className="p-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:scale-110 active:scale-95 transition-all shadow-lg shadow-zinc-900/10"
                        title="عرض الملف"
                    >
                        <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); /* Handle direct edit if needed */ }}
                        className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-sm active:scale-95"
                        title="تعديل سريع"
                    >
                        <Users className="w-5 h-5" />
                    </button>
                </div>
            </td>
        </motion.tr>
    )
}
