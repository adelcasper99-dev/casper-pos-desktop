"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "@/lib/i18n-mock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    ArrowLeft, Printer, Shield, ShieldCheck, Lock, Smartphone, User,
    DollarSign, Send, CheckCircle, Receipt, Eye, EyeOff, Edit2,
    RotateCcw, Save, X, XCircle, ScanBarcode, Clock, Plus, Database, Settings as SettingsIcon, Check,
    Bell, MessageSquare, History, BadgeCheck, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import Decimal from "decimal.js";
import {
    getTicketDetails,
    updateTicketStatus,
    assignTechnician,
    addTicketNote,
    updateTicketDetails,
    getAllTechnicians,
    refundTicketExcessToCustomer,
    reopenAccidentallyDeliveredTicket
} from "@/actions/ticket-actions";
import { updateCustomer } from "@/actions/customer-actions";
import { getCurrentUser } from "@/actions/auth";
import { getEffectiveStoreSettings } from "@/actions/settings";
import { getDefaultWarehouses } from "@/actions/inventory";
import { useCSRF } from "@/contexts/CSRFContext";

import type { WorkflowTicket } from "@/types/ticket";
import type { UserSession } from "@/lib/auth";
import TicketPartsManager from "@/components/tickets/TicketPartsManager";
import CollaboratorManager from "@/components/tickets/CollaboratorManager";
import WorkflowActions from "@/components/tickets/WorkflowActions";
import TicketPaymentModal from "@/components/tickets/TicketPaymentModal";
import ReturnForRepairModal from "@/components/tickets/ReturnForRepairModal";
import RefundTicketModal from "@/components/tickets/RefundTicketModal";
import RejectTicketModal from "@/components/tickets/RejectTicketModal";
import TicketPrintOptionsModal, { checkPrinterAndRedirect } from "@/components/tickets/TicketPrintOptionsModal";
import WarrantyCard from "@/components/tickets/WarrantyCard";
import TechnicianAssignmentModal from "@/components/tickets/TechnicianAssignmentModal";
import ReopenDeliveredTicketModal from "@/components/tickets/ReopenDeliveredTicketModal";
import { generateWhatsAppUrl, getStatusTemplate } from "@/lib/whatsapp-templates";
import { printService } from "@/lib/print-service";

interface TicketPartItem {
    id: string;
    productId: string | null;
    partName?: string;
    name?: string;
    price: number;
    cost: number;
    quantity: number;
    status?: 'ACTIVE' | 'REFUNDED';
    isDamaged?: boolean;
    createdAt?: string | Date;
    product?: {
        name: string;
        sku: string;
    };
    addedBy?: {
        name: string;
        username: string;
    };
}

interface TicketNoteItem {
    id: string;
    text: string;
    author: string;
    createdAt: string | Date;
}

interface TicketLogItem {
    id: string;
    type?: string;
    channel?: string;
    status: string;
    sentAt: string | Date;
    metadata?: string | null;
    templateId?: string | null;
}

interface TicketDetailModel {
    id: string;
    barcode: string;
    status: string;
    customerName: string;
    customerPhone: string;
    customerId?: string;
    deviceBrand?: string;
    deviceModel?: string;
    deviceColor?: string;
    deviceImei?: string;
    issueDescription?: string;
    securityCode?: string;
    patternData?: string;
    repairPrice?: number;
    amountPaid?: number;
    initialQuote?: number;
    partsCost?: number;
    deposit?: number;
    commissionRate?: number;
    commissionAmount?: number;
    netProfit?: number;
    expectedDuration?: number;
    finalCustomerPrice?: number;
    laborPoolAmount?: number;
    techCommissionAmount?: number;
    centerLaborProfit?: number;
    centerPartProfit?: number;
    rejectionReason?: string;
    parentTicketId?: string;
    lastReturnedAt?: string | Date | null;
    successRatio?: number;
    gap?: string;
    riskLevel?: 'low' | 'medium' | 'high' | string;
    technicianId?: string | null;
    technician?: {
        name?: string;
        warehouseId?: string;
    };
    customer?: {
        id: string;
        name: string;
        phone: string;
        receivesNotifications?: boolean;
    };
    parts?: TicketPartItem[];
    collaborators?: Array<{ id: string; technicianId: string; role?: string }>;
    notes?: TicketNoteItem[];
    logs?: TicketLogItem[];
    returnTickets?: Array<{ id: string; barcode: string }>;
    isWarrantyReturn?: boolean;
    createdAt: string | Date;
}

interface TechnicianItem {
    id: string;
    name: string;
    warehouseId?: string;
}

interface AuthUser {
    id: string;
    name?: string | null;
    role?: string;
    [key: string]: unknown;
}

interface StoreSettingsModel {
    autoPrintTicket?: boolean;
    [key: string]: unknown;
}

// Helper to ensure all Decimal fields are converted to numbers
function serializeTicket(ticket: Record<string, unknown>): TicketDetailModel {
    if (!ticket) return ticket as unknown as TicketDetailModel;
    return {
        ...(ticket as unknown as TicketDetailModel),
        initialQuote: Number(ticket.initialQuote || 0),
        repairPrice: Number(ticket.repairPrice || 0),
        partsCost: Number(ticket.partsCost || 0),
        deposit: Number(ticket.deposit || 0),
        commissionRate: Number(ticket.commissionRate || 0),
        commissionAmount: Number(ticket.commissionAmount || 0),
        netProfit: Number(ticket.netProfit || 0),
        amountPaid: Number(ticket.amountPaid || 0),
        expectedDuration: Number(ticket.expectedDuration || 0),
        finalCustomerPrice: Number(ticket.finalCustomerPrice || 0),
        laborPoolAmount: Number(ticket.laborPoolAmount || 0),
        techCommissionAmount: Number(ticket.techCommissionAmount || 0),
        centerLaborProfit: Number(ticket.centerLaborProfit || 0),
        centerPartProfit: Number(ticket.centerPartProfit || 0),
    };
}

