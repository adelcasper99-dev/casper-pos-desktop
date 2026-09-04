"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "@/lib/i18n-mock"
import EmployeeDirectory from "@/components/hr/EmployeeDirectory"
import AttendanceManager from "@/components/hr/AttendanceManager"
import { Users, Calendar, DollarSign, CalendarOff, ShoppingCart, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { getHRDashboardSummary } from "@/actions/hr"
import { cn } from "@/lib/utils"

import TechniciansPayrollDashboard from "@/components/hr/TechniciansPayrollDashboard"

export default function HRClient({ csrfToken, currentUserId, branchId }: { csrfToken: string, currentUserId: string, branchId: string }) {
    const t = useTranslations("HR")
    const [activeTab, setActiveTab] = useState<'directory' | 'attendance' | 'technicians'>('directory')
    const [currentDate, setCurrentDate] = useState(new Date())

    const [summary, setSummary] = useState({ expectedSalaries: 0, totalAbsences: 0, employeeCreditSales: 0 })
    const [isLoadingSummary, setIsLoadingSummary] = useState(true)

    useEffect(() => {
        const fetchSummary = () => {
            getHRDashboardSummary({ 
                month: currentDate.getMonth(), 
                year: currentDate.getFullYear() 
            }).then((res: any) => {
                if (res && res.success && res.data) {
                    setSummary(res.data)
                } else if (res && res.data && !res.success) {
                    setSummary(res.data)
                }
                setIsLoadingSummary(false)
            }).catch((err: any) => {
                console.error("Error loading HR summary:", err);
                setIsLoadingSummary(false)
            })
        }

        setIsLoadingSummary(true)
        fetchSummary()

        // Set up polling interval every 10 seconds
        const intervalId = setInterval(fetchSummary, 10000)

        return () => clearInterval(intervalId)
    }, [currentDate])

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

    return (
        <div className="p-3 md:p-5 w-full max-w-[1600px] mx-auto space-y-2.5 animate-in fade-in duration-300 font-cairo" dir="rtl">
            {/* Header Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-zinc-200/80 dark:border-white/5">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm">
                        <Users className="w-4 h-4" />
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                            {t("title") || "شؤون الموظفين"}
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 font-medium text-xs mt-0.5">
                            {t("subtitle") || "إدارة الموظفين والحضور اليومي"}
                        </p>
                    </div>
                </div>

                {/* Date Filter */}
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-white/10 rounded-xl p-1 shadow-inner">
                    <button 
                        onClick={prevMonth}
                        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg transition-all text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white active:scale-95"
                        title="الشهر السابق"
                    >
                        <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                    </button>
                    <div className="flex items-center gap-2 px-3 h-8 text-xs font-bold min-w-[140px] justify-center text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 rounded-lg shadow-xs border border-zinc-200/50 dark:border-white/5 uppercase tracking-wide">
                        <CalendarDays className="w-3.5 h-3.5 text-zinc-400" />
                        {currentDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
                    </div>
                    <button 
                        onClick={nextMonth}
                        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg transition-all text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white active:scale-95"
                        title="الشهر التالي"
                    >
                        <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </button>
                    <div className="w-px h-3.5 bg-zinc-300 dark:bg-white/10 mx-0.5 hidden sm:block" />
                    <button 
                        onClick={() => {
                            setCurrentDate(new Date());
                            setActiveTab('directory');
                        }}
                        className="px-2.5 h-8 text-[11px] uppercase font-bold tracking-wider bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-xs"
                    >
                        اليوم
                    </button>
                </div>
            </div>

            {/* Compact Metric Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* اجمالى الصافى المستحق */}
                <div className="bg-zinc-50/80 dark:bg-zinc-900/40 p-2.5 px-3.5 flex items-center justify-between border border-zinc-200/80 dark:border-white/10 rounded-xl shadow-xs border-r-4 border-r-emerald-500/80 min-w-0">
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-bold truncate">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">اجمالي الصافي المستحق</span>
                    </span>
                    {isLoadingSummary ? (
                        <div className="h-5 w-20 bg-zinc-200 dark:bg-white/10 rounded animate-pulse shrink-0" />
                    ) : (
                        <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums flex items-baseline gap-1 whitespace-nowrap shrink-0">
                            {summary.expectedSalaries.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-[10px] font-normal opacity-70 font-cairo">EGP</span>
                        </span>
                    )}
                </div>

                {/* إجمالي الغيابات */}
                <div className="bg-zinc-50/80 dark:bg-zinc-900/40 p-2.5 px-3.5 flex items-center justify-between border border-zinc-200/80 dark:border-white/10 rounded-xl shadow-xs border-r-4 border-r-rose-500/80 min-w-0">
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-bold truncate">
                        <CalendarOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className="truncate">الغيابات والشفتات المفقودة</span>
                    </span>
                    {isLoadingSummary ? (
                        <div className="h-5 w-12 bg-zinc-200 dark:bg-white/10 rounded animate-pulse shrink-0" />
                    ) : (
                        <span className="text-sm sm:text-base font-black text-rose-600 dark:text-rose-500 font-mono tabular-nums flex items-baseline gap-1 whitespace-nowrap shrink-0">
                            {summary.totalAbsences}
                            <span className="text-[10px] font-normal opacity-70 font-cairo">غياب</span>
                        </span>
                    )}
                </div>

                {/* مبيعات موظفين (آجل) */}
                <div className="bg-zinc-50/80 dark:bg-zinc-900/40 p-2.5 px-3.5 flex items-center justify-between border border-zinc-200/80 dark:border-white/10 rounded-xl shadow-xs border-r-4 border-r-indigo-500/80 min-w-0">
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-bold truncate">
                        <ShoppingCart className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">مبيعات آجل</span>
                    </span>
                    {isLoadingSummary ? (
                        <div className="h-5 w-20 bg-zinc-200 dark:bg-white/10 rounded animate-pulse shrink-0" />
                    ) : (
                        <span className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400 font-mono tabular-nums flex items-baseline gap-1 whitespace-nowrap shrink-0">
                            {summary.employeeCreditSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-[10px] font-normal opacity-70 font-cairo">EGP</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Taste-Tier Navigation Tabs */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-inner w-full sm:w-auto">
                    <button
                        onClick={() => setActiveTab('directory')}
                        className={cn(
                            "flex items-center gap-2 px-3.5 h-8 rounded-lg text-xs font-bold transition-all tracking-wide",
                            activeTab === 'directory'
                                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/5'
                        )}
                    >
                        <Users className="w-3.5 h-3.5" />
                        {t("tabs.directory") || "دليل الموظفين"}
                    </button>
                    <button
                        onClick={() => setActiveTab('attendance')}
                        className={cn(
                            "flex items-center gap-2 px-3.5 h-8 rounded-lg text-xs font-bold transition-all tracking-wide",
                            activeTab === 'attendance'
                                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/5'
                        )}
                    >
                        <Calendar className="w-3.5 h-3.5" />
                        {t("tabs.attendance") || "إدارة الحضور"}
                    </button>
                    <button
                        onClick={() => setActiveTab('technicians')}
                        className={cn(
                            "flex items-center gap-2 px-3.5 h-8 rounded-lg text-xs font-bold transition-all tracking-wide",
                            activeTab === 'technicians'
                                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/5'
                        )}
                    >
                        <DollarSign className="w-3.5 h-3.5" />
                        تسوية الفنيين
                    </button>
                </div>
            </div>

            {/* Content area */}
            <div className="mt-1">
                {activeTab === 'directory' && <EmployeeDirectory csrfToken={csrfToken} filterDate={currentDate} />}
                {activeTab === 'attendance' && <AttendanceManager csrfToken={csrfToken} filterDate={currentDate} />}
                {activeTab === 'technicians' && <TechniciansPayrollDashboard filterDate={currentDate} currentUserId={currentUserId} branchId={branchId} />}
            </div>
        </div>
    )
}
