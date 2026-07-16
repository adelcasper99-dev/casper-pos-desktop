'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from '@/lib/i18n-mock';
import {
    Search, Filter, CreditCard, History, User, Phone,
    ArrowUpRight, ArrowDownLeft, Settings,
    ShoppingBag, Wallet, Info, ChevronUp, ChevronDown, ArrowUpDown,
    MoreVertical, Edit2, AlertTriangle, TrendingUp, Clock, Activity, Loader2,
    MapPin, Mail, Wrench, Check, X, Share2, Copy, ExternalLink, QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    getCustomersWithBalance,
    recordCustomerPayment,
    updateCustomerCreditLimit,
    getCustomerDetails,
    updateCustomer,
    getCustomerIntelligenceStats
} from '@/actions/customer-actions';
import { CasperLoader } from '@/components/ui/CasperLoader';
import clsx from 'clsx';
import Decimal from 'decimal.js';

export interface CustomerWithBalance {
    id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    receivesNotifications?: boolean;
    balance: number;
    creditLimit?: number | null;
    riskLevel: 'high' | 'medium' | 'low';
    successRatio: number;
    daysSinceLastActivity: number;
    [key: string]: any; // Allow dynamic key access for sorting
}

export interface IntelligenceStats {
    totalOutstanding?: number;
    avgSuccessRatio?: number;
    highRiskCount?: number;
    totalCustomers?: number;
}

