'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslations, useLocale } from '@/lib/i18n-mock'
import { 
    CreditCard, 
    Wrench, 
    CalendarCheck, 
    TrendingUp, 
    TrendingDown, 
    CheckCircle2,
    ArrowUpRight,
    Search,
    Printer,
    Snowflake,
    ShieldAlert,
    Plus,
    Pencil,
    Trash2,
    Eye,
    FileText,
    Target,
    AlertCircle,
    RefreshCw,
    Zap,
    DollarSign
} from 'lucide-react'
import { toggleUserFreeze } from '@/actions/hr'
import { deleteEmployeeTransaction, deleteAttendanceEntry } from '@/actions/employee-ledger'
import { getSaleById } from '@/actions/sales-actions'
import { getStoreSettings } from '@/actions/settings'
import { printService } from '@/lib/print-service'
import { generateThermalReceiptHTML } from '@/components/pos/ThermalReceiptTemplate'
import { formatArabicPrintText } from '@/lib/arabic-reshaper'
import EmployeeTransactionModal from './EmployeeTransactionModal'
import EmployeeDataModal from './EmployeeDataModal'
import SalaryPaymentModal from './SalaryPaymentModal'
import ConfirmationModal from '@/components/ui/ConfirmationModal'
import { getEmployeeProfileData } from '@/actions/hr-profile'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import clsx from 'clsx'

interface ProfileData {
    user: any
    hireDate?: string | null
    attendanceLogs: any[]
    tickets: any[]
    transactions: any[]
    clawbacks: any[]
    kpis: {
        contractualSalary: number
        baseSalary: number
        netAccrued: number
        totalDeductions: number
        totalBonuses: number
        maintenanceCommissions: number
        completedTickets: number
        returnCount: number
        successRatio: number
        workflowGaps: number
    }
}

