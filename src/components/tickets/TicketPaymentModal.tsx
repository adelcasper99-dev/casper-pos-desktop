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
    Smartphone, UserCircle, XCircle, CheckCircle, ShieldCheck, LayoutDashboard
} from "lucide-react";
import { addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";
import { useCSRF } from "@/contexts/CSRFContext";
import { processTicketPayment, getOrCreateCustomer, updateTicketStatus } from "@/actions/ticket-actions";
import { getEffectiveStoreSettings } from "@/actions/settings";
import TicketPrintTemplate from "./TicketPrintTemplate";
import { renderToStaticMarkup } from "react-dom/server";
import { printService } from "@/lib/print-service";
import { generateEngineerReceiptHTML, generatePaidTicketReceiptHTML } from "@/lib/ticket-print-helpers";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { searchCustomers } from "@/actions/customer-actions";
import { searchEmployeeByPhone } from "@/actions/employee-transaction-actions";
import { useDebounce } from "use-debounce";
import clsx from "clsx";
import { useWhatsAppAutoNotify } from "@/hooks/useWhatsAppAutoNotify";

interface TicketPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: any;
    onSuccess?: () => void;
}

export default function TicketPaymentModal({ isOpen, onClose, ticket, onSuccess }: TicketPaymentModalProps) {
    const t = useTranslations("Tickets.details.payment");
    const router = useRouter();
    const commonT = useTranslations("Common");
    const { token: csrfToken } = useCSRF();
    const autoNotify = useWhatsAppAutoNotify();
    const [isLoading, setIsLoading] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Payment State
    const [paymentMethod, setPaymentMethod] = useState("CASH");
    const [paymentType, setPaymentType] = useState<'DEPOSIT' | 'PAYMENT'>('PAYMENT');
    const [reference, setReference] = useState("");
    const [printReceipt, setPrintReceipt] = useState(true);

    // Warranty State
    const [warrantyEnabled, setWarrantyEnabled] = useState(true);
    const [warrantyDays, setWarrantyDays] = useState(30);
    const [warrantyExpiryDate, setWarrantyExpiryDate] = useState<Date>(addDays(new Date(), 30));

    // Customer / Employee Selection
    const [customers, setCustomers] = useState<any[]>([]);
    const [customerQuery, setCustomerQuery] = useState("");
    const [debouncedQuery] = useDebounce(customerQuery, 500);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const [employeeData, setEmployeeData] = useState<any>(null);
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState("");
    const [newCustomerPhone, setNewCustomerPhone] = useState("");

    const isWarrantyReturn = !!ticket.parentTicket;
    const inheritedCredit = isWarrantyReturn ? Number(ticket.parentTicket.amountPaid || 0) : 0;
    const currentPaid = Number(ticket.amountPaid || 0);
    const totalNewPrice = Number(ticket.repairPrice || 0);
    const balanceDue = Math.max(0, totalNewPrice - currentPaid);

    // Delta for reconciliation (unifies warranty and regular overpayments)
    const netDelta = totalNewPrice - inheritedCredit - currentPaid;

    const [amount, setAmount] = useState(isWarrantyReturn || netDelta < 0 ? netDelta.toString() : balanceDue.toString());

    useEffect(() => {
        const loadSettings = async () => {
            setSettingsLoading(true);
            const res = await getEffectiveStoreSettings();
            if (res.success) setSettings(res.data);
            setSettingsLoading(false);
        };
        if (isOpen) {
            loadSettings();
            setAmount(isWarrantyReturn || netDelta < 0 ? netDelta.toString() : balanceDue.toString());
            setPaymentMethod("CASH");
            setPaymentType("PAYMENT");
            setReference("");
            setSuccess(false);
            setWarrantyEnabled(true);
            const defaultDays = settings?.warrantyDays || 30;
            setWarrantyDays(defaultDays);
            setWarrantyExpiryDate(addDays(new Date(), defaultDays));
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

            // 🛡️ [NEW] Enforce ACCOUNT method for refunds (netDelta < 0)
            if (netDelta < 0) {
                setPaymentMethod("ACCOUNT");
            }
        }
    }, [isOpen, ticket, netDelta]); // Added netDelta dependency

    useEffect(() => {
        if (debouncedQuery.length >= 2) {
            handleSearchCustomers(debouncedQuery);
            if (paymentMethod === "ACCOUNT") {
                handleSearchEmployee(debouncedQuery);
            }
        }
    }, [debouncedQuery, paymentMethod]);

    useEffect(() => {
        setWarrantyExpiryDate(addDays(new Date(), warrantyDays));
    }, [warrantyDays]);

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
        // For warranty returns, 0 is valid (even swap) and negative is valid (refund)
        if (!isWarrantyReturn && paymentAmountNum <= 0 && paymentMethod !== "ACCOUNT") {
            toast.error(t('validAmountError') || "Please enter a valid amount");
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
                    toast.error(t('linkCustomerError') || "Failed to link customer for account payment");
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
            amount: isWarrantyReturn ? paymentAmountNum : effectivePayment,
            paymentMethod: paymentMethod as any,
            paymentType: paymentType,
            reference: reference || undefined,
            customerId: paymentMethod === "ACCOUNT" ? (employeeData ? undefined : finalCustomerId) : undefined,
            csrfToken: csrfToken ?? undefined,
            warranty: (warrantyEnabled && paymentType === 'PAYMENT') ? {
                warrantyDays,
                warrantyExpiryDate
            } : undefined
        });

        if (res.success) {
            // ... (previous logic)
            toast.success(t('paymentSuccess'));
            setSuccess(true);
            onSuccess?.();
            router.refresh();

            // 🚀 WhatsApp Auto-Notify (Non-blocking)
            if (paymentType === 'PAYMENT' || netDelta === 0) {
                autoNotify('PAID_DELIVERED', {
                    customerPhone: ticket.customerPhone,
                    customerName: ticket.customerName,
                    barcode: ticket.barcode,
                    deviceBrand: ticket.deviceBrand,
                    deviceModel: ticket.deviceModel,
                    repairPrice: totalNewPrice,
                    branchName: settings?.name ?? undefined,
                    issueDescription: ticket.issueDescription
                }, {
                    whatsappEnabled: settings?.whatsappEnabled,
                    whatsappTemplates: settings?.whatsappTemplates
                });
            }

            // 🏷️ [AUTO-PRINT] If autoPrintTicket is explicitly enabled, trigger silent print
            // Only auto-print when explicitly enabled to avoid unexpected behavior
            // 🛡️ FIX: Wait for settings to load and check loading state
            if (!settingsLoading && settings && settings.autoPrintTicket === true) {
                // We use a small delay to ensure the success state is rendered or the state is ready
                setTimeout(() => {
                    handlePrint(true);
                    // Close slightly later after print job is sent
                    setTimeout(() => {
                        onClose();
                    }, 1200);
                }, 500);
            } else if (settingsLoading) {
                // 🛡️ Settings still loading - wait for them to load then auto-print
                const checkSettingsAndPrint = () => {
                    if (settings && settings.autoPrintTicket === true) {
                        handlePrint(true);
                        setTimeout(() => onClose(), 1200);
                    } else {
                        onClose();
                    }
                };
                // Wait a bit and check again
                setTimeout(checkSettingsAndPrint, 1000);
            } else {
                // Auto close after small delay to let user see success state/toast
                setTimeout(() => {
                    onClose();
                }, 800);
            }
        } else {
            toast.error((res as any).error || t('paymentError'));
        }
        setIsLoading(false);
    };

    const handlePrint = async (isAutoPrint = false) => {
        // If settings not loaded, try to load them or use defaults
        let currentSettings = settings;
        if (!currentSettings) {
            try {
                const res = await getEffectiveStoreSettings();
                if (res.success) {
                    currentSettings = res.data;
                    setSettings(res.data);
                }
            } catch (e) {
                console.warn('Failed to load settings for printing:', e);
            }
        }

        if (!currentSettings) {
            console.warn('Cannot print: settings not available');
            return;
        }

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

            // 🛡️ [NEW] Resolve Printer specifically for Thermal path
            const registry = printService.getRegistry();
            const targetPrinter = registry?.thermalPrinter || registry?.receiptPrinter || localStorage.getItem('printer_receipt') || '';
            const paperWidthMm = currentSettings?.paperSize === '58mm' ? 58 : 80;

            // Prepare Warranty Data if enabled
            const warrantyData = (warrantyEnabled && paymentType === 'PAYMENT') ? {
                warrantyDays,
                warrantyExpiryDate
            } : undefined;

            const finalTicketForPrint = {
                ...updatedTicket,
                warranty: warrantyData,
                reference: reference || undefined
            };

            const htmlContent = generatePaidTicketReceiptHTML(finalTicketForPrint, currentSettings, translations);

            // 🛡️ [FIX] Use HIGH PRECISION printThermal for the customer copy
            if (targetPrinter) {
                 await printService.printThermal(htmlContent, targetPrinter, paperWidthMm);
            } else {
                await printService.printHTML(htmlContent, undefined, {
                    paperWidthMm,
                    strictlySilent: isAutoPrint
                });
            }

            if (!isAutoPrint) toast.success("Print job sent successfully");

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

                    <div className="grid grid-cols-2 gap-3 w-full">
                        <Button
                            onClick={() => handlePrint()}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                        >
                            <Printer className="w-4 h-4 mr-2" />
                            {t('printReceipt')}
                        </Button>
                        <Button
                            onClick={async () => {
                                const registry = printService.getRegistry();
                                const targetPrinter = registry?.thermalPrinter || registry?.receiptPrinter || localStorage.getItem('printer_receipt') || '';
                                if (targetPrinter) {
                                    const engineerHtml = generateEngineerReceiptHTML({
                                        ...ticket,
                                        amountPaid: (Number(ticket.amountPaid) || 0) + effectivePayment,
                                        lastPaymentAmount: effectivePayment,
                                        lastPaymentMethod: paymentMethod
                                    }, settings);
                                    await printService.printThermal(engineerHtml, targetPrinter, settings?.paperSize === '58mm' ? 58 : 80);
                                    toast.success("Engineer copy sent");
                                }
                            }}
                            variant="outline"
                            className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10 font-bold"
                        >
                            <ShieldAlert className="w-4 h-4 mr-2" />
                            نسخة المهندس
                        </Button>
                    </div>
                    <Button variant="ghost" onClick={onClose} className="w-full text-zinc-500 font-bold">
                        {t('close')}
                    </Button>
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
                    {(isWarrantyReturn || currentPaid > 0 || netDelta < 0) ? (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-cyan-800 dark:text-zinc-400">{t('newTotalDue') || "New Repair Total"}</span>
                                <span className="text-cyan-950 dark:text-white font-bold">{formatCurrency(totalNewPrice)}</span>
                            </div>
                            {isWarrantyReturn && inheritedCredit > 0 && (
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-cyan-800 dark:text-zinc-400">{t('inheritedCredit') || "Previous Ticket Credit"}</span>
                                    <span className="text-emerald-600 dark:text-green-400 font-bold">{formatCurrency(inheritedCredit)}</span>
                                </div>
                            )}
                            {currentPaid > 0 && (
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-cyan-800 dark:text-zinc-400">{t('paidAmount') || "Previously Paid (Deposits/Originals)"}</span>
                                    <span className="text-cyan-600 dark:text-cyan-400 font-bold">{formatCurrency(currentPaid)}</span>
                                </div>
                            )}
                            <div className="pt-2 border-t border-cyan-500/20 dark:border-white/5 flex justify-between items-center">
                                <span className="text-[10px] text-cyan-700 dark:text-cyan-400 uppercase tracking-widest font-black">
                                    {netDelta < 0 ? (t('refundAmount') || "Refund Amount") : (netDelta === 0 ? "Settled (No Due)" : (t('netAmount') || "Net Difference Due"))}
                                </span>
                                <span className={clsx(
                                    "text-2xl font-black",
                                    netDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : netDelta < 0 ? "text-purple-600 dark:text-purple-400" : "text-cyan-600 dark:text-cyan-400"
                                )}>
                                    {formatCurrency(Math.abs(netDelta))}
                                </span>
                            </div>
                            {netDelta < 0 && (
                                <p className="text-[9px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-tighter mt-1 animate-pulse">
                                    {t('refundToWalletEnforcement') || "يتم إضافة المرتجع لرصيد العميل فقط حفاظاً على أمان الصندوق"}
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="text-xs text-cyan-700 dark:text-cyan-400 uppercase tracking-widest font-bold mb-1">{t('balanceDue')}</div>
                            <div className="text-3xl font-black text-cyan-950 dark:text-white">
                                {formatCurrency(balanceDue)}
                            </div>
                        </>
                    )}

                    {/* Financial Distribution Preview (New: CP-01) */}
                    {paymentType === 'PAYMENT' && netDelta >= 0 && (
                        <div className="mt-4 pt-4 border-t border-cyan-500/20 dark:border-cyan-500/10 space-y-2 animate-fly-in">
                            <p className="text-[10px] text-cyan-800 dark:text-zinc-500 uppercase font-black tracking-widest flex items-center gap-1.5 justify-center">
                                <LayoutDashboard className="w-3 h-3" />
                                {t('profitDistribution') || "معاينة توزيع الارباح"}
                            </p>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2 rounded-lg bg-cyan-500/5 dark:bg-white/5 border border-cyan-500/10 dark:border-white/5 flex flex-col items-center">
                                    <span className="text-[9px] text-cyan-700 dark:text-zinc-500 uppercase font-bold">{t('laborPool') || "وعاء المصنعية"}</span>
                                    <span className="text-xs font-black text-cyan-950 dark:text-white">{formatCurrency(totalNewPrice - (ticket.parts?.reduce((s:any, p:any) => s + Number(p.price), 0) || 0))}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 flex flex-col items-center text-emerald-600 dark:text-emerald-400">
                                    <span className="text-[9px] uppercase font-bold text-emerald-700 dark:text-zinc-500">{t('techShare') || "نصيب المهندس"}</span>
                                    <span className="text-xs font-black">
                                        {formatCurrency((totalNewPrice - (ticket.parts?.reduce((s:any, p:any) => s + Number(p.price), 0) || 0)) * (Number(ticket.commissionRate || 0) / 100))}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Change Calculator */}
                    {!isWarrantyReturn && changeAmount > 0 && (
                        <div className="mt-3 pt-3 border-t border-cyan-500/20 animate-fly-in">
                            <div className="flex items-center justify-between bg-yellow-400/10 p-2 rounded-lg border border-yellow-400/20">
                                <span className="text-yellow-600 dark:text-yellow-400 font-bold text-xs">{t('change') || "Change"}</span>
                                <span className="text-yellow-600 dark:text-yellow-400 font-black text-lg">{formatCurrency(changeAmount)}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {/* Payment Method Grid */}
                    <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs uppercase tracking-wider">{commonT('methods.title')}</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'CASH', icon: Banknote, label: commonT('methods.CASH') },
                                { id: 'VISA', icon: CreditCard, label: commonT('methods.VISA') },
                                { id: 'WALLET', icon: Smartphone, label: commonT('methods.WALLET') },
                                { id: 'INSTAPAY', icon: ArrowRightLeft, label: commonT('methods.INSTAPAY') },
                                { id: 'ACCOUNT', icon: UserCircle, label: commonT('methods.ACCOUNT') },
                            ].map((m) => (
                                <button
                                    key={m.id}
                                    disabled={netDelta < 0 && m.id !== 'ACCOUNT'}
                                    onClick={() => setPaymentMethod(m.id)}
                                    className={clsx(
                                        "flex flex-col items-center justify-center p-2 rounded-xl border transition-all gap-1.5 min-h-[70px]",
                                        paymentMethod === m.id
                                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                                             : (netDelta < 0 && m.id !== 'ACCOUNT' 
                                                ? 'bg-muted border-border text-muted-foreground cursor-not-allowed opacity-50' 
                                                : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground')
                                    )}
                                >
                                    <m.icon className="w-5 h-5" />
                                    <span className="text-[10px] font-bold uppercase">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Payment Type Toggle */}
                    <div className="flex gap-2 bg-muted/40 rounded-xl p-1">
                        <button
                            onClick={() => setPaymentType('PAYMENT')}
                            className={clsx(
                                "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all",
                                paymentType === 'PAYMENT'
                                    ? "bg-cyan-500 text-white shadow-lg"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {t('finalPayment')}
                        </button>
                        <button
                            onClick={() => setPaymentType('DEPOSIT')}
                            className={clsx(
                                "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all",
                                paymentType === 'DEPOSIT'
                                    ? "bg-yellow-500 text-white shadow-lg"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {t('deposit')}
                        </button>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">{t('paymentAmount')}</Label>
                        <div className="relative">
                            <Input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="solid-input pl-10 h-14 text-2xl font-black text-emerald-600 dark:text-green-400 bg-muted/40 border-border"
                                placeholder="0.00"
                            />
                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">EGP</div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-[10px] h-7 bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                onClick={() => setAmount(isWarrantyReturn ? netDelta.toString() : balanceDue.toString())}
                            >
                                {isWarrantyReturn ? (t('fullDelta') || "Full Delta") : t('fullBalance')}
                            </Button>
                            {!isWarrantyReturn && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] h-7 bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                    onClick={() => setAmount((balanceDue / 2).toString())}
                                >
                                    {t('half')}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Reference (for Visa/Wallet/InstaPay) */}
                    {['VISA', 'WALLET', 'INSTAPAY'].includes(paymentMethod) && (
                        <div className="space-y-2 animate-fly-in">
                            <Label className="text-muted-foreground text-xs uppercase tracking-wider">{t('referenceAuthCode')}</Label>
                            <Input
                                value={reference}
                                onChange={e => setReference(e.target.value)}
                                placeholder={t('referenceAuthCode')}
                                className="bg-muted/40 border-border h-10 text-sm"
                            />
                        </div>
                    )}

                    {/* Warranty Selection */}
                    {paymentType === 'PAYMENT' && netDelta >= 0 && (
                        <div className="space-y-3 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl animate-fly-in">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="warranty-toggle"
                                        checked={warrantyEnabled}
                                        onCheckedChange={(val) => setWarrantyEnabled(val as boolean)}
                                        className="border-emerald-500/50 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-black"
                                    />
                                    <Label htmlFor="warranty-toggle" className="text-emerald-500 font-bold text-[10px] uppercase tracking-wider cursor-pointer">
                                        {t('enableWarranty') || "تفعيل الضمان"}
                                    </Label>
                                </div>
                                {warrantyEnabled && (
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] h-5 font-black uppercase">
                                        {warrantyDays} {commonT('days')}
                                    </Badge>
                                )}
                            </div>

                            {warrantyEnabled && (
                                <div className="space-y-3 pt-3 border-t border-emerald-500/10 animate-fade-in">
                                    <div className="grid grid-cols-4 gap-2">
                                        {[30, 60, 90, 180].map(d => (
                                            <Button
                                                key={d}
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setWarrantyDays(d)}
                                                className={clsx(
                                                    "h-8 text-[9px] font-black rounded-lg border transition-all",
                                                    warrantyDays === d
                                                        ? "bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20"
                                                        : "bg-white/5 border-white/5 hover:border-emerald-500/30 text-zinc-400"
                                                )}
                                            >
                                                {d} {commonT('days')}
                                            </Button>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">{t('expiryDate') || "تاريخ الانتهاء"}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs font-black text-emerald-400 tracking-tighter">
                                                {warrantyExpiryDate.toLocaleDateString('ar-EG')}
                                            </span>
                                            <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest leading-none">
                                                (يبدأ من اليوم)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Customer Selection for Account Payment or Info */}
                    {paymentMethod === "ACCOUNT" && (
                        <div className="space-y-3 p-4 bg-muted/40 rounded-xl border border-border animate-fly-in">
                            {/* Employee Detection Banner */}
                            {employeeData && (
                                <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                                            <UserCheck className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{employeeData.name}</p>
                                            <p className="text-[10px] text-muted-foreground tracking-tighter">{t('empSalDeduction')}</p>
                                        </div>
                                    </div>
                                    <ShieldAlert className="w-4 h-4 text-blue-500 dark:text-blue-400 opacity-50" />
                                </div>
                            )}

                            <div className="flex items-center justify-between mb-1">
                                <Label className="text-[10px] text-muted-foreground uppercase font-black">{t('customerAccount')}</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] text-cyan-600 dark:text-cyan-500 hover:bg-cyan-500/10"
                                    onClick={() => setIsCreatingCustomer(!isCreatingCustomer)}
                                >
                                    {isCreatingCustomer ? t('searchExisting') : t('addNewCustomer')}
                                </Button>
                            </div>

                            {isCreatingCustomer ? (
                                <div className="grid grid-cols-2 gap-2 animate-fly-in">
                                    <Input
                                        placeholder={commonT('name')}
                                        value={newCustomerName}
                                        onChange={e => setNewCustomerName(e.target.value)}
                                        className="h-10 text-xs bg-background border-border"
                                    />
                                    <Input
                                        placeholder={commonT('phone')}
                                        value={newCustomerPhone}
                                        onChange={e => setNewCustomerPhone(e.target.value)}
                                        className="h-10 text-xs bg-background border-border"
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
                                        placeholder={t('searchPlaceHolder')}
                                        className="h-10"
                                    />
                                    {selectedCustomer && (
                                        <div className="flex items-center justify-between px-2 pt-1">
                                            <span className="text-[10px] text-muted-foreground">{t('currentBalance')}:</span>
                                            <span className={clsx(
                                                "text-xs font-bold",
                                                Number(selectedCustomer.balance) > 0 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-green-400"
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
                <div className="pt-4 flex gap-3 border-t border-white/5">
                    <Button variant="ghost" onClick={onClose} className="flex-1 text-zinc-500 h-14">
                        {commonT('cancel').toUpperCase()}
                    </Button>
                    <Button
                        onClick={handleProcessPayment}
                        disabled={isLoading}
                        className={clsx(
                            "flex-[2] font-black h-14 shadow-lg border-0 transition-all",
                            netDelta < 0
                                ? "bg-red-600 hover:bg-red-500 shadow-red-500/20 text-white"
                                : "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-500/20 text-white"
                        )}
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                            netDelta < 0 ? <ArrowRightLeft className="w-5 h-5 mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />
                        )}
                        {(isWarrantyReturn || currentPaid > 0 || netDelta < 0) ? (
                            netDelta > 0 ? (t('collectDifference') || "Collect Difference").toUpperCase() :
                                netDelta < 0 ? (t('refundCustomer') || "Refund Customer").toUpperCase() :
                                    (t('settleAndClose') || "Settle & Close").toUpperCase()
                        ) : t('confirmPayment').toUpperCase()}
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
