"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "@/lib/i18n-mock"
import EmployeeDirectory from "@/components/hr/EmployeeDirectory"
import AttendanceManager from "@/components/hr/AttendanceManager"
import { Users, Calendar, DollarSign, CalendarOff, ShoppingCart, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { getHRDashboardSummary } from "@/actions/hr"
import { cn } from "@/lib/utils"

export default function HRClient({ csrfToken }: { csrfToken: string }) {
    const t = useTranslations("HR")
    const [activeTab, setActiveTab] = useState<'directory' | 'attendance'>('directory')
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
        <div className="p-8 space-y-8 animate-in fade-in duration-500 font-cairo max-w-[2400px] mx-auto" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-200 dark:border-white/5">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-black flex items-center gap-3 text-zinc-900 dark:text-white uppercase tracking-tight">
                        <div className="p-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/20">
                            <Users className="w-6 h-6" />
                        </div>
                        {t("title") || "شؤون الموظفين"}
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 font-bold text-sm tracking-wide mt-1">{t("subtitle") || "إدارة الموظفين والحضور اليومي"}</p>
                </div>

                {/* Date Filter */}
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
                    <div className="w-px h-4 bg-zinc-200 dark:bg-white/10 mx-1 hidden sm:block" />
                    <button 
                        onClick={() => {
                            setCurrentDate(new Date());
                            setActiveTab('directory');
                        }}
                        className="mr-1 px-5 h-10 text-[11px] uppercase font-black tracking-widest bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg"
                    >
                        اليوم
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* اجمالى الصافى المستحق */}
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-zinc-900/50 dark:border-b-white/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <DollarSign className="w-3.5 h-3.5 text-zinc-400" />
                        اجمالى الصافى المستحق
                    </span>
                    {isLoadingSummary ? (
                        <div className="h-8 w-24 bg-zinc-200 dark:bg-white/10 rounded-lg animate-pulse" />
                    ) : (
                        <span className="text-2xl font-black text-zinc-900 dark:text-white font-mono flex items-center gap-1.5 tabular-nums">
                            {summary.expectedSalaries.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs font-normal opacity-70 italic font-cairo">EGP</span>
                        </span>
                    )}
                </div>

                {/* إجمالي الغيابات */}
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-rose-500/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <CalendarOff className="w-3.5 h-3.5 text-rose-500" />
                        إجمالي الغيابات والشفتات المفقودة
                    </span>
                    {isLoadingSummary ? (
                        <div className="h-8 w-16 bg-zinc-200 dark:bg-white/10 rounded-lg animate-pulse" />
                    ) : (
                        <span className="text-2xl font-black text-rose-600 dark:text-rose-500 font-mono flex items-center gap-1.5 tabular-nums">
                            {summary.totalAbsences}
                            <span className="text-xs font-normal opacity-70 italic font-cairo">غياب</span>
                        </span>
                    )}
                </div>

                {/* مبيعات موظفين (آجل) */}
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-primary/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <ShoppingCart className="w-3.5 h-3.5 text-primary" />
                        مبيعات موظفين (آجل)
                    </span>
                    {isLoadingSummary ? (
                        <div className="h-8 w-24 bg-zinc-200 dark:bg-white/10 rounded-lg animate-pulse" />
                    ) : (
                        <span className="text-2xl font-black text-primary font-mono flex items-center gap-1.5 tabular-nums">
                            {summary.employeeCreditSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs font-normal opacity-70 italic font-cairo">EGP</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-1.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-white/10 w-fit shadow-inner">
                <button
                    onClick={() => setActiveTab('directory')}
                    className={cn(
                        "flex items-center gap-3 px-8 h-12 rounded-xl text-sm font-black transition-all tracking-wide uppercase",
                        activeTab === 'directory'
                            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5'
                    )}
                >
                    <Users className="w-4 h-4" />
                    {t("tabs.directory")}
                </button>
                <button
                    onClick={() => setActiveTab('attendance')}
                    className={cn(
                        "flex items-center gap-3 px-8 h-12 rounded-xl text-sm font-black transition-all tracking-wide uppercase",
                        activeTab === 'attendance'
                            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5'
                    )}
                >
                    <Calendar className="w-4 h-4" />
                    {t("tabs.attendance")}
                </button>
            </div>

            {/* Content area */}
            <div className="mt-8">
                {activeTab === 'directory' && <EmployeeDirectory csrfToken={csrfToken} filterDate={currentDate} />}
                {activeTab === 'attendance' && <AttendanceManager csrfToken={csrfToken} filterDate={currentDate} />}
            </div>
        </div>
    )
}
