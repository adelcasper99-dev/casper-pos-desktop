"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { formatCurrency } from "@/lib/utils";
import Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    CreditCard, Banknote, ShieldAlert, Printer,
    ArrowRightLeft, Smartphone, UserCircle, ShieldCheck,
    LayoutDashboard, Loader2, Sparkles
} from "lucide-react";
import { addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";
import { useCSRF } from "@/contexts/CSRFContext";
import { processTicketPayment, getOrCreateCustomer } from "@/actions/ticket-actions";
import { getEffectiveStoreSettings } from "@/actions/settings";
import TicketPrintTemplate from "./TicketPrintTemplate";
import { printService } from "@/lib/print-service";
import { generateEngineerReceiptHTML, generatePaidTicketReceiptHTML } from "@/lib/ticket-print-helpers";
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
    const router = useRouter();
    const { token: csrfToken } = useCSRF();
    const [isLoading, setIsLoading] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Payment State
    const [paymentMethod, setPaymentMethod] = useState("CASH");
    const [paymentType, setPaymentType] = useState<'DEPOSIT' | 'PAYMENT'>('PAYMENT');
    const [reference, setReference] = useState("");

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

    const isWarrantyReturn = !!ticket?.parentTicket;
    const inheritedCredit = isWarrantyReturn ? Number(ticket.parentTicket?.amountPaid || 0) : 0;
    const currentPaid = Number(ticket?.amountPaid || 0);
    const totalNewPrice = Number(ticket?.repairPrice || 0);
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
            const isUnfinishedTicket = !['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED', 'PAID_DELIVERED'].includes(ticket?.status);
            setAmount(isWarrantyReturn || netDelta < 0 ? netDelta.toString() : balanceDue.toString());
            setPaymentMethod("CASH");
            setPaymentType(isUnfinishedTicket ? "DEPOSIT" : "PAYMENT");
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
            if (ticket?.customerId) {
                handleSearchCustomers(ticket.customerPhone || ticket.customerName).then(results => {
                    const match = results?.find((c: any) => c.id === ticket.customerId || c.phone === ticket.customerPhone);
                    if (match) setSelectedCustomer(match);
                });
            }

            if (netDelta < 0) {
                setPaymentMethod("ACCOUNT");
            }
        }
    }, [isOpen, ticket, netDelta]);

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
        } catch {
            setEmployeeData(null);
        }
    };

    const paymentAmountNum = parseFloat(amount) || 0;
    const changeAmount = paymentAmountNum > balanceDue ? paymentAmountNum - balanceDue : 0;
    const effectivePayment = Math.min(paymentAmountNum, balanceDue);

    const handleProcessPayment = async () => {
        if (!isWarrantyReturn && paymentAmountNum <= 0 && paymentMethod !== "ACCOUNT") {
            toast.error("يرجى إدخال مبلغ صحيح");
            return;
        }

        setIsLoading(true);

        let finalCustomerId = selectedCustomer?.id || ticket?.customerId;

        if (paymentMethod === "ACCOUNT" && !employeeData) {
            if (isCreatingCustomer || !finalCustomerId) {
                const custRes = await getOrCreateCustomer({
                    name: newCustomerName || ticket?.customerName,
                    phone: newCustomerPhone || ticket?.customerPhone,
                    csrfToken: csrfToken ?? undefined
                });
                if (custRes.success) {
                    finalCustomerId = (custRes as any).id;
                } else {
                    toast.error("تعذر ربط العميل للحساب الآجل");
                    setIsLoading(false);
                    return;
                }
            } else if (!finalCustomerId) {
                toast.error("يرجى اختيار العميل لحساب الآجل");
                setIsLoading(false);
                return;
            }
        }

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
            toast.success("تم تسجيل الدفع بنجاح");
            setSuccess(true);
            onSuccess?.();
            router.refresh();

            const isSpeedPrintEnabled = printService.getRegistry()?.enableSpeedPrint !== false;

            if (!settingsLoading && settings && settings.autoPrintTicket === true && isSpeedPrintEnabled) {
                setTimeout(() => {
                    handlePrint(true);
                    setTimeout(() => {
                        onClose();
                    }, 1200);
                }, 500);
            } else if (settingsLoading) {
                const checkSettingsAndPrint = () => {
                    if (settings && settings.autoPrintTicket === true && printService.getRegistry()?.enableSpeedPrint !== false) {
                        handlePrint(true);
                        setTimeout(() => onClose(), 1200);
                    } else {
                        onClose();
                    }
                };
                setTimeout(checkSettingsAndPrint, 1000);
            } else {
                setTimeout(() => {
                    onClose();
                }, 800);
            }
        } else {
            toast.error((res as any).error || "حدث خطأ أثناء تسجيل الدفعة");
        }
        setIsLoading(false);
    };

    const handlePrint = async (isAutoPrint = false) => {
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
            const updatedTicket = {
                ...ticket,
                amountPaid: (Number(ticket.amountPaid) || 0) + effectivePayment,
                lastPaymentAmount: effectivePayment,
                lastPaymentMethod: paymentMethod,
                paymentType: paymentType
            };

            const translations = {
                customerInfo: "بيانات العميل",
                name: "الاسم",
                phone: "الهاتف",
                deviceDetails: "بيانات الجهاز",
                device: "الجهاز",
                detail: "التفاصيل",
                conditionHeader: "حالة الجهاز",
                expectedTime: "الوقت المتوقع",
                issueLabel: "العطل",
                financialsHeader: "البيانات المالية",
                repairCost: "تكلفة الإصلاح",
                paid: "المدفوع",
                balanceDue: "المتبقي",
                termsHeader: "الشروط والأحكام",
                terms1: "المركز غير مسؤول عن الأجهزة المتروكة لأكثر من 30 يوم",
                terms2: "الضمان يسري على قطع الغيار المستبدلة فقط",
                terms3: "يُرجى إحضار هذا الإيصال عند الاستلام",
            };

            const registry = printService.getRegistry();
            const targetPrinter = registry?.thermalPrinter || registry?.receiptPrinter || localStorage.getItem('printer_receipt') || '';
            const paperWidthMm = currentSettings?.paperSize === '58mm' ? 58 : 80;

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

            if (targetPrinter) {
                 await printService.printThermal(htmlContent, targetPrinter, paperWidthMm);
            } else {
                await printService.printHTML(htmlContent, undefined, {
                    paperWidthMm,
                    strictlySilent: isAutoPrint
                });
            }

            if (!isAutoPrint) toast.success("تم إرسال أمر الطباعة بنجاح");

        } catch (error) {
            console.error("Print Error:", error);
            toast.error("فشل إرسال أمر الطباعة");
        }
    };

    // Calculate Parts Cost, Labor Pool, and Technician Distribution
    const activeParts = (ticket?.parts as any[])?.filter(p => p.status !== 'REFUNDED' && !p.deletedAt) || [];
    const partsBillingToTech = activeParts.reduce((sum: number, p: any) => {
        const unitCost = Number(p.transferPrice ?? p.cost ?? p.baseCostPrice ?? p.product?.costPrice ?? 0);
        return sum + (unitCost * (Number(p.quantity) || 1));
    }, 0);
    const effectivePartsCost = partsBillingToTech > 0 
        ? partsBillingToTech 
        : Number(ticket?.techBillingPrice || ticket?.partsCost || 0);

    const laborPoolAmount = Number(ticket?.laborPoolAmount || 0) > 0 
        ? Number(ticket.laborPoolAmount) 
        : Math.max(0, totalNewPrice - effectivePartsCost);

    const techShareAmount = (() => {
        if (Number(ticket?.techCommissionAmount || 0) > 0) {
            return Number(ticket.techCommissionAmount);
        }
        if (ticket?.technician?.commissionRule?.type === 'FIXED') {
            return Number(ticket.technician.commissionRule.value || 0);
        }
        const effectiveRate = Number(
            ticket?.commissionRate || 
            (ticket?.technician?.commissionRule?.type === 'PERCENTAGE' ? ticket.technician.commissionRule.value : 0) ||
            ticket?.technician?.commissionRate || 
            0
        );
        return (laborPoolAmount * effectiveRate) / 100;
    })();

    const centerLaborProfit = Math.max(0, laborPoolAmount - techShareAmount);

    // Success State View
    if (success) {
        return (
            <GlassModal isOpen={isOpen} onClose={onClose} title="تم تسجيل الدفع بنجاح" className="max-w-md">
                <div className="flex flex-col items-center space-y-4 py-2">
                    <div className="bg-white text-black w-[280px] shadow-2xl relative overflow-hidden rounded-lg border border-gray-200">
                        <div className="py-4 px-3">
                            <TicketPrintTemplate
                                ticket={{
                                    ...ticket,
                                    amountPaid: (Number(ticket?.amountPaid) || 0) + effectivePayment,
                                    lastPaymentAmount: effectivePayment,
                                    lastPaymentMethod: paymentMethod
                                }}
                                settings={settings}
                                translations={{}}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 w-full">
                        <Button
                            onClick={() => handlePrint()}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold h-10 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                        >
                            <Printer className="w-4 h-4 ml-1.5" />
                            طباعة الإيصال
                        </Button>
                        <Button
                            onClick={async () => {
                                const registry = printService.getRegistry();
                                const targetPrinter = registry?.thermalPrinter || registry?.receiptPrinter || localStorage.getItem('printer_receipt') || '';
                                if (targetPrinter) {
                                    const engineerHtml = generateEngineerReceiptHTML({
                                        ...ticket,
                                        amountPaid: (Number(ticket?.amountPaid) || 0) + effectivePayment,
                                        lastPaymentAmount: effectivePayment,
                                        lastPaymentMethod: paymentMethod
                                    }, settings);
                                    await printService.printThermal(engineerHtml, targetPrinter, settings?.paperSize === '58mm' ? 58 : 80);
                                    toast.success("تم إرسال نسخة الفني للطباعة");
                                }
                            }}
                            variant="outline"
                            className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10 font-bold h-10"
                        >
                            <ShieldAlert className="w-4 h-4 ml-1.5" />
                            إيصال الفني
                        </Button>
                    </div>
                    <Button variant="ghost" onClick={onClose} className="w-full text-zinc-500 font-bold h-9">
                        إغلاق
                    </Button>
                </div>
            </GlassModal>
        );
    }

    const isUnfinished = !['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED', 'PAID_DELIVERED'].includes(ticket?.status);
    const modalTitleText = isUnfinished ? "تسجيل دفعة مقدمة / عربون" : "سداد مستحقات التذكرة وتأكيد التسليم";

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={modalTitleText}
            className="max-w-lg"
        >
            <div className="space-y-3 py-1">
                {/* Due Amount Highlight Compact Card */}
                <div className="p-3 bg-gradient-to-b from-cyan-500/15 to-cyan-500/5 border border-cyan-500/25 rounded-xl text-center shadow-inner">
                    {(isWarrantyReturn || currentPaid > 0 || netDelta < 0) ? (
                        <div className="space-y-1.5">
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded-md">
                                    <span className="text-zinc-400">تكلفة الصيانة:</span>
                                    <span className="text-white font-bold">{formatCurrency(totalNewPrice)}</span>
                                </div>
                                {currentPaid > 0 && (
                                    <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded-md">
                                        <span className="text-zinc-400">المدفوع مسبقاً:</span>
                                        <span className="text-cyan-400 font-bold">{formatCurrency(currentPaid)}</span>
                                    </div>
                                )}
                                {isWarrantyReturn && inheritedCredit > 0 && (
                                    <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded-md col-span-2">
                                        <span className="text-zinc-400">رصيد التذكرة السابقة:</span>
                                        <span className="text-emerald-400 font-bold">{formatCurrency(inheritedCredit)}</span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 border-t border-cyan-500/20 flex justify-between items-center">
                                <span className="text-xs text-cyan-300 font-bold">
                                    {netDelta < 0 ? "مستحق إرجاعه للعميل:" : (netDelta === 0 ? "تمت التسوية بالكامل" : "صافي المبلغ المستحق:")}
                                </span>
                                <span className={clsx(
                                    "text-xl font-black",
                                    netDelta > 0 ? "text-emerald-400" : netDelta < 0 ? "text-purple-400" : "text-cyan-400"
                                )}>
                                    {formatCurrency(Math.abs(netDelta))}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between px-2">
                            <div className="text-right">
                                <span className="text-[11px] text-cyan-300 font-bold block">المبلغ المستحق للدفع</span>
                                <span className="text-[10px] text-zinc-400">تذكرة صيانة #{ticket?.ticketNumber || ticket?.id?.slice(0, 6)}</span>
                            </div>
                            <div className="text-2xl font-black text-cyan-400 tracking-tight">
                                {formatCurrency(balanceDue)}
                            </div>
                        </div>
                    )}

                    {/* Financial Distribution Preview */}
                    {paymentType === 'PAYMENT' && netDelta >= 0 && (
                        <div className="mt-2.5 pt-2 border-t border-cyan-500/20 grid grid-cols-2 gap-2 text-right">
                            <div className="p-1.5 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between px-2.5">
                                <span className="text-[10px] text-zinc-400 font-medium">أجور اليد / الصندوق</span>
                                <span className="text-[11px] font-black text-white">{formatCurrency(centerLaborProfit)}</span>
                            </div>
                            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between px-2.5">
                                <span className="text-[10px] text-emerald-400 font-medium">نسبة الفني</span>
                                <span className="text-[11px] font-black text-emerald-400">{formatCurrency(techShareAmount)}</span>
                            </div>
                        </div>
                    )}

                    {/* Change Calculator */}
                    {!isWarrantyReturn && changeAmount > 0 && (
                        <div className="mt-2 pt-2 border-t border-yellow-500/20 flex items-center justify-between bg-yellow-500/10 p-1.5 rounded-lg">
                            <span className="text-yellow-400 font-bold text-xs">المتبقي للعميل (الفكة):</span>
                            <span className="text-yellow-400 font-black text-base">{formatCurrency(changeAmount)}</span>
                        </div>
                    )}
                </div>

                {/* Compact Payment Method Grid */}
                <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-[11px] font-bold">طريقة الدفع</Label>
                    <div className="grid grid-cols-5 gap-1.5">
                        {[
                            { id: 'CASH', icon: Banknote, label: 'نقداً' },
                            { id: 'VISA', icon: CreditCard, label: 'بطاقة' },
                            { id: 'WALLET', icon: Smartphone, label: 'محفظة' },
                            { id: 'INSTAPAY', icon: ArrowRightLeft, label: 'إنستا باي' },
                            { id: 'ACCOUNT', icon: UserCircle, label: 'آجل / حساب' },
                        ].map((m) => (
                            <button
                                key={m.id}
                                disabled={netDelta < 0 && m.id !== 'ACCOUNT'}
                                onClick={() => setPaymentMethod(m.id)}
                                className={clsx(
                                    "flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all gap-1 min-h-[52px]",
                                    paymentMethod === m.id
                                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)] font-bold'
                                        : (netDelta < 0 && m.id !== 'ACCOUNT' 
                                            ? 'bg-zinc-900/40 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-50' 
                                            : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200')
                                )}
                            >
                                <m.icon className="w-4 h-4" />
                                <span className="text-[10px] leading-tight">{m.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Reference Code for Non-Cash */}
                {['VISA', 'WALLET', 'INSTAPAY'].includes(paymentMethod) && (
                    <div className="space-y-1">
                        <Label className="text-[10px] text-zinc-400 font-bold">رقم العملية / المرجع</Label>
                        <Input
                            placeholder="أدخل رقم الإيصال أو المرجع..."
                            value={reference}
                            onChange={e => setReference(e.target.value)}
                            className="h-8 text-xs bg-zinc-900/60 border-zinc-800"
                        />
                    </div>
                )}

                {/* Payment Amount & Type Box */}
                {netDelta >= 0 && (
                    <div className="space-y-2 p-2.5 bg-zinc-900/40 rounded-xl border border-zinc-800/80">
                        {/* Segmented Type Toggle */}
                        <div className="flex gap-1.5 bg-black/40 p-1 rounded-lg">
                            <button
                                type="button"
                                onClick={() => { setPaymentType('DEPOSIT'); setAmount(balanceDue.toString()); }}
                                className={clsx(
                                    "flex-1 py-1 px-2 rounded-md text-[11px] font-bold transition-all",
                                    paymentType === 'DEPOSIT'
                                        ? "bg-amber-500 text-black shadow-sm"
                                        : "text-zinc-400 hover:text-white"
                                )}
                            >
                                دفعة / عربون مقدم
                            </button>
                            <button
                                type="button"
                                onClick={() => { setPaymentType('PAYMENT'); setAmount(balanceDue.toString()); }}
                                className={clsx(
                                    "flex-1 py-1 px-2 rounded-md text-[11px] font-bold transition-all",
                                    paymentType === 'PAYMENT'
                                        ? "bg-cyan-500 text-black shadow-sm"
                                        : "text-zinc-400 hover:text-white"
                                )}
                            >
                                سداد كامل / نهائي
                            </button>
                        </div>

                        {/* Amount Input & Quick Buttons */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="h-9 text-base font-black bg-black/50 border-zinc-700 text-center text-cyan-400 pr-2 pl-8"
                                />
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-bold">ج.م</span>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 px-2 text-[11px] font-bold border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700"
                                onClick={() => setAmount(balanceDue.toString())}
                            >
                                المبلغ كاملاً
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 px-2 text-[11px] font-bold border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700"
                                onClick={() => setAmount((balanceDue / 2).toFixed(2))}
                            >
                                50%
                            </Button>
                        </div>

                        {/* Compact Warranty Extension */}
                        {paymentType === 'PAYMENT' && (
                            <div className="pt-2 border-t border-white/5 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setWarrantyEnabled(!warrantyEnabled)}>
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-[11px] font-bold text-zinc-300">منح فترة ضمان</span>
                                    </div>
                                    <Checkbox
                                        checked={warrantyEnabled}
                                        onCheckedChange={(checked) => setWarrantyEnabled(!!checked)}
                                        className="h-3.5 w-3.5 border-emerald-500/60 data-[state=checked]:bg-emerald-500"
                                    />
                                </div>

                                {warrantyEnabled && (
                                    <div className="grid grid-cols-4 gap-1 pt-0.5">
                                        {[30, 60, 90, 180].map((days) => (
                                            <button
                                                key={days}
                                                type="button"
                                                onClick={() => setWarrantyDays(days)}
                                                className={clsx(
                                                    "py-1 px-1.5 rounded text-[10px] font-bold border transition-all",
                                                    warrantyDays === days
                                                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                                                        : "bg-black/30 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                                                )}
                                            >
                                                {days} يوم
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Customer Account Selection */}
                {paymentMethod === "ACCOUNT" && (
                    <div className="space-y-2 p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800">
                        {employeeData && (
                            <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                                        <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold text-blue-400">{employeeData.name}</p>
                                        <p className="text-[9px] text-zinc-400">خصم من راتب الموظف (آجل)</p>
                                    </div>
                                </div>
                                <ShieldAlert className="w-3.5 h-3.5 text-blue-400 opacity-50" />
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <Label className="text-[11px] text-zinc-400 font-bold">حساب العميل الآجل</Label>
                            <button
                                type="button"
                                className="text-[10px] text-cyan-400 hover:underline"
                                onClick={() => setIsCreatingCustomer(!isCreatingCustomer)}
                            >
                                {isCreatingCustomer ? "بحث عن مسجل" : "+ عميل جديد"}
                            </button>
                        </div>

                        {isCreatingCustomer ? (
                            <div className="grid grid-cols-2 gap-1.5">
                                <Input
                                    placeholder="اسم العميل"
                                    value={newCustomerName}
                                    onChange={e => setNewCustomerName(e.target.value)}
                                    className="h-8 text-xs bg-black/40 border-zinc-800"
                                />
                                <Input
                                    placeholder="رقم الهاتف"
                                    value={newCustomerPhone}
                                    onChange={e => setNewCustomerPhone(e.target.value)}
                                    className="h-8 text-xs bg-black/40 border-zinc-800"
                                />
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <SearchableSelect
                                    options={customers.map(c => ({ label: `${c.name} (${c.phone})`, value: c.id }))}
                                    value={selectedCustomer?.id || ""}
                                    onChange={(val) => {
                                        const cust = customers.find(c => c.id === val);
                                        setSelectedCustomer(cust);
                                    }}
                                    onSearch={setCustomerQuery}
                                    placeholder="ابحث بالاسم أو الهاتف..."
                                    className="h-8 text-xs"
                                />
                                {selectedCustomer && (
                                    <div className="flex items-center justify-between px-1 pt-0.5">
                                        <span className="text-[10px] text-zinc-400">الرصيد:</span>
                                        <span className={clsx(
                                            "text-[11px] font-bold",
                                            Number(selectedCustomer.balance) > 0 ? "text-red-400" : "text-emerald-400"
                                        )}>
                                            {formatCurrency(selectedCustomer.balance)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Compact Footer Actions */}
                <div className="pt-2 flex gap-2 border-t border-white/5">
                    <Button variant="ghost" onClick={onClose} className="flex-1 text-zinc-400 h-11 text-xs">
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleProcessPayment}
                        disabled={isLoading}
                        className={clsx(
                            "flex-[2.5] font-black h-11 text-xs shadow-lg transition-all",
                            netDelta < 0
                                ? "bg-red-600 hover:bg-red-500 shadow-red-500/20 text-white"
                                : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-cyan-500/20 text-black font-extrabold"
                        )}
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin ml-1.5" /> : (
                            netDelta < 0 ? <ArrowRightLeft className="w-4 h-4 ml-1.5" /> : <CreditCard className="w-4 h-4 ml-1.5" />
                        )}
                        {isUnfinished ? (
                            "تسجيل الدفعة المقدمة"
                        ) : (isWarrantyReturn || currentPaid > 0 || netDelta < 0) ? (
                            netDelta > 0 ? "تحصيل فرق الحساب" :
                                netDelta < 0 ? "إرجاع الفارق للعميل" :
                                    "تسوية وإغلاق التذكرة"
                        ) : "تأكيد واستلام الدفعة"}
                    </Button>
                </div>
            </div>
        </GlassModal>
    );
}

function UserCheck(props: React.SVGProps<SVGSVGElement>) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" /></svg>
}
