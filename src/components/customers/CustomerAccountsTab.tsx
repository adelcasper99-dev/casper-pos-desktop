'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from '@/lib/i18n-mock';
import {
    Search, Filter, CreditCard, History, User, Phone,
    ArrowUpRight, ArrowDownLeft, Settings,
    ShoppingBag, Wallet, Info, ChevronUp, ChevronDown, ArrowUpDown
} from 'lucide-react';
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    getCustomersWithBalance,
    recordCustomerPayment,
    updateCustomerCreditLimit,
    getCustomerDetails
} from '@/actions/customer-actions';
import { CasperLoader } from '@/components/ui/CasperLoader';
import clsx from 'clsx';

export default function CustomerAccountsTab() {
    const t = useTranslations('Customers');
    const ct = useTranslations('Common');
    const [isPending, startTransition] = useTransition();

    // State
    const [customers, setCustomers] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [hasBalanceOnly, setHasBalanceOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' | null }>({ 
        key: 'balance', 
        direction: 'desc' 
    });

    // Selection for Modals
    const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
    const [customerDetails, setCustomerDetails] = useState<any | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    // Form States
    const [paymentData, setPaymentData] = useState({ amount: '', method: 'CASH' as any, reference: '' });
    const [limitValue, setLimitValue] = useState('');

    useEffect(() => {
        loadCustomers();
    }, [hasBalanceOnly]);

    const loadCustomers = async (query = searchQuery) => {
        setLoading(true);
        try {
            const result = await getCustomersWithBalance({
                search: query,
                hasBalance: hasBalanceOnly
            });
            if (result.success && Array.isArray(result.customers)) {
                setCustomers(result.customers);
            } else if (result.error) {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error("Failed to load customers");
        } finally {
            setLoading(false);
        }
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchQuery(val);
        // Debounce search
        const timeoutId = setTimeout(() => loadCustomers(val), 500);
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

    const handleOpenDetails = async (customer: any) => {
        setSelectedCustomer(customer);
        setShowDetailsModal(true);
        setLoading(true);
        try {
            const result = await getCustomerDetails(customer.id);
            if (result.success && result.id) {
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

        startTransition(async () => {
            try {
                const res = await recordCustomerPayment({
                    customerId: selectedCustomer.id,
                    amount: parseFloat(paymentData.amount),
                    paymentMethod: paymentData.method,
                    reference: paymentData.reference
                });

                if (res?.success) {
                    toast.success(t('paymentModal.success'));
                    setShowPaymentModal(false);
                    loadCustomers();
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
                    loadCustomers();
                } else if (res?.error) {
                    toast.error(res.error);
                }
            } catch (error) {
                toast.error('Failed to update limit');
            }
        });
    };

    // Calculate Totals
    const totalOwed = customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    const totalCredit = customers.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
    
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-rose-500/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                        {t('totalOwed')}
                    </span>
                    <span className="text-2xl font-black text-rose-600 dark:text-rose-500 font-mono flex items-center gap-1.5">
                        {Number(totalOwed).toLocaleString()}
                        <span className="text-xs font-normal opacity-70 italic">EGP</span>
                    </span>
                </div>
                
                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-emerald-500/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
                        {t('totalCredit')}
                    </span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-500 font-mono flex items-center gap-1.5">
                        {Number(totalCredit).toLocaleString()}
                        <span className="text-xs font-normal opacity-70 italic">EGP</span>
                    </span>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-900/40 p-6 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 rounded-3xl shadow-sm transition-all hover:shadow-md border-b-zinc-900/50 dark:border-b-white/50">
                    <span className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                        {t('totalCustomers')}
                    </span>
                    <span className="text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
                        {customers.length}
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
                            <th className="px-6 py-4 text-start font-black text-[10px] uppercase tracking-widest">{t('table.phone')}</th>
                            <th 
                                className="px-6 py-4 text-start font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group select-none"
                                onClick={() => handleSort('balance')}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={cn("transition-transform group-hover:translate-x-1", sortConfig.key === 'balance' && "underline underline-offset-4 decoration-2")}>{t('table.balance')}</span>
                                    {getSortIcon('balance')}
                                </div>
                            </th>
                            <th 
                                className="px-6 py-4 text-start font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group select-none"
                                onClick={() => handleSort('creditLimit')}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={cn("transition-transform group-hover:translate-x-1", sortConfig.key === 'creditLimit' && "underline underline-offset-4 decoration-2")}>{t('table.creditLimit')}</span>
                                    {getSortIcon('creditLimit')}
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
                                <tr key={customer.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors group border-none">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-black text-xs shrink-0 shadow-lg shadow-zinc-900/10">
                                                {customer.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-black text-zinc-900 dark:text-white text-sm group-hover:underline transition-all cursor-pointer truncate max-w-[200px]" onClick={() => handleOpenDetails(customer)}>{customer.name}</span>
                                                <span className="text-[10px] text-zinc-400 font-bold truncate max-w-[200px]">{customer.email || "—"}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">
                                        <div className="flex items-center gap-2 text-[11px] font-bold">
                                            <Phone className="w-3.5 h-3.5 opacity-50" />
                                            {customer.phone}
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
                                                {Math.abs(customer.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            {customer.balance < 0 && <span className="text-[9px] text-emerald-600 dark:text-emerald-500 font-black uppercase tracking-widest mx-1 text-right block w-full">رصيد للعميل</span>}
                                            {customer.balance > 0 && <span className="text-[9px] text-rose-600 dark:text-rose-500 font-black uppercase tracking-widest mx-1 text-right block w-full">عليه - مديونية</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 text-[11px] font-bold">
                                        {customer.creditLimit ? (
                                            <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-mono">
                                                <Info className="w-3.5 h-3.5 opacity-50 text-zinc-400" />
                                                {Number(customer.creditLimit).toLocaleString()}
                                            </div>
                                        ) : (
                                            <span className="opacity-50 uppercase tracking-widest text-[9px]">{t('details.unlimited')}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        <div className="flex justify-end gap-2 translate-x-1">
                                            <button 
                                                onClick={() => handleOpenPayment(customer)} 
                                                className="h-8 px-3 flex items-center justify-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition-all shadow-sm active:scale-90 font-bold text-[10px] uppercase"
                                                title={t('actions.payment')}
                                            >
                                                <Wallet className="w-3.5 h-3.5" />
                                                <span>دفع</span>
                                            </button>
                                            <button 
                                                onClick={() => handleOpenLimit(customer)} 
                                                className="h-8 px-3 flex items-center justify-center gap-1.5 bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-900 dark:hover:bg-white hover:text-white dark:hover:text-zinc-900 rounded-lg transition-all shadow-sm active:scale-90 font-bold text-[10px] uppercase"
                                                title={t('actions.creditLimit')}
                                            >
                                                <Settings className="w-3.5 h-3.5" />
                                                <span>الحد الائتماني</span>
                                            </button>
                                            <button 
                                                onClick={() => handleOpenDetails(customer)} 
                                                className="w-8 h-8 flex items-center justify-center bg-zinc-100 dark:bg-white/5 hover:bg-zinc-900 dark:hover:bg-white hover:text-white dark:hover:text-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-lg transition-all shadow-sm active:scale-90"
                                                title={t('actions.view')}
                                            >
                                                <History className="w-4 h-4" />
                                            </button>
                                        </div>
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
                            <span className="text-zinc-900 dark:text-white">{selectedCustomer?.name}</span> • {t('table.balance')}: <span className="text-rose-500">{Number(selectedCustomer?.balance).toFixed(2)} EGP</span>
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
                                </div>
                            </div>
                            <div className="text-left bg-white dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm min-w-[180px]">
                                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-1">{t('details.info.balance')}</p>
                                <p className={`text-2xl font-black tabular-nums font-mono ${selectedCustomer?.balance > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {Number(selectedCustomer?.balance).toLocaleString()} <span className="text-xs font-normal opacity-50 italic">EGP</span>
                                </p>
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
                                        {customerDetails.transactions.map((tx: any) => (
                                            <div key={tx.id} className="bg-zinc-50 dark:bg-zinc-900/40 p-5 rounded-2xl border border-zinc-200 dark:border-white/5 flex items-center justify-between group">
                                                <div className="flex items-center gap-5">
                                                    <div className={`p-3 rounded-xl ${tx.type === 'DEBIT' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-500' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500'}`}>
                                                        {tx.type === 'DEBIT' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-zinc-900 dark:text-white text-sm">{tx.description || (tx.type === 'DEBIT' ? t('details.transactionTypes.sale') : t('details.transactionTypes.credit'))}</p>
                                                        <p className="text-[10px] text-zinc-500 font-bold mt-1 tracking-widest uppercase">
                                                            {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tx.createdAt))}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-lg font-black tabular-nums font-mono ${tx.type === 'DEBIT' ? 'text-rose-600 dark:text-rose-500' : 'text-emerald-600 dark:text-emerald-500'}`}>
                                                        {tx.type === 'DEBIT' ? '+' : '-'}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px]">EGP</span>
                                                    </p>
                                                    <p className="text-[9px] text-zinc-400 font-bold mt-1 uppercase">Ref: {tx.id.split('-')[0]}</p>
                                                </div>
                                            </div>
                                        ))}
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
                                                            SALE #{sale.id.split('-')[0]}
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
        </div>
    );
}