// Helper to convert SNAKE_CASE status to camelCase for translation keys
function getStatusTranslationKey(status: string) {
    if (!status) return 'new';
    return status.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

export default function TicketDetailPage() {
    const t = useTranslations('Tickets.details');
    const tCommon = useTranslations('Common');
    const tPOSIX = useTranslations('POS');
    const tTickets = useTranslations('Tickets');
    const locale = useLocale();
    const { token: csrfToken } = useCSRF();
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const id = params?.id;
    const router = useRouter();

    const [ticket, setTicket] = useState<TicketDetailModel | null>(null);
    const [loading, setLoading] = useState(true);
    const [technicians, setTechnicians] = useState<TechnicianItem[]>([]);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [hasPrinted, setHasPrinted] = useState(false);
    const [settings, setSettings] = useState<StoreSettingsModel | null>(null);
    const [maintenanceWhName, setMaintenanceWhName] = useState<string | null>(null);

    // Form States
    const [noteText, setNoteText] = useState('');
    const [editingPrice, setEditingPrice] = useState(false);
    const [priceInput, setPriceInput] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showReopenModal, setShowReopenModal] = useState(false);
    const [showTechModal, setShowTechModal] = useState(false);
    const [editingIssue, setEditingIssue] = useState(false);
    const [issueText, setIssueText] = useState('');
    const [showSecurityCode, setShowSecurityCode] = useState(false);
    const [showPattern, setShowPattern] = useState(false);
    const [editingDuration, setEditingDuration] = useState(false);
    const [durationInput, setDurationInput] = useState('');
    const [editingSecurityCode, setEditingSecurityCode] = useState(false);
    const [securityCodeInput, setSecurityCodeInput] = useState('');
    const [editingPattern, setEditingPattern] = useState(false);
    const [patternInput, setPatternInput] = useState('');
    const [showPrintOptions, setShowPrintOptions] = useState(false);
    const [isSilentPrint, setIsSilentPrint] = useState(false);
    const [defaultPrintMode, setDefaultPrintMode] = useState<'receipt' | 'label' | 'engineer'>('receipt');
    const [activeTab, setActiveTab] = useState('parts');
    const [showAddPartModal, setShowAddPartModal] = useState(false);
    const [isRefundingExcess, setIsRefundingExcess] = useState(false);
    const [isReopeningTicket, setIsReopeningTicket] = useState(false);
    const isSpeedPrintEnabled = printService.getRegistry()?.enableSpeedPrint !== false;


    const clearPrintGuard = () =>
        ticket?.id && sessionStorage.removeItem(`ticket_autoprint_${ticket.id}`);

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    useEffect(() => {
        // 🛡️ FIX: Log state changes for debugging
        console.log('[AutoPrint] ========== USE EFFECT RUNNING =========='); 
        console.log('[AutoPrint] State:', { 
            printParam: searchParams?.get('print'), 
            ticketExists: !!ticket, 
            loading, 
            hasPrinted, 
            settingsExists: !!settings,
            showPrintOptions 
        });

        // Don't run if still loading initial data
        if (loading) {
            console.log('[AutoPrint] Skipping - still loading');
            return;
        }

        // Already shown
        if (showPrintOptions) {
            console.log('[AutoPrint] Already shown');
            return;
        }

        const shouldPrint = searchParams?.get('print') === 'true';
        console.log('[AutoPrint] shouldPrint:', shouldPrint, 'speedPrintEnabled:', isSpeedPrintEnabled);

        // Clean URL if we have print=true
        if (shouldPrint && ticket && !hasPrinted) {
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('print');
                window.history.replaceState({}, '', url.toString());
            } catch (e) {
                console.log('[AutoPrint] URL clean failed:', e);
            }
        }

        if (isSpeedPrintEnabled && ticket && !hasPrinted) {
            const autoPrintEnabled = settings?.autoPrintTicket === true;
            
            // 🛡️ ONLY auto-print if BOTH ?print=true AND autoPrintEnabled in settings are true
            if (shouldPrint && autoPrintEnabled) {
                console.log('[AutoPrint] ✓ Triggering auto-print (shouldPrint and settings enabled)');
                setHasPrinted(true);
                setIsSilentPrint(true);
                setShowPrintOptions(true);
            }
        }
    }, [searchParams, ticket, loading, hasPrinted, settings, showPrintOptions]);

    async function loadData() {
        if (!id) return;
        if (!ticket) setLoading(true);
        try {
            const [ticketRes, techRes, userRes, settingsRes, whRes] = await Promise.all([
                getTicketDetails(id),
                getAllTechnicians(),
                getCurrentUser(),
                getEffectiveStoreSettings(),
                getDefaultWarehouses()
            ]);

            if (ticketRes.ticket) {
                const serializedTicket = serializeTicket(ticketRes.ticket);
                setTicket(serializedTicket);
                setPriceInput(serializedTicket.repairPrice?.toString() || '0');
                setIssueText(serializedTicket.issueDescription || '');
                setDurationInput(serializedTicket.expectedDuration?.toString() || '');
                setSecurityCodeInput(serializedTicket.securityCode || '');
                setPatternInput(serializedTicket.patternData || '');
            } else if (ticketRes.error) {
                toast.error(ticketRes.error);
            }

            if (techRes.technicians) {
                setTechnicians(techRes.technicians);
            }

            setUser(userRes);
            if (settingsRes?.data) setSettings(settingsRes.data);
            if (whRes.success) setMaintenanceWhName(whRes.maintenanceDefault?.name || null);
        } catch (error) {
            console.error("Failed to load ticket data", error);
            toast.error("Failed to load data");
        } finally {
            setLoading(false);
        }
    }

    const handleRefundExcess = async () => {
        if (!ticket) return;
        const amountPaidDec = new Decimal(ticket.amountPaid || 0);
        if (amountPaidDec.lte(0)) {
            toast.error("لا يوجد مبالغ مدفوعة أو عربون مسجل على هذه التذكرة لاسترداده.");
            return;
        }

        const isRejectedOrCancelled = ['REJECTED', 'CANCELLED', 'VOIDED'].includes(ticket.status);
        const repairPriceDec = new Decimal(ticket.repairPrice || 0);
        const excessDec = isRejectedOrCancelled ? amountPaidDec : amountPaidDec.minus(repairPriceDec);
        const refundAmountDec = isRejectedOrCancelled ? amountPaidDec : (excessDec.gt(0) ? excessDec : amountPaidDec);

        if (refundAmountDec.lte(0)) {
            toast.error("لا يوجد مبالغ مستحقة للعميل لاستردادها.");
            return;
        }

        setIsRefundingExcess(true);
        try {
            const res = await refundTicketExcessToCustomer({
                ticketId: ticket.id,
                amount: refundAmountDec.toNumber(),
                method: 'CASH',
                csrfToken: csrfToken ?? undefined
            });
            if (res.success) {
                toast.success(res.message || "تم صرف واسترداد العربون للعميل بنجاح");
                await loadData();
            } else {
                toast.error((res as { error?: string }).error || "فشل صرف المبلغ");
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء صرف المبلغ");
        } finally {
            setIsRefundingExcess(false);
        }
    };

    const handleSaveDuration = async () => {
        if (!ticket) return;
        const d = parseInt(durationInput);
        if (isNaN(d)) return;
        const res = await updateTicketDetails(ticket.id, { expectedDuration: d, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setEditingDuration(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Duration updated");
        }
    };

    const handleAssign = async (techId: string) => {
        if (!ticket) return;
        const res = await assignTechnician({ ticketId: ticket.id, technicianId: techId, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            loadData();
            toast.success("Technician assigned");
        }
    };

    const handleAddNote = async () => {
        if (!ticket || !noteText.trim()) return;
        const res = await addTicketNote({ ticketId: ticket.id, text: noteText, isInternal: true, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setNoteText('');
            loadData();
            toast.success("Note added");
        }
    };

    const handleSavePrice = async () => {
        if (!ticket) return;
        const price = parseFloat(priceInput);
        if (isNaN(price)) return;
        const res = await updateTicketDetails(ticket.id, { repairPrice: price, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setEditingPrice(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Price updated");
        }
    };

    const handleSaveIssue = async () => {
        if (!ticket || !issueText.trim()) return;
        const res = await updateTicketDetails(ticket.id, { issueDescription: issueText, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setEditingIssue(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Issue updated");
        }
    };

    const handleSaveSecurityCode = async () => {
        if (!ticket) return;
        const res = await updateTicketDetails(ticket.id, { securityCode: securityCodeInput, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setEditingSecurityCode(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Security code updated");
        }
    };

    const handleSavePattern = async () => {
        if (!ticket) return;
        const res = await updateTicketDetails(ticket.id, { patternData: patternInput, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setEditingPattern(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Pattern updated");
        }
    };

    const openBarcodePrint = async (e?: React.MouseEvent) => {
        console.log('[DirectPrint] Manual Label request');
        
        const isManualOverride = e?.shiftKey;
        if (!isManualOverride && !await checkPrinterAndRedirect('label', router, locale)) return;

        clearPrintGuard();
        setDefaultPrintMode('label');
        
        // Check printers for silent flag
        const registry = printService.getRegistry();
        const hasLabelPrinter = !!(registry?.labelPrinter || localStorage.getItem('printer_label') || localStorage.getItem('printer_barcode'));
        
        // Enable silent only if printer is configured AND Speed Print is enabled AND NOT manual override
        const silent = hasLabelPrinter && isSpeedPrintEnabled && !isManualOverride;
        setIsSilentPrint(silent);
        setShowPrintOptions(true);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-[100dvh] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white transition-colors">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-slate-300 dark:border-white/20 border-t-black dark:border-t-white rounded-full animate-spin" />
                <p className="text-slate-500 dark:text-zinc-400 animate-pulse">{tCommon('loading')}...</p>
            </div>
        </div>
    );

    if (!ticket) return (
        <div className="flex items-center justify-center h-[100dvh] bg-slate-50 dark:bg-[#09090b] transition-colors">
            <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-center p-8 max-w-md mx-auto shadow-2xl">
                <X className="w-12 h-12 text-slate-400 dark:text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('ticketNotFound')}</h2>
                <Button onClick={() => router.back()} className="mt-4 bg-slate-200 hover:bg-slate-300 text-slate-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
                </Button>
            </Card>
        </div>
    );

    return (
        <div className="h-[100dvh] overflow-hidden bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 flex flex-col pt-2 transition-colors" dir="rtl">
            {/* Phase 1: Fixed Sleek Compact Header */}
            <header className="h-12 px-4 border-b border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md shrink-0 flex items-center justify-between z-20">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 h-8 w-8 shrink-0 rounded-lg"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <h1 className="text-base font-black text-slate-900 dark:text-white tabular-nums tracking-tight">#{ticket.barcode}</h1>
                        <Badge className={`${ticket.status === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white border-black/20 dark:border-white/20'} text-[10px] px-2 py-0.5 rounded-md`}>
                            {tTickets(`status.${getStatusTranslationKey(ticket.status)}`)}
                        </Badge>
                        {ticket.parentTicketId && (
                            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[9px] px-1.5 py-0 font-black">مرتجع ضمان</Badge>
                        )}
                        {ticket.returnTickets && ticket.returnTickets.length > 0 && (
                            <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] px-1.5 py-0 rounded font-black flex items-center gap-1">
                                {ticket.returnTickets.length} مرتجع
                            </div>
                        )}
                    </div>

                    <div className="hidden md:flex items-center gap-2 mr-2 text-xs font-bold text-slate-500 dark:text-zinc-400">
                        <span>{ticket.customerName}</span>
                        <span>•</span>
                        <span className="font-mono">{ticket.customerPhone}</span>
                        {maintenanceWhName && (
                            <div className="flex items-center gap-1 text-[10px] uppercase font-black tracking-wider text-slate-700 dark:text-cyan-400 bg-slate-100 dark:bg-cyan-500/10 px-2 py-0.5 rounded border border-slate-200 dark:border-cyan-500/20 mr-2">
                                <Database className="w-2.5 h-2.5" />
                                <span>{maintenanceWhName}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={openBarcodePrint}
                        className="bg-purple-500/5 border-purple-500/20 text-purple-400 h-8 px-2.5 flex gap-1.5 items-center hover:bg-purple-500/10 transition-colors text-xs font-bold rounded-lg"
                    >
                        <ScanBarcode className="h-3.5 w-3.5" />
                        <span>{t('printOptions.printLabel')}</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={async (e) => { 
                            const isManualOverride = e.shiftKey;
                            if (!isManualOverride && !await checkPrinterAndRedirect('engineer', router, locale)) return;

                            clearPrintGuard(); 
                            setDefaultPrintMode('engineer'); 
                            
                            const registry = printService.getRegistry();
                            const hasThermalPrinter = !!(registry?.thermalPrinter || localStorage.getItem('thermal_printer') || localStorage.getItem('casper_receipt_printer'));
                            
                            const silent = hasThermalPrinter && isSpeedPrintEnabled && !isManualOverride;
                            setIsSilentPrint(silent); 
                            setShowPrintOptions(true); 
                        }}
                        className="bg-orange-500/5 border-orange-500/20 text-orange-400 h-8 px-2.5 flex gap-1.5 items-center hover:bg-orange-500/10 transition-colors text-xs font-bold rounded-lg"
                    >
                        <SettingsIcon className="h-3.5 w-3.5" />
                        <span>{t('printOptions.printEngineer')}</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={async (e) => { 
                            const isManualOverride = e.shiftKey;
                            if (!isManualOverride && !await checkPrinterAndRedirect('receipt', router, locale)) return;

                            clearPrintGuard(); 
                            setDefaultPrintMode('receipt'); 

                            const registry = printService.getRegistry();
                            const hasThermalPrinter = !!(registry?.thermalPrinter || localStorage.getItem('thermal_printer') || localStorage.getItem('casper_receipt_printer'));

                            const silent = hasThermalPrinter && isSpeedPrintEnabled && !isManualOverride;
                            setIsSilentPrint(silent); 
                            setShowPrintOptions(true); 
                        }}
                        className="bg-slate-100 dark:bg-zinc-800/80 border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 h-8 px-2.5 flex gap-1.5 items-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors text-xs font-bold rounded-lg"
                    >
                        <Printer className="h-3.5 w-3.5" />
                        <span>{t('printOptions.printReceipt')}</span>
                    </Button>
                    <div className="hidden lg:flex items-center gap-1 px-1.5 py-0.5 bg-zinc-500/10 rounded border border-zinc-500/20 text-[9px] text-zinc-400 font-medium">
                        <div className="w-1 h-1 rounded-full bg-zinc-400 animate-pulse" />
                        <span>Shift + Click للمعاينة</span>
                    </div>
                </div>
            </header>

            {/* Main Single-Screen Workspace (Cockpit Layout) */}
            <div className="flex-1 overflow-hidden flex flex-row-reverse bg-slate-50 dark:bg-[#09090b]">

                {/* ── Left/Center: Main Cockpit Area (Bento Top + Tabbed Bottom) ── */}
                <div className="flex-1 overflow-hidden flex flex-col p-3 gap-3 min-w-0">

                    {/* 1. Bento Overview Cards (Max ~110px Height) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 shrink-0">
                        {/* Card 1: Device Specs */}
                        <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-2.5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between text-xs font-black text-slate-600 dark:text-zinc-400 pb-1 border-b border-slate-100 dark:border-zinc-800">
                                <span className="flex items-center gap-1.5 text-slate-900 dark:text-white">
                                    <Smartphone className="w-3.5 h-3.5 text-cyan-500" />
                                    مواصفات الجهاز
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">{new Date(ticket.createdAt).toLocaleDateString('ar-EG')}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1.5">
                                <div>
                                    <p className="text-xs font-black text-slate-900 dark:text-white leading-tight">{ticket.deviceBrand} {ticket.deviceModel}</p>
                                    <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 mt-0.5">IMEI: {ticket.deviceImei || 'غير متوفر'}</p>
                                </div>
                                {ticket.deviceColor && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-300 dark:border-zinc-700">
                                        {ticket.deviceColor}
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {/* Card 2: Security & Lock */}
                        <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-2.5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between text-xs font-black text-slate-600 dark:text-zinc-400 pb-1 border-b border-slate-100 dark:border-zinc-800">
                                <span className="flex items-center gap-1.5 text-slate-900 dark:text-white">
                                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                                    بروتوكولات الأمان
                                </span>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => setShowSecurityCode(!showSecurityCode)}
                                        className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-0.5"
                                        title="إظهار/إخفاء"
                                    >
                                        {showSecurityCode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-slate-400 font-bold">رمز القفل:</span>
                                    {editingSecurityCode ? (
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <Input
                                                value={securityCodeInput}
                                                onChange={(e) => setSecurityCodeInput(e.target.value)}
                                                className="h-6 text-xs bg-slate-50 dark:bg-zinc-800 px-1 py-0"
                                                autoFocus
                                            />
                                            <Button size="icon" variant="ghost" onClick={handleSaveSecurityCode} className="h-6 w-6 text-emerald-500">
                                                <Save className="w-3 h-3" />
                                            </Button>
                                            <Button size="icon" variant="ghost" onClick={() => setEditingSecurityCode(false)} className="h-6 w-6 text-rose-500">
                                                <X className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 font-mono font-black text-slate-900 dark:text-zinc-100">
                                            <span>{showSecurityCode ? ticket.securityCode || '0000' : '••••'}</span>
                                            <button onClick={() => setEditingSecurityCode(true)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                                <Edit2 className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-slate-400 font-bold">النمط المرسوم:</span>
                                    {editingPattern ? (
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <Input
                                                value={patternInput}
                                                onChange={(e) => setPatternInput(e.target.value)}
                                                className="h-6 text-xs bg-slate-50 dark:bg-zinc-800 px-1 py-0"
                                                autoFocus
                                            />
                                            <Button size="icon" variant="ghost" onClick={handleSavePattern} className="h-6 w-6 text-emerald-500">
                                                <Save className="w-3 h-3" />
                                            </Button>
                                            <Button size="icon" variant="ghost" onClick={() => setEditingPattern(false)} className="h-6 w-6 text-rose-500">
                                                <X className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 text-[10px] font-black text-slate-800 dark:text-zinc-300">
                                            <span>{showPattern ? ticket.patternData || 'لا يوجد' : 'محمي'}</span>
                                            <button onClick={() => setShowPattern(!showPattern)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                                {showPattern ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                            </button>
                                            <button onClick={() => setEditingPattern(true)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                                <Edit2 className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Issue Description & Warranty */}
                        <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-2.5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between text-xs font-black text-slate-600 dark:text-zinc-400 pb-1 border-b border-slate-100 dark:border-zinc-800">
                                <span className="flex items-center gap-1.5 text-slate-900 dark:text-white">
                                    <Shield className="w-3.5 h-3.5 text-emerald-500" />
                                    وصف العطل
                                </span>
                                <button onClick={() => setEditingIssue(!editingIssue)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                    <Edit2 className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="pt-1">
                                {editingIssue ? (
                                    <div className="flex items-center gap-1">
                                        <Input
                                            value={issueText}
                                            onChange={(e) => setIssueText(e.target.value)}
                                            className="h-6 text-xs bg-slate-50 dark:bg-zinc-800 px-1 py-0"
                                            autoFocus
                                        />
                                        <Button size="icon" variant="ghost" onClick={handleSaveIssue} className="h-6 w-6 text-emerald-500">
                                            <Save className="w-3 h-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => setEditingIssue(false)} className="h-6 w-6 text-rose-500">
                                            <X className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 line-clamp-2 leading-tight">
                                        "{ticket.issueDescription}"
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. Main Tabbed Operational Center (Takes rest of height) */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
                        <div className="flex items-center justify-between shrink-0 pb-1.5">
                            <TabsList className="bg-slate-200/70 dark:bg-zinc-900 border border-slate-300/50 dark:border-zinc-800 h-9 p-0.5 rounded-lg">
                                <TabsTrigger value="parts" className="text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white px-3 py-1 rounded-md flex items-center gap-1.5">
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>قطع الغيار والخدمات</span>
                                    {ticket.parts && ticket.parts.length > 0 && (
                                        <Badge className="bg-emerald-500/20 text-emerald-500 border-0 text-[9px] px-1 py-0 h-4">
                                            {ticket.parts.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="collaborators" className="text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white px-3 py-1 rounded-md flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5" />
                                    <span>الشركاء الفنيين</span>
                                    {ticket.collaborators && ticket.collaborators.length > 0 && (
                                        <Badge className="bg-cyan-500/20 text-cyan-400 border-0 text-[9px] px-1 py-0 h-4">
                                            {ticket.collaborators.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="notes" className="text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white px-3 py-1 rounded-md flex items-center gap-1.5">
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>سجل العمليات (Notes)</span>
                                    {ticket.notes && ticket.notes.length > 0 && (
                                        <Badge className="bg-slate-500/20 text-slate-400 border-0 text-[9px] px-1 py-0 h-4">
                                            {ticket.notes.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="notifications" className="text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white px-3 py-1 rounded-md flex items-center gap-1.5">
                                    <Bell className="w-3.5 h-3.5" />
                                    <span>سجل الإشعارات</span>
                                    {ticket.logs && ticket.logs.length > 0 && (
                                        <Badge className="bg-purple-500/20 text-purple-400 border-0 text-[9px] px-1 py-0 h-4">
                                            {ticket.logs.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Tab 1: Parts & Services */}
                        <TabsContent value="parts" className="flex-1 overflow-y-auto custom-scrollbar m-0 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-3">
                            <TicketPartsManager
                                ticketId={ticket.id}
                                parts={ticket.parts || []}
                                status={ticket.status}
                                technicianId={ticket.technicianId}
                                technicianName={ticket.technician?.name}
                                technicianWarehouseId={ticket.technician?.warehouseId}
                                onChangeTechnician={() => setShowTechModal(true)}
                                onUpdate={loadData}
                                isWarrantyTicket={!!ticket.parentTicketId}
                                lastReturnedAt={ticket.lastReturnedAt}
                                isAddingPartExternal={showAddPartModal}
                                onCloseAddingPartExternal={() => setShowAddPartModal(false)}
                            />
                        </TabsContent>

                        {/* Tab 2: Collaborators */}
                        <TabsContent value="collaborators" className="flex-1 overflow-y-auto custom-scrollbar m-0 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-3">
                            <CollaboratorManager 
                                ticketId={ticket.id}
                                collaborators={ticket.collaborators || []}
                                technicians={technicians}
                                onUpdate={loadData}
                            />
                        </TabsContent>

                        {/* Tab 3: Notes & Timeline */}
                        <TabsContent value="notes" className="flex-1 flex flex-col overflow-hidden m-0 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-xl">
                            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar text-right">
                                {(!ticket.notes || ticket.notes.length === 0) ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-zinc-600">
                                        <RotateCcw className="w-8 h-8 mb-2 opacity-30" />
                                        <p className="text-xs font-bold">لا توجد ملاحظات مسجلة بعد</p>
                                    </div>
                                ) : (
                                    ticket.notes.map((note: { id: string; author: string; createdAt: string | Date; text: string }) => (
                                        <div key={note.id} className="relative pr-3 border-r-2 border-slate-300 dark:border-zinc-700 pb-2">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-[10px] font-black text-slate-600 dark:text-zinc-400">{note.author}</span>
                                                <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-mono">{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <p className="text-xs text-slate-900 dark:text-zinc-200 font-bold">{note.text}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="p-2 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 flex gap-2">
                                <Input
                                    placeholder="إضافة تعليق..."
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    className="bg-white dark:bg-black border-slate-300 dark:border-zinc-700 h-9 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                                />
                                <Button onClick={handleAddNote} size="icon" className="h-9 w-9 bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black shrink-0 rounded-lg">
                                    <Send className="w-3.5 h-3.5 rtl:rotate-180" />
                                </Button>
                            </div>
                        </TabsContent>

                        {/* Tab 4: Communication Audit Log */}
                        <TabsContent value="notifications" className="flex-1 overflow-y-auto custom-scrollbar m-0 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-3">
                            <div className="space-y-2">
                                {!ticket.logs || ticket.logs.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-zinc-600">
                                        <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                                        <p className="text-xs font-bold">لا يوجد إشعارات مرسلة بعد</p>
                                    </div>
                                ) : (
                                    ticket.logs.map((log: { id: string; status: string; metadata?: string | null; templateId?: string | null; sentAt: string | Date; channel?: string }) => {
                                        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
                                        return (
                                            <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
                                                <div className={cn(
                                                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                                                    log.status === 'SENT' ? "bg-emerald-500/10 text-emerald-500" : (log.status === 'FAILED' ? "bg-red-500/10 text-red-500" : "bg-cyan-500/10 text-cyan-500")
                                                )}>
                                                    {log.status === 'SENT' ? <BadgeCheck className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-black uppercase text-slate-600 dark:text-zinc-400">{((log as { type?: string; channel?: string }).type || (log as { type?: string; channel?: string }).channel || 'SMS')} • {log.status}</span>
                                                        <span className="text-[9px] text-slate-400 font-mono">{new Date(log.sentAt).toLocaleString('ar-EG')}</span>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-900 dark:text-zinc-200 mt-0.5">
                                                        {metadata.triggeredStatus ? `تحديث الحالة إلى: ${metadata.triggeredStatus}` : 'إشعار مخصص'}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* ── Right: Compact Command Sidebar (Width: 300px) ── */}
                <div className="w-[300px] shrink-0 border-l border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] overflow-y-auto custom-scrollbar p-2.5 flex flex-col gap-2 shadow-lg z-10">
                    
                    {/* Customer Header Card */}
                    <div className="bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800/80 p-2.5 rounded-xl flex flex-col gap-1.5 relative">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 flex items-center justify-center text-slate-900 dark:text-white font-black text-xs shrink-0">
                                {ticket.customerName.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">{ticket.customerName}</h4>
                                <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>{ticket.customerPhone}</span>
                                </div>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-7 bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black rounded-lg text-[9px] font-black transition-all"
                            onClick={() => {
                                if (!ticket.customer) {
                                    toast.error("يرجى ربط العميل أولاً لإرسال إشعارات تلقائية");
                                    return;
                                }
                                const template = getStatusTemplate(ticket.status, 'ar');
                                const url = generateWhatsAppUrl(ticket.customer.phone || '', template || '', {
                                    name: ticket.customer.name || '',
                                    device: `${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}`.trim(),
                                    barcode: ticket.barcode || '',
                                    branch: 'الفرع الرئيسي',
                                    issue: ticket.issueDescription || ''
                                });
                                window.open(url, '_blank');
                            }}
                        >
                            <Send className="h-2.5 w-2.5 ml-1" /> مراسلة تليفونية (WhatsApp)
                        </Button>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-zinc-800 text-[9px]">
                            <span className="font-bold text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                                <Bell className="w-2.5 h-2.5 text-cyan-500" /> استقبال الإشعارات
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                    if (!ticket.customer) {
                                        toast.error("هذا العميل غير مسجل كعضو دائم");
                                        return;
                                    }
                                    const currentVal = ticket.customer.receivesNotifications ?? true;
                                    const res = await updateCustomer({ 
                                        id: ticket.customer.id, 
                                        name: ticket.customer.name, 
                                        phone: ticket.customer.phone, 
                                        receivesNotifications: !currentVal 
                                    });
                                    if (res.success) {
                                        toast.success("تم تحديث خيارات الخصوصية");
                                        loadData();
                                    }
                                }}
                                className={cn(
                                    "h-5 px-1.5 rounded text-[8px] font-black transition-all",
                                    (ticket.customer?.receivesNotifications ?? true)
                                        ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                        : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                                )}
                            >
                                {(ticket.customer?.receivesNotifications ?? true) ? "مفعل" : "غير مفعل"}
                            </Button>
                        </div>
                    </div>

                    {/* Financial Settlement & Due Card */}
                    {(() => {
                        const repairPriceDec = new Decimal(ticket.repairPrice || 0);
                        const amountPaidDec = new Decimal(ticket.amountPaid || 0);
                        const isRejectedOrCancelled = ['REJECTED', 'CANCELLED', 'VOIDED'].includes(ticket.status);
                        const remainingDueDec = isRejectedOrCancelled ? new Decimal(0) : repairPriceDec.minus(amountPaidDec);
                        const isOverpaid = remainingDueDec.lt(0) || (isRejectedOrCancelled && amountPaidDec.gt(0));
                        const excessDec = isRejectedOrCancelled ? amountPaidDec : amountPaidDec.minus(repairPriceDec);
                        const isFullyPaid = !isRejectedOrCancelled && remainingDueDec.isZero() && repairPriceDec.gt(0);
                        const isUnrepairedWithDeposit = !['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED', 'PAID_DELIVERED'].includes(ticket.status) && amountPaidDec.gt(0);
                        const isDeliveredState = ['DELIVERED', 'PAID_DELIVERED'].includes(ticket.status);

                        return (
                            <div className="flex flex-col gap-1.5">
                                <div className={cn(
                                    "p-2.5 rounded-xl border flex flex-col gap-1 transition-all",
                                    isOverpaid
                                        ? "bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-950/30"
                                        : isFullyPaid
                                            ? "bg-cyan-500/10 border-cyan-500/20 dark:bg-cyan-950/20"
                                            : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                                )}>
                                    <div className="flex items-center justify-between text-[10px] font-black">
                                        <span className={cn(
                                            isOverpaid ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"
                                        )}>
                                            {isRejectedOrCancelled && amountPaidDec.gt(0)
                                                ? "مستحق استرداد للعميل (طلب مرفوض)"
                                                : isOverpaid
                                                    ? "مستحق استرداد للعميل (فائض عربون)"
                                                    : isFullyPaid
                                                        ? "الحالة المالية"
                                                        : "إجمالي المبلغ المتبقي المستحق"}
                                        </span>
                                        <span className="text-[9px] text-slate-400 font-mono">EGP</span>
                                    </div>

                                    <div className="flex items-baseline gap-1.5">
                                        <span className={cn(
                                            "text-2xl font-black tabular-nums tracking-tight",
                                            isOverpaid
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : isFullyPaid
                                                    ? "text-cyan-600 dark:text-cyan-400"
                                                    : "text-slate-900 dark:text-white"
                                        )}>
                                            {isOverpaid
                                                ? excessDec.toNumber().toLocaleString()
                                                : isFullyPaid
                                                    ? "مدفوع بالكامل"
                                                    : remainingDueDec.toNumber().toLocaleString()}
                                        </span>
                                        {!isFullyPaid && <span className="text-[10px] font-black text-slate-600 dark:text-cyan-400">ج.م</span>}
                                    </div>

                                    {amountPaidDec.gt(0) && (
                                        <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-zinc-800 text-[9px] font-bold">
                                            <span className="text-slate-500 dark:text-zinc-400">
                                                {isUnrepairedWithDeposit ? "عربون مسبق مسجل:" : "المدفوع مسبقاً:"}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-emerald-500 font-mono font-black">{amountPaidDec.toNumber().toLocaleString()} ج.م</span>
                                                {!isDeliveredState && !isOverpaid && (
                                                    <button
                                                        type="button"
                                                        onClick={handleRefundExcess}
                                                        disabled={isRefundingExcess}
                                                        className="text-[9px] text-amber-500 hover:text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer"
                                                    >
                                                        استرداد العربون
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Overpaid / Rejected Deposit Refund Action Button */}
                                {isOverpaid && (
                                    <Button
                                        onClick={handleRefundExcess}
                                        disabled={isRefundingExcess}
                                        className="w-full h-8.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        {isRefundingExcess ? "جاري صرف المبلغ..." : `صرف واسترداد العربون (${excessDec.toNumber().toLocaleString()} ج.م)`}
                                    </Button>
                                )}

                                {/* Prematurely Closed / Reopen Action Button */}
                                {isDeliveredState && (
                                    <Button
                                        onClick={() => setShowReopenModal(true)}
                                        variant="outline"
                                        className="w-full h-8 text-[11px] font-bold text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 flex items-center justify-center gap-1.5"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>استئناف الإصلاح (إلغاء التسليم المبكر)</span>
                                    </Button>
                                )}

                                {/* Quick Payment Button for Underpaid Tickets */}
                                {!isRejectedOrCancelled && remainingDueDec.gt(0) && (
                                    <Button
                                        onClick={() => setShowPaymentModal(true)}
                                        className="w-full h-8.5 bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 font-black rounded-lg text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <DollarSign className="w-3.5 h-3.5" />
                                        {isUnrepairedWithDeposit ? "تسجيل دفعة إضافية" : "تسجيل دفعة جديدة"}
                                    </Button>
                                )}
                            </div>
                        );
                    })()}

                    {/* Quick Payment & Workflow Action Controls */}
                    <div className="flex flex-col gap-1.5">
                        <WorkflowActions 
                            ticket={ticket as unknown as WorkflowTicket} 
                            user={user as unknown as UserSession} 
                            onUpdate={loadData}
                            onReject={['ADMIN', 'مدير النظام', 'المالك'].includes(user?.role || '') ? () => setShowRejectModal(true) : undefined}
                            onAddPart={() => {
                                setActiveTab("parts");
                                setShowAddPartModal(true);
                            }}
                        />
                    </div>

                    {/* Basic Info & Technician Assignment */}
                    <div className="bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-2.5 flex flex-col gap-2 text-xs">
                        <WarrantyCard ticket={ticket as unknown as { warrantyDays?: number; warrantyExpiresAt?: string | Date | null; status?: string; createdAt?: string | Date; id?: string }} onUpdate={loadData} />
                        
                        <div className="space-y-1 pt-1 border-t border-slate-200 dark:border-zinc-800">
                            <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 dark:text-zinc-400">
                                <span>الفني المسؤول</span>
                                {ticket.isWarrantyReturn && ['ADMIN', 'مدير النظام', 'المالك', '*'].includes(user?.role || '') && (
                                    <button onClick={() => setShowTechModal(true)} className="text-orange-400 hover:underline">
                                        إعادة تعيين
                                    </button>
                                )}
                            </div>
                            <Select
                                defaultValue={ticket.technicianId || ''}
                                onValueChange={handleAssign}
                                disabled={
                                    ['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'CANCELLED', 'REJECTED', 'VOIDED', 'RETURNED_FOR_REFIX'].includes(ticket.status) ||
                                    (ticket.isWarrantyReturn && !['ADMIN', 'مدير النظام', 'المالك', '*'].includes(user?.role || ''))
                                }
                            >
                                <SelectTrigger className="bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 h-7.5 rounded-lg text-xs font-bold text-slate-900 dark:text-white">
                                    <SelectValue placeholder="غير مسند" />
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white rounded-lg">
                                    {technicians.map(tech => (
                                        <SelectItem key={tech.id} value={tech.id} className="text-xs">{tech.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-zinc-800 text-[9px]">
                            <span className="text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" /> منذ متى بالمركز:
                            </span>
                            <span className="font-mono font-bold text-slate-800 dark:text-zinc-300">{ticket.gap || '--:--'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals Section */}
            <TicketPrintOptionsModal
                isOpen={showPrintOptions}
                onClose={() => {
                    setShowPrintOptions(false)
                    setIsSilentPrint(false)
                }}
                ticket={ticket}
                settings={settings}
                defaultMode={defaultPrintMode}
                silent={isSilentPrint}
                singleDocument={isSilentPrint}
            />

            <TicketPaymentModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    customerName: ticket.customerName,
                    customerPhone: ticket.customerPhone,
                    repairPrice: Number(ticket.repairPrice),
                    amountPaid: Number(ticket.amountPaid),
                    customerId: ticket.customerId,
                    deviceBrand: ticket.deviceBrand,
                    deviceModel: ticket.deviceModel,
                    deviceColor: ticket.deviceColor,
                    status: ticket.status,
                    issueDescription: ticket.issueDescription
                }}
                onSuccess={loadData}
            />

            <ReturnForRepairModal
                isOpen={showReturnModal}
                onClose={() => setShowReturnModal(false)}
                ticket={ticket}
                onSuccess={loadData}
            />

            <RefundTicketModal
                isOpen={showRefundModal}
                onClose={() => setShowRefundModal(false)}
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    amountPaid: Number(ticket.amountPaid),
                    repairPrice: Number(ticket.repairPrice)
                }}
                onSuccess={loadData}
            />

            <RejectTicketModal
                isOpen={showRejectModal}
                onClose={() => setShowRejectModal(false)}
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    customerName: ticket.customerName,
                    customerPhone: ticket.customerPhone,
                    deviceBrand: ticket.deviceBrand,
                    deviceModel: ticket.deviceModel,
                    status: ticket.status,
                    amountPaid: Number(ticket.amountPaid || 0)
                }}
                onSuccess={loadData}
            />

            <ReopenDeliveredTicketModal
                isOpen={showReopenModal}
                onClose={() => setShowReopenModal(false)}
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    customerName: ticket.customerName,
                    repairPrice: Number(ticket.repairPrice || 0)
                }}
                onSuccess={loadData}
            />

            <TechnicianAssignmentModal
                isOpen={showTechModal}
                onClose={() => setShowTechModal(false)}
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    status: ticket.status,
                    technicianId: ticket.technicianId,
                    deviceBrand: ticket.deviceBrand,
                    deviceModel: ticket.deviceModel,
                }}
                onSuccess={loadData}
            />
        </div>
    );
}

