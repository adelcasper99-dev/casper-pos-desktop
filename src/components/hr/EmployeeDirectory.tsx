import { useEffect, useState, useCallback, useRef } from "react"
import { Search, MapPin, RefreshCw, ChevronLeft, Users } from "lucide-react"
import { getStaffDirectory } from "@/actions/hr"
import { useTranslations } from "@/lib/i18n-mock"
import clsx from "clsx"
import { Decimal } from 'decimal.js'

import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

export interface StaffMember {
    id: string;
    name: string;
    username: string;
    role: string;
    branch: string;
    salary: number | string;
    netDue: number | string;
    status: string;
    avatarSeed?: string;
    kpis?: {
        successRatio: number;
        delayedTickets: number;
    };
}

export default function EmployeeDirectory({ csrfToken, filterDate }: { csrfToken: string, filterDate: Date }) {
    const t = useTranslations("HR.directory")
    const [staff, setStaff] = useState<StaffMember[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
    const [mounted, setMounted] = useState(false)
    const pollInterval = useRef<NodeJS.Timeout | null>(null)
    const isFetchingRef = useRef(false)
    const mountedRef = useRef(false)

    useEffect(() => {
        setMounted(true)
        mountedRef.current = true
        return () => { mountedRef.current = false }
    }, [])

    const loadStaff = useCallback(async (isSilent = false) => {
        if (isFetchingRef.current) return
        
        isFetchingRef.current = true
        if (!isSilent) setLoading(true)
        else setRefreshing(true)
        
        try {
            const res = await getStaffDirectory({
                month: filterDate.getMonth(),
                year: filterDate.getFullYear()
            })
            if (mountedRef.current) {
                if (res.success && res.data) {
                    setStaff(res.data)
                    setLastUpdated(new Date())
                } else if (!res.success) {
                    console.error("[EmployeeDirectory] Failed to load staff:", (res as any).error);
                }
            }
        } catch (error) {
            console.error("[EmployeeDirectory] Error loading staff:", error);
        } finally {
            if (mountedRef.current) {
                setLoading(false)
                setRefreshing(false)
                setTimeout(() => { isFetchingRef.current = false }, 300)
            }
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
        <div className="space-y-2.5 animate-in fade-in duration-300 font-cairo">
            {/* Header & Search Toolbar */}
            <div className="flex flex-col sm:flex-row gap-2.5 justify-between items-center bg-zinc-50/80 dark:bg-white/[0.02] p-2 px-3 rounded-xl border border-zinc-200/80 dark:border-white/5 shadow-xs">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <h2 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                        {t("title") || "دليل الموظفين"}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                        <span>{t("activeMembers", { count: staff.length }) || `${staff.length} عضو نشط`}</span>
                        <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                        <span className="flex items-center gap-1">
                            {t("lastUpdate") || "تزامن"}: <span className="text-zinc-800 dark:text-zinc-200">{mounted ? lastUpdated.toLocaleTimeString() : '--:--:--'}</span>
                            {refreshing && <RefreshCw className="w-2.5 h-2.5 animate-spin text-primary" />}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                        <input
                            type="text"
                            placeholder={t("searchPlaceholder") || "ابحث عن الموظفين..."}
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 rounded-lg h-8 pl-8 pr-3 text-zinc-900 dark:text-white font-bold text-xs outline-none focus:ring-1 focus:ring-primary/50 transition-all shadow-xs"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={() => loadStaff(true)}
                        disabled={refreshing}
                        className="h-8 w-8 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-white/10 flex items-center justify-center transition-all disabled:opacity-50 active:scale-95 shadow-xs"
                        title="تحديث البيانات"
                    >
                        <RefreshCw className={clsx("w-3.5 h-3.5 text-zinc-500", refreshing && "animate-spin")} />
                    </button>
                </div>
            </div>

            {staff.length >= 500 && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                    ⚠️ تم الوصول للحد الأقصى للعرض (500 موظف). يرجى تصفية البحث.
                </div>
            )}

            {loading ? (
                <div className="space-y-1.5">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-10 rounded-lg bg-zinc-200/40 dark:bg-white/5 animate-pulse border border-zinc-200/40 dark:border-white/5" />
                    ))}
                </div>
            ) : (
                <div className="bg-white dark:bg-zinc-950/40 rounded-xl border border-zinc-200/80 dark:border-white/5 overflow-hidden shadow-xs">
                    <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] custom-scrollbar">
                        <table className="w-full text-left rtl:text-right border-collapse">
                            <thead className="sticky top-0 z-20 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs border-b border-zinc-200/80 dark:border-white/10">
                                <tr>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("table.employee") || "الموظف"}</th>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("table.role") || "الدور"}</th>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("table.branch") || "الفرع"}</th>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("table.salary") || "الاساسي"}</th>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">الصافي المستحق</th>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">النجاح</th>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">متأخرات</th>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("table.status") || "الحالة"}</th>
                                    <th className="px-3 py-2 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right rtl:text-left">{t("table.actions") || "الإجراءات"}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200/60 dark:divide-white/5">
                                <AnimatePresence mode="popLayout">
                                    {filteredStaff.map((member) => (
                                        <TableRow key={member.id} member={member} t={t} />
                                    ))}
                                </AnimatePresence>
                                {filteredStaff.length > 0 && (
                                    <tr className="bg-zinc-100/95 dark:bg-zinc-900/95 font-bold border-t border-zinc-200/80 dark:border-white/10 sticky bottom-0 backdrop-blur-xs">
                                        <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 text-[11px] uppercase tracking-wider font-bold">
                                            {t("table.total") || "الإجمالي"}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="px-2 py-0.5 rounded-md bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[10px] font-bold tracking-wider uppercase">
                                                {filteredStaff.length} {t("table.members") || "موظف"}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2"></td>
                                        <td className="px-3 py-2">
                                            <div className="font-mono text-xs font-bold text-zinc-900 dark:text-white tabular-nums">
                                                {filteredStaff.reduce((sum, s) => new Decimal(sum).plus(new Decimal(s.salary || 0)).toNumber(), 0).toLocaleString()} EGP
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                {filteredStaff.reduce((sum, s) => new Decimal(sum).plus(new Decimal(s.netDue || 0)).toNumber(), 0).toLocaleString()} EGP
                                            </div>
                                        </td>
                                        <td className="px-3 py-2" colSpan={4}></td>
                                    </tr>
                                )}
                                {filteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-12 text-center font-bold text-zinc-400 text-xs uppercase tracking-wider">
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

function TableRow({ member, t }: { member: StaffMember, t: any }) {
    const isOnline = member.status === 'ONLINE'
    const router = useRouter()

    return (
        <motion.tr 
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            onClick={() => router.push(`/hr/employees/${member.id}`)}
            className="group hover:bg-zinc-100/70 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
            <td className="px-3 py-1.5">
                <div className="flex items-center gap-2.5">
                    <div className="relative shrink-0">
                        <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center text-[10px] font-black shadow-xs group-hover:scale-105 transition-transform">
                            {member.avatarSeed?.substring(0, 2).toUpperCase() || "CN"}
                        </div>
                        {isOnline && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-zinc-950 animate-pulse" />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-zinc-900 dark:text-white text-xs leading-snug">{member.name}</span>
                        <span className="text-[10px] text-zinc-400 font-medium">@{member.username}</span>
                    </div>
                </div>
            </td>
            <td className="px-3 py-1.5">
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20">
                    {member.role}
                </span>
            </td>
            <td className="px-3 py-1.5">
                <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-xs font-medium">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[120px]">{member.branch}</span>
                </div>
            </td>
            <td className="px-3 py-1.5">
                <div className="font-mono text-zinc-800 dark:text-zinc-200 text-xs font-bold tabular-nums">
                    {Number(member.salary || 0).toLocaleString()} <span className="text-[10px] text-zinc-400 font-normal">EGP</span>
                </div>
            </td>
            <td className="px-3 py-1.5">
                <div className={clsx(
                    "font-mono text-xs font-black tabular-nums",
                    Number(member.netDue) > 0 ? "text-emerald-600 dark:text-emerald-400" : Number(member.netDue) < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"
                )}>
                    {Number(member.netDue) > 0 ? "+" : ""}{Number(member.netDue).toLocaleString()} <span className="text-[10px] font-normal opacity-70">EGP</span>
                </div>
            </td>
            <td className="px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1.5 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className={clsx(
                                "h-full transition-all duration-700",
                                (member.kpis?.successRatio || 0) >= 90 ? "bg-emerald-500" : (member.kpis?.successRatio || 0) >= 70 ? "bg-amber-500" : "bg-rose-500"
                            )}
                            style={{ width: `${member.kpis?.successRatio || 0}%` }}
                        />
                    </div>
                    <span className={clsx(
                        "text-[10px] font-bold font-mono",
                        (member.kpis?.successRatio || 0) >= 90 ? "text-emerald-600 dark:text-emerald-400" : (member.kpis?.successRatio || 0) >= 70 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"
                    )}>
                        {member.kpis?.successRatio || 0}%
                    </span>
                </div>
            </td>
            <td className="px-3 py-1.5">
                {(member.kpis?.delayedTickets || 0) > 0 ? (
                    <div className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider border border-rose-500/20 flex items-center gap-1 w-fit">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        {member.kpis?.delayedTickets} خطر
                    </div>
                ) : (
                    <span className="text-[10px] font-medium text-zinc-400">لا يوجد</span>
                )}
            </td>
            <td className="px-3 py-1.5">
                <div className={clsx(
                    "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md w-fit border shadow-2xs",
                    isOnline 
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" 
                        : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                )}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-500")} />
                    {isOnline ? "متصل" : "أوفلاين"}
                </div>
            </td>
            <td className="px-3 py-1.5 text-right rtl:text-left">
                <div className="flex items-center gap-1 justify-end">
                    <button 
                        onClick={(e) => { e.stopPropagation(); router.push(`/hr/employees/${member.id}`); }}
                        className="p-1 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:scale-105 active:scale-95 transition-all shadow-2xs"
                        title="عرض الملف"
                    >
                        <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                    </button>
                </div>
            </td>
        </motion.tr>
    )
}
