"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Plus, CreditCard, Banknote, ShieldAlert, Printer,
    CheckCircle2, UserPlus, Search, Loader2, ArrowRightLeft,
    Smartphone, UserCircle, XCircle, CheckCircle
} from "lucide-react";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";
import { useCSRF } from "@/contexts/CSRFContext";
import { processTicketPayment, getOrCreateCustomer } from "@/actions/ticket-actions";
import { getEffectiveStoreSettings } from "@/actions/settings";
import TicketPrintTemplate from "./TicketPrintTemplate";
import { renderToStaticMarkup } from "react-dom/server";
import { printService } from "@/lib/print-service";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { searchCustomers } from "@/actions/customer-actions";
import { searchEmployeeByPhone } from "@/actions/employee-transaction-actions";
import { useDebounce } from "use-debounce";
import clsx from "clsx";

interface TicketPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: any;
    onSuccess?: () => void;
}

export default function TicketPaymentModal({ isOpen, onClose, ticket, onSuccess }: TicketPaymentModalProps) {
    const t = useTranslations("Ticket.payment");
    const router = useRouter();
    const commonT = useTranslations("Common");
    const { token: csrfToken } = useCSRF();
    const [isLoading, setIsLoading] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [success, setSuccess] = useState(false);

    // Payment State
    const [paymentMethod, setPaymentMethod] = useState("CASH");
    const [paymentType, setPaymentType] = useState<'DEPOSIT' | 'PAYMENT'>('PAYMENT');
    const [amount, setAmount] = useState<string>("");
    const [reference, setReference] = useState("");
    const [printReceipt, setPrintReceipt] = useState(true);

    // Customer / Employee Selection
    const [customers, setCustomers] = useState<any[]>([]);
    const [customerQuery, setCustomerQuery] = useState("");
    const [debouncedQuery] = useDebounce(customerQuery, 500);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const [employeeData, setEmployeeData] = useState<any>(null);
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState("");
    const [newCustomerPhone, setNewCustomerPhone] = useState("");

    const balanceDue = Math.max(0, (Number(ticket.repairPrice || 0) - Number(ticket.amountPaid || 0)));

    useEffect(() => {
        const loadSettings = async () => {
            const res = await getEffectiveStoreSettings();
            if (res.success) setSettings(res.data);
        };
        if (isOpen) {
            loadSettings();
            setAmount(balanceDue.toString());
            setPaymentMethod("CASH");
            setPaymentType("PAYMENT");
            setReference("");
            setSuccess(false);
            setSelectedCustomer(null);
            setEmployeeData(null);
            setIsCreatingCustomer(false);

            // Auto-link customer if ticket has customerId
            if (ticket.customerId) {
                // Find existing customer in our search
                handleSearchCustomers(ticket.customerPhone || ticket.customerName).then(results => {
                    const match = results?.find((c: any) => c.id === ticket.customerId || c.phone === ticket.customerPhone);
                    if (match) setSelectedCustomer(match);
                });
            }
        }
    }, [isOpen, ticket]);

    useEffect(() => {
        if (debouncedQuery.length >= 2) {
            handleSearchCustomers(debouncedQuery);
            if (paymentMethod === "ACCOUNT") {
                handleSearchEmployee(debouncedQuery);
            }
        }
    }, [debouncedQuery, paymentMethod]);

    const handleSearchCustomers = async (q: string) => {
        const res = await searchCustomers(q);
        if (res.success) {
            setCustomers(res.customers || []);
            return res.customers;
        }
        return [];
    };

    const handleSearchEmployee = async (phone: string) => {
        try {
            const res = await searchEmployeeByPhone(phone);
            if (res.success && res.data) {
                setEmployeeData(res.data);
            } else {
                setEmployeeData(null);
            }
        } catch (e) {
            setEmployeeData(null);
        }
    };

    const paymentAmountNum = parseFloat(amount) || 0;
    const changeAmount = paymentAmountNum > balanceDue ? paymentAmountNum - balanceDue : 0;
    const effectivePayment = Math.min(paymentAmountNum, balanceDue);

    const handleProcessPayment = async () => {
        if (paymentAmountNum <= 0 && paymentMethod !== "ACCOUNT") {
            toast.error("Please enter a valid amount");
            return;
        }

        setIsLoading(true);

        // 1. Ensure Customer exists for ACCOUNT payment if no employee deduction
        let finalCustomerId = selectedCustomer?.id || ticket.customerId;

        if (paymentMethod === "ACCOUNT" && !employeeData) {
            if (isCreatingCustomer || !finalCustomerId) {
                const custRes = await getOrCreateCustomer({
                    name: newCustomerName || ticket.customerName,
                    phone: newCustomerPhone || ticket.customerPhone,
                    csrfToken: csrfToken ?? undefined
                });
                if (custRes.success) {
                    finalCustomerId = (custRes as any).id;
                } else {
                    toast.error("Failed to link customer for account payment");
                    setIsLoading(false);
                    return;
                }
            } else if (!finalCustomerId) {
                toast.error("Customer selection is required for account payment");
                setIsLoading(false);
                return;
            }
        }

        // 2. Process Server Action
        const res = await processTicketPayment({
            ticketId: ticket.id,
            amount: effectivePayment,
            paymentMethod: paymentMethod as any,
            paymentType: paymentType,
            reference: reference || undefined,
            customerId: paymentMethod === "ACCOUNT" ? (employeeData ? undefined : finalCustomerId) : undefined,
            csrfToken: csrfToken ?? undefined
        });

        if (res.success) {
            toast.success(t('paymentSuccess'));
            setSuccess(true);

            // Auto-print if enabled and not showing success preview (though here we show success preview)
            // In desktop version, success preview is good, but user might want instant print.
            // Following original project, we show preview and offer print button.

            onSuccess?.();
            router.refresh();
        } else {
            toast.error((res as any).error || t('paymentError'));
        }
        setIsLoading(false);
    };

    const handlePrint = async () => {
        if (!settings) return;

        try {
            // Prepare the Updated Ticket Object for Printing
            const updatedTicket = {
                ...ticket,
                amountPaid: (Number(ticket.amountPaid) || 0) + effectivePayment,
                lastPaymentAmount: effectivePayment,
                lastPaymentMethod: paymentMethod,
                paymentType: paymentType
            };

            const translations = {
                customerInfo: t('customerInfo'),
                name: t('name'),
                phone: t('phone'),
                deviceDetails: t('deviceDetails'),
                device: t('device'),
                detail: t('detail'),
                conditionHeader: t('conditionHeader'),
                expectedTime: t('expectedTime'),
                issueLabel: t('issueLabel'),
                financialsHeader: t('financialsHeader'),
                repairCost: t('repairCost'),
                paid: t('paid'),
                balanceDue: t('balanceDue'),
                termsHeader: t('termsHeader'),
                terms1: t('terms1'),
                terms2: t('terms2'),
                terms3: t('terms3'),
            };

            const htmlContent = renderToStaticMarkup(
                <TicketPrintTemplate
                    ticket={updatedTicket}
                    settings={settings}
                    translations={translations}
                />
            );

            await printService.printHTML(htmlContent, undefined, { paperWidthMm: 80 });
            toast.success("Print job sent successfully");
        } catch (error) {
            console.error("Print Error:", error);
            toast.error("Failed to print receipt");
        }
    };

    // Success State View
    if (success) {
        return (
            <GlassModal isOpen={isOpen} onClose={onClose} title={t('paymentSuccess')} className="max-w-md">
                <div className="flex flex-col items-center space-y-6 py-4">
                    <div className="bg-white text-black w-[300px] shadow-2xl relative overflow-hidden transform rotate-1 border border-gray-200">
                        {/* Zigzag decoration can be CSS based, keeping it simple here */}
                        <div className="py-6 px-4">
                            <TicketPrintTemplate
                                ticket={{
                                    ...ticket,
                                    amountPaid: (Number(ticket.amountPaid) || 0) + effectivePayment,
                                    lastPaymentAmount: effectivePayment,
                                    lastPaymentMethod: paymentMethod
                                }}
                                settings={settings}
                                translations={{}}
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 w-full">
                        <Button variant="outline" onClick={onClose} className="flex-1 border-white/10 hover:bg-white/5">
                            {t('close')}
                        </Button>
                        <Button
                            onClick={handlePrint}
                            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                        >
                            <Printer className="w-4 h-4 mr-2" />
                            {t('printReceipt')}
                        </Button>
                    </div>
                </div>
            </GlassModal>
        );
    }

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={t('confirmPayment')}
            className="max-w-md"
        >
            <div className="space-y-5 py-4 overflow-y-auto max-h-[80vh] scrollbar-hide">
                {/* Due Amount Highlight */}
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                    <div className="text-xs text-cyan-400 uppercase tracking-widest font-bold mb-1">{t('balanceDue')}</div>
                    <div className="text-3xl font-black text-white">
                        {formatCurrency(balanceDue)}
                    </div>

                    {/* Change Calculator */}
                    {changeAmount > 0 && (
                        <div className="mt-3 pt-3 border-t border-cyan-500/20 animate-fly-in">
                            <div className="flex items-center justify-between bg-yellow-400/10 p-2 rounded-lg border border-yellow-400/20">
                                <span className="text-yellow-400 font-bold text-xs">{t('change') || "Change"}</span>
                                <span className="text-yellow-400 font-black text-lg">{formatCurrency(changeAmount)}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {/* Payment Method Grid */}
                    <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs uppercase tracking-wider">{commonT('methods.title') || "Payment Method"}</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'CASH', icon: Banknote, label: commonT('methods.CASH') },
                                { id: 'VISA', icon: CreditCard, label: commonT('methods.VISA') },
                                { id: 'WALLET', icon: Smartphone, label: "Wallet" },
                                { id: 'INSTAPAY', icon: ArrowRightLeft, label: "InstaPay" },
                                { id: 'ACCOUNT', icon: UserCircle, label: "Account" },
                            ].map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setPaymentMethod(m.id)}
                                    className={clsx(
                                        "flex flex-col items-center justify-center p-2 rounded-xl border transition-all gap-1.5 min-h-[70px]",
                                        paymentMethod === m.id
                                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                                            : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:text-zinc-300'
                                    )}
                                >
                                    <m.icon className="w-5 h-5" />
                                    <span className="text-[10px] font-bold uppercase">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Payment Type Toggle */}
                    <div className="flex gap-2 bg-white/5 rounded-xl p-1">
                        <button
                            onClick={() => setPaymentType('PAYMENT')}
                            className={clsx(
                                "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all",
                                paymentType === 'PAYMENT'
                                    ? "bg-cyan-500 text-black shadow-lg"
                                    : "text-zinc-500 hover:text-white"
                            )}
                        >
                            {t('finalPayment') || "Final Payment"}
                        </button>
                        <button
                            onClick={() => setPaymentType('DEPOSIT')}
                            className={clsx(
                                "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all",
                                paymentType === 'DEPOSIT'
                                    ? "bg-yellow-500 text-black shadow-lg"
                                    : "text-zinc-500 hover:text-white"
                            )}
                        >
                            {t('deposit') || "Deposit"}
                        </button>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t('paymentAmount')}</Label>
                        <div className="relative">
                            <Input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="solid-input pl-10 h-14 text-2xl font-black text-green-400 bg-black/40 border-white/10"
                                placeholder="0.00"
                            />
                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-500" />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-600">EGP</div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-[10px] h-7 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
                                onClick={() => setAmount(balanceDue.toString())}
                            >
                                {t('fullBalance') || "Full Balance"}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-[10px] h-7 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
                                onClick={() => setAmount((balanceDue / 2).toString())}
                            >
                                {t('half') || "50% Deposit"}
                            </Button>
                        </div>
                    </div>

                    {/* Reference (for Visa/Wallet/InstaPay) */}
                    {['VISA', 'WALLET', 'INSTAPAY'].includes(paymentMethod) && (
                        <div className="space-y-2 animate-fly-in">
                            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t('referenceAuthCode') || "Reference / Auth Code"}</Label>
                            <Input
                                value={reference}
                                onChange={e => setReference(e.target.value)}
                                placeholder="Optional Transaction ID"
                                className="bg-white/5 border-white/10 h-10 text-sm"
                            />
                        </div>
                    )}

                    {/* Customer Selection for Account Payment or Info */}
                    {paymentMethod === "ACCOUNT" && (
                        <div className="space-y-3 p-4 bg-black/40 rounded-xl border border-white/10 animate-fly-in">
                            {/* Employee Detection Banner */}
                            {employeeData && (
                                <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                                            <UserCheck className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-blue-400">Employee: {employeeData.name}</p>
                                            <p className="text-[10px] text-zinc-500 tracking-tighter">Salary Deduction (خصم من الراتب)</p>
                                        </div>
                                    </div>
                                    <ShieldAlert className="w-4 h-4 text-blue-400 opacity-50" />
                                </div>
                            )}

                            <div className="flex items-center justify-between mb-1">
                                <Label className="text-[10px] text-zinc-500 uppercase font-black">{t('customerAccount') || "Customer Account"}</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] text-cyan-500 hover:bg-cyan-500/10"
                                    onClick={() => setIsCreatingCustomer(!isCreatingCustomer)}
                                >
                                    {isCreatingCustomer ? "Search Existing" : "Add New Customer"}
                                </Button>
                            </div>

                            {isCreatingCustomer ? (
                                <div className="grid grid-cols-2 gap-2 animate-fly-in">
                                    <Input
                                        placeholder="Name"
                                        value={newCustomerName}
                                        onChange={e => setNewCustomerName(e.target.value)}
                                        className="h-10 text-xs bg-white/5 border-white/10"
                                    />
                                    <Input
                                        placeholder="Phone"
                                        value={newCustomerPhone}
                                        onChange={e => setNewCustomerPhone(e.target.value)}
                                        className="h-10 text-xs bg-white/5 border-white/10"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <SearchableSelect
                                        options={customers.map(c => ({ label: `${c.name} (${c.phone})`, value: c.id }))}
                                        value={selectedCustomer?.id || ""}
                                        onChange={(val) => {
                                            const cust = customers.find(c => c.id === val);
                                            setSelectedCustomer(cust);
                                        }}
                                        onSearch={setCustomerQuery}
                                        placeholder="Search by name or phone..."
                                        className="h-10"
                                    />
                                    {selectedCustomer && (
                                        <div className="flex items-center justify-between px-2 pt-1">
                                            <span className="text-[10px] text-zinc-500">Current Balance:</span>
                                            <span className={clsx(
                                                "text-xs font-bold",
                                                Number(selectedCustomer.balance) > 0 ? "text-red-400" : "text-green-400"
                                            )}>
                                                {formatCurrency(selectedCustomer.balance)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="pt-4 flex gap-3">
                    <Button variant="ghost" onClick={onClose} className="flex-1 text-zinc-500 h-12">
                        {commonT('cancel')}
                    </Button>
                    <Button
                        onClick={handleProcessPayment}
                        disabled={isLoading}
                        className="flex-[2] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black h-12 shadow-lg shadow-cyan-500/20 border-0"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5 mr-2" />}
                        {t('confirmPayment').toUpperCase()}
                    </Button>
                </div>
            </div>
        </GlassModal>
    );
}

// Helper icons mapping for SearchableSelect can be added if needed, but here we use simple ones
function UserCheck(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" /></svg>
}
