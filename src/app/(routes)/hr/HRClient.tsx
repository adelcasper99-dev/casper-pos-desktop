"use client"

import { useState } from "react"
import { useTranslations } from "@/lib/i18n-mock"
import EmployeeDirectory from "@/components/hr/EmployeeDirectory"
import AttendanceManager from "@/components/hr/AttendanceManager"
import { Users, Calendar } from "lucide-react"

export default function HRClient({ csrfToken }: { csrfToken: string }) {
    const t = useTranslations("HR")
    const [activeTab, setActiveTab] = useState<'directory' | 'attendance'>('directory')

    return (
        <div className="p-6 w-full space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                    {t("title")}
                </h1>
                <p className="text-muted-foreground">{t("subtitle")}</p>
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
