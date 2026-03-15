import { useState, useEffect, useTransition, useMemo } from 'react'
import {
    Search, User as UserIcon, Plus, Edit2, Trash2, MoreHorizontal,
    Clock, AlertTriangle, AlertCircle, X, Shield, Wrench, Filter, ChevronDown, Download
} from "lucide-react"
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
import TicketQuickEditModal from './TicketQuickEditModal'
import TicketDeleteDialog from './TicketDeleteDialog'
import { toast } from "sonner"

export default function TicketsList() {
    const t = useTranslations('Tickets');
    const [tickets, setTickets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [query, setQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [showStale, setShowStale] = useState(false)
    
    // Unified Date Filtering
    const [dateFilter, setDateFilter] = useState<string>("all")
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

    const [isPending, startTransition] = useTransition()
    const [sortByUrgency, setSortByUrgency] = useState(false)
    const router = useRouter()

    const [editingTicket, setEditingTicket] = useState<any>(null)
    const [deletingTicket, setDeletingTicket] = useState<any>(null)
    const [showEditModal, setShowEditModal] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)

    const [serverStats, setServerStats] = useState({ delivered: 0, returns: 0, ratio: '0.0' });

    const stats = useMemo(() => serverStats, [serverStats]);

    const debouncedSetQuery = useDebouncedCallback(
        (value: string) => {
            setQuery(value)
        },
        500
    )

    useEffect(() => {
        loadTickets()
    }, [query, statusFilter, showStale, dateRange])

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
            'RETURNED_FOR_REFIX': t('status.returnedForRefix')
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

    const sortedTickets = (sortByUrgency ? [...tickets].filter(t => {
        const u = getUrgencyInfo(t);
        return u !== null && u.status !== 'normal';
    }) : [...tickets])
        .sort((a, b) => {
            if (!sortByUrgency) return 0;
            const urgencyA = getUrgencyInfo(a);
            const urgencyB = getUrgencyInfo(b);
            if (!urgencyA && !urgencyB) return 0;
            if (!urgencyA) return 1;
            if (!urgencyB) return -1;
            const timeA = new Date(a.createdAt).getTime() + (a.expectedDuration * 60000);
            const timeB = new Date(b.createdAt).getTime() + (b.expectedDuration * 60000);
            return timeA - timeB;
        });

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4 flex items-center justify-between border border-white/5 bg-white/5 shadow-xl">
                    <div>
                        <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{t('table.successRatio')}</p>
                        <h3 className="text-2xl font-bold text-emerald-400 mt-1">{stats.ratio}%</h3>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-0">
                            {stats.delivered}
                        </Badge>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center justify-between border border-white/5 bg-white/5 shadow-xl">
                    <div>
                        <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{t('filters.returns')}</p>
                        <h3 className="text-2xl font-bold text-orange-400 mt-1">{stats.returns}</h3>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center justify-between border border-white/5 bg-white/5 shadow-xl">
                    <div>
                        <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{t('filters.all')}</p>
                        <h3 className="text-2xl font-bold text-cyan-400 mt-1">{tickets.length}</h3>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                        <Search className="h-5 w-5 text-cyan-500" />
                    </div>
                </div>
            </div>

            <div className="flex gap-4 items-center flex-wrap">
                <div className="relative flex-1 min-w-[300px] group/search">
                    <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within/search:text-cyan-400 transition-all pointer-events-none" />
                    <Input
                        placeholder={t('search.placeholder')}
                        className="ps-12 solid-input h-10 bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500/50 transition-all font-medium rounded-xl"
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

                <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-white/10 flex-wrap">
                    <Button
                        variant={dateFilter === "today" ? "default" : "ghost"}
                        size="sm"
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "today" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "yesterday" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "week" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-zinc-400")}
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
                        className={cn("h-8 text-[11px] font-bold px-2 rounded-md", dateFilter === "month" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "text-zinc-400")}
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
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-white/10 gap-2 h-10 px-4 bg-zinc-900/50">
                                <Filter className="w-4 h-4" />
                                <span>{statusFilter === 'all' ? t('filters.all') : getStatusLabel(statusFilter.toUpperCase())}</span>
                                <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border-white/10 text-white">
                            <DropdownMenuLabel className="text-xs uppercase tracking-widest text-zinc-500">{t('table.status')}</DropdownMenuLabel>
                            {['all', 'new', 'in_progress', 'completed', 'delivered', 'warranty', 'returns'].map(st => (
                                <DropdownMenuItem 
                                    key={st} 
                                    onClick={() => handleFilterChange(st)}
                                    className={statusFilter === st ? "bg-white/10" : ""}
                                >
                                    {st === 'all' ? t('filters.all') : (
                                        st === 'new' ? t('filters.new') :
                                            st === 'in_progress' ? t('filters.inProgress') :
                                                st === 'completed' ? t('filters.completed') :
                                                    st === 'delivered' ? t('filters.delivered') :
                                                        st === 'warranty' ? t('filters.warranty') :
                                                            t('filters.returns')
                                    )}
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
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <CasperLoader text={t('search.loading')} />
                </div>
            ) : sortedTickets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">{t('search.noResults')}</div>
            ) : (
                <div className="glass-card overflow-hidden rounded-xl border border-white/5 bg-black/20 shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-zinc-400 table-fixed">
                            <colgroup><col className="w-[120px]" /><col className="w-[100px]" /><col className="w-[100px]" /><col className="w-[120px]" /><col className="w-[100px]" /><col className="w-[180px]" /><col className="w-[180px]" /><col className="w-[120px]" /><col className="w-[50px]" /></colgroup>
                            <thead className="bg-white/5 text-zinc-300 uppercase font-medium text-xs tracking-wider border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-4">{t('table.status')}</th>
                                    <th className="px-6 py-4">{t('table.date')}</th>
                                    <th className="px-6 py-4">{t('table.ticketInfo')}</th>
                                    <th className="px-6 py-4">{t('table.gap')}</th>
                                    <th className="px-6 py-4">{t('table.risk')}</th>
                                    <th className="px-6 py-4">{t('table.customer')}</th>
                                    <th className="px-6 py-4">{t('table.device')}</th>
                                    <th className="px-6 py-4">{t('table.timeToFix')}</th>
                                    <th className="px-6 py-4 w-[50px]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800 bg-black/10">
                                {sortedTickets.map((ticket) => {
                                    const urgency = getUrgencyInfo(ticket);
                                    const risk = getRiskInfo(ticket);
                                    const RiskIcon = risk.icon;
                                    return (
                                        <tr
                                            key={ticket.id}
                                            onClick={() => router.push(`/ar/maintenance/tickets/${ticket.id}`)}
                                            className="hover:bg-white/5 transition-colors cursor-pointer group"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Badge className={`${getStatusColor(ticket.status)} text-white font-bold border-0 hover:${getStatusColor(ticket.status)}`}>
                                                    {getStatusLabel(ticket.status)}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-mono text-zinc-300 font-medium text-xs">#{ticket.barcode}</span>
                                                    {(() => {
                                                        const caseInfo = getCaseInfo(ticket);
                                                        const CaseIcon = caseInfo.icon;
                                                        return (
                                                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border w-fit ${caseInfo.color}`}>
                                                                <CaseIcon className="w-3 h-3" />
                                                                <span className="text-[10px] font-bold uppercase tracking-wider">{caseInfo.label}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-medium text-blue-300">
                                                {ticket.gap || formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`flex items-center gap-1 ${ticket.riskLevel === 'high' ? 'text-red-500' : (ticket.riskLevel === 'medium' ? 'text-orange-500' : 'text-emerald-500')}`}>
                                                    {ticket.riskLevel === 'high' ? <AlertCircle className="w-4 h-4" /> : (ticket.riskLevel === 'medium' ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />)}
                                                    <span className="text-xs uppercase font-bold tracking-tighter">{ticket.riskLevel || 'low'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-zinc-200 group-hover:text-cyan-500 transition-colors truncate">{ticket.customerName}</span>
                                                        {ticket.customer?.linkedEmployeeId && (
                                                            <span className="text-[9px] bg-cyan-900/60 text-cyan-200 border border-cyan-500/40 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                                موظف داخلي
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-zinc-500">{ticket.customerPhone}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-zinc-300 truncate block">{ticket.deviceBrand} {ticket.deviceModel}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`flex items-center gap-1 ${urgency ? urgency.color : 'text-zinc-400'}`}>
                                                    <Clock className="w-3 h-3" />
                                                    <span className="text-sm font-medium">
                                                        {urgency ? urgency.label : (ticket.expectedDuration ? `${ticket.expectedDuration} min` : '-')}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-[160px] bg-zinc-900 border-white/10 text-white">
                                                        <DropdownMenuLabel>{t('list.actions')}</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/ar/maintenance/tickets/${ticket.id}`) }}>
                                                            <Search className="mr-2 h-4 w-4" />
                                                            <span>{t('list.viewDetails')}</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingTicket(ticket); setShowEditModal(true); }}>
                                                            <Edit2 className="mr-2 h-4 w-4" />
                                                            <span>{t('list.editDetails')}</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="bg-white/5" />
                                                        <DropdownMenuItem
                                                            className="text-red-400 focus:text-red-400 focus:bg-red-400/10"
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