export default function EmployeeProfileClient({
    initialData,
    userId,
    monthStr,
}: {
    initialData: ProfileData
    userId: string
    monthStr: string
}) {
    const t = useTranslations("HR.profile")
    const ta = useTranslations("HR.attendance")
    const tl = useTranslations("HR.ledger")
    const locale = useLocale()
    const router = useRouter()
    
    const [data, setData] = useState(initialData)
    const [isTxModalOpen, setIsTxModalOpen] = useState(false)
    const [isDataModalOpen, setIsDataModalOpen] = useState(false)
    const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false)
    const [selectedTx, setSelectedTx] = useState<any>(null)
    const [modalMode, setModalMode] = useState<'MANUAL' | 'ATTENDANCE'>('MANUAL')
    
    // Confirmation Modal State
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
    const [confirmLoading, setConfirmLoading] = useState(false)

    // Invoice View State
    const [isSaleDetailOpen, setIsSaleDetailOpen] = useState(false)
    const [viewSale, setViewSale] = useState<any>(null)
    const [loadingSale, setLoadingSale] = useState(false)
    const [pendingAction, setPendingAction] = useState<{ 
        type: 'DELETE_TX' | 'TOGGLE_FREEZE', 
        data?: any 
    } | null>(null)

    const refreshData = async () => {
        try {
            const res = await getEmployeeProfileData(userId, monthStr)
            if (res.success && res.data) {
                setData(res.data)
            }
        } catch (error) {
            console.error("Failed to refresh data:", error)
        }
    }

    useEffect(() => {
        setData(initialData)
    }, [initialData])

    const { user, kpis, attendanceLogs, transactions, clawbacks, tickets } = data

    // Phase 3: Financial Ledger Aggregation
    // Unified ledger entries with references
    const ledgerEntries = [
        // Base Salary Entry
        {
            date: (user.hireDate && new Date(user.hireDate) > new Date(`${monthStr}-01`))
                ? new Date(user.hireDate).toLocaleDateString('en-CA')
                : `${monthStr}-01`,
            description: (user.hireDate && new Date(user.hireDate) > new Date(`${monthStr}-01`)) 
                ? "الراتب الأساسي (معدل بناءً على تاريخ التعيين)"
                : tl("salary_base"),
            type: "ADDITION",
            amount: kpis.baseSalary,
            status: "NATIVE",
            id: undefined,
            referenceId: undefined,
            referenceType: undefined
        },
        // 1. Attendance Logs (Only those with financial impact)
        ...attendanceLogs.filter(log => {
            const hasManualFinancials = Number(log.bonus) > 0 || Number(log.deduction) > 0;
            const isAbsent = log.status === 'ABSENT';
            // Only show if it has a manual impact OR it's an absence (which has auto-deduction)
            return hasManualFinancials || isAbsent;
        }).map(log => {
            const isAbsent = log.status === 'ABSENT';
            const isLate = log.status === 'LATE';
            const logBonus = Number(log.bonus || 0);
            const logDeduction = Number(log.deduction || 0);
            
            let amount = logBonus - logDeduction;
            
            // If absent and no manual deduction was recorded, calculate auto-deduction (1 day)
            if (isAbsent && logDeduction === 0) {
                const dailyRate = kpis.contractualSalary / 30;
                amount -= dailyRate;
            }

            return {
                id: log.id,
                date: new Date(log.date).toLocaleDateString('en-CA'),
                description: isAbsent ? "غياب" : (isLate ? "تأخير" : "حضور"),
                type: log.status,
                amount: amount,
                status: "ATTENDANCE",
                referenceId: undefined,
                referenceType: undefined
            };
        }),
        // Manual & System Transactions
        ...transactions.map(tx => {
            const isDeduction = tx.type.endsWith('_DEDUCTION');
            const isReversal = tx.type.endsWith('_REVERSAL');
            
            let finalAmount = Number(tx.amount);
            if (isDeduction) finalAmount = -Math.abs(finalAmount);
            if (isReversal) finalAmount = Math.abs(finalAmount);

            if (!isDeduction && !isReversal) {
                finalAmount = (tx.type === 'BONUS' || tx.type === 'ADDITION') ? tx.amount : -tx.amount;
            }

            return {
                id: tx.id,
                date: new Date(tx.createdAt).toLocaleDateString('en-CA'),
                description: tx.description || "حركة مالية",
                type: tx.type,
                amount: finalAmount,
                status: (isDeduction || isReversal) ? "POS" : "MANUAL",
                referenceId: tx.referenceId,
                referenceType: tx.referenceType
            };
        }),
        ...clawbacks.map(cb => ({
            date: new Date(cb.updatedAt).toLocaleDateString('en-CA'),
            description: `خسارة مرتجع تذكرة #${cb.barcode} (${cb.returnReason || 'عطل فني'})`,
            type: "CLAWBACK",
            amount: -cb.commissionClawback,
            status: "OPERATIONS",
            id: undefined,
            referenceId: cb.id,
            referenceType: 'TICKET'
        })),
        // 3. Maintenance Profits (Commissions)
        ...tickets.filter(t => (t.status === 'COMPLETED' || t.status === 'PAID_DELIVERED') && Number(t.commissionAmount) > 0).map(t => ({
            date: t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-CA') : new Date(t.updatedAt).toLocaleDateString('en-CA'),
            description: `ربح صيانة تذكرة #${t.barcode}`,
            type: "MAINTENANCE_COMMISSION",
            amount: Number(t.commissionAmount),
            status: "OPERATIONS",
            id: undefined,
            referenceId: t.id,
            referenceType: 'TICKET'
        }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const handleViewReference = async (id: string, type: string) => {
        if (type === 'TICKET') {
            router.push(`/${locale}/maintenance/tickets/${id}`)
        } else if (type === 'SALE' || type === 'SALE_REFUND' || type === 'PARTIAL_SALE_REFUND') {
            setLoadingSale(true)
            try {
                const res = await getSaleById(id)
                if (res.success) {
                    setViewSale(res.sale)
                    setIsSaleDetailOpen(true)
                } else {
                    toast.error(res.error)
                }
            } finally {
                setLoadingSale(false)
            }
        }
    }

    const getEntryTypeBadge = (status: string) => {
        switch(status) {
            case 'ATTENDANCE': return <Badge variant="outline" className="border-green-500/20 text-green-400">حضور</Badge>
            case 'OPERATIONS': return <Badge variant="outline" className="border-red-500/20 text-red-400">عمليات</Badge>
            case 'MANUAL': return <Badge variant="outline" className="border-cyan-500/20 text-cyan-400">يدوي</Badge>
            case 'POS': return <Badge variant="outline" className="border-purple-500/20 text-purple-400">نقطة بيع</Badge>
            default: return <Badge variant="outline">نظامي</Badge>
        }
    }

    const kpiCards = [
        { 
            title: "الراتب الأساسي", 
            value: `${kpis.contractualSalary.toLocaleString()} EGP`, 
            icon: <CreditCard className="w-5 h-5 text-zinc-400" />,
            desc: "الراتب الشهري التعاقدي الثابت"
        },
        { 
            title: "الصافي المستحق", 
            value: `${kpis.netAccrued.toLocaleString()} EGP`, 
            icon: <TrendingUp className="w-5 h-5 text-cyan-400" />,
            desc: "المبلغ الإجمالي بعد التسويات",
            highlight: true
        },
        { 
            title: "إجمالي المكسب", 
            value: `${kpis.totalBonuses.toLocaleString()} EGP`, 
            icon: <TrendingUp className="w-5 h-5 text-green-400" />,
            desc: "مكافآت + مكاسب صيانة صافيه"
        },
        { 
            title: "إجمالي الخصومات", 
            value: `${kpis.totalDeductions.toLocaleString()} EGP`, 
            icon: <TrendingDown className="w-5 h-5 text-red-400" />,
            desc: "خصومات + خسائر مرتجعات"
        },
    ]

    const techMetrics = user.technician ? [
        {
            title: "نسبة النجاح",
            value: `${kpis.successRatio}%`,
            icon: <Target className="w-5 h-5 text-cyan-400" />,
            desc: "نسبة الأجهزة المنجزة بدون مرتجع",
            progress: kpis.successRatio
        },
        {
            title: "مخاطر سير العمل",
            value: kpis.workflowGaps.toString(),
            icon: <AlertCircle className="w-5 h-5 text-orange-400" />,
            desc: "أجهزة تجاوزت الوقت المتوقع",
            isWarning: kpis.workflowGaps > 0
        },
        {
            title: "عدد المرتجعات",
            value: kpis.returnCount.toString(),
            icon: <RefreshCw className="w-5 h-5 text-red-400" />,
            desc: "أجهزة عادت من الضمان هذا الشهر",
            isDanger: kpis.returnCount > 3
        },
        {
            title: "الأجهزة المنجزة",
            value: kpis.completedTickets.toString(),
            icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
            desc: "تذاكر مغلقة بنجاح"
        }
    ] : []

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Phase 1: Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-card/40 p-8 rounded-3xl border border-white/5 backdrop-blur-xl shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[100px] rounded-full -mr-32 -mt-32" />
                
                <div className="flex items-center gap-6 z-10">
                    <Avatar className="w-24 h-24 border-2 border-cyan-500/20 shadow-xl ring-4 ring-black/20">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} />
                        <AvatarFallback className="bg-zinc-800 text-2xl">{user.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-extrabold tracking-tight text-white">{user.name}</h1>
                            {user.hireDate && (
                                <Badge variant="outline" className="bg-white/5 border-white/10 text-zinc-400 text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                                    <CalendarCheck className="w-3 h-3 text-cyan-400" />
                                    تعيين: {new Date(user.hireDate).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-cyan-400 font-medium text-lg">{user.role?.name || user.roleStr}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-zinc-400">{user.branch?.name || 'Main Branch'}</span>
                        </div>
                        <div className="pt-2">
                            {user.isFrozen ? (
                                <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 px-3 py-1 font-bold animate-pulse">
                                    <Snowflake className="w-3 h-3 mr-1" /> حساب مجمد
                                </Badge>
                            ) : (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 font-bold">
                                    على رأس العمل
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 z-10">
                    <button 
                        onClick={() => {
                            setPendingAction({ type: 'TOGGLE_FREEZE' })
                            setIsConfirmModalOpen(true)
                        }}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                            user.isFrozen 
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" 
                                : "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                        )}
                    >
                        {user.isFrozen ? <ShieldAlert className="w-4 h-4" /> : <Snowflake className="w-4 h-4" />}
                        {user.isFrozen ? 'إلغاء التجميد' : 'تجميد الحساب'}
                    </button>
                    <button className="flex items-center gap-2 bg-zinc-900 border border-white/5 px-4 py-2 rounded-xl text-sm font-bold text-zinc-300 hover:bg-zinc-800 transition-all">
                        <Printer className="w-4 h-4" /> طباعة كشف الحساب
                    </button>
                    <Button 
                        onClick={() => setIsDataModalOpen(true)}
                        className="bg-cyan-500 text-black border-none hover:bg-cyan-400 font-bold rounded-xl px-6"
                    >
                        <Pencil className="w-4 h-4 mr-2" />
                        تعديل البيانات
                    </Button>
                    <Button 
                        onClick={() => setIsSalaryModalOpen(true)}
                        className="bg-emerald-600 text-white border-none hover:bg-emerald-500 font-bold rounded-xl px-6 shadow-lg shadow-emerald-500/20"
                    >
                        <DollarSign className="w-4 h-4 mr-2" />
                        سداد المرتب
                    </Button>
                </div>
            </div>

            {/* Main Financial KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {kpiCards.map((card, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <Card className={clsx(
                            "border-white/5 overflow-hidden relative group h-full",
                            card.highlight ? "bg-cyan-500/5 ring-1 ring-cyan-500/20 shadow-cyan-500/10 shadow-lg" : "bg-zinc-950/40"
                        )}>
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className={clsx(
                                        "p-2 rounded-xl",
                                        card.highlight ? "bg-cyan-500/20" : "bg-white/5"
                                    )}>
                                        {card.icon}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{card.title}</p>
                                    <h3 className={clsx(
                                        "text-2xl font-black tracking-tighter",
                                        card.highlight ? "text-cyan-400" : "text-white"
                                    )}>
                                        {card.value}
                                    </h3>
                                    <p className="text-zinc-600 text-[10px]">{card.desc}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Technician Performance Details */}
            {user.technician && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/10 rounded-xl">
                            <TrendingUp className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">تحليلات الأداء والإنتاجية</h2>
                            <p className="text-sm text-zinc-500">نظرة عميقة على جودة العمل وسير العمل التقني</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {techMetrics.map((metric, i) => (
                            <Card key={i} className="bg-zinc-950/40 border-white/5 backdrop-blur-xl p-6 rounded-3xl relative group overflow-hidden border">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div className={clsx(
                                            "p-2 rounded-xl",
                                            metric.isDanger ? "bg-red-500/10" : metric.isWarning ? "bg-orange-500/10" : "bg-cyan-500/10"
                                        )}>
                                            {metric.icon}
                                        </div>
                                        {metric.progress !== undefined && (
                                            <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-lg">
                                                {metric.progress}%
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">{metric.title}</h4>
                                        <div className="flex items-baseline gap-2">
                                            <span className={clsx(
                                                "text-2xl font-black",
                                                metric.isDanger ? "text-red-400" : metric.isWarning ? "text-orange-400" : "text-white"
                                            )}>
                                                {metric.value}
                                            </span>
                                        </div>
                                        <p className="text-zinc-600 text-[10px] mt-2 leading-tight">{metric.desc}</p>
                                    </div>
                                    {metric.progress !== undefined && (
                                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-4">
                                            <div 
                                                className="h-full bg-cyan-500 transition-all duration-1000" 
                                                style={{ width: `${metric.progress}%` }} 
                                            />
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Phase 2: Tabs */}
            <Tabs defaultValue="ledger" className="w-full">
                <div className="flex justify-between items-center mb-6">
                    <TabsList className="bg-card/40 border border-white/5 p-1 h-auto rounded-2xl">
                        <TabsTrigger value="ledger" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all">
                            <CreditCard className="w-4 h-4" /> كشف الحساب
                        </TabsTrigger>
                        <TabsTrigger value="service" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all">
                            <Wrench className="w-4 h-4" /> سجل الصيانة
                        </TabsTrigger>
                        <TabsTrigger value="attendance" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all">
                            <CalendarCheck className="w-4 h-4" /> سجل الحضور
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => {
                                setSelectedTx(null)
                                setModalMode('MANUAL')
                                setIsTxModalOpen(true)
                            }}
                            className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-xl text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" /> إضافة حركة
                        </button>
                        <div className="flex items-center gap-3 bg-card/40 border border-white/5 px-4 py-2 rounded-2xl">
                            <span className="text-xs font-bold text-zinc-500 tracking-widest uppercase">الفترة:</span>
                            <span className="text-sm font-bold text-cyan-400 underline decoration-cyan-500/30 underline-offset-4 cursor-pointer">
                                {monthStr}
                            </span>
                        </div>
                    </div>
                </div>

                <TabsContent value="ledger" className="mt-0 focus-visible:ring-0">
                    <Card className="bg-card/40 border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
                        <div className="p-6 bg-white/[0.02] border-b border-white/5 flex justify-between items-center">
                            <h2 className="text-lg font-bold">{tl("title")}</h2>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/5 rounded-xl">
                                <Search className="w-3.5 h-3.5 text-zinc-500" />
                                <input placeholder={tl("search")} className="bg-transparent border-none text-xs focus:ring-0 text-white w-32" />
                            </div>
                        </div>
                        <div className="overflow-x-auto min-h-[400px]">
                            <table className="w-full text-right">
                                <thead className="bg-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                    <tr>
                                        <th className="p-4 border-b border-white/5">{tl("date")}</th>
                                        <th className="p-4 border-b border-white/5">{tl("description")}</th>
                                        <th className="p-4 border-b border-white/5">{tl("type")}</th>
                                        <th className="p-4 border-b border-white/5">{tl("amount")}</th>
                                        <th className="p-4 border-b border-white/5 text-left">{tl("actions")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {ledgerEntries.length > 0 ? ledgerEntries.map((entry, idx) => (
                                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="p-4 text-xs font-mono text-zinc-500">{entry.date}</td>
                                            <td className="p-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-sm font-bold text-zinc-200">{entry.description}</span>
                                                    <span className="text-[10px] text-zinc-500 font-medium group-hover:text-cyan-400 transition-colors">ID: {entry.status}-{idx}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">{getEntryTypeBadge(entry.status)}</td>
                                            <td className={clsx(
                                                "p-4 text-sm font-black tabular-nums",
                                                entry.amount > 0 ? "text-emerald-400" : "text-rose-400"
                                            )}>
                                                {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()} EGP
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    {entry.referenceId && (
                                                        <button 
                                                            onClick={() => handleViewReference(entry.referenceId, entry.referenceType)}
                                                            disabled={loadingSale}
                                                            className="px-2 py-1 flex items-center gap-1 hover:bg-cyan-500/10 rounded-lg text-cyan-400 transition-colors"
                                                            title="عرض التفاصيل"
                                                        >
                                                            {loadingSale ? <div className="w-3 h-3 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                                                            <span className="text-[10px] font-bold">عرض</span>
                                                        </button>
                                                    )}
                                                    {entry.status === 'MANUAL' || entry.status === 'ATTENDANCE' ? (
                                                        <>
                                                        <button 
                                                            onClick={() => {
                                                                if (entry.status === 'MANUAL') {
                                                                    setSelectedTx(transactions.find((tx: any) => tx.id === entry.id))
                                                                    setModalMode('MANUAL')
                                                                } else {
                                                                    const log = attendanceLogs.find((l: any) => l.id === entry.id)
                                                                    setSelectedTx({
                                                                        id: log.id,
                                                                        type: entry.type,
                                                                        amount: entry.amount,
                                                                        description: entry.description,
                                                                        date: entry.date
                                                                    })
                                                                    setModalMode('ATTENDANCE')
                                                                }
                                                                setIsTxModalOpen(true)
                                                            }}
                                                            className="px-2 py-1 flex items-center gap-1 hover:bg-zinc-500/10 rounded-lg text-zinc-400 transition-colors"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                            <span className="text-[10px] font-bold">{tl("edit")}</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                setPendingAction({ 
                                                                    type: 'DELETE_TX', 
                                                                    data: { id: entry.id, type: entry.type, status: entry.status } 
                                                                })
                                                                setIsConfirmModalOpen(true)
                                                            }}
                                                            className="px-2 py-1 flex items-center gap-1 hover:bg-rose-500/10 rounded-lg text-rose-400 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            <span className="text-[10px] font-bold">{tl("delete")}</span>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-none text-[10px] font-bold">
                                                        {tl("system")}
                                                    </Badge>
                                                )}
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr className="hover:bg-white/[0.02] transition-colors">
                                            <td className="p-4 text-xs font-mono text-zinc-400">---</td>
                                            <td className="p-4 text-sm font-medium">{tl("no_transactions")}</td>
                                            <td className="p-4"><Badge variant="outline">{tl("system")}</Badge></td>
                                            <td className="p-4 text-sm font-black">---</td>
                                            <td className="p-4 font-bold text-xs text-zinc-600 italic">لا توجد بيانات</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="service" className="mt-0 focus-visible:ring-0">
                    <Card className="bg-card/40 border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
                        <div className="p-6 bg-white/[0.02] border-b border-white/5 flex justify-between items-center">
                            <h2 className="text-lg font-bold">تاريخ الخدمات والعمليات</h2>
                             <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-mono">
                                {data.tickets.length} تذكرة
                             </Badge>
                        </div>
                        <div className="overflow-x-auto min-h-[400px]">
                            <table className="w-full text-right">
                                <thead className="bg-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                    <tr>
                                        <th className="p-4 border-b border-white/5">رقم التذكرة</th>
                                        <th className="p-4 border-b border-white/5">الجهاز / العميل</th>
                                        <th className="p-4 border-b border-white/5">التاريخ</th>
                                        <th className="p-4 border-b border-white/5">الحالة</th>
                                        <th className="p-4 border-b border-white/5">الإجراء</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.tickets.length > 0 ? data.tickets.map((ticket, idx) => (
                                        <tr key={ticket.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="p-4 font-mono font-bold text-cyan-400">#{ticket.barcode}</td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-zinc-200">{ticket.brand} {ticket.model}</span>
                                                    <span className="text-[10px] text-zinc-500">{ticket.customerName || 'عميل نقدي'}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-xs font-mono text-zinc-500">
                                                {new Date(ticket.createdAt).toLocaleDateString('ar-EG')}
                                            </td>
                                            <td className="p-4">
                                                <Badge className={clsx(
                                                    "text-[10px] font-bold px-2 py-0.5 border-none",
                                                    ticket.status === 'PAID_DELIVERED' ? "bg-emerald-500/10 text-emerald-400" :
                                                    ticket.status === 'CANCELLED' ? "bg-rose-500/10 text-rose-400" :
                                                    "bg-cyan-500/10 text-cyan-400"
                                                )}>
                                                    {ticket.status}
                                                </Badge>
                                            </td>
                                            <td className="p-4">
                                                <button className="text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 transition-colors">
                                                    <Search className="w-3 h-3" /> فتح التذكرة
                                                </button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5} className="p-20 text-center text-zinc-600">
                                                <Wrench className="w-12 h-12 opacity-20 mx-auto mb-4" />
                                                <p className="font-bold tracking-widest uppercase text-xs">لا توجد عمليات مسجلة</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="attendance" className="mt-0 focus-visible:ring-0">
                    <Card className="bg-card/40 border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
                        <div className="p-6 bg-white/[0.02] border-b border-white/5 flex justify-between items-center">
                            <h2 className="text-lg font-bold">سجل الحضور والانصراف التفصيلي</h2>
                             <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono">
                                {data.attendanceLogs.length} سجل
                             </Badge>
                        </div>
                        <div className="overflow-x-auto min-h-[400px]">
                            <table className="w-full text-right">
                                <thead className="bg-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                    <tr>
                                        <th className="p-4 border-b border-white/5">التاريخ</th>
                                        <th className="p-4 border-b border-white/5">الحالة</th>
                                        <th className="p-4 border-b border-white/5">المكافأة</th>
                                        <th className="p-4 border-b border-white/5">الخصم</th>
                                        <th className="p-4 border-b border-white/5">ملاحظات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.attendanceLogs.length > 0 ? data.attendanceLogs.map((log, idx) => (
                                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="p-4 text-xs font-mono text-zinc-500">{new Date(log.date).toLocaleDateString('ar-EG')}</td>
                                            <td className="p-4">
                                                <Badge className={clsx(
                                                    "text-[10px] font-bold px-2 py-0.5 border-none",
                                                    log.status === 'PRESENT' ? "bg-emerald-500/10 text-emerald-400" :
                                                    log.status === 'ABSENT' ? "bg-rose-500/10 text-rose-400" :
                                                    "bg-zinc-500/10 text-zinc-400"
                                                )}>
                                                    {log.status}
                                                </Badge>
                                            </td>
                                            <td className="p-4 text-sm font-bold text-emerald-400">
                                                {log.bonus > 0 ? `+${log.bonus.toLocaleString()}` : '---'}
                                            </td>
                                            <td className="p-4 text-sm font-bold text-rose-400">
                                                {log.deduction > 0 ? `-${log.deduction.toLocaleString()}` : '---'}
                                            </td>
                                            <td className="p-4 text-xs text-zinc-400">
                                                <div className="flex flex-col gap-1">
                                                    {log.bonusNote && <div className="text-emerald-500/80">مكافأة: {log.bonusNote}</div>}
                                                    {log.deductionNote && <div className="text-rose-500/80">خصم: {log.deductionNote}</div>}
                                                    {log.note && <div className="italic opacity-60">{log.note}</div>}
                                                    {!log.bonusNote && !log.deductionNote && !log.note && '---'}
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5} className="p-20 text-center text-zinc-600">
                                                <CalendarCheck className="w-12 h-12 opacity-20 mx-auto mb-4" />
                                                <p className="font-bold tracking-widest uppercase text-xs">لا توجد سجلات حضور</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>

            <EmployeeTransactionModal 
                isOpen={isTxModalOpen}
                onClose={() => setIsTxModalOpen(false)}
                onSuccess={refreshData}
                userId={userId}
                transaction={selectedTx}
                mode={modalMode}
            />

            <EmployeeDataModal 
                isOpen={isDataModalOpen}
                onClose={() => setIsDataModalOpen(false)}
                onSuccess={refreshData}
                userId={userId}
                initialData={{
                    name: user.name || '',
                    roleId: user.roleId || '',
                    branchId: user.branchId || '',
                    salary: user.salary ? Number(user.salary) : 0,
                    monthlyOffDays: user.monthlyOffDays ?? 4,
                    hireDate: user.hireDate || null
                }}
            />

            <SalaryPaymentModal 
                isOpen={isSalaryModalOpen}
                onClose={() => setIsSalaryModalOpen(false)}
                onSuccess={refreshData}
                userId={userId}
                suggestedAmount={kpis.netAccrued}
                userName={user.name}
            />

            <ConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={() => {
                    setIsConfirmModalOpen(false)
                    setPendingAction(null)
                }}
                onConfirm={async () => {
                    if (!pendingAction) return
                    setConfirmLoading(true)
                    try {
                        if (pendingAction.type === 'DELETE_TX') {
                            const { id, type, status } = pendingAction.data
                            const reason = 'Manual deletion via ledger'
                            let res;
                            if (status === 'MANUAL') {
                                res = await deleteEmployeeTransaction(id, userId, reason)
                            } else {
                                res = await deleteAttendanceEntry(id, type, userId, reason)
                            }

                            if (res.success) {
                                toast.success('تم حذف الحركة بنجاح')
                                refreshData()
                                setIsConfirmModalOpen(false)
                            } else {
                                toast.error(res.error)
                            }
                        } else if (pendingAction.type === 'TOGGLE_FREEZE') {
                            const res = await toggleUserFreeze(userId);
                            if (res.success) {
                                toast.success(res.message);
                                setData(prev => ({ ...prev, user: { ...prev.user, isFrozen: res.isFrozen } }));
                                setIsConfirmModalOpen(false)
                            } else {
                                toast.error(res.error);
                            }
                        }
                    } finally {
                        setConfirmLoading(false)
                    }
                }}
                loading={confirmLoading}
                title={pendingAction?.type === 'TOGGLE_FREEZE' ? (user.isFrozen ? 'إلغاء تجميد الحساب' : 'تجميد الحساب') : "تأكيد الحذف"}
                message={
                    pendingAction?.type === 'TOGGLE_FREEZE' 
                        ? (user.isFrozen ? 'هل تريد إلغاء تجميد حساب الموظف؟' : 'هل تريد تجميد الحساب؟ سيتم تسجيل خروج الموظف ومنعه من الدخول فوراً.')
                        : "هل أنت متأكد من حذف هذه الحركة؟ سيتم استرجاع أي مبالغ تم خصمها إلى الخزينة المرتبطة وإلغاء القيود المحاسبية."
                }
                confirmText={pendingAction?.type === 'TOGGLE_FREEZE' ? (user.isFrozen ? 'إلغاء التجميد' : 'تجميد الحساب') : "حذف الحركة"}
                cancelText="تراجع"
                variant={pendingAction?.type === 'TOGGLE_FREEZE' ? (user.isFrozen ? 'info' : 'danger') : 'danger'}
            />

            {/* Invoice Detail Dialog */}
            <Dialog open={isSaleDetailOpen} onOpenChange={setIsSaleDetailOpen}>
                <DialogContent className="max-w-3xl bg-zinc-950 border-white/5 text-right p-0 overflow-hidden rounded-3xl">
                    {viewSale && (
                        <div className="flex flex-col max-h-[90vh]">
                            <DialogHeader className="p-6 border-b border-white/5 bg-white/[0.02]">
                                <div className="flex justify-between items-center w-full">
                                    <Badge className="bg-cyan-500/10 text-cyan-400 border-none font-mono">
                                        #{viewSale.invoiceNumber}
                                    </Badge>
                                    <DialogTitle className="text-xl font-black tracking-tighter">تفاصيل الفاتورة</DialogTitle>
                                </div>
                            </DialogHeader>
                            
                            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                {/* Header Info */}
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-1">
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mb-2">العميل</div>
                                        <div className="text-lg font-black text-white">{viewSale.customer?.name || 'عميل نقدي'}</div>
                                        <div className="text-xs text-zinc-400 font-mono">{viewSale.customer?.phone || '---'}</div>
                                    </div>
                                    <div className="space-y-1 text-left">
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mb-2 text-right">التاريخ</div>
                                        <div className="text-sm font-bold text-zinc-200">{new Date(viewSale.createdAt).toLocaleString('ar-EG')}</div>
                                        <div className="text-[10px] text-zinc-500 font-mono">البائع: {viewSale.user?.name}</div>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="rounded-2xl border border-white/5 overflow-hidden">
                                    <table className="w-full text-right text-xs">
                                        <thead className="bg-white/5 text-zinc-500 font-bold uppercase tracking-widest">
                                            <tr>
                                                <th className="p-3">المنتج</th>
                                                <th className="p-3">الكمية</th>
                                                <th className="p-3">السعر</th>
                                                <th className="p-3">الإجمالي</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {viewSale.items.map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-white/[0.02]">
                                                    <td className="p-3 font-bold">{item.product.name}</td>
                                                    <td className="p-3 font-mono">{item.quantity}</td>
                                                    <td className="p-3 font-mono">{item.unitPrice.toLocaleString()}</td>
                                                    <td className="p-3 font-bold text-white">{(item.quantity * item.unitPrice).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Totals */}
                                <div className="bg-white/[0.03] rounded-3xl p-6 space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 font-bold uppercase tracking-widest">المجموع الفرعي</span>
                                        <span className="font-mono">{viewSale.subTotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 font-bold uppercase tracking-widest text-cyan-400">الخصم</span>
                                        <span className="font-mono text-cyan-400">-{viewSale.discountAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 font-bold uppercase tracking-widest text-emerald-400">الضريبة (14%)</span>
                                        <span className="font-mono text-emerald-400">+{viewSale.taxAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="h-px bg-white/10 my-4" />
                                    <div className="flex justify-between items-end">
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">الإجمالي النهائي</div>
                                        <div className="text-4xl font-black text-white tabular-nums tracking-tighter">
                                            {viewSale.totalAmount.toLocaleString()} <span className="text-sm font-bold text-zinc-500">EGP</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <CardFooter className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
                                <button 
                                    onClick={() => setIsSaleDetailOpen(false)}
                                    className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-2xl font-bold text-sm transition-all"
                                >
                                    إغلاق
                                </button>
                                <button 
                                    onClick={async () => {
                                        const settingsRes = await getStoreSettings();
                                        if (settingsRes.success) {
                                            const html = generateThermalReceiptHTML({ 
                                                saleData: viewSale, 
                                                settings: settingsRes.data 
                                            });
                                            await printService.printHTML(html);
                                        }
                                    }}
                                    className="flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-8 py-3 rounded-2xl font-bold text-sm transition-all"
                                >
                                    <Printer className="w-4 h-4" /> طباعة نسخة
                                </button>
                            </CardFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
