'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from '@/lib/i18n-mock';
import {
    Search, Filter, CreditCard, History, User, Phone,
    ArrowUpRight, ArrowDownLeft, MoreHorizontal, Settings,
    FileText, ShoppingBag, Wallet, Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    getCustomersWithBalance,
    recordCustomerPayment,
    updateCustomerCreditLimit,
    getCustomerDetails
} from '@/actions/customer-actions';
import { CasperLoader } from '@/components/ui/CasperLoader';

export default function CustomerAccountsTab() {
    const t = useTranslations('Customers');
    const ct = useTranslations('Common');
    const [isPending, startTransition] = useTransition();

    // State
    const [customers, setCustomers] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [hasBalanceOnly, setHasBalanceOnly] = useState(false);
    const [loading, setLoading] = useState(true);

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
            if (result?.customers) {
                setCustomers(result.customers);
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
            if (result?.id) {
                setCustomerDetails(result);
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
                }
            } catch (error) {
                toast.error('Failed to update limit');
            }
        });
    };

    // Calculate Totals
    const totalOwed = customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    const totalCredit = customers.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="reveal-animation">
                    <Card className="bg-card/50 backdrop-blur-xl border-primary/20 overflow-hidden relative group shadow-lg shadow-cyan-500/5">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ArrowUpRight className="w-12 h-12 text-rose-500" />
                        </div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{t('totalOwed')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-rose-500">
                                {Number(totalOwed).toLocaleString()} <span className="text-xs font-normal opacity-70 italic font-mono">EGP</span>
                            </div>
                        </CardContent>
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-rose-500/30" />
                    </Card>
                </div>

                <div className="reveal-animation">
                    <Card className="bg-card/50 backdrop-blur-xl border-primary/20 overflow-hidden relative group shadow-lg shadow-emerald-500/5">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ArrowDownLeft className="w-12 h-12 text-emerald-500" />
                        </div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{t('totalCredit')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-emerald-500">
                                {Number(totalCredit).toLocaleString()} <span className="text-xs font-normal opacity-70 italic font-mono">EGP</span>
                            </div>
                        </CardContent>
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-emerald-500/30" />
                    </Card>
                </div>

                <div className="reveal-animation">
                    <Card className="bg-card/50 backdrop-blur-xl border-primary/20 overflow-hidden relative group shadow-lg shadow-primary/5">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <User className="w-12 h-12 text-primary" />
                        </div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{t('totalCustomers')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-primary">
                                {customers.length} <span className="text-xs font-normal opacity-70 italic font-mono">{t('totalCustomersLabel')}</span>
                            </div>
                        </CardContent>
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-primary/30" />
                    </Card>
                </div>
            </div>

            {/* Filters & Search */}
            <Card className="bg-card/30 backdrop-blur-md border-primary/10">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                            <Input
                                placeholder={t('searchPlaceholder')}
                                className="pl-9 bg-background/50 border-primary/20 focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
                                value={searchQuery}
                                onChange={handleSearchChange}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant={hasBalanceOnly ? "default" : "outline"}
                                onClick={() => setHasBalanceOnly(!hasBalanceOnly)}
                                className={cn(
                                    "gap-2 transition-all",
                                    hasBalanceOnly && "shadow-[0_0_15px_rgba(0,242,255,0.3)]"
                                )}
                            >
                                <Filter className="w-4 h-4" />
                                {t('onlyWithBalance')}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Customers Table */}
            <Card className="bg-card/50 backdrop-blur-xl border-primary/20 shadow-2xl overflow-hidden rounded-2xl">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-primary/10">
                            <TableRow className="border-b border-primary/10">
                                <TableHead className="text-right text-primary font-bold">{t('table.name')}</TableHead>
                                <TableHead className="text-right text-primary font-bold">{t('table.phone')}</TableHead>
                                <TableHead className="text-right text-primary font-bold">{t('table.balance')}</TableHead>
                                <TableHead className="text-right text-primary font-bold">{t('table.creditLimit')}</TableHead>
                                <TableHead className="text-center text-primary font-bold">{t('table.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-64">
                                        <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                            <CasperLoader width={80} />
                                            <p className="text-primary animate-pulse">{ct('loading')}</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : customers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-64 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-4">
                                            <div className="p-4 rounded-full bg-primary/5">
                                                <Search className="w-12 h-12 text-primary opacity-20" />
                                            </div>
                                            <p className="text-lg font-medium">{t('noCustomersFound')}</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                customers.map((customer, idx) => (
                                    <TableRow
                                        key={customer.id}
                                        className="group hover:bg-primary/5 transition-colors border-b border-primary/5"
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-sm shadow-inner group-hover:scale-110 transition-transform">
                                                    {customer.name.substring(0, 1).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-foreground font-bold">{customer.name}</span>
                                                    <span className="text-xs text-muted-foreground italic font-mono opacity-70">{customer.email || '—'}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-muted-foreground font-mono">
                                                <Phone className="w-3 h-3 text-primary opacity-60" />
                                                {customer.phone}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            <Badge
                                                variant={customer.balance > 0 ? "destructive" : "default"}
                                                className={cn(
                                                    "min-w-[100px] justify-center text-sm py-1 font-black",
                                                    customer.balance <= 0 && "bg-emerald-500/20 text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/30",
                                                    customer.balance > 0 && "bg-rose-500/20 text-rose-500 border-rose-500/40 hover:bg-rose-500/30"
                                                )}
                                            >
                                                {Number(customer.balance).toFixed(2)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground font-mono italic">
                                            {customer.creditLimit ? (
                                                <span className="flex items-center justify-end gap-1">
                                                    <Info className="w-3 h-3 text-primary opacity-50" />
                                                    {Number(customer.creditLimit).toLocaleString()}
                                                </span>
                                            ) : t('details.unlimited')}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center justify-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-9 w-9 p-0 hover:bg-primary/20 hover:text-primary transition-all rounded-lg"
                                                    onClick={() => handleOpenDetails(customer)}
                                                >
                                                    <Info className="w-5 h-5" />
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 hover:bg-primary/20 rounded-lg">
                                                            <MoreHorizontal className="w-5 h-5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56 p-1 bg-card/95 backdrop-blur-xl border-primary/20 shadow-2xl">
                                                        <DropdownMenuItem className="gap-3 cursor-pointer py-3 focus:bg-primary/20 focus:text-primary rounded-xl" onClick={() => handleOpenPayment(customer)}>
                                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                                                <Wallet className="w-4 h-4" />
                                                            </div>
                                                            <span className="font-bold">{t('actions.payment')}</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="gap-3 cursor-pointer py-3 focus:bg-primary/20 focus:text-primary rounded-xl" onClick={() => handleOpenLimit(customer)}>
                                                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                                                                <Settings className="w-4 h-4" />
                                                            </div>
                                                            <span className="font-bold">{t('actions.creditLimit')}</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="gap-3 cursor-pointer py-3 focus:bg-primary/20 focus:text-primary rounded-xl" onClick={() => handleOpenDetails(customer)}>
                                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                                <History className="w-4 h-4" />
                                                            </div>
                                                            <span className="font-bold">{t('actions.view')}</span>
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {/* Payment Modal */}
            <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
                <DialogContent className="sm:max-w-[425px] bg-card/95 backdrop-blur-2xl border-primary/20 shadow-2xl rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-black text-foreground">
                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                                <Wallet className="w-5 h-5" />
                            </div>
                            {t('paymentModal.title')}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground/80">
                            <span className="font-bold text-foreground">{selectedCustomer?.name}</span> • {t('table.balance')}: <span className="font-black text-rose-500">{Number(selectedCustomer?.balance).toFixed(2)} EGP</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-6 border-y border-primary/10 my-2">
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-primary flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                {t('paymentModal.amount')}
                            </label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    placeholder="0.00"
                                    className="h-14 bg-background/50 border-primary/20 text-2xl font-black text-foreground focus:border-primary focus:ring-1 focus:ring-primary shadow-inner pl-4"
                                    value={paymentData.amount}
                                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                                    autoFocus
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono font-bold italic">EGP</span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-primary flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                {t('paymentModal.method')}
                            </label>
                            <Tabs value={paymentData.method} onValueChange={(v) => setPaymentData({ ...paymentData, method: v as any })}>
                                <TabsList className="grid grid-cols-4 w-full h-14 bg-background/50 border border-primary/10 p-1 rounded-2xl">
                                    <TabsTrigger value="CASH" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-bold">{t('paymentModal.methods.cash')}</TabsTrigger>
                                    <TabsTrigger value="VISA" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-bold">{t('paymentModal.methods.visa')}</TabsTrigger>
                                    <TabsTrigger value="WALLET" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-bold">{t('paymentModal.methods.vcash')}</TabsTrigger>
                                    <TabsTrigger value="INSTAPAY" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-bold">{t('paymentModal.methods.ipay')}</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-muted-foreground">{t('paymentModal.reference')}</label>
                            <Input
                                placeholder={t('paymentModal.referencePlaceholder')}
                                className="bg-background/30 border-primary/10 focus:border-primary/50 italic"
                                value={paymentData.reference}
                                onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-3">
                        <Button variant="ghost" className="rounded-xl font-bold flex-1" onClick={() => setShowPaymentModal(false)}>{ct('cancel')}</Button>
                        <Button
                            className="rounded-xl font-black flex-1 shadow-[0_0_20px_rgba(0,242,255,0.2)]"
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
                <DialogContent className="sm:max-w-[425px] bg-card/95 backdrop-blur-2xl border-primary/20 shadow-2xl rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-black text-foreground">
                            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                                <Settings className="w-5 h-5" />
                            </div>
                            {t('creditModal.title')}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground font-medium">
                            {selectedCustomer?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 space-y-4 border-y border-primary/10 my-2">
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-amber-500 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                {t('creditModal.limit')}
                            </label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    placeholder="No limit"
                                    className="h-14 bg-background/50 border-amber-500/20 text-2xl font-black text-foreground focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-inner"
                                    value={limitValue}
                                    onChange={(e) => setLimitValue(e.target.value)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono font-bold">EGP</span>
                            </div>
                            <p className="text-xs text-muted-foreground italic pl-1">{t('creditModal.hint')}</p>
                        </div>
                    </div>
                    <DialogFooter className="gap-3">
                        <Button variant="ghost" className="rounded-xl font-bold flex-1" onClick={() => setShowLimitModal(false)}>{ct('cancel')}</Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black flex-1 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
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
                <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 overflow-hidden bg-card/95 backdrop-blur-3xl border-primary/20 shadow-2xl rounded-[2.5rem]">
                    <DialogHeader className="p-8 pb-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse" />
                        <div className="flex items-start justify-between relative z-10">
                            <div className="flex gap-6">
                                <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-black text-3xl shadow-2xl">
                                    {selectedCustomer?.name.substring(0, 1).toUpperCase()}
                                </div>
                                <div>
                                    <DialogTitle className="text-3xl font-black tracking-tight text-foreground">{selectedCustomer?.name}</DialogTitle>
                                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 border border-primary/10">
                                            <Phone className="w-3.5 h-3.5 text-primary" /> {selectedCustomer?.phone}
                                        </span>
                                        {selectedCustomer?.email && (
                                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 border border-primary/10">
                                                <Info className="w-3.5 h-3.5 text-primary" /> {selectedCustomer.email}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="text-left bg-background/50 backdrop-blur-md p-4 rounded-3xl border border-primary/10 shadow-inner min-w-[180px]">
                                <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mb-1 opacity-70">{t('details.info.balance')}</p>
                                <p className={`text-3xl font-black tabular-nums ${selectedCustomer?.balance > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {Number(selectedCustomer?.balance).toLocaleString()} <span className="text-xs font-normal opacity-50 italic">EGP</span>
                                </p>
                            </div>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="transactions" className="flex-1 flex flex-col px-0 mt-2">
                        <div className="px-8 border-b border-primary/10">
                            <TabsList className="bg-transparent h-14 w-full justify-start gap-10 p-0">
                                <TabsTrigger
                                    value="transactions"
                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 gap-3 h-full font-black text-sm uppercase tracking-wider transition-all"
                                >
                                    <CreditCard className="w-4 h-4" />
                                    {t('details.tabs.transactions')}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="sales"
                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 gap-3 h-full font-black text-sm uppercase tracking-wider transition-all"
                                >
                                    <ShoppingBag className="w-4 h-4" />
                                    {t('details.tabs.sales')}
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-background/20">
                            <TabsContent value="transactions" className="mt-0 outline-none">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                                        <CasperLoader width={100} />
                                        <p className="text-primary font-black animate-pulse uppercase tracking-widest text-xs">{t('details.authenticatingHistory')}</p>
                                    </div>
                                ) : !customerDetails?.transactions?.length ? (
                                    <div className="text-center py-32 text-muted-foreground font-medium italic opacity-40">{t('details.noTransactions')}</div>
                                ) : (
                                    <div className="space-y-4">
                                        {customerDetails.transactions.map((tx: any) => (
                                            <div key={tx.id} className="bg-card/40 backdrop-blur-md p-5 rounded-2xl border border-primary/5 flex items-center justify-between group hover:border-primary/30 transition-all shadow-sm hover:shadow-xl hover:-translate-y-0.5">
                                                <div className="flex items-center gap-5">
                                                    <div className={`p-3 rounded-2xl ${tx.type === 'DEBIT' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                                                        {tx.type === 'DEBIT' ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownLeft className="w-6 h-6" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-foreground">{tx.description || (tx.type === 'DEBIT' ? t('details.transactionTypes.sale') : t('details.transactionTypes.credit'))}</p>
                                                        <p className="text-[11px] text-muted-foreground font-bold mt-1 uppercase tracking-tight opacity-60">
                                                            {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tx.createdAt))}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-xl font-black tabular-nums ${tx.type === 'DEBIT' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                        {tx.type === 'DEBIT' ? '+' : '-'}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <p className="text-[9px] text-muted-foreground font-black italic opacity-30 mt-1 uppercase">Ref: {tx.id.split('-')[0]}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="sales" className="mt-0 outline-none">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                                        <CasperLoader width={100} />
                                        <p className="text-primary font-black animate-pulse uppercase tracking-widest text-xs">{t('details.scanningLedger')}</p>
                                    </div>
                                ) : !customerDetails?.sales?.length ? (
                                    <div className="text-center py-32 text-muted-foreground font-medium italic opacity-40">{t('details.noSales')}</div>
                                ) : (
                                    <div className="space-y-6">
                                        {customerDetails.sales.map((sale: any) => (
                                            <Card key={sale.id} className="bg-card/40 backdrop-blur-md border border-primary/10 shadow-lg overflow-hidden rounded-3xl group hover:border-primary/40 transition-all">
                                                <div className="p-6 flex items-center justify-between bg-primary/5 border-b border-primary/5">
                                                    <div>
                                                        <p className="font-black text-foreground flex items-center gap-2">
                                                            <ShoppingBag className="w-4 h-4 text-primary" />
                                                            SALE #{sale.id.split('-')[0].toUpperCase()}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground font-bold mt-1 opacity-60">{new Date(sale.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <Badge className={cn(
                                                            "font-black text-[10px] px-3 py-1 rounded-lg uppercase tracking-[0.1em]",
                                                            sale.status === 'COMPLETED' ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/40" : "bg-primary/20 text-primary border-primary/40"
                                                        )}>
                                                            {sale.status}
                                                        </Badge>
                                                        <p className="font-black text-2xl mt-1 text-foreground tabular-nums">{Number(sale.totalAmount).toLocaleString()} <span className="text-[10px] font-normal opacity-40">EGP</span></p>
                                                    </div>
                                                </div>
                                                <div className="p-6 space-y-4">
                                                    {sale.items.map((item: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-center text-sm group/item">
                                                            <div className="flex items-center gap-3">
                                                                <span className="w-8 h-8 rounded-lg bg-background border border-primary/5 flex items-center justify-center font-bold text-xs text-primary">{item.quantity}x</span>
                                                                <span className="font-bold text-foreground/80 group-hover/item:text-primary transition-colors">{item.productName}</span>
                                                            </div>
                                                            <span className="text-muted-foreground font-mono font-bold italic">{Number(item.unitPrice).toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>

                    <div className="p-8 border-t border-primary/10 bg-card/95 backdrop-blur-xl flex justify-center">
                        <Button
                            variant="ghost"
                            className="w-full max-w-sm h-14 rounded-2xl font-black text-foreground hover:bg-primary/10 hover:text-primary transition-all border border-primary/5 shadow-inner uppercase tracking-widest text-xs"
                            onClick={() => setShowDetailsModal(false)}
                        >
                            {t('details.deactivateSession')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
