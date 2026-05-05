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
import { useTranslations } from '@/lib/i18n-mock'
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
import { getEffectiveStoreSettings } from "@/actions/settings"
import TicketQuickEditModal from './TicketQuickEditModal'
import TicketDeleteDialog from './TicketDeleteDialog'
import TicketPrintOptionsModal from './TicketPrintOptionsModal'
import { toast } from "sonner"

export default function TicketsList() {
    const t = useTranslations('Tickets');
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

    // Helper: check if default printers are configured
    const hasThermalPrinter = () =>
        !!(localStorage.getItem('thermal_printer') || localStorage.getItem('casper_receipt_printer') || localStorage.getItem('casper_ticket_printer'));
    const hasLabelPrinter = () =>
        !!(localStorage.getItem('printer_label') || localStorage.getItem('casper_barcode_printer') || localStorage.getItem('casper_label_printer'));

    // Clear the auto-print session guard so re-printing works
    const clearPrintGuard = (ticketId: string) =>
        sessionStorage.removeItem(`ticket_autoprint_${ticketId}`);

    const [serverStats, setServerStats] = useState({ 
        delivered: 0, 
        returns: 0, 
        ratio: '0.0', 
        totalPaid: 0,
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

    const handleSpeedPrintToggle = (val: boolean) => {
        setEnableSpeedPrint(val);
        const current = printService.getRegistry() || {};
        printService.updateRegistry({ ...current, enableSpeedPrint: val });
        toast.success(val ? "تم تفعيل الطباعة المباشرة" : "تم تعطيل الطباعة المباشرة");
    };

    async function loadData() {
        startTransition(async () => {
            await Promise.all([loadTickets(), loadSettings()])
        })
    }

    async function loadSettings() {
        const res = await getEffectiveStoreSettings()
        if (res?.data) setSettings(res.data)
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-cairo">
                {/* Card 1: Success Ratio */}
                <div className="relative flex items-center gap-5 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-[2rem] shadow-sm overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    {/* Circular progress chart */}
                    <div className="relative w-16 h-16 flex-shrink-0">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="currentColor" strokeWidth="3" className="text-zinc-100 dark:text-white/5" />
                            <circle
                                cx="18" cy="18" r="15.9" fill="transparent" stroke="currentColor" strokeWidth="3"
                                strokeDasharray={100}
                                strokeDashoffset={100 - parseFloat(stats.ratio)}
                                strokeLinecap="round"
                                className="text-emerald-500 transition-all duration-700"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-lg font-black text-zinc-900 dark:text-white tabular-nums leading-none">{stats.ratio}%</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-black uppercase tracking-widest">{t('table.successRatio')}</p>
                        <p className="text-zinc-900 dark:text-white font-black text-sm">{stats.delivered} <span className="text-zinc-400 font-normal text-xs">{t('filters.delivered')}</span></p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <div className="h-1 w-1 rounded-full bg-emerald-500" />
                            <span className="text-[10px] text-zinc-400 font-black">معدل إنجاز العمليات</span>
                        </div>
                    </div>
                </div>
                {/* Card 3: Overdue */}
                <div className="relative flex items-center gap-5 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-[2rem] shadow-sm overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full bg-cyan-500/10 border border-cyan-500/20" />
                        <Clock className="h-7 w-7 text-cyan-500 relative z-10" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-black uppercase tracking-widest">الفجوة (Gap/SLO)</p>
                        <p className="text-3xl font-black text-cyan-500 tabular-nums leading-none">{stats.overdueCount}</p>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-black">تجاوزت الوقت المتوقع للإصلاح</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 items-center flex-wrap">
                <div className="relative flex-1 min-w-[300px] group/search">
                    <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within/search:text-cyan-400 transition-all pointer-events-none" />
                    <Input
                        placeholder={t('search.placeholder')}
                        className="ps-12 solid-input h-10 bg-slate-100 dark:bg-zinc-900/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:border-cyan-500/50 transition-all font-black rounded-xl"
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
                            className="absolute end-4 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition-all active:scale-90"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900/50 p-1 rounded-lg border border-slate-300 dark:border-white/10 flex-wrap">
                    <Button
                        variant={dateFilter === "all" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md transition-all", dateFilter === "all" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-950 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10")}
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
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md transition-all", dateFilter === "today" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-950 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10")}
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
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md transition-all", dateFilter === "yesterday" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-950 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10")}
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
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md transition-all", dateFilter === "week" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-950 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10")}
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
                        className={cn("h-8 text-[11px] font-black px-2 rounded-md transition-colors", dateFilter === "month" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-slate-950 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10")}
                        onClick={() => {
                            setDateFilter("month");
                            setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
                        }}
                    >
                        الشهر
                    </Button>

                    <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />

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
                        className="w-48 bg-transparent border-0 text-xs h-8 text-zinc-300 placeholder:text-zinc-600"
                    />
                </div>

                <div className="flex gap-2 flex-wrap">
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-900/50 p-1 rounded-lg border border-slate-300 dark:border-white/10 px-3 h-10">
                        <Zap className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-zinc-300 whitespace-nowrap">طباعة مباشرة</span>
                        <Switch
                            checked={enableSpeedPrint}
                            onCheckedChange={handleSpeedPrintToggle}
                            className="scale-[0.8] ms-1 data-[state=checked]:bg-indigo-500"
                        />
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-slate-200 dark:border-white/10 gap-2 h-10 px-4 bg-slate-100 dark:bg-zinc-900/50 text-slate-900 dark:text-white font-black">
                                <Filter className="w-4 h-4" />
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
                                    className={cn("font-black", statusFilter === st ? "bg-slate-100 dark:bg-white/10" : "")}
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
                        className={showStale
                            ? "bg-orange-500 text-white hover:bg-orange-400 border-0 h-10"
                            : "bg-transparent border-orange-500/30 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 h-10"}
                    >
                        {t('filters.stale')}
                    </Button>

                    <div className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 px-4 rounded-xl flex items-center gap-2 h-10 shadow-sm ml-auto sm:ml-0">
                        <Activity className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-black uppercase tracking-widest">{t('table.totalResults') || 'النتائج'}:</span>
                        <span className="text-sm font-black tabular-nums">{sortedTickets.length}</span>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <CasperLoader text={t('search.loading')} />
                </div>
            ) : sortedTickets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">{t('search.noResults')}</div>
            ) : (
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-[2.5rem] overflow-hidden shadow-sm font-cairo">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="zebra-table w-full text-right text-sm text-zinc-900 dark:text-zinc-200 table-fixed" dir="rtl">
                            <colgroup>
                                <col className="w-[150px]" /> {/* Status */}
                                <col className="w-[80px]" />  {/* Gap */}
                                <col className="w-[100px]" /> {/* Success */}
                                <col className="w-[120px]" /> {/* Date */}
                                <col className="w-[120px]" /> {/* Info */}
                                <col className="w-[120px]" /> {/* Paid */}
                                <col className="w-[120px]" /> {/* Due */}
                                <col className="w-[180px]" /> {/* Customer */}
                                <col className="w-[180px]" /> {/* Device */}
                                <col className="w-[180px]" /> {/* Fault/Issue */}
                                <col className="w-[100px]" /> {/* Time */}
                                <col className="w-[50px]" />  {/* Actions */}
                            </colgroup>
                                <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 uppercase font-black text-[11px] tracking-wider border-b border-zinc-200 dark:border-white/10">
                                    <tr>
                                        <th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('status')}>
                                            <div className="flex items-center gap-2">
                                                {getSortIcon('status')}
                                                {t('table.status')}
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('gap')}>
                                             <div className="flex items-center gap-2">
                                                 {getSortIcon('gap')}
                                                 {t('table.gap')}
                                             </div>
                                         </th>
                                         <th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('customerSuccessRatio')}>
                                             <div className="flex items-center gap-2">
                                                 {getSortIcon('customerSuccessRatio')}
                                                 {t('table.successRatio')}
                                             </div>
                                         </th>
                                        <th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('createdAt')}>
                                            <div className="flex items-center gap-2">
                                                {getSortIcon('createdAt')}
                                                {t('table.date')}
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 text-start">{t('table.ticketInfo')}</th>
                                        <th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('amountPaid')}>
                                            <div className="flex items-center gap-2">
                                                {getSortIcon('amountPaid')}
                                                {t('table.paidAmount')}
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('amountDue')}>
                                            <div className="flex items-center gap-2">
                                                {getSortIcon('amountDue')}
                                                {t('table.amountDue')}
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('customerName')}>
                                            <div className="flex items-center gap-2">
                                                {getSortIcon('customerName')}
                                                {t('table.customer')}
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 text-start">{t('table.device')}</th>
                                        <th className="px-6 py-4 text-start">
                                             <div className="flex items-center gap-2">
                                                 {t('table.risk')}
                                             </div>
                                         </th>
                                        <th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('expectedDuration')}>
                                            <div className="flex items-center gap-2">
                                                {getSortIcon('expectedDuration')}
                                                {t('table.timeToFix')}
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 w-[50px]"></th>
                                    </tr>
                                </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                                {sortedTickets.map((ticket) => {
                                    const urgency = getUrgencyInfo(ticket);
                                    return (
                                        <tr
                                            key={ticket.id}
                                            onClick={() => router.push(`/ar/maintenance/tickets/${ticket.id}`)}
                                            className="bg-white even:bg-slate-100 dark:bg-transparent dark:even:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors cursor-pointer group"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap font-black">
                                                <div className="flex flex-col gap-1.5">
                                                    <Badge className={`${getStatusColor(ticket.status)} text-white font-bold border-0 hover:${getStatusColor(ticket.status)}`}>
                                                        {getStatusLabel(ticket.status)}
                                                    </Badge>
                                                    {/* 🌊 Workflow Stage Progress Bar */}
                                                    {(() => {
                                                        const workflow = getWorkflowStage(ticket.status);
                                                        const stageLabels = ['استلام', 'فحص', 'إصلاح', 'QC', 'جاهز', 'تسليم', 'مسدد'];
                                                        return (
                                                            <div className="mt-1.5">
                                                                <div className="flex gap-[2px] w-full mb-0.5">
                                                                    {[...Array(workflow.total)].map((_, i) => (
                                                                        <div 
                                                                            key={i} 
                                                                            title={stageLabels[i]}
                                                                            className={`h-[3px] flex-1 rounded-full transition-all ${
                                                                                i < workflow.current 
                                                                                    ? (i === workflow.current - 1 ? `${getStatusColor(ticket.status)} opacity-100` : `${getStatusColor(ticket.status)} opacity-60`) 
                                                                                    : 'bg-zinc-200 dark:bg-white/10'
                                                                            }`} 
                                                                        />
                                                                    ))}
                                                                </div>
                                                                <span className="text-[8px] text-zinc-400 dark:text-zinc-600 font-black">
                                                                    {workflow.current}/{workflow.total}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>

                                            {/* ⏱ Gap Column */}
                                            <td className="px-4 py-4">
                                                {(() => {
                                                    const isLong = ticket.gap?.includes('d') || (ticket.gap?.includes('h') && parseInt(ticket.gap) > 8);
                                                    return (
                                                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black tabular-nums ${
                                                            ticket.isOverdue 
                                                                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                                                                : isLong 
                                                                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-500'
                                                                    : 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-500'
                                                        }`}>
                                                            <Clock className="w-2.5 h-2.5" />
                                                            {ticket.gap}
                                                        </div>
                                                    );
                                                })()}
                                            </td>

                                            {/* 🏆 Customer Success Ratio */}
                                            <td className="px-4 py-4">
                                                {(() => {
                                                    const ratio = Number(ticket.customerSuccessRatio) || 100;
                                                    const color = ratio >= 80 ? 'text-emerald-500' : ratio >= 50 ? 'text-orange-500' : 'text-rose-500';
                                                    const trackColor = ratio >= 80 ? 'text-emerald-500' : ratio >= 50 ? 'text-orange-500' : 'text-rose-500';
                                                    const r = 9; const circ = 2 * Math.PI * r;
                                                    return (
                                                        <div className="flex items-center gap-2">
                                                            <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
                                                                <svg viewBox="0 0 24 24" className="w-full h-full -rotate-90">
                                                                    <circle cx="12" cy="12" r={r} fill="transparent" stroke="currentColor" strokeWidth="2.5" className="text-zinc-200 dark:text-white/5" />
                                                                    <circle 
                                                                        cx="12" cy="12" r={r}
                                                                        fill="transparent" stroke="currentColor" strokeWidth="2.5"
                                                                        strokeDasharray={circ}
                                                                        strokeDashoffset={circ - (circ * ratio / 100)}
                                                                        strokeLinecap="round"
                                                                        className={`${trackColor} transition-all duration-500`}
                                                                    />
                                                                </svg>
                                                                <span className={`absolute text-[7px] font-black ${color}`}>{ratio}%</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-6 py-4 font-black text-slate-700 dark:text-zinc-400 text-xs tabular-nums">
                                                {new Date(ticket.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 font-black">
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-mono text-zinc-500 dark:text-zinc-400 font-black text-xs">#{ticket.barcode}</span>
                                                    {(() => {
                                                        const caseInfo = getCaseInfo(ticket);
                                                        const CaseIcon = caseInfo.icon;
                                                        return (
                                                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border w-fit ${caseInfo.color}`}>
                                                                <CaseIcon className="w-3 h-3" />
                                                                <span className="text-[10px] font-black uppercase tracking-wider">{caseInfo.label}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-black">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-emerald-600 dark:text-emerald-400 font-black tabular-nums">{(ticket.amountPaid || 0).toLocaleString()} <span className="text-[10px] font-black text-zinc-500">EGP</span></span>
                                                    <span className="text-[10px] text-zinc-500 tracking-tighter uppercase">{ticket.paymentStatus || 'unpaid'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-black">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className={`font-black tabular-nums ${(ticket.repairPrice - (ticket.amountPaid || 0)) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500'}`}>
                                                        {(ticket.repairPrice - (ticket.amountPaid || 0)).toLocaleString()} <span className="text-[10px] font-black text-zinc-500">EGP</span>
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500 tracking-tighter uppercase">{(ticket.repairPrice - (ticket.amountPaid || 0)) > 0 ? 'pending' : 'settled'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-black">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-slate-900 dark:text-zinc-200 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors truncate">{ticket.customerName}</span>
                                                        {ticket.customer?.linkedEmployeeId && (
                                                            <span className="text-[9px] bg-cyan-900/60 text-cyan-200 border border-cyan-500/40 px-1.5 py-0.5 rounded-full font-black whitespace-nowrap">
                                                                موظف داخلي
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-slate-600 dark:text-zinc-500 font-black tracking-tight">{ticket.customerPhone}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-slate-900 dark:text-zinc-200 font-black uppercase truncate block">{ticket.deviceBrand} {ticket.deviceModel}</span>
                                            </td>
                                            {/* 🎯 Fault Column */}
                                            <td className="px-4 py-4">
                                                <div 
                                                    className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 truncate max-w-[160px] bg-zinc-100 dark:bg-white/5 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10" 
                                                    title={ticket.issueDescription}
                                                >
                                                    {ticket.issueDescription}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`flex items-center gap-1 font-black ${urgency ? urgency.color : 'text-slate-500 dark:text-zinc-400'}`}>
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span className="text-sm font-black">
                                                        {urgency ? urgency.label : (ticket.expectedDuration ? `${ticket.expectedDuration} min` : '-')}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap text-right">                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                        <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 dark:hover:bg-white/10">
                                                            <MoreHorizontal className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-[160px] bg-white dark:bg-zinc-900 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white shadow-xl">
                                                        <DropdownMenuLabel className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500">{t('list.actions')}</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/ar/maintenance/tickets/${ticket.id}`) }} className="font-bold hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
                                                            <Search className="mr-2 h-4 w-4 text-cyan-500" />
                                                            <span>{t('list.viewDetails')}</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingTicket(ticket); setShowEditModal(true); }} className="font-bold hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
                                                            <Edit2 className="mr-2 h-4 w-4 text-amber-500" />
                                                            <span>{t('list.editDetails')}</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="bg-slate-200 dark:bg-white/5" />
                                                        <DropdownMenuItem onClick={(e) => { 
                                                            e.stopPropagation();
                                                            clearPrintGuard(ticket.id);
                                                            const silent = hasThermalPrinter() && enableSpeedPrint;
                                                            setPrintTicket(ticket); 
                                                            setPrintMode('receipt'); 
                                                            setIsSilentPrint(silent);
                                                            setShowPrintOptions(true); 
                                                        }} className="font-bold hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
                                                            <Printer className="mr-2 h-4 w-4 text-blue-500" />
                                                            <span>{t('list.printReceipt')}</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => { 
                                                            e.stopPropagation();
                                                            clearPrintGuard(ticket.id);
                                                            const silent = hasThermalPrinter() && enableSpeedPrint;
                                                            setPrintTicket(ticket); 
                                                            setPrintMode('engineer'); 
                                                            setIsSilentPrint(silent);
                                                            setShowPrintOptions(true); 
                                                        }} className="font-bold hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
                                                            <SettingsIcon className="mr-2 h-4 w-4 text-orange-500" />
                                                            <span>{t('list.printEngineer')}</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => { 
                                                            e.stopPropagation();
                                                            clearPrintGuard(ticket.id);
                                                            const silent = hasLabelPrinter() && enableSpeedPrint;
                                                            setPrintTicket(ticket); 
                                                            setPrintMode('label'); 
                                                            setIsSilentPrint(silent);
                                                            setShowPrintOptions(true); 
                                                        }} className="font-bold hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
                                                            <StickyNote className="mr-2 h-4 w-4 text-purple-500" />
                                                            <span>Print Label</span>
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