export default function CustomerAccountsTab() {
    const t = useTranslations('Customers');
    const ct = useTranslations('Common');
    const [isPending, startTransition] = useTransition();

    // State
    const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
    const [intelligenceStats, setIntelligenceStats] = useState<IntelligenceStats | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [hasBalanceOnly, setHasBalanceOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' | null }>({ 
        key: 'balance', 
        direction: 'desc' 
    });

    // Selection for Modals
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithBalance | null>(null);
    const [customerDetails, setCustomerDetails] = useState<any | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPortalModal, setShowPortalModal] = useState(false);
    const [portalLink, setPortalLink] = useState<string | null>(null);
    const [isGeneratingPortal, setIsGeneratingPortal] = useState(false);

    // Form States
    const [paymentData, setPaymentData] = useState<{ amount: string, method: 'CASH' | 'VISA' | 'WALLET' | 'INSTAPAY', reference: string }>({ amount: '', method: 'CASH', reference: '' });
    const [limitValue, setLimitValue] = useState('');
    const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', address: '', receivesNotifications: true });

    useEffect(() => {
        loadData();
    }, [hasBalanceOnly]);

    const loadData = async (query = searchQuery) => {
        setLoading(true);
        try {
            const [custResult, statsResult] = await Promise.all([
                getCustomersWithBalance({
                    search: query,
                    hasBalance: hasBalanceOnly
                }),
                getCustomerIntelligenceStats()
            ]);

            if (custResult.success && Array.isArray(custResult.customers)) {
                setCustomers(custResult.customers);
            }
            
            if (statsResult.success) {
                setIntelligenceStats(statsResult);
            }
        } catch (error) {
            toast.error("Failed to load intelligence data");
        } finally {
            setLoading(false);
        }
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchQuery(val);
        // Debounce search
        const timeoutId = setTimeout(() => loadData(val), 500);
        return () => clearTimeout(timeoutId);
    };

    const handleOpenPayment = (customer: any) => {
        setSelectedCustomer(customer);
        setPaymentData({ amount: '', method: 'CASH', reference: '' });
        setShowPaymentModal(true);
    };

    const handleOpenLimit = (customer: any) => {
        setSelectedCustomer(customer);
        setLimitValue(customer.creditLimit ? customer.creditLimit.toString() : '');
        setShowLimitModal(true);
    };

    const handleOpenEdit = (customer: any) => {
        setSelectedCustomer(customer);
        setEditForm({
            name: customer.name,
            phone: customer.phone,
            email: customer.email || '',
            address: customer.address || '',
            receivesNotifications: customer.receivesNotifications ?? true
        });
        setShowEditModal(true);
    };

    const handleOpenDetails = async (customer: any) => {
        setSelectedCustomer(customer);
        setShowDetailsModal(true);
        setLoading(true);
        try {
            const result = await getCustomerDetails(customer.id);
            if (result.success !== false) {
                setCustomerDetails(result);
            } else if (result.error) {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error('Failed to load details');
        } finally {
            setLoading(false);
        }
    };

    const submitPayment = async () => {
        if (!selectedCustomer || !paymentData.amount) return;

        let paymentAmount: number;
        try {
            paymentAmount = new Decimal(paymentData.amount).toDecimalPlaces(2).toNumber();
        } catch (e) {
            toast.error(t('paymentModal.errorInvalidFormat', { defaultValue: 'Please enter a valid number' }));
            return;
        }

        if (paymentAmount <= 0) {
            toast.error(t('paymentModal.errorInvalidAmount', { defaultValue: 'Amount must be greater than zero' }));
            return;
        }

        startTransition(async () => {
            try {
                const res = await recordCustomerPayment({
                    customerId: selectedCustomer.id,
                    amount: paymentAmount,
                    paymentMethod: paymentData.method,
                    reference: paymentData.reference
                });

                if (res?.success) {
                    toast.success(t('paymentModal.success'));
                    setShowPaymentModal(false);
                    loadData();
                } else if (res?.error) {
                    toast.error(res.error);
                }
            } catch (error) {
                toast.error(t('paymentModal.error'));
            }
        });
    };

    const submitLimit = async () => {
        if (!selectedCustomer) return;

        startTransition(async () => {
            try {
                const res = await updateCustomerCreditLimit({
                    customerId: selectedCustomer.id,
                    creditLimit: limitValue ? parseFloat(limitValue) : null
                });

                if (res?.success) {
                    toast.success(t('creditModal.success'));
                    setShowLimitModal(false);
                    loadData();
                } else if (res?.error) {
                    toast.error(res.error);
                }
            } catch (error) {
                toast.error('Failed to update limit');
            }
        });
    };

    const submitEdit = async () => {
        if (!selectedCustomer) return;

        startTransition(async () => {
            try {
                const res = await updateCustomer({
                    id: selectedCustomer.id,
                    ...editForm
                });

                if (res.success) {
                    toast.success(ct('SystemMessages.Success.updated'));
                    setShowEditModal(false);
                    loadData();
                } else if (res.error) {
                    toast.error(res.error);
                }
            } catch (error) {
                toast.error('Failed to update customer');
            }
        });
    };

    const generatePortalLink = async () => {
        if (!selectedCustomer) return;
        setIsGeneratingPortal(true);
        try {
            const res = await fetch(`/api/customers/${selectedCustomer.id}/portal-link`);
            const data = await res.json();
            if (data.success) {
                let link = `${window.location.origin}${data.path}`;
                if ((window as any).ipcRenderer) {
                    const status = await (window as any).ipcRenderer.invoke('tunnel:status');
                    if (status.active && status.url) {
                        link = `${status.url}${data.path}`;
                    }
                }
                setPortalLink(link);
                setShowPortalModal(true);
            } else {
                toast.error(data.error);
            }
        } catch (e) {
            toast.error('Failed to generate portal link');
        } finally {
            setIsGeneratingPortal(false);
        }
    };

    // Calculate Totals
    const totalOwed = customers
        .reduce((sum, c) => (c.balance ?? 0) > 0 ? sum.add(new Decimal(c.balance || 0)) : sum, new Decimal(0))
        .toDecimalPlaces(2).toNumber();
    const totalCredit = customers
        .reduce((sum, c) => (c.balance ?? 0) < 0 ? sum.add(new Decimal(Math.abs(c.balance || 0))) : sum, new Decimal(0))
        .toDecimalPlaces(2).toNumber();
    
    // Sorting Logic
    const sortedCustomers = useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) return customers;

        return [...customers].sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [customers, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev.key === key) {
                if (prev.direction === 'desc') return { key, direction: 'asc' };
                if (prev.direction === 'asc') return { key: '', direction: null };
            }
            return { key, direction: 'desc' };
        });
    };

    const getSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
        if (sortConfig.direction === 'asc') return <ChevronUp className="w-4 h-4" />;
        return <ChevronDown className="w-4 h-4" />;
    };

    return (
        <div className="space-y-6 animate-fly-in font-cairo" dir="rtl">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-rose-500/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        {t('intelligence.outstanding')}
                    </span>
                    <span className="text-2xl font-black text-rose-600 dark:text-rose-500 font-mono flex items-center gap-1.5">
                        {Number(intelligenceStats?.totalOutstanding || 0).toLocaleString()}
                        <span className="text-xs font-normal opacity-70 italic font-cairo">EGP</span>
                    </span>
                </div>
                
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-emerald-500/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                        {t('intelligence.avgSuccess')}
                    </span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-500 font-mono flex items-center gap-1.5">
                        {intelligenceStats?.avgSuccessRatio || 0}%
                        <Activity className="w-4 h-4 opacity-50" />
                    </span>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-orange-500/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <Clock className="w-3.5 h-3.5 text-orange-500" />
                        {t('intelligence.highRiskCount')}
                    </span>
                    <span className="text-2xl font-black text-orange-600 dark:text-orange-500 font-mono flex items-center gap-1.5">
                        {intelligenceStats?.highRiskCount || 0}
                        <span className="text-xs font-normal opacity-70 italic font-cairo">{t('totalCustomersLabel')}</span>
                    </span>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-zinc-900/50 dark:border-b-white/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                        {t('totalCustomers')}
                    </span>
                    <span className="text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
                        {intelligenceStats?.totalCustomers || 0}
                        <span className="text-xs font-normal opacity-70 italic font-cairo">{t('totalCustomersLabel')}</span>
                    </span>
                </div>
            </div>

            {/* Filters Area */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 min-w-[300px] group/search w-full">
                    <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within/search:text-zinc-900 dark:group-focus-within/search:text-white transition-all pointer-events-none" />
                    <input
                        placeholder={t('searchPlaceholder')}
                        className="w-full h-12 ps-12 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:border-zinc-900 dark:focus:border-white transition-all font-bold rounded-2xl shadow-inner"
                        value={searchQuery}
                        onChange={handleSearchChange}
                    />
                </div>
                <Button
                    variant={hasBalanceOnly ? "default" : "ghost"}
                    onClick={() => setHasBalanceOnly(!hasBalanceOnly)}
                    className={cn(
                        "h-12 px-6 rounded-2xl font-black gap-2 transition-all uppercase tracking-widest text-xs",
                        hasBalanceOnly 
                            ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-zinc-900/10" 
                            : "bg-zinc-50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5"
                    )}
                >
                    <Filter className="w-4 h-4" />
                    {t('onlyWithBalance')}
                </Button>
            </div>

            {/* Customers Table */}
            <div className="bg-white dark:bg-zinc-900/50 overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10 shadow-sm">
                <table className="w-full text-right text-sm text-zinc-600 dark:text-zinc-400 zebra-table">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/80 text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-white/10">
                        <tr className="hover:bg-transparent border-none">
                            <th 
                                className="px-6 py-4 text-start font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group select-none"
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={cn("transition-transform group-hover:translate-x-1", sortConfig.key === 'name' && "underline underline-offset-4 decoration-2")}>{t('table.name')}</span>
                                    {getSortIcon('name')}
                                </div>
                            </th>
                            <th className="px-6 py-4 text-start font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group select-none" onClick={() => handleSort('balance')}>
                                <div className="flex items-center gap-2">
                                    <span className={cn("transition-transform group-hover:translate-x-1", sortConfig.key === 'balance' && "underline underline-offset-4 decoration-2")}>{t('table.balance')}</span>
                                    {getSortIcon('balance')}
                                </div>
                            </th>
                            <th className="px-6 py-4 text-start font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group" onClick={() => handleSort('successRatio')}>
                                <div className="flex items-center gap-2">
                                    <span className={cn("transition-transform group-hover:translate-x-1", sortConfig.key === 'successRatio' && "underline underline-offset-4 decoration-2")}>{t('table.intelligence')}</span>
                                    {getSortIcon('successRatio')}
                                </div>
                            </th>
                            <th className="px-6 py-4 text-end font-black text-[10px] uppercase tracking-widest">{t('table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="py-16 text-center">
                                    <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                        <CasperLoader width={60} />
                                        <p className="font-bold text-xs uppercase tracking-widest">{ct('loading')}</p>
                                    </div>
                                </td>
                            </tr>
                        ) : sortedCustomers.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-16 text-center">
                                    <div className="flex flex-col items-center justify-center gap-4">
                                        <div className="inline-flex p-4 rounded-full bg-zinc-50 dark:bg-white/5 mb-2">
                                            <Search className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                                        </div>
                                        <p className="font-bold text-zinc-500 dark:text-zinc-400">{t('noCustomersFound')}</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            sortedCustomers.map((customer) => (
                                <tr 
                                    key={customer.id} 
                                    className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-all group border-none cursor-pointer"
                                    onClick={() => handleOpenDetails(customer)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-black text-xs shrink-0 shadow-lg shadow-zinc-900/10">
                                                {customer.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-black text-zinc-900 dark:text-white text-sm group-hover:underline transition-all truncate max-w-[200px]">{customer.name}</span>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-zinc-500 font-bold flex items-center gap-1">
                                                        <Phone className="w-2.5 h-2.5 opacity-50" /> {customer.phone}
                                                    </span>
                                                    {customer.email && (
                                                        <span className="text-[10px] text-zinc-400 font-bold truncate max-w-[120px]">• {customer.email}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className={clsx(
                                                "text-sm font-black font-mono px-2.5 py-1 rounded-lg border",
                                                customer.balance > 0 ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20" : 
                                                customer.balance < 0 ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20" : 
                                                "bg-zinc-50 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10"
                                            )}>
                                                {(-Number(customer.balance)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {customer.balance !== 0 && (
                                                    <span className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest",
                                                        customer.balance > 0 ? "text-rose-600" : "text-emerald-600"
                                                    )}>
                                                        {customer.balance > 0 ? "DEBIT" : "CREDIT"}
                                                    </span>
                                                )}
                                                {customer.creditLimit && (
                                                    <span className="text-[9px] text-zinc-400 font-bold">/ Limit: {customer.creditLimit}</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            {/* Risk Indicator */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[8px] text-zinc-400 font-black uppercase tracking-tighter">{t('intelligence.riskLevel')}</span>
                                                <Badge variant="outline" className={cn(
                                                    "text-[9px] h-5 font-black uppercase",
                                                    customer.riskLevel === 'high' ? "bg-rose-500/10 text-rose-600 border-rose-200" :
                                                    customer.riskLevel === 'medium' ? "bg-orange-500/10 text-orange-600 border-orange-200" :
                                                    "bg-emerald-500/10 text-emerald-600 border-emerald-200"
                                                )}>
                                                    {t(`intelligence.${customer.riskLevel}Risk`)}
                                                </Badge>
                                            </div>

                                            {/* Success Ratio */}
                                            <div className="flex flex-col gap-1 w-20">
                                                <div className="flex justify-between items-center px-0.5">
                                                    <span className="text-[8px] text-zinc-400 font-black uppercase tracking-tighter">{t('intelligence.successRatio')}</span>
                                                    <span className="text-[9px] font-black font-mono">{customer.successRatio}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <div 
                                                        className={cn(
                                                            "h-full transition-all duration-1000",
                                                            customer.successRatio >= 90 ? "bg-emerald-500" :
                                                            customer.successRatio >= 70 ? "bg-orange-500" :
                                                            "bg-rose-500"
                                                        )}
                                                        style={{ width: `${customer.successRatio}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Activity Status */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[8px] text-zinc-400 font-black uppercase tracking-tighter">{t('intelligence.activityGap')}</span>
                                                <div className="flex items-center gap-1.5">
                                                    <div className={cn(
                                                        "w-2 h-2 rounded-full animate-pulse",
                                                        customer.daysSinceLastActivity < 7 ? "bg-emerald-500" :
                                                        customer.daysSinceLastActivity < 30 ? "bg-orange-500" :
                                                        "bg-rose-500"
                                                    )} />
                                                    <span className="text-[10px] font-bold text-zinc-500">
                                                        {customer.daysSinceLastActivity === 0 ? t('intelligence.active') : t('intelligence.staleDays', { days: customer.daysSinceLastActivity })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-end" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl p-2 font-cairo">
                                                <DropdownMenuLabel className="text-[10px] uppercase font-black tracking-widest text-zinc-400 px-3 py-2">{t('actions.menu')}</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => handleOpenDetails(customer)} className="rounded-xl px-3 py-2.5 gap-3 cursor-pointer group">
                                                    <History className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white" />
                                                    <span className="font-bold text-sm">{t('actions.view')}</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleOpenPayment(customer)} className="rounded-xl px-3 py-2.5 gap-3 cursor-pointer group text-emerald-600 dark:text-emerald-400">
                                                    <Wallet className="w-4 h-4" />
                                                    <span className="font-bold text-sm">{t('actions.payment')}</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator className="bg-zinc-100 dark:bg-white/5 my-1" />
                                                <DropdownMenuItem onClick={() => handleOpenEdit(customer)} className="rounded-xl px-3 py-2.5 gap-3 cursor-pointer group">
                                                    <Edit2 className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white" />
                                                    <span className="font-bold text-sm">{t('actions.edit')}</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleOpenLimit(customer)} className="rounded-xl px-3 py-2.5 gap-3 cursor-pointer group">
                                                    <Settings className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white" />
                                                    <span className="font-bold text-sm">{t('actions.creditLimit')}</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Payment Modal */}
            <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
                <DialogContent className="sm:max-w-[425px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 shadow-2xl rounded-3xl text-zinc-900 dark:text-white font-cairo">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">
                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                                <Wallet className="w-5 h-5" />
                            </div>
                            {t('paymentModal.title')}
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500 font-bold mt-2">
                            <span className="text-zinc-900 dark:text-white">{selectedCustomer?.name}</span> • {t('table.balance')}: <span className={Number(selectedCustomer?.balance) > 0 ? "text-rose-500" : "text-emerald-500"}>{(-Number(selectedCustomer?.balance)).toFixed(2)} EGP</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-6 border-y border-zinc-100 dark:border-white/5 my-2">
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t('paymentModal.amount')}</label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    placeholder="0.00"
                                    className="h-14 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 text-2xl font-black text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white shadow-inner pl-4"
                                    value={paymentData.amount}
                                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                                    autoFocus
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold text-xs">EGP</span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t('paymentModal.method')}</label>
                            <Tabs value={paymentData.method} onValueChange={(v) => setPaymentData({ ...paymentData, method: v as any })}>
                                <TabsList className="grid grid-cols-4 w-full h-12 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-1 rounded-xl">
                                    <TabsTrigger value="CASH" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white font-black text-[10px] uppercase shadow-sm">{t('paymentModal.methods.cash')}</TabsTrigger>
                                    <TabsTrigger value="VISA" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white font-black text-[10px] uppercase shadow-sm">{t('paymentModal.methods.visa')}</TabsTrigger>
                                    <TabsTrigger value="WALLET" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white font-black text-[10px] uppercase shadow-sm">{t('paymentModal.methods.vcash')}</TabsTrigger>
                                    <TabsTrigger value="INSTAPAY" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white font-black text-[10px] uppercase shadow-sm">{t('paymentModal.methods.ipay')}</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t('paymentModal.reference')}</label>
                            <Input
                                placeholder={t('paymentModal.referencePlaceholder')}
                                className="h-12 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 focus:border-zinc-900 dark:focus:border-white text-zinc-900 dark:text-white"
                                value={paymentData.reference}
                                onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-3">
                        <Button variant="ghost" className="rounded-xl font-bold flex-1 h-12" onClick={() => setShowPaymentModal(false)}>{ct('cancel')}</Button>
                        <Button
                            className="rounded-xl font-black flex-1 h-12 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                            onClick={submitPayment}
                            disabled={isPending || !paymentData.amount}
                        >
                            {isPending ? <CasperLoader width={24} /> : ct('save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Credit Limit Modal */}
            <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
                <DialogContent className="sm:max-w-[425px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 shadow-2xl rounded-3xl text-zinc-900 dark:text-white font-cairo">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">
                            <div className="p-2 rounded-xl bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white">
                                <Settings className="w-5 h-5" />
                            </div>
                            {t('creditModal.title')}
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500 font-bold mt-2">
                            {selectedCustomer?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 space-y-4 border-y border-zinc-100 dark:border-white/5 my-2">
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t('creditModal.limit')}</label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    placeholder="بلا حد ائتماني"
                                    className="h-14 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 text-2xl font-black text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white focus:ring-1 focus:ring-zinc-900 shadow-inner"
                                    value={limitValue}
                                    onChange={(e) => setLimitValue(e.target.value)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold text-xs">EGP</span>
                            </div>
                            <p className="text-xs text-zinc-500 font-bold pl-1">{t('creditModal.hint')}</p>
                        </div>
                    </div>
                    <DialogFooter className="gap-3">
                        <Button variant="ghost" className="rounded-xl font-bold flex-1 h-12" onClick={() => setShowLimitModal(false)}>{ct('cancel')}</Button>
                        <Button
                            className="bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl font-black flex-1 h-12"
                            onClick={submitLimit}
                            disabled={isPending}
                        >
                            {isPending ? <CasperLoader width={24} /> : ct('save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Details Modal */}
            <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
                <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 shadow-2xl rounded-[2.5rem] font-cairo">
                    <DialogHeader className="p-8 pb-4 relative overflow-hidden bg-zinc-50 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-white/5">
                        <div className="flex items-start justify-between relative z-10">
                            <div className="flex gap-6">
                                <div className="w-20 h-20 rounded-[1.5rem] bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-black text-3xl shadow-lg">
                                    {selectedCustomer?.name.substring(0, 1).toUpperCase()}
                                </div>
                                <div>
                                    <DialogTitle className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{selectedCustomer?.name}</DialogTitle>
                                    <DialogDescription className="sr-only">
                                        تفاصيل حساب العميل والمعاملات المالية.
                                    </DialogDescription>

                                    <div className="flex items-center gap-4 text-sm text-zinc-500 mt-2 font-bold">
                                        <span className="flex items-center gap-1.5 border border-zinc-200 dark:border-white/10 px-3 py-1 rounded-lg bg-white dark:bg-black/20">
                                            <Phone className="w-3.5 h-3.5" /> {selectedCustomer?.phone}
                                        </span>
                                        {selectedCustomer?.email && (
                                            <span className="flex items-center gap-1.5 border border-zinc-200 dark:border-white/10 px-3 py-1 rounded-lg bg-white dark:bg-black/20">
                                                <Info className="w-3.5 h-3.5" /> {selectedCustomer.email}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-4">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-8 gap-2 bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 font-bold"
                                            onClick={generatePortalLink}
                                            disabled={isGeneratingPortal}
                                        >
                                            {isGeneratingPortal ? <CasperLoader width={16} /> : <Share2 className="w-3.5 h-3.5" />}
                                            بوابة العميل
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="text-left bg-white dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm min-w-[180px]">
                                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-1">{t('details.info.balance')}</p>
                                <div className={`text-2xl flex items-center justify-end gap-1 font-black tabular-nums font-mono ${(selectedCustomer?.balance ?? 0) > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    <span dir="ltr">{-Number(selectedCustomer?.balance ?? 0)}</span>
                                    <span className="text-[10px] text-zinc-400">EGP</span>
                                </div>
                            </div>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="transactions" className="flex-1 flex flex-col px-0">
                        <div className="px-8 border-b border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/20">
                            <TabsList className="bg-transparent h-14 w-full justify-start gap-8 p-0">
                                <TabsTrigger
                                    value="transactions"
                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 dark:data-[state=active]:border-white data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white px-0 gap-2 h-full font-black text-xs uppercase tracking-widest transition-all text-zinc-500"
                                >
                                    <CreditCard className="w-4 h-4" />
                                    {t('details.tabs.transactions')}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="sales"
                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 dark:data-[state=active]:border-white data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white px-0 gap-2 h-full font-black text-xs uppercase tracking-widest transition-all text-zinc-500"
                                >
                                    <ShoppingBag className="w-4 h-4" />
                                    {t('details.tabs.sales')}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="tickets"
                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 dark:data-[state=active]:border-white data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white px-0 gap-2 h-full font-black text-xs uppercase tracking-widest transition-all text-zinc-500"
                                >
                                    <Wrench className="w-4 h-4" />
                                    {t('details.tabs.tickets')}
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-white dark:bg-zinc-950">
                            <TabsContent value="transactions" className="mt-0 outline-none">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                                        <CasperLoader width={60} />
                                        <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">{t('details.authenticatingHistory')}</p>
                                    </div>
                                ) : !customerDetails?.transactions?.length ? (
                                    <div className="text-center py-24 text-zinc-400 font-bold">{t('details.noTransactions')}</div>
                                ) : (
                                    <div className="space-y-4">
                                        {customerDetails.transactions.map((tx: any) => {
                                            const ticketRef = tx.description?.match(/#(T-\d+)/)?.[1] || tx.reference?.match(/(T-\d+)/)?.[1] || tx.reference;
                                            const linkedTicket = ticketRef ? customerDetails.tickets?.find((t: any) => t.barcode === ticketRef || t.id === ticketRef) : null;
                                            
                                            return (
                                                <div key={tx.id} className="bg-zinc-50 dark:bg-zinc-900/40 p-3 rounded-xl border border-zinc-200 dark:border-white/5 flex items-center justify-between group hover:bg-white dark:hover:bg-zinc-900 transition-colors">
                                                    <div className="flex items-center gap-4 min-w-0">
                                                        <div className={`p-2 rounded-xl shrink-0 ${tx.type === 'DEBIT' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-500' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500'}`}>
                                                            {tx.type === 'DEBIT' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="font-black text-zinc-900 dark:text-white text-sm truncate">
                                                                    {tx.description || (tx.type === 'DEBIT' ? t('details.transactionTypes.sale') : t('details.transactionTypes.credit'))}
                                                                </p>
                                                                {linkedTicket && (
                                                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-black border-zinc-200 dark:border-white/10 uppercase tracking-widest bg-white dark:bg-zinc-900 truncate max-w-[200px]">
                                                                        {linkedTicket.device} {linkedTicket.issueDescription ? `— ${linkedTicket.issueDescription}` : ''}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <p className="text-[9px] text-zinc-500 font-bold mt-0.5 tracking-widest uppercase">
                                                                {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tx.createdAt))}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0 ml-4">
                                                        <div className={`text-base flex items-center justify-end gap-1 font-black tabular-nums font-mono ${tx.type === 'DEBIT' ? 'text-rose-600 dark:text-rose-500' : 'text-emerald-600 dark:text-emerald-500'}`}>
                                                            <span dir="ltr">{tx.type === 'DEBIT' ? '-' : '+'}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> <span className="text-[9px]">EGP</span>
                                                        </div>
                                                        <p className="text-[9px] text-zinc-400 font-bold mt-0.5 uppercase">مرجع: {tx.id.split('-')[0]}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="tickets" className="mt-0 outline-none">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                                        <CasperLoader width={60} />
                                        <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">{t('details.authenticatingHistory')}</p>
                                    </div>
                                ) : !customerDetails?.tickets?.length ? (
                                    <div className="text-center py-24 text-zinc-400 font-bold">{t('details.noTickets')}</div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Intelligence Summary Bar */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-zinc-50 dark:bg-zinc-900/40 p-1 rounded-2xl border border-zinc-200 dark:border-white/5">
                                            <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-white/5 shadow-sm">
                                                <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">{t('intelligence.successRatio')}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg font-black">{customerDetails.intelligence.ticketSuccessRatio}%</span>
                                                    <div className="h-1 flex-1 bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                        <div 
                                                            className={cn(
                                                                "h-full transition-all duration-1000",
                                                                customerDetails.intelligence.ticketSuccessRatio >= 90 ? "bg-emerald-500" :
                                                                customerDetails.intelligence.ticketSuccessRatio >= 70 ? "bg-orange-500" :
                                                                "bg-rose-500"
                                                            )}
                                                            style={{ width: `${customerDetails.intelligence.ticketSuccessRatio}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-white/5 shadow-sm">
                                                <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">ديون متأخرة</p>
                                                <p className="text-lg font-black text-rose-500 font-mono">
                                                    {customerDetails.intelligence.unpaidMaintenance.toLocaleString()} <span className="text-[9px] font-normal italic">EGP</span>
                                                </p>
                                            </div>
                                            <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-white/5 shadow-sm">
                                                <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">معدل التردد للصيانة</p>
                                                <p className="text-lg font-black">
                                                    {customerDetails.intelligence.maintenanceGapDays !== null ? `كل ${customerDetails.intelligence.maintenanceGapDays} يوم` : "—"}
                                                </p>
                                            </div>
                                            <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-white/5 shadow-sm">
                                                <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">إجمالي الأجهزة</p>
                                                <p className="text-lg font-black">
                                                    {customerDetails.tickets.length} <span className="text-[9px] font-normal">جهاز</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {customerDetails.tickets.map((ticket: any) => (
                                                <div key={ticket.id} className="group bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/5 rounded-2xl p-4 transition-all hover:bg-white dark:hover:bg-zinc-900 hover:shadow-xl hover:shadow-zinc-900/5 hover:-translate-y-1">
                                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                        <div className="flex items-center gap-3 md:w-[35%] min-w-0">
                                                            <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-black shadow-md shrink-0">
                                                                <Wrench className="w-4 h-4" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5 min-w-0 mb-0.5">
                                                                    {ticket.issueDescription && (
                                                                        <>
                                                                            <p className="font-black text-zinc-900 dark:text-white uppercase tracking-tighter text-sm truncate">
                                                                                {ticket.issueDescription}
                                                                            </p>
                                                                            <span className="text-zinc-300 dark:text-zinc-600 shrink-0">—</span>
                                                                        </>
                                                                    )}
                                                                    <p className={cn("uppercase tracking-tighter truncate", ticket.issueDescription ? "text-xs font-bold text-zinc-500" : "font-black text-zinc-900 dark:text-white text-sm")}>
                                                                        {ticket.device}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-black border-zinc-200 dark:border-white/10 uppercase tracking-widest truncate">#{ticket.barcode}</Badge>
                                                                    <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest truncate">
                                                                        {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(ticket.createdAt))}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between md:justify-end gap-6 flex-1 min-w-0">
                                                            <div className="hidden lg:block shrink-0">
                                                                <p className="text-[8px] text-zinc-400 font-black uppercase tracking-widest mb-0.5 text-right">الحالة المالية</p>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[10px] font-black font-mono">
                                                                        {ticket.repairPrice.toLocaleString()} <span className="text-[8px] font-normal">التكلفة</span>
                                                                    </span>
                                                                    <span className="text-[9px] text-zinc-300">|</span>
                                                                    <span className="text-[10px] font-black font-mono text-emerald-600">
                                                                        {ticket.deposit.toLocaleString()} <span className="text-[8px] font-normal">المدفوع</span>
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0 text-end">
                                                                <p className="text-[8px] text-zinc-400 font-black uppercase tracking-widest mb-0.5">المتبقي</p>
                                                                <p className={cn(
                                                                    "text-xs font-black font-mono",
                                                                    ticket.due > 0 ? "text-rose-600" : "text-emerald-600"
                                                                )}>
                                                                    {ticket.due.toLocaleString()} <span className="text-[9px]">EGP</span>
                                                                </p>
                                                            </div>
                                                            
                                                            <div className="shrink-0 w-20 hidden md:block">
                                                                <p className="text-[8px] text-zinc-400 font-black uppercase tracking-widest mb-1 text-center">مسار التذكرة</p>
                                                                <div className="flex gap-0.5">
                                                                    {[1, 2, 3, 4].map((step) => (
                                                                        <div 
                                                                            key={step} 
                                                                            className={cn(
                                                                                "h-1 flex-1 rounded-full",
                                                                                step === 1 ? "bg-emerald-500" :
                                                                                (step === 2 && ['DIAGNOSING', 'REPAIRING', 'COMPLETED', 'DELIVERED', 'PAID_DELIVERED'].includes(ticket.status)) ? "bg-emerald-500" :
                                                                                (step === 3 && ['COMPLETED', 'DELIVERED', 'PAID_DELIVERED'].includes(ticket.status)) ? "bg-emerald-500" :
                                                                                (step === 4 && ['DELIVERED', 'PAID_DELIVERED'].includes(ticket.status)) ? "bg-emerald-500" :
                                                                                "bg-zinc-200 dark:bg-white/10"
                                                                            )}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0 text-right">
                                                                <Badge className={cn(
                                                                    "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg text-center min-w-[90px]",
                                                                    ['COMPLETED', 'DELIVERED', 'PAID_DELIVERED'].includes(ticket.status) ? "bg-emerald-500 text-white" :
                                                                    ['CANCELLED', 'VOIDED'].includes(ticket.status) ? "bg-rose-500 text-white" :
                                                                    "bg-orange-500 text-white"
                                                                )}>
                                                                    {ticket.status === 'PAID_DELIVERED' ? 'PAID & DELIVERED' : ticket.status}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </TabsContent>
                            <TabsContent value="sales" className="mt-0 outline-none">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                                        <CasperLoader width={60} />
                                        <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">{t('details.scanningLedger')}</p>
                                    </div>
                                ) : !customerDetails?.sales?.length ? (
                                    <div className="text-center py-24 text-zinc-400 font-bold">{t('details.noSales')}</div>
                                ) : (
                                    <div className="space-y-6">
                                        {customerDetails.sales.map((sale: any) => (
                                            <div key={sale.id} className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/5 rounded-2xl overflow-hidden">
                                                <div className="p-5 flex items-center justify-between border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-zinc-900/60">
                                                    <div>
                                                        <p className="font-black text-zinc-900 dark:text-white flex items-center gap-2 text-sm uppercase">
                                                            <ShoppingBag className="w-4 h-4 text-zinc-400" />
                                                            فاتورة #{sale.id.split('-')[0]}
                                                        </p>
                                                        <p className="text-[10px] text-zinc-500 font-bold mt-1 tracking-widest">
                                                            {new Date(sale.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={cn(
                                                            "font-black text-[9px] px-2.5 py-1 rounded-md uppercase tracking-[0.1em]",
                                                            sale.status === 'COMPLETED' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500" : "bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white"
                                                        )}>
                                                            {sale.status}
                                                        </span>
                                                        <p className="font-black text-lg mt-2 text-zinc-900 dark:text-white tabular-nums font-mono">{Number(sale.totalAmount).toLocaleString()} <span className="text-[10px] font-normal text-zinc-500">EGP</span></p>
                                                    </div>
                                                </div>
                                                <div className="p-5 space-y-3">
                                                    {sale.items.map((item: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-center text-sm font-bold">
                                                            <div className="flex items-center gap-3">
                                                                <span className="w-6 h-6 rounded-md bg-zinc-200 dark:bg-white/10 flex items-center justify-center font-black text-[10px] text-zinc-900 dark:text-white">{item.quantity}x</span>
                                                                <span className="text-zinc-700 dark:text-zinc-300">{item.productName}</span>
                                                            </div>
                                                            <span className="text-zinc-500 font-mono text-xs">{Number(item.unitPrice).toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Edit Customer Modal */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="sm:max-w-[425px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 shadow-2xl rounded-3xl text-zinc-900 dark:text-white font-cairo">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">
                            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500">
                                <Edit2 className="w-5 h-5" />
                            </div>
                            {t('editModal.title')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-6 border-y border-zinc-100 dark:border-white/5 my-2">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-500">{t('editModal.name')}</label>
                            <Input
                                className="h-11 bg-zinc-50 dark:bg-white/5 border-zinc-200 dark:border-white/10 rounded-xl"
                                value={editForm.name}
                                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-500">{t('editModal.phone')}</label>
                            <Input
                                className="h-11 bg-zinc-50 dark:bg-white/5 border-zinc-200 dark:border-white/10 rounded-xl font-mono"
                                value={editForm.phone}
                                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-500">{t('editModal.email')}</label>
                            <Input
                                type="email"
                                className="h-11 bg-zinc-50 dark:bg-white/5 border-zinc-200 dark:border-white/10 rounded-xl font-mono"
                                value={editForm.email}
                                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-500">{t('editModal.address')}</label>
                            <textarea
                                className="w-full min-h-[80px] p-3 text-sm bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                                value={editForm.address}
                                onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-500">خيارات الإشعارات</label>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditForm(prev => ({ ...prev, receivesNotifications: !prev.receivesNotifications }))}
                                className={cn(
                                    "w-full h-11 rounded-xl flex items-center justify-between px-4 transition-all",
                                    editForm.receivesNotifications 
                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                                        : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                )}
                            >
                                <span className="font-bold text-sm">استقبال الإشعارات (SMS/WhatsApp)</span>
                                <div className="flex items-center gap-2">
                                    {editForm.receivesNotifications ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                    <span className="text-[10px] font-black uppercase">{editForm.receivesNotifications ? "مفعل" : "غير مفعل"}</span>
                                </div>
                            </Button>
                        </div>
                    </div>
                    <DialogFooter className="gap-3">
                        <Button variant="ghost" className="rounded-xl font-bold flex-1 h-12" onClick={() => setShowEditModal(false)}>{ct('cancel')}</Button>
                        <Button
                            className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black flex-1 h-12"
                            onClick={submitEdit}
                            disabled={isPending}
                        >
                            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : t('editModal.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        {/* Portal Link Modal */}
        <Dialog open={showPortalModal} onOpenChange={setShowPortalModal}>
            <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 shadow-2xl rounded-3xl text-zinc-900 dark:text-white font-cairo overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-indigo-500/5 to-slate-900/5 -z-10" />
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">
                        <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                            <Share2 className="w-5 h-5" />
                        </div>
                        بوابة العميل
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 dark:text-zinc-400 font-bold">
                        رابط الدخول المباشر لبوابة العميل. (الرقم السري هو آخر 4 أرقام من الموبايل)
                    </DialogDescription>
                </DialogHeader>
                
                {portalLink && (
                    <div className="flex flex-col items-center gap-6 py-6 border-y border-zinc-100 dark:border-white/5 my-2">
                        <div className="p-4 bg-white rounded-2xl shadow-sm border border-zinc-200">
                            <QRCodeSVG value={portalLink} size={180} level="M" />
                        </div>
                        
                        <div className="w-full space-y-2">
                            <div className="flex items-center gap-2">
                                <Input 
                                    readOnly 
                                    value={portalLink} 
                                    className="font-mono text-xs bg-zinc-50 dark:bg-white/5 border-zinc-200 dark:border-white/10 h-12"
                                    dir="ltr"
                                />
                                <Button 
                                    variant="outline" 
                                    size="icon"
                                    className="h-12 w-12 shrink-0 border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5"
                                    onClick={() => {
                                        navigator.clipboard.writeText(portalLink);
                                        toast.success("تم نسخ الرابط");
                                    }}
                                >
                                    <Copy className="w-4 h-4 text-zinc-500" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
                
                <DialogFooter>
                    <Button 
                        className="w-full rounded-xl font-bold h-12 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100" 
                        onClick={() => setShowPortalModal(false)}
                    >
                        إغلاق
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        </div>
    );
}


