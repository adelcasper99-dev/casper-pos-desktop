"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "@/lib/i18n-mock"
import EmployeeDirectory from "@/components/hr/EmployeeDirectory"
import AttendanceManager from "@/components/hr/AttendanceManager"
import { Users, Calendar, DollarSign, CalendarOff, ShoppingCart, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { getHRDashboardSummary } from "@/actions/hr"

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
        <div className="p-6 w-full space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        {t("title") || "HR Dashboard"}
                    </h1>
                    <p className="text-muted-foreground">{t("subtitle") || "Manage staff directory and attendance"}</p>
                </div>

                {/* Date Filter */}
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1.5 backdrop-blur-md shadow-lg">
                    <button 
                        onClick={prevMonth}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1 text-sm font-semibold min-w-[140px] justify-center text-white">
                        <CalendarDays className="w-4 h-4 text-primary" />
                        {currentDate.toLocaleDateString('ar-AR', { month: 'long', year: 'numeric' })}
                    </div>
                    <button 
                        onClick={nextMonth}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setCurrentDate(new Date())}
                        className="ml-2 px-3 py-1 text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-all"
                    >
                        Today
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* اجمالى الصافى المستحق */}
                <div className="bg-card/50 backdrop-blur-md p-5 rounded-2xl border border-white/5 flex flex-col gap-2 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-primary/20" />
                    <div className="flex items-center gap-3 text-zinc-400">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                            <DollarSign className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">اجمالى الصافى المستحق</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-bold text-emerald-500/80 tracking-wider">LIVE</span>
                            </div>
                        </div>
                    </div>
                    {isLoadingSummary ? (
                        <div className="h-8 w-24 bg-white/5 rounded-lg animate-pulse mt-1" />
                    ) : (
                        <div className="text-2xl font-bold font-mono tracking-tight text-white mt-1">
                            ${summary.expectedSalaries.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    )}
                </div>

                {/* إجمالي الغيابات */}
                <div className="bg-card/50 backdrop-blur-md p-5 rounded-2xl border border-white/5 flex flex-col gap-2 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-red-500/20" />
                    <div className="flex items-center gap-3 text-zinc-400">
                        <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
                            <CalendarOff className="w-5 h-5" />
                        </div>
                        <span className="font-medium text-sm">إجمالي الغيابات</span>
                    </div>
                    {isLoadingSummary ? (
                        <div className="h-8 w-16 bg-white/5 rounded-lg animate-pulse mt-1" />
                    ) : (
                        <div className="text-2xl font-bold font-mono tracking-tight text-white mt-1">
                            {summary.totalAbsences}
                        </div>
                    )}
                </div>

                {/* مبيعات موظفين (آجل) */}
                <div className="bg-card/50 backdrop-blur-md p-5 rounded-2xl border border-white/5 flex flex-col gap-2 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-emerald-500/20" />
                    <div className="flex items-center gap-3 text-zinc-400">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                            <ShoppingCart className="w-5 h-5" />
                        </div>
                        <span className="font-medium text-sm">مبيعات موظفين (آجل)</span>
                    </div>
                    {isLoadingSummary ? (
                        <div className="h-8 w-24 bg-white/5 rounded-lg animate-pulse mt-1" />
                    ) : (
                        <div className="text-2xl font-bold font-mono tracking-tight text-white mt-1 flex gap-2 items-baseline">
                            ${summary.employeeCreditSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
                <button
                    onClick={() => setActiveTab('directory')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'directory'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Users className="w-4 h-4" />
                    {t("tabs.directory")}
                </button>
                <button
                    onClick={() => setActiveTab('attendance')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'attendance'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Calendar className="w-4 h-4" />
                    {t("tabs.attendance")}
                </button>
            </div>

            {/* Content area */}
            <div className="mt-6">
                {activeTab === 'directory' && <EmployeeDirectory csrfToken={csrfToken} />}
                {activeTab === 'attendance' && <AttendanceManager csrfToken={csrfToken} />}
            </div>
        </div>
    )
}
