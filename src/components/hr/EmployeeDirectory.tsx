"use client"

import { useEffect, useState } from "react"
import { Search, MapPin, MapPinned, User as UserIcon, Calendar, DollarSign, Clock } from "lucide-react"
import { getStaffDirectory } from "@/actions/hr"
import clsx from "clsx"

export default function EmployeeDirectory({ csrfToken }: { csrfToken: string }) {
    const [staff, setStaff] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    const loadStaff = async () => {
        setLoading(true)
        const res = await getStaffDirectory()
        if (res.success && res.data) {
            setStaff(res.data)
        }
        setLoading(false)
    }

    useEffect(() => {
        loadStaff()
    }, [])

    const filteredStaff = staff.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.username.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Search */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-2xl border border-white/5 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Staff Directory</h2>
                    <p className="text-xs text-muted-foreground">{staff.length} Active Members</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search staff..."
                            className="w-full glass-input pl-10 h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredStaff.map((member) => (
                        <StaffCard key={member.id} member={member} />
                    ))}
                </div>
            )}
        </div>
    )
}

function StaffCard({ member }: { member: any }) {
    const isOnline = member.status === 'ONLINE'

    return (
        <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-white/5 to-transparent hover:from-white/10 hover:border-white/10 transition-all duration-300 backdrop-blur-sm cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-1">
            {/* Status Indicator Stripe */}
            <div className={clsx(
                "absolute top-0 left-0 w-full h-1",
                isOnline ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-zinc-700"
            )} />

            <div className="p-5 flex flex-col items-center">
                {/* Avatar */}
                <div className="relative mb-3">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white shadow-inner border-2 border-white/10">
                        {member.avatarSeed.substring(0, 2).toUpperCase()}
                    </div>
                    {isOnline && (
                        <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-green-500 border-2 border-zinc-900 animate-pulse" />
                    )}
                </div>

                <h3 className="font-bold text-lg text-white truncate w-full text-center">{member.name}</h3>
                <p className="text-sm text-indigo-300 font-medium mb-4">{member.role}</p>

                {/* Info Grid */}
                <div className="w-full space-y-2 bg-black/20 rounded-xl p-3 border border-white/5">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> Branch</span>
                        <span className="text-zinc-200">{member.branch}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Base Salary</span>
                        <span className="text-zinc-200 font-mono">${member.salary}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                        <span className="text-zinc-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Status</span>
                        <span className={clsx("font-medium", isOnline ? "text-green-400" : "text-zinc-500")}>
                            {isOnline ? "Online" : "Offline"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
