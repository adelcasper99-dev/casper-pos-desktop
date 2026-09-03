import { useState, useEffect, useTransition, useMemo } from 'react'
import {
    Search, User as UserIcon, Plus, Edit2, Trash2, MoreHorizontal,
    Clock, AlertTriangle, AlertCircle, X, Shield, Wrench, Filter, ChevronDown, Download,
    Printer, Settings as SettingsIcon, StickyNote, Zap, Activity
} from "lucide-react"

import { Switch } from "@/components/ui/switch"
import { printService } from "@/lib/print-service"
import { useRouter } from 'next/navigation'
import { useDebouncedCallback } from 'use-debounce'
import { CasperLoader } from "@/components/ui/CasperLoader"
import { useTranslations, useLocale } from '@/lib/i18n-mock'
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FlatpickrRangePicker } from '@/components/ui/flatpickr-range-picker'
import {
    format, isToday, isYesterday, isThisWeek, isThisMonth,
    startOfDay, endOfDay, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, subDays, formatDistanceToNow
} from 'date-fns'
import { DateRange } from "react-day-picker"
import { cn } from '@/lib/utils'
import { getTickets as fetchTickets } from "@/actions/ticket-actions"
import { getEffectiveStoreSettings, updateStoreSettings } from "@/actions/settings"
import TicketQuickEditModal from './TicketQuickEditModal'
import TicketDeleteDialog from './TicketDeleteDialog'
import TicketPrintOptionsModal, { checkPrinterAndRedirect } from './TicketPrintOptionsModal'
import { toast } from "sonner"

export default function TicketsList() {
    const t = useTranslations('Tickets');
    const locale = useLocale();
    const [tickets, setTickets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [query, setQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [showStale, setShowStale] = useState(false)
    
    // Unified Date Filtering - Defaulting to Today
    const [dateFilter, setDateFilter] = useState<string>("today")
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfDay(new Date()),
        to: endOfDay(new Date())
    })

    const [isPending, startTransition] = useTransition()
    const [sortByUrgency, setSortByUrgency] = useState(false)
    const router = useRouter()

    const [editingTicket, setEditingTicket] = useState<any>(null)
    const [deletingTicket, setDeletingTicket] = useState<any>(null)
    const [showEditModal, setShowEditModal] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: 'createdAt', direction: 'desc' });
    const [settings, setSettings] = useState<any>(null)
    const [showPrintOptions, setShowPrintOptions] = useState(false)
    const [printTicket, setPrintTicket] = useState<any>(null)
    const [printMode, setPrintMode] = useState<'receipt' | 'label' | 'engineer'>('receipt')
    const [isSilentPrint, setIsSilentPrint] = useState(false)
    const [enableSpeedPrint, setEnableSpeedPrint] = useState(true)

    // Clear the auto-print session guard so re-printing works
    const clearPrintGuard = (ticketId: string) =>
        sessionStorage.removeItem(`ticket_autoprint_${ticketId}`);

    const [serverStats, setServerStats] = useState({ 
        delivered: 0, 
        returns: 0, 
        ratio: '0.0', 
        totalPaid: 0,
        highRiskCount: 0,
        overdueCount: 0
    });

    const stats = useMemo(() => serverStats, [serverStats]);

    const debouncedSetQuery = useDebouncedCallback(
        (value: string) => {
            setQuery(value)
        },
        500
    )

    useEffect(() => {
        loadData()
    }, [query, statusFilter, showStale, dateRange])

    useEffect(() => {
        const registry = printService.getRegistry();
        if (registry) {
            setEnableSpeedPrint(registry.enableSpeedPrint !== false);
        }
    }, [])

    const handleSpeedPrintToggle = async (val: boolean) => {
        setEnableSpeedPrint(val);
        const current = printService.getRegistry() || {};
        printService.updateRegistry({ ...current, enableSpeedPrint: val });
        
        // 🛡️ [SYNC FIX] Also update the global store setting so they are linked
        if (settings) {
            setSettings({ ...settings, autoPrintTicket: val });
        }
        await updateStoreSettings({ autoPrintTicket: val });
        
        toast.success(val ? "تم تفعيل الطباعة المباشرة والتلقائية" : "تم تعطيل الطباعة المباشرة والتلقائية");
    };

    async function loadData() {
        startTransition(async () => {
            await Promise.all([loadTickets(), loadSettings()])
        })
    }

    async function loadSettings() {
        const res = await getEffectiveStoreSettings()
        if (res?.data) {
            setSettings(res.data)
            // 🛡️ [SYNC FIX] Ensure the local lightning bolt matches the global setting
            if (res.data.autoPrintTicket !== undefined && res.data.autoPrintTicket !== enableSpeedPrint) {
                setEnableSpeedPrint(res.data.autoPrintTicket === true);
                const current = printService.getRegistry() || {};
                printService.updateRegistry({ ...current, enableSpeedPrint: res.data.autoPrintTicket === true });
            }
        }
    }

    async function loadTickets() {
        setLoading(true)
        const filters: any = {
            search: query,
            status: showStale ? 'all' : statusFilter,
            startDate: dateRange?.from ? dateRange.from.toISOString() : undefined,
            endDate: dateRange?.to ? dateRange.to.toISOString() : undefined
        }
        if (showStale) {
            filters.minDaysOld = 30
            filters.staleStatuses = ['READY_AT_BRANCH', 'COMPLETED']
        }
        const res = await fetchTickets(filters)
        if (res.success) {
            setTickets((res as any).tickets || [])
            if ((res as any).stats) {
                setServerStats((res as any).stats);
            }
        }
        setLoading(false)
    }

    const handleFilterChange = (newFilter: string) => {
        setShowStale(false)
        setStatusFilter(newFilter)
    }

    const handleStaleToggle = () => {
        const newValue = !showStale
        setShowStale(newValue)
        if (newValue) {
            setStatusFilter('all')
        }
    }

    const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchTerm) {
            debouncedSetQuery.cancel();
            setQuery(searchTerm);
        }
    }

    const handleDirectPrint = async (ticket: any, e?: React.MouseEvent) => {
        const isManualOverride = e?.shiftKey;
        if (!isManualOverride && !await checkPrinterAndRedirect('receipt', router, locale)) return;

        setPrintTicket(ticket)
        setPrintMode('receipt')
        
        const registry = printService.getRegistry();
        const hasThermalPrinter = !!(registry?.thermalPrinter || localStorage.getItem('thermal_printer') || localStorage.getItem('casper_receipt_printer'));
        
        const silent = hasThermalPrinter && enableSpeedPrint && !isManualOverride;
        setIsSilentPrint(silent)
        setShowPrintOptions(true)
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'NEW': return 'bg-blue-500'
            case 'IN_TRANSIT_TO_CENTER': return 'bg-purple-500'
            case 'IN_TRANSIT_TO_BRANCH': return 'bg-purple-500'
            case 'AT_CENTER': return 'bg-indigo-500'
            case 'DIAGNOSING': return 'bg-yellow-600'
            case 'IN_PROGRESS': return 'bg-yellow-500'
            case 'QC_PENDING': return 'bg-orange-500'
            case 'WAITING_FOR_PARTS': return 'bg-orange-600'
            case 'COMPLETED': return 'bg-green-500'
            case 'READY_AT_BRANCH': return 'bg-green-600'
            case 'PICKED_UP': return 'bg-gray-500'
            case 'DELIVERED': return 'bg-gray-500'
            case 'PAID_DELIVERED': return 'bg-emerald-600'
            case 'REJECTED': return 'bg-red-500'
            case 'VOIDED': return 'bg-slate-700'
            default: return 'bg-gray-500'
        }
    }

    const getStatusLabel = (status: string) => {
        const statusMap: Record<string, string> = {
            'NEW': t('status.new'),
            'IN_TRANSIT_TO_CENTER': t('status.inTransitToCenter'),
            'AT_CENTER': t('status.atCenter'),
            'DIAGNOSING': t('status.diagnosing'),
            'PENDING_APPROVAL': t('status.pendingApproval'),
            'IN_PROGRESS': t('status.inProgress'),
            'QC_PENDING': t('status.qcPending'),
            'WAITING_FOR_PARTS': t('status.waitingForParts'),
            'COMPLETED': t('status.completed'),
            'IN_TRANSIT_TO_BRANCH': t('status.inTransitToBranch'),
            'READY_AT_BRANCH': t('status.readyAtBranch'),
            'DELIVERED': t('status.delivered'),
            'PAID_DELIVERED': t('status.paidDelivered') || 'Paid & Delivered',
            'PICKED_UP': t('status.pickedUp'),
            'CANCELLED': t('status.cancelled'),
            'REJECTED': t('status.rejected'),
            'RETURNED_FOR_REFIX': t('status.returnedForRefix'),
            'WARRANTY': t('filters.warranty'),
            'RETURNS': t('filters.returns'),
            'VOIDED': t('status.voided')
        }
        return statusMap[status] || status.toUpperCase()
    }

    const getUrgencyInfo = (ticket: any) => {
        if (!ticket.expectedDuration || ['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'REJECTED'].includes(ticket.status)) return null;

        const created = new Date(ticket.createdAt).getTime();
        const durationMs = ticket.expectedDuration * 60 * 1000;
        const dueTime = created + durationMs;
        const now = Date.now();
        const timeLeftMs = dueTime - now;
        const timeLeftMin = Math.round(timeLeftMs / 60000);

        if (timeLeftMin < 0) return { status: 'overdue', label: t('table.overdue', { min: Math.abs(timeLeftMin) }), color: 'text-red-500' };
        if (timeLeftMin < 60) return { status: 'due_soon', label: t('table.dueIn', { min: timeLeftMin }), color: 'text-yellow-500' };
        return { status: 'normal', label: `${ticket.expectedDuration} min`, color: 'text-zinc-400' };
    }

    const getCaseInfo = (ticket: any) => {
        if (ticket.isWarrantyReturn) {
            return { label: 'مرتجع', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: AlertTriangle };
        }
        const now = new Date();
        if (ticket.warrantyExpiryDate && new Date(ticket.warrantyExpiryDate) > now) {
            return { label: 'ضمان', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Shield };
        }
        return { label: 'عادي', color: 'bg-zinc-500/10 text-zinc-400 border-white/5', icon: Wrench };
    }

    const getRiskInfo = (ticket: any) => {
        const level = ticket.riskLevel || 'low';

        if (level === 'high') return { level: 'high', color: 'text-red-500', icon: AlertCircle };
        if (level === 'medium') return { level: 'medium', color: 'text-orange-500', icon: AlertTriangle };
        return { level: 'low', color: 'text-emerald-500', icon: Clock };
    }

    const getWorkflowStage = (status: string) => {
        const stages = [
            ['NEW', 'RETURNED_FOR_REFIX'],
            ['DIAGNOSING'],
            ['AT_CENTER', 'PENDING_APPROVAL', 'IN_PROGRESS', 'WAITING_FOR_PARTS'],
            ['QC_PENDING'],
            ['COMPLETED', 'READY_AT_BRANCH', 'IN_TRANSIT_TO_BRANCH'],
            ['PICKED_UP', 'DELIVERED'],
            ['PAID_DELIVERED']
        ];
        
        const stageIndex = stages.findIndex(s => s.includes(status));
        if (stageIndex === -1) return { current: 1, total: 7, label: getStatusLabel(status) };
        
        return {
            current: stageIndex + 1,
            total: 7,
            label: getStatusLabel(status)
        };
    };

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev.key === key) {
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                if (prev.direction === 'desc') return { key: '', direction: null };
            }
            return { key, direction: 'asc' };
        });
    };

    const getSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <ChevronDown className="w-3.5 h-3.5 opacity-20" />;
        return sortConfig.direction === 'asc' ? <ChevronDown className="w-3.5 h-3.5 text-cyan-400 rotate-180 transition-transform" /> : <ChevronDown className="w-3.5 h-3.5 text-cyan-400 transition-transform" />;
    };

    const sortedTickets = useMemo(() => {
        let items = [...tickets];
        
        if (sortByUrgency) {
            items = items.filter(t => {
                const u = getUrgencyInfo(t);
                return u !== null && u.status !== 'normal';
            }).sort((a, b) => {
                const timeA = new Date(a.createdAt).getTime() + (a.expectedDuration * 60000);
                const timeB = new Date(b.createdAt).getTime() + (b.expectedDuration * 60000);
                return timeA - timeB;
            });
            return items;
        }

        if (sortConfig.key && sortConfig.direction) {
            items.sort((a, b) => {
                let aVal: any = a[sortConfig.key];
                let bVal: any = b[sortConfig.key];

                if (sortConfig.key === 'amountDue') {
                    aVal = a.repairPrice - (a.amountPaid || 0);
                    bVal = b.repairPrice - (b.amountPaid || 0);
                }

                if (sortConfig.key === 'gap') {
                    aVal = new Date(a.updatedAt).getTime();
                    bVal = new Date(b.updatedAt).getTime();
                } else if (sortConfig.key === 'customerSuccessRatio') {
                    aVal = Number(a.customerSuccessRatio);
                    bVal = Number(b.customerSuccessRatio);
                } else if (sortConfig.key === 'riskLevel') {
                    const riskMap: any = { 'high': 3, 'medium': 2, 'low': 1 };
                    aVal = riskMap[a.riskLevel] || 0;
                    bVal = riskMap[b.riskLevel] || 0;
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [tickets, sortByUrgency, sortConfig]);

    return (
        <div className="space-y-6">
            {/* KPI Cards Row (Cockpit Overview) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-cairo">
                {/* Card 1: Success Ratio */}
                <div className="relative flex items-center justify-between p-3.5 bg-white dark:bg-zinc-900/80 border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
                            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="currentColor" strokeWidth="3" className="text-slate-100 dark:text-white/5" />
                                <circle
                                    cx="18" cy="18" r="15.9" fill="transparent" stroke="currentColor" strokeWidth="3"
                                    strokeDasharray={100}
                                    strokeDashoffset={100 - parseFloat(stats.ratio || '0')}
                                    strokeLinecap="round"
                                    className="text-emerald-500 transition-all duration-700"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[11px] font-black text-slate-800 dark:text-zinc-100 tabular-nums">{stats.ratio}%</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-wider">{t('table.successRatio')}</span>
                            <span className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                                {stats.delivered} <span className="text-slate-400 font-medium text-[11px]">{t('filters.delivered')}</span>
                            </span>
                        </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                        إنجاز العمليات
                    </span>
                </div>

                {/* Card 2: High Risk */}
                <div className="relative flex items-center justify-between p-3.5 bg-white dark:bg-zinc-900/80 border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                            <AlertTriangle className="h-5 w-5 text-rose-500" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-wider">{t('table.risk')}</span>
                            <span className="text-xl font-black text-rose-500 tabular-nums font-mono mt-0.5">{stats.highRiskCount}</span>
                        </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        متابعة عاجلة
                    </span>
                </div>

                {/* Card 3: Overdue */}
                <div className="relative flex items-center justify-between p-3.5 bg-white dark:bg-zinc-900/80 border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                            <Clock className="h-5 w-5 text-cyan-500" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-wider">الفجوة (GAP/SLO)</span>
                            <span className="text-xl font-black text-cyan-500 tabular-nums font-mono mt-0.5">{stats.overdueCount}</span>
                        </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 whitespace-nowrap">
                        تجاوز الوقت
                    </span>
                </div>
            </div>

            {/* Filters and Search Bar */}
            <div className="flex gap-2.5 items-center flex-wrap">
                <div className="relative flex-1 min-w-[260px] group/search">
                    <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within/search:text-cyan-500 transition-all pointer-events-none" />
                    <Input
                        placeholder={t('search.placeholder')}
                        className="ps-10 solid-input h-10 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:border-cyan-500/50 transition-all text-xs font-bold rounded-xl"
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setSearchTerm(e.target.value);
                            debouncedSetQuery(e.target.value);
                        }}
                        onKeyDown={handleSearchKeyDown}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => { setSearchTerm(''); setQuery(''); debouncedSetQuery.cancel(); }}
                            className="absolute end-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-all active:scale-90"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-zinc-900/60 p-1 rounded-xl border border-slate-200/80 dark:border-white/10 flex-wrap h-10">
                    <Button
                        variant={dateFilter === "all" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-xs font-bold px-3 rounded-lg transition-all", dateFilter === "all" ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm" : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5")}
                        onClick={() => {
                            setDateFilter("all");
                            setDateRange(undefined);
                        }}
                    >
                        الكل
                    </Button>
                    <Button
                        variant={dateFilter === "today" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-xs font-bold px-3 rounded-lg transition-all", dateFilter === "today" ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm" : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5")}
                        onClick={() => {
                            setDateFilter("today");
                            setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
                        }}
                    >
                        اليوم
                    </Button>
                    <Button
                        variant={dateFilter === "yesterday" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-xs font-bold px-3 rounded-lg transition-all", dateFilter === "yesterday" ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm" : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5")}
                        onClick={() => {
                            const yesterday = subDays(new Date(), 1);
                            setDateFilter("yesterday");
                            setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
                        }}
                    >
                        أمس
                    </Button>
                    <Button
                        variant={dateFilter === "week" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-xs font-bold px-3 rounded-lg transition-all", dateFilter === "week" ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm" : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5")}
                        onClick={() => {
                            setDateFilter("week");
                            setDateRange({ from: startOfWeek(new Date(), { weekStartsOn: 6 }), to: endOfWeek(new Date(), { weekStartsOn: 6 }) });
                        }}
                    >
                        الأسبوع
                    </Button>
                    <Button
                        variant={dateFilter === "month" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-xs font-bold px-3 rounded-lg transition-all", dateFilter === "month" ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm" : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5")}
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                    >
                        الشهر
                    </Button>

                    <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1 hidden sm:block" />

                    <FlatpickrRangePicker
                        onRangeChange={(dates) => {
                            if (dates.length === 2) {
                                setDateRange({ from: dates[0], to: dates[1] });
                                setDateFilter("custom");
                            } else if (dates.length === 1) {
                                setDateRange({ from: dates[0], to: undefined });
                                setDateFilter("custom");
                            } else {
                                setDateRange(undefined);
                                setDateFilter("all");
                            }
                        }}
                        onClear={() => {
                            setDateRange(undefined);
                            setDateFilter("all");
                        }}
                        initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
                        className="w-40 bg-transparent border-0 text-xs h-8 text-slate-700 dark:text-zinc-300 placeholder:text-slate-400 dark:placeholder:text-zinc-500 font-mono"
                    />
                </div>

                <div className="flex gap-2 flex-wrap items-center">
                    <div className="flex items-center gap-2 bg-white dark:bg-zinc-900/60 p-1 rounded-xl border border-slate-200/80 dark:border-white/10 px-3 h-10">
                        <Zap className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 whitespace-nowrap">طباعة مباشرة</span>
                        <Switch
                            checked={enableSpeedPrint}
                            onCheckedChange={handleSpeedPrintToggle}
                            className="scale-[0.8] ms-1 data-[state=checked]:bg-indigo-500"
                        />
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 h-10 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200/80 dark:border-white/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium whitespace-nowrap">{t('printOptions.shiftClickHint') || '(Shift + Click) للمعاينة'}</span>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-slate-200/80 dark:border-white/10 gap-2 h-10 px-3.5 bg-white dark:bg-zinc-900/60 text-slate-800 dark:text-white font-bold rounded-xl text-xs">
                                <Filter className="w-3.5 h-3.5" />
                                <span>{statusFilter === 'all' ? t('filters.all') : getStatusLabel(statusFilter.toUpperCase())}</span>
                                <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white">
                            <DropdownMenuLabel className="text-xs uppercase tracking-widest text-slate-500 dark:text-zinc-500">{t('table.status')}</DropdownMenuLabel>
                            {['all', 'new', 'in_progress', 'waiting_for_parts', 'completed', 'delivered', 'paid_delivered', 'warranty', 'returns', 'rejected', 'cancelled'].map(st => (
                                <DropdownMenuItem 
                                    key={st} 
                                    onClick={() => handleFilterChange(st)}
                                    className={cn("font-bold text-xs", statusFilter === st ? "bg-slate-100 dark:bg-white/10" : "")}
                                >
                                    {st === 'all' ? t('filters.all') : getStatusLabel(st.toUpperCase())}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                        variant={showStale ? 'default' : 'outline'}
                        onClick={handleStaleToggle}
                        size="sm"
                        className={cn(
                            "h-10 px-3 rounded-xl text-xs font-bold transition-all",
                            showStale
                                ? "bg-orange-500 text-white hover:bg-orange-400 border-0"
                                : "bg-white dark:bg-zinc-900/60 border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                        )}
                    >
                        {t('filters.stale')}
                    </Button>

                    <div className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 px-3.5 rounded-xl flex items-center gap-1.5 h-10 shadow-sm ml-auto sm:ml-0 text-xs font-black">
                        <Activity className="w-3.5 h-3.5" />
                        <span>{t('table.totalResults') || 'النتائج'}:</span>
                        <span className="font-mono text-sm">{sortedTickets.length}</span>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <CasperLoader text={t('search.loading')} />
                </div>
            ) : sortedTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/40 dark:bg-zinc-900/20 border border-dashed border-slate-300 dark:border-white/10 rounded-2xl text-center font-cairo">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 mb-3 border border-slate-200/60 dark:border-white/5 shadow-sm">
                        <Wrench className="w-6 h-6 opacity-60" />
                    </div>
                    <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">{t('search.noResults') || "لا توجد تذاكر تطابق معايير البحث"}</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-zinc-900/50 border border-slate-200/80 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm font-cairo">
                    <div className="w-full overflow-x-auto no-scrollbar">
                        <table className="zebra-table w-full text-right text-xs text-slate-800 dark:text-zinc-200" dir="rtl">
                            <thead>
                                <tr className="bg-slate-50/80 dark:bg-zinc-900/80 text-slate-500 dark:text-zinc-400 uppercase font-black text-[10px] tracking-wider border-b border-slate-200/80 dark:border-white/10">
                                    <th className="px-2.5 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('status')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('status')}
                                            <span>{t('table.status')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('gap')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('gap')}
                                            <span>{t('table.gap')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('riskLevel')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('riskLevel')}
                                            <span>{t('table.risk')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('customerSuccessRatio')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('customerSuccessRatio')}
                                            <span>{t('table.successRatio')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('createdAt')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('createdAt')}
                                            <span>{t('table.date')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2 py-2.5 text-start">{t('table.ticketInfo')}</th>
                                    <th className="px-2 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('amountPaid')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('amountPaid')}
                                            <span>{t('table.paidAmount')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('amountDue')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('amountDue')}
                                            <span>{t('table.amountDue')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2.5 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('customerName')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('customerName')}
                                            <span>{t('table.customer')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2.5 py-2.5 text-start">{t('table.device')}</th>
                                    <th className="px-2 py-2.5 text-start cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('expectedDuration')}>
                                        <div className="flex items-center gap-1">
                                            {getSortIcon('expectedDuration')}
                                            <span>{t('table.timeToFix')}</span>
                                        </div>
                                    </th>
                                    <th className="px-2 py-2.5 w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                                {sortedTickets.map((ticket) => {
                                    const urgency = getUrgencyInfo(ticket);
                                    const risk = getRiskInfo(ticket);
                                    return (
                                        <tr
                                            key={ticket.id}
                                            onClick={() => router.push(`/ar/maintenance/tickets/${ticket.id}`)}
                                            className="bg-white even:bg-slate-50/70 dark:bg-transparent dark:even:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer group"
                                        >
                                            <td className="px-2.5 py-2 whitespace-nowrap font-black">
                                                <div className="flex flex-col gap-1">
                                                    <Badge className={`${getStatusColor(ticket.status)} text-white font-bold border-0 text-[10px] px-2 py-0.5 w-fit hover:${getStatusColor(ticket.status)}`}>
                                                        {getStatusLabel(ticket.status)}
                                                    </Badge>
                                                    {/* 🌊 Workflow Stage Progress Bar */}
                                                    {(() => {
                                                        const workflow = getWorkflowStage(ticket.status);
                                                        const stageLabels = ['استلام', 'فحص', 'إصلاح', 'QC', 'جاهز', 'تسليم', 'مسدد'];
                                                        return (
                                                            <div className="mt-0.5">
                                                                <div className="flex gap-[1.5px] w-full mb-0.5">
                                                                    {[...Array(workflow.total)].map((_, i) => (
                                                                        <div 
                                                                            key={i} 
                                                                            title={stageLabels[i]}
                                                                            className={`h-[2.5px] flex-1 rounded-full transition-all ${
                                                                                i < workflow.current 
                                                                                    ? (i === workflow.current - 1 ? `${getStatusColor(ticket.status)} opacity-100` : `${getStatusColor(ticket.status)} opacity-60`) 
                                                                                    : 'bg-slate-200 dark:bg-white/10'
                                                                            }`} 
                                                                        />
                                                                    ))}
                                                                </div>
                                                                <span className="text-[7px] text-slate-400 dark:text-zinc-500 font-mono font-bold">
                                                                    {workflow.current}/{workflow.total}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>

                                            {/* ⏱ Gap Column */}
                                            <td className="px-2 py-2">
                                                {(() => {
                                                    const isLong = ticket.gap?.includes('d') || (ticket.gap?.includes('h') && parseInt(ticket.gap) > 8);
                                                    return (
                                                        <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[9px] font-black tabular-nums font-mono ${
                                                            ticket.isOverdue 
                                                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                                                                : isLong 
                                                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                                                    : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400'
                                                        }`}>
                                                            <Clock className="w-2.5 h-2.5" />
                                                            <span>{ticket.gap}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </td>

                                            {/* 🎯 Risk Column */}
                                            <td className="px-2 py-2">
                                                {(() => {
                                                    const riskStyles = {
                                                        high: { bg: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-500', label: 'عالي', pulse: true },
                                                        medium: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-500', label: 'متوسط', pulse: false },
                                                        low: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-500', label: 'منخفض', pulse: false }
                                                    };
                                                    const style = riskStyles[risk.level as keyof typeof riskStyles] || riskStyles.low;
                                                    return (
                                                        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${style.bg}`}>
                                                            {style.pulse && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span></span>}
                                                            <AlertTriangle className={`w-2.5 h-2.5 ${style.text}`} />
                                                            <span className={`text-[9px] font-black ${style.text}`}>{style.label}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </td>

                                            {/* 🏆 Customer Success Ratio */}
                                            <td className="px-2 py-2">
                                                {(() => {
                                                    const ratio = Number(ticket.customerSuccessRatio) || 100;
                                                    const color = ratio >= 80 ? 'text-emerald-500' : ratio >= 50 ? 'text-amber-500' : 'text-rose-500';
                                                    const trackColor = ratio >= 80 ? 'text-emerald-500' : ratio >= 50 ? 'text-amber-500' : 'text-rose-500';
                                                    const r = 9; const circ = 2 * Math.PI * r;
                                                    return (
                                                        <div className="flex items-center gap-1">
                                                            <div className="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
                                                                <svg viewBox="0 0 24 24" className="w-full h-full -rotate-90">
                                                                    <circle cx="12" cy="12" r={r} fill="transparent" stroke="currentColor" strokeWidth="2.5" className="text-slate-200 dark:text-white/5" />
                                                                    <circle 
                                                                        cx="12" cy="12" r={r}
                                                                        fill="transparent" stroke="currentColor" strokeWidth="2.5"
                                                                        strokeDasharray={circ}
                                                                        strokeDashoffset={circ - (circ * ratio / 100)}
                                                                        strokeLinecap="round"
                                                                        className={`${trackColor} transition-all duration-500`}
                                                                    />
                                                                </svg>
                                                                <span className={`absolute text-[7px] font-black font-mono ${color}`}>{ratio}%</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </td>

                                            {/* 📅 Date */}
                                            <td className="px-2 py-2 font-bold text-slate-600 dark:text-zinc-400 text-[10px] tabular-nums font-mono whitespace-nowrap">
                                                {new Date(ticket.createdAt).toLocaleDateString()}
                                            </td>

                                            {/* 🏷️ Info */}
                                            <td className="px-2 py-2 font-black">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-mono text-slate-600 dark:text-zinc-400 font-black text-[10px]">#{ticket.barcode}</span>
                                                    {(() => {
                                                        const caseInfo = getCaseInfo(ticket);
                                                        const CaseIcon = caseInfo.icon;
                                                        return (
                                                            <div className={`flex items-center gap-1 px-1.5 py-0.2 rounded border w-fit text-[9px] font-black ${caseInfo.color}`}>
                                                                <CaseIcon className="w-2.5 h-2.5" />
                                                                <span>{caseInfo.label}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>

                                            {/* 💵 Paid */}
                                            <td className="px-2 py-2 font-black">
                                                <div className="flex flex-col">
                                                    <span className="text-emerald-600 dark:text-emerald-400 font-black font-mono tabular-nums text-xs">
                                                        {(ticket.amountPaid || 0).toLocaleString()} <span className="text-[8px] font-bold text-slate-400">ج.م</span>
                                                    </span>
                                                    <span className="text-[8px] text-slate-400 uppercase font-mono">{ticket.paymentStatus || 'unpaid'}</span>
                                                </div>
                                            </td>

                                            {/* 💳 Due */}
                                            <td className="px-2 py-2 font-black">
                                                <div className="flex flex-col">
                                                    <span className={`font-black font-mono tabular-nums text-xs ${(ticket.repairPrice - (ticket.amountPaid || 0)) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                                                        {(ticket.repairPrice - (ticket.amountPaid || 0)).toLocaleString()} <span className="text-[8px] font-bold text-slate-400">ج.م</span>
                                                    </span>
                                                    <span className="text-[8px] text-slate-400 uppercase font-mono">{(ticket.repairPrice - (ticket.amountPaid || 0)) > 0 ? 'pending' : 'settled'}</span>
                                                </div>
                                            </td>

                                            {/* 👤 Customer */}
                                            <td className="px-2.5 py-2 font-black">
                                                <div className="flex flex-col max-w-[130px]">
                                                    <span className="font-bold text-slate-900 dark:text-zinc-200 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors truncate block text-xs">
                                                        {ticket.customerName}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono tracking-tight">{ticket.customerPhone}</span>
                                                </div>
                                            </td>

                                            {/* 📱 Device */}
                                            <td className="px-2.5 py-2">
                                                <span className="text-slate-800 dark:text-zinc-300 font-bold uppercase truncate block text-xs max-w-[120px]" title={`${ticket.deviceBrand} ${ticket.deviceModel}`}>
                                                    {ticket.deviceBrand} {ticket.deviceModel}
                                                </span>
                                            </td>

                                            {/* ⏱ Duration */}
                                            <td className="px-2 py-2">
                                                <div className={`flex items-center gap-1 font-bold text-xs ${urgency ? urgency.color : 'text-slate-500 dark:text-zinc-400'}`}>
                                                    <Clock className="w-3 h-3 shrink-0" />
                                                    <span className="font-mono text-[11px] whitespace-nowrap">
                                                        {urgency ? urgency.label : (ticket.expectedDuration ? `${ticket.expectedDuration} دقيقة` : '-')}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* ⚙️ Actions */}
                                            <td className="px-2 py-2 whitespace-nowrap text-end w-8">
                                                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDirectPrint(ticket, e); }}
                                                        className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors text-slate-500 hover:text-cyan-500"
                                                        title="طباعة سريعة"
                                                    >
                                                        <Printer className="h-3.5 w-3.5" />
                                                    </button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                            <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-white/10">
                                                                <MoreHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-[160px] bg-white dark:bg-zinc-900 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white shadow-xl">
                                                            <DropdownMenuLabel className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500">{t('list.actions')}</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/ar/maintenance/tickets/${ticket.id}`) }} className="font-bold hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-xs">
                                                                <Search className="mr-2 h-3.5 w-3.5 text-cyan-500" />
                                                                <span>{t('list.viewDetails')}</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingTicket(ticket); setShowEditModal(true); }} className="font-bold hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-xs">
                                                                <Edit2 className="mr-2 h-3.5 w-3.5 text-amber-500" />
                                                                <span>{t('list.editDetails')}</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator className="bg-slate-200 dark:bg-white/5" />
                                                            <DropdownMenuItem onClick={async (e) => {
                                                                const isManualOverride = e.shiftKey;
                                                                if (!isManualOverride && !await checkPrinterAndRedirect('label', router, locale)) return;
                                                                setPrintTicket(ticket);
                                                                setPrintMode('label');
                                                                clearPrintGuard(ticket.id);

                                                                const registry = printService.getRegistry();
                                                                const hasLabelPrinter = !!(registry?.labelPrinter || localStorage.getItem('printer_label') || localStorage.getItem('printer_barcode'));

                                                                const silent = hasLabelPrinter && enableSpeedPrint && !isManualOverride;
                                                                setIsSilentPrint(silent);
                                                                setShowPrintOptions(true);
                                                            }} className="gap-2 cursor-pointer">
                                                                <StickyNote className="h-4 w-4" />
                                                                <span>{t('printOptions.printLabel') || 'Print Label'}</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={async (e) => {
                                                                const isManualOverride = e.shiftKey;
                                                                if (!isManualOverride && !await checkPrinterAndRedirect('engineer', router, locale)) return;

                                                                setPrintTicket(ticket);
                                                                setPrintMode('engineer');
                                                                clearPrintGuard(ticket.id);
                                                                
                                                                const registry = printService.getRegistry();
                                                                const hasThermalPrinter = !!(registry?.thermalPrinter || localStorage.getItem('thermal_printer') || localStorage.getItem('casper_receipt_printer'));

                                                                const silent = hasThermalPrinter && enableSpeedPrint && !isManualOverride;
                                                                setIsSilentPrint(silent);
                                                                setShowPrintOptions(true);
                                                            }} className="gap-2 cursor-pointer">
                                                                <SettingsIcon className="h-4 w-4" />
                                                                <span>{t('list.printEngineer')}</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator className="bg-slate-200 dark:bg-white/5" />
                                                            <DropdownMenuItem
                                                                className="text-red-500 focus:text-red-500 focus:bg-red-50 dark:focus:bg-red-500/10 font-bold cursor-pointer hover:bg-red-50 dark:hover:bg-red-500/10"
                                                                onClick={(e) => { e.stopPropagation(); setDeletingTicket(ticket); setShowDeleteDialog(true); }}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                <span>{t('list.deleteTicket')}</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showPrintOptions && printTicket && (
                <TicketPrintOptionsModal
                    isOpen={showPrintOptions}
                    onClose={() => {
                        setShowPrintOptions(false)
                        setPrintTicket(null)
                        setIsSilentPrint(false)
                    }}
                    ticket={printTicket}
                    settings={settings}
                    defaultMode={printMode}
                    silent={isSilentPrint}
                    singleDocument={isSilentPrint}
                />
            )}

            {showEditModal && editingTicket && (
                <TicketQuickEditModal
                    isOpen={showEditModal}
                    onClose={() => {
                        setShowEditModal(false)
                        setEditingTicket(null)
                    }}
                    ticket={editingTicket}
                    onSuccess={loadTickets}
                />
            )}

            {showDeleteDialog && deletingTicket && (
                <TicketDeleteDialog
                    isOpen={showDeleteDialog}
                    onClose={() => {
                        setShowDeleteDialog(false)
                        setDeletingTicket(null)
                    }}
                    ticket={deletingTicket}
                    onSuccess={loadTickets}
                />
            )}
        </div>
    )
}
