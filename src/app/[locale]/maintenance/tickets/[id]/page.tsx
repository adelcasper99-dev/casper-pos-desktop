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

import {
    getTicketDetails,
    updateTicketStatus,
    assignTechnician,
    addTicketNote,
    updateTicketDetails,
    getAllTechnicians
} from "@/actions/ticket-actions";
import { updateCustomer } from "@/actions/customer-actions";
import { getCurrentUser } from "@/actions/auth";
import { getEffectiveStoreSettings } from "@/actions/settings";
import { getDefaultWarehouses } from "@/actions/inventory";
import { useCSRF } from "@/contexts/CSRFContext";

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
import { generateWhatsAppUrl, getStatusTemplate } from "@/lib/whatsapp-templates";
import { printService } from "@/lib/print-service";

// Helper to ensure all Decimal fields are converted to numbers
function serializeTicket(ticket: any) {
    if (!ticket) return ticket;
    return {
        ...ticket,
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

// Minimalist Section Header for Invoice Design
function SectionHeader({ children, icon: Icon, className }: { children: React.ReactNode; icon?: any; className?: string }) {
    return (
        <div className={cn("flex items-center gap-2.5 mb-4 group/section pb-3 border-b-2 border-slate-300 dark:border-zinc-700", className)}>
            {Icon && (
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-400 dark:border-zinc-600 flex items-center justify-center text-slate-900 dark:text-white group-hover/section:bg-black dark:group-hover/section:bg-white group-hover/section:text-white dark:group-hover/section:text-black transition-all shadow-lg">
                    <Icon className="w-4 h-4" />
                </div>
            )}
            <h3 className="text-lg font-black text-slate-900 dark:text-white transition-colors">
                {children}
            </h3>
        </div>
    );
}

function DataRow({ label, children, action, className, align = 'start' }: { label: string; children: React.ReactNode; action?: React.ReactNode; className?: string; align?: 'start' | 'center' }) {
    return (
        <div className={cn("flex flex-col py-2.5 gap-1 group/row border-b border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-white/[0.02] px-3 -mx-3 rounded-lg transition-all",
            align === 'center' ? "items-center text-center" : "items-start text-right",
            className
        )}>
            <div className={cn("flex items-center w-full", align === 'center' ? "justify-center" : "justify-between")}>
                <span className="text-xs font-black uppercase text-slate-500 dark:text-zinc-100 tracking-wide transition-colors">
                    {label}
                </span>
                {action && <div className={cn("shrink-0", align === 'center' ? "absolute right-3" : "")}>{action}</div>}
            </div>
            <div className="font-black text-sm text-slate-900 dark:text-white transition-colors">
                {children}
            </div>
        </div>
    );
}

// Helper to get workflow progress percentage
function getWorkflowProgress(status: string) {
    const progressMap: Record<string, number> = {
        'NEW': 5,
        'IN_TRANSIT_TO_CENTER': 20,
        'AT_CENTER': 35,
        'DIAGNOSING': 50,
        'PENDING_APPROVAL': 60,
        'IN_PROGRESS': 75,
        'QC_PENDING': 85,
        'WAITING_FOR_PARTS': 70,
        'COMPLETED': 95,
        'IN_TRANSIT_TO_BRANCH': 96,
        'READY_AT_BRANCH': 98,
        'PICKED_UP': 100,
        'DELIVERED': 100,
        'PAID_DELIVERED': 100,
        'CANCELLED': 0,
        'REJECTED': 100,
        'RETURNED_FOR_REFIX': 65,
    };
    return progressMap[status] || 0;
}

// Derive the active stepper step index (0-based) from ticket status
function getActiveStepIndex(status: string): number {
    const step1 = ['NEW', 'IN_TRANSIT_TO_CENTER', 'AT_CENTER'];
    const step2 = ['DIAGNOSING', 'PENDING_APPROVAL', 'RETURNED_FOR_REFIX'];
    const step3 = ['IN_PROGRESS', 'WAITING_FOR_PARTS', 'QC_PENDING'];
    const step4 = ['COMPLETED', 'IN_TRANSIT_TO_BRANCH', 'READY_AT_BRANCH', 'PICKED_UP', 'DELIVERED', 'PAID_DELIVERED'];
    if (step4.includes(status)) return 3;
    if (step3.includes(status)) return 2;
    if (step2.includes(status)) return 1;
    return 0;
}

// ─── Vertical Scrollspy Stepper ───────────────────────────────────────────────
const STEPPER_STEPS = [
    { label: 'استلام الجهاز', sub: 'Intake', sectionId: 'section-device', icon: Smartphone },
    { label: 'الفحص والأمان', sub: 'Diagnosis', sectionId: 'section-security', icon: Lock },
    { label: 'قطع الغيار', sub: 'Parts', sectionId: 'section-parts', icon: Plus },
    { label: 'سجل العمليات', sub: 'Notes', sectionId: 'section-notes', icon: RotateCcw },
];

function ScrollStepper({ activeIndex }: { activeIndex: number }) {
    const scrollTo = (sectionId: string) => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="hidden xl:flex flex-col w-44 shrink-0 relative pl-4 pt-8 pb-6">
            {/* Vertical connector line */}
            <div className="absolute right-[27px] top-[68px] bottom-10 w-[2px] bg-zinc-800/70" />

            <div className="flex flex-col gap-5 relative z-10">
                {STEPPER_STEPS.map((step, i) => {
                    const isDone = i < activeIndex;
                    const isActive = i === activeIndex;
                    const StepIcon = step.icon;

                    return (
                        <button
                            key={step.sectionId}
                            onClick={() => scrollTo(step.sectionId)}
                            className="flex items-center gap-3 group text-right w-full"
                        >
                            {/* Bullet */}
                            <div className={cn(
                                'relative flex items-center justify-center w-7 h-7 rounded-full shrink-0 border-2 transition-all duration-300',
                                isActive && 'bg-black dark:bg-white border-black dark:border-white shadow-lg shadow-black/20 dark:shadow-white/20',
                                isDone && 'bg-slate-200 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700',
                                !isActive && !isDone && 'bg-transparent border-slate-200 dark:border-zinc-700 group-hover:border-slate-400',
                            )}>
                                {isDone
                                    ? <CheckCircle className="w-3.5 h-3.5 text-slate-900 dark:text-white" />
                                    : <StepIcon className={cn(
                                        'w-3 h-3 transition-colors',
                                        isActive ? 'text-white dark:text-black' : 'text-slate-400 dark:text-zinc-600 group-hover:text-slate-700 dark:group-hover:text-zinc-400'
                                    )} />
                                }
                            </div>

                            {/* Label */}
                            <div className="flex flex-col items-start">
                                <span className={cn(
                                    'text-[11px] font-black leading-tight transition-colors',
                                    isActive && 'text-black dark:text-white',
                                    isDone && 'text-slate-500 dark:text-zinc-300',
                                    !isActive && !isDone && 'text-slate-400 dark:text-zinc-600 group-hover:text-slate-700 dark:group-hover:text-zinc-400',
                                )}>
                                    {step.label}
                                </span>
                                <span className="text-[9px] font-bold text-slate-500 dark:text-zinc-700 uppercase tracking-wider mt-0.5">
                                    {step.sub}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
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

    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [hasPrinted, setHasPrinted] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [maintenanceWhName, setMaintenanceWhName] = useState<string | null>(null);

    // Form States
    const [noteText, setNoteText] = useState('');
    const [editingPrice, setEditingPrice] = useState(false);
    const [priceInput, setPriceInput] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
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
    const [defaultPrintMode, setDefaultPrintMode] = useState<'receipt' | 'label'>('receipt');
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

    const handleSaveDuration = async () => {
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
        const res = await assignTechnician({ ticketId: ticket.id, technicianId: techId, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            loadData();
            toast.success("Technician assigned");
        }
    };

    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        const res = await addTicketNote({ ticketId: ticket.id, text: noteText, isInternal: true, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setNoteText('');
            loadData();
            toast.success("Note added");
        }
    };

    const handleSavePrice = async () => {
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
        if (!issueText.trim()) return;
        const res = await updateTicketDetails(ticket.id, { issueDescription: issueText, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setEditingIssue(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Issue updated");
        }
    };

    const handleSaveSecurityCode = async () => {
        const res = await updateTicketDetails(ticket.id, { securityCode: securityCodeInput, csrfToken: csrfToken ?? undefined });
        if (res.success) {
            setEditingSecurityCode(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Security code updated");
        }
    };

    const handleSavePattern = async () => {
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
        <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white transition-colors">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-slate-300 dark:border-white/20 border-t-black dark:border-t-white rounded-full animate-spin" />
                <p className="text-slate-500 dark:text-zinc-400 animate-pulse">{tCommon('loading')}...</p>
            </div>
        </div>
    );

    if (!ticket) return (
        <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-[#09090b] transition-colors">
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
        <div className="h-screen overflow-hidden bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 flex flex-col pt-2 transition-colors" dir="rtl">
            {/* Phase 1: Fixed Compact Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b-2 border-slate-300 dark:border-zinc-700 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="bg-white/5 hover:bg-white/10 text-zinc-300 h-10 w-10 shrink-0"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black text-slate-900 dark:text-white leading-none">#{ticket.barcode}</h1>
                            <Badge className={`${ticket.status === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white border-black/20 dark:border-white/20'} text-[10px] px-2 py-0`}>
                                {tTickets(`status.${getStatusTranslationKey(ticket.status)}`)}
                            </Badge>
                        </div>
                        {/* Show rejection reason if ticket is rejected */}
                        {ticket.status === 'REJECTED' && ticket.rejectionReason && (
                            <div className="text-xs text-red-400 font-medium mt-1 flex items-center gap-2 bg-red-500/10 px-2 py-1 rounded-lg">
                                <XCircle className="w-3 h-3" />
                                <span>سبب الرفض: {ticket.rejectionReason}</span>
                            </div>
                        )}
                        <div className="text-xs text-zinc-500 font-bold mt-1 flex items-center gap-3">
                            <span>{ticket.customerName} • {ticket.customerPhone}</span>
                            {maintenanceWhName && (
                                <>
                                    <div className="h-1 w-1 rounded-full bg-zinc-700" />
                                    <div className="flex items-center gap-1.5 text-slate-900 dark:text-cyan-500/80">
                                        <Database className="w-3 h-3" />
                                        <span className="text-[10px] uppercase font-black tracking-widest">المخزن: {maintenanceWhName}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={openBarcodePrint}
                        className="bg-purple-500/5 border-purple-500/20 text-purple-400 h-10 px-3 flex gap-2 items-center hover:bg-purple-500/10 transition-colors"
                    >
                        <ScanBarcode className="h-4 w-4" />
                        <span className="text-xs font-bold">{t('printOptions.printLabel')}</span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={async (e) => { 
                            const isManualOverride = e.shiftKey;
                            if (!isManualOverride && !await checkPrinterAndRedirect('engineer', router, locale)) return;

                            clearPrintGuard(); 
                            setDefaultPrintMode('engineer' as any); 
                            
                            const registry = printService.getRegistry();
                            const hasThermalPrinter = !!(registry?.thermalPrinter || localStorage.getItem('thermal_printer') || localStorage.getItem('casper_receipt_printer'));
                            
                            const silent = hasThermalPrinter && isSpeedPrintEnabled && !isManualOverride;
                            setIsSilentPrint(silent); 
                            setShowPrintOptions(true); 
                        }}
                        className="bg-orange-500/5 border-orange-500/20 text-orange-400 h-10 px-3 flex gap-2 items-center hover:bg-orange-500/10 transition-colors"
                    >
                        <SettingsIcon className="h-4 w-4" />
                        <span className="text-xs font-bold">{t('printOptions.printEngineer')}</span>
                    </Button>
                    <Button
                        variant="outline"
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
                        className="bg-slate-200/50 dark:bg-zinc-800/50 border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-300 h-10 px-3 flex gap-2 items-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                        <Printer className="h-4 w-4" />
                        <span className="text-xs font-bold">{t('printOptions.printReceipt')}</span>
                    </Button>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-500/10 rounded-md border border-zinc-500/20 ml-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                        <span className="text-[10px] text-zinc-400 font-medium">{t('printOptions.shiftClickHint') || 'Shift + Click للمعاينة'}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-300 dark:bg-white/10 mx-1" />
                    <div className="flex -space-x-2 rtl:space-x-reverse shrink-0">
                        <div className="w-10 h-10 rounded-full border-2 border-white dark:border-[#09090b] bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-zinc-400">
                            <User className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Workspace: 3-Pane Layout — Stepper | Content | Sidebar */}
            <div className="flex-1 overflow-hidden flex flex-row-reverse bg-slate-50 dark:bg-[#09090b]">

                {/* ── Center: Scrollable Content ── */}
                <div className="flex-1 overflow-hidden flex flex-row">

                    {/* Scrollable main content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 relative">
                        {/* Header Banner (Invoice Style) */}
                        <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-6">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h2 className="text-4xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">#{ticket.barcode}</h2>
                                    {ticket.parentTicketId && (
                                        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 font-black tracking-widest leading-none h-6 mt-1">مرتجع ضمان</Badge>
                                    )}
                                    {ticket.returnTickets && ticket.returnTickets.length > 0 && (
                                        <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-1 rounded-md font-black flex items-center gap-1.5 mt-1 h-6">
                                            يوجد {ticket.returnTickets.length} مرتجع (
                                            {ticket.returnTickets.map((rt: any, i: number) => (
                                                <span
                                                    key={rt.id}
                                                    className="cursor-pointer hover:text-emerald-300 hover:underline mx-0.5"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/ar/maintenance/tickets/${rt.id}`);
                                                    }}
                                                >
                                                    #{rt.barcode}{i < ticket.returnTickets.length - 1 ? ',' : ''}
                                                </span>
                                            ))}
                                            )
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-3">
                                    <span className="text-[11px] font-black uppercase text-slate-900 dark:text-cyan-500 tracking-[0.2em]">{tTickets(`status.${getStatusTranslationKey(ticket.status)}`)}</span>
                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-zinc-700" />
                                    <span className="text-[11px] font-black uppercase text-slate-600 dark:text-zinc-500 tracking-[0.2em]">تاريخ الاستلام: {new Date(ticket.createdAt).toLocaleDateString('ar-EG')}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col text-left">
                                    <span className="text-xs font-black text-slate-500 dark:text-zinc-500 mb-1">الحالة</span>
                                    <Badge className="bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white border-black/20 dark:border-white/20 px-3 py-1 rounded-lg text-xs font-black tracking-wide">
                                        {tTickets(`status.${getStatusTranslationKey(ticket.status)}`)}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <div id="section-device" className="grid grid-cols-2 gap-x-16 gap-y-12">
                            {/* Device Specifications */}
                            <section>
                                <SectionHeader icon={Smartphone}>مواصفات الجهاز</SectionHeader>
                                <div className="space-y-1 pr-4">
                                    <DataRow label="الماركة والموديل">{ticket.deviceBrand} {ticket.deviceModel}</DataRow>
                                    <DataRow label="الرقم التعريفي (IMEI)">
                                        <span className="font-mono text-zinc-400 tabular-nums">{ticket.deviceImei || '-'}</span>
                                    </DataRow>
                                    <div className="py-4">
                                        <span className="text-xs font-black text-slate-600 dark:text-zinc-600 block mb-2 px-1">وصف العطل</span>
                                        <div className="p-5 bg-slate-100 dark:bg-white/[0.02] rounded-2xl border-2 border-slate-300 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-300 leading-relaxed font-bold shadow-inner">
                                            "{ticket.issueDescription}"
                                        </div>
                                    </div>
                                </div>
                            </section>

                                             {/* Security Protocols */}
                            <section id="section-security">
                                <SectionHeader icon={Lock}>بروتوكولات الأمان</SectionHeader>
                                <div className="space-y-1 pr-4">
                                    <DataRow label="رمز القفل المباشر">
                                        <div className="flex items-center gap-2">
                                            {editingSecurityCode ? (
                                                <>
                                                    <Input
                                                        value={securityCodeInput}
                                                        onChange={(e) => setSecurityCodeInput(e.target.value)}
                                                        className="h-8 bg-zinc-800 border-zinc-700 text-center font-mono w-32"
                                                        autoFocus
                                                    />
                                                    <Button variant="ghost" size="icon" onClick={handleSaveSecurityCode} className="text-green-500 h-8 w-8 hover:bg-green-500/10 shrink-0">
                                                        <Save className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setEditingSecurityCode(false)} className="text-red-500 h-8 w-8 hover:bg-red-500/10 shrink-0">
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-mono font-black tracking-widest text-zinc-100 text-lg">
                                                        {showSecurityCode ? ticket.securityCode || '0000' : '••••'}
                                                    </span>
                                                    <Button variant="ghost" size="icon" onClick={() => setEditingSecurityCode(true)} className="text-zinc-600 h-8 w-8 hover:text-white shrink-0">
                                                        <Edit2 className="w-3 h-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setShowSecurityCode(!showSecurityCode)} className="text-zinc-700 h-8 w-8 hover:text-white shrink-0">
                                                        {showSecurityCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </DataRow>
                                    <DataRow
                                        label="نمط الفتح المرسوم"
                                        align="center"
                                        action={
                                            <div className="flex items-center gap-1">
                                                {editingPattern ? (
                                                    <>
                                                        <Button variant="ghost" size="icon" onClick={handleSavePattern} className="text-green-500 h-8 w-8 hover:bg-green-500/10 shrink-0">
                                                            <Save className="w-4 h-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => setEditingPattern(false)} className="text-red-500 h-8 w-8 hover:bg-red-500/10 shrink-0">
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button variant="ghost" size="icon" onClick={() => setEditingPattern(true)} className="text-slate-500 dark:text-zinc-600 h-8 w-8 hover:text-slate-900 dark:hover:text-white shrink-0">
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => setShowPattern(!showPattern)} className="text-slate-500 dark:text-zinc-700 h-8 w-8 hover:text-slate-900 dark:hover:text-white shrink-0">
                                                            {showPattern ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        }
                                    >
                                        <div className="flex items-center justify-center w-full">
                                            {editingPattern ? (
                                                <Input
                                                    value={patternInput}
                                                    onChange={(e) => setPatternInput(e.target.value)}
                                                    className="h-8 bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-center text-[11px] w-32 font-black shadow-inner"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span className="text-[11px] font-black text-slate-900 dark:text-slate-300 uppercase tracking-widest">
                                                    {showPattern ? ticket.patternData || 'No Pattern' : 'Hidden'}
                                                </span>
                                            )}
                                        </div>
                                    </DataRow>
                                </div>
                            </section>
                        </div>

                        {/* Spare Parts (Full Width in Main Content) */}
                        <section id="section-parts" className="pt-8 border-t border-white/5">
                            <SectionHeader icon={Plus}>إدارة قطع الغيار والخدمات</SectionHeader>
                            <div className="pr-2 space-y-6">
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
                                />

                                <CollaboratorManager 
                                    ticketId={ticket.id}
                                    collaborators={ticket.collaborators || []}
                                    technicians={technicians}
                                    onUpdate={loadData}
                                />
                            </div>
                        </section>

                        {/* Timeline (Bottom) */}
                        <section id="section-notes" className="pt-8 border-t-2 border-slate-300 dark:border-zinc-700">
                            <SectionHeader icon={RotateCcw}>سجل العمليات (Notes)</SectionHeader>
                            <div className="bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 rounded-[24px] flex flex-col h-[350px] overflow-hidden shadow-2xl">
                                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 custom-scrollbar text-right">
                                    {ticket.notes?.map((note: any) => (
                                        <div key={note.id} className="relative pr-5 border-r border-white/10 pb-3 last:pb-0">
                                            <div className="absolute top-0 right-[-3px] w-1.5 h-1.5 rounded-full bg-zinc-700 border border-black" />
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[9px] font-black text-slate-500 dark:text-zinc-500 uppercase tracking-widest">{note.author}</span>
                                                <span className="text-[9px] text-slate-700 dark:text-zinc-700 font-mono font-bold">{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <p className="text-xs text-slate-800 dark:text-zinc-400 font-bold leading-relaxed">{note.text}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 bg-slate-50 dark:bg-zinc-950 border-t-2 border-slate-300 dark:border-zinc-700 flex gap-2 backdrop-blur-2xl">
                                    <Input
                                        placeholder="إضافة تعليق..."
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        className="bg-white dark:bg-black border-slate-400 dark:border-zinc-600 h-11 rounded-xl text-xs focus:ring-1 focus:ring-black dark:focus:ring-white/20 focus:border-black dark:focus:border-white/20 transition-all font-bold text-slate-900 dark:text-white"
                                    />
                                    <Button onClick={handleAddNote} size="icon" className="h-11 w-11 bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 shrink-0 rounded-xl transition-all shadow-2xl shadow-black/5 dark:shadow-white/5">
                                        <Send className="w-4 h-4 rtl:rotate-180" />
                                    </Button>
                                </div>
                            </div>
                        </section>

                        {/* ── [NEW] Notification History (Intelligence Log) ── */}
                        <section id="section-notifications" className="pt-8 border-t-2 border-slate-300 dark:border-zinc-700">
                            <SectionHeader icon={Bell}>سجل الإشعارات وذكاء التواصل</SectionHeader>
                            <div className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-2 border-slate-300 dark:border-zinc-700 rounded-[24px] overflow-hidden shadow-2xl">
                                <div className="px-6 py-6 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                                    {!ticket.logs || ticket.logs.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-zinc-600">
                                            <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
                                            <p className="text-sm font-bold tracking-wide">لا يوجد إشعارات مرسلة بعد</p>
                                        </div>
                                    ) : (
                                        ticket.logs.map((log: any) => {
                                            const metadata = log.metadata ? JSON.parse(log.metadata) : {};
                                            return (
                                                <div key={log.id} className="group flex items-start gap-4 p-4 rounded-2xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 hover:border-slate-400 dark:hover:border-white/20 transition-all">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
                                                        log.status === 'SENT' ? "bg-emerald-500/10 text-emerald-500" : (log.status === 'FAILED' ? "bg-red-500/10 text-red-500" : "bg-cyan-500/10 text-cyan-500 animate-pulse")
                                                    )}>
                                                        {log.status === 'SENT' ? <BadgeCheck className="w-5 h-5" /> : (log.status === 'FAILED' ? <History className="w-5 h-5" /> : <Clock className="w-5 h-5" />)}
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-widest">{log.type} • {log.status}</span>
                                                            <span className="text-[10px] text-slate-400 dark:text-zinc-600 font-mono">{new Date(log.sentAt).toLocaleString('ar-EG')}</span>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                                                            {metadata.triggeredStatus ? `تحديث الحالة إلى: ${metadata.triggeredStatus}` : 'إشعار مخصص للمحافظة على العميل'}
                                                        </p>
                                                        {metadata.riskLevel && (
                                                            <div className="flex items-center gap-3 mt-2">
                                                                <Badge className={cn("text-[9px] px-2 py-0", metadata.riskLevel === 'high' ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500")}>
                                                                    Risk: {metadata.riskLevel}
                                                                </Badge>
                                                                <span className="text-[9px] text-slate-500 dark:text-zinc-500">Gap: {metadata.gapHours}h</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* ── Left: Sticky Scrollspy Stepper ── */}
                    <ScrollStepper activeIndex={getActiveStepIndex(ticket.status)} />

                </div>

                {/* Side Panel (Right - 30% / 360px) — UNTOUCHED */}
                <div className="w-[360px] shrink-0 border-l-2 border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0c0c0e] overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 shadow-[-20px_0_50px_rgba(0,0,0,0.05)] dark:shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">

                    <section>
                        <SectionHeader icon={User}>Client Details</SectionHeader>
                        <div className="bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 p-5 rounded-[24px] flex flex-col items-center text-center gap-4 relative overflow-hidden group shadow-2xl">
                            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                <User className="w-16 h-16 text-slate-900 dark:text-white" />
                            </div>
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-gradient-to-br dark:from-zinc-700 dark:to-zinc-800 border-2 border-slate-300 dark:border-zinc-700 flex items-center justify-center text-slate-900 dark:text-white text-2xl font-black shadow-2xl relative z-10 transform group-hover:scale-105 transition-transform">
                                {ticket.customerName.charAt(0)}
                            </div>
                            <div className="flex flex-col items-center gap-1 relative z-10 w-full text-center">
                                <h4 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{ticket.customerName}</h4>
                                <div className="flex items-center justify-center gap-1.5 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-black">{ticket.customerPhone}</p>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                className="w-full h-10 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black rounded-xl text-[9px] font-black uppercase tracking-widest mt-1 transition-all"
                                onClick={() => {
                                    if (!ticket.customer) {
                                        toast.error("يرجى ربط العميل أولاً لإرسال إشعارات تلقائية");
                                        return;
                                    }
                                    const template = getStatusTemplate(ticket.status, 'ar');
                                    const url = generateWhatsAppUrl(ticket.customer.phone || '', template || '', {
                                        name: ticket.customer.name,
                                        device: `${ticket.deviceBrand} ${ticket.deviceModel}`,
                                        barcode: ticket.barcode, branch: 'الفرع الرئيسي', issue: ticket.issueDescription
                                    });
                                    window.open(url, '_blank');
                                }}
                            >
                                <Send className="h-3.5 w-3.5 ml-2" /> مراسلة تليفونية
                            </Button>

                            <div className="w-full pt-4 border-t border-slate-100 dark:border-white/5 mt-2 space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex flex-col items-start gap-0.5">
                                        <span className="text-[10px] font-black text-slate-900 dark:text-white flex items-center gap-1.5 uppercase">
                                            <Bell className="w-3 h-3 text-cyan-500" />
                                            استقبال الإشعارات
                                        </span>
                                        <span className="text-[8px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider">SMS / WHATSAPP</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                            if (!ticket.customer) {
                                                toast.error("هذا العميل غير مسجل كعضو دائم");
                                                return;
                                            }
                                            const currentVal = ticket.customer.receivesNotifications ?? true;
                                            const newVal = !currentVal;
                                            const res = await updateCustomer({ 
                                                id: ticket.customer.id, 
                                                name: ticket.customer.name, 
                                                phone: ticket.customer.phone, 
                                                receivesNotifications: newVal 
                                            });
                                            if (res.success) {
                                                toast.success("تم تحديث خيارات الخصوصية");
                                                loadData();
                                            }
                                        }}
                                        className={cn(
                                            "h-8 px-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2",
                                            (ticket.customer?.receivesNotifications ?? true)
                                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20"
                                                : "bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20"
                                        )}
                                    >
                                        {(ticket.customer?.receivesNotifications ?? true) ? (
                                            <>
                                                <Check className="w-3.5 h-3.5" />
                                                مفعل
                                            </>
                                        ) : (
                                            <>
                                                <X className="w-3.5 h-3.5" />
                                                غير مفعل
                                            </>
                                        )}
                                    </Button>
                                </div>
                                
                                <div className="flex flex-col gap-1 px-1">
                                    <span className="text-[9px] font-black text-slate-500 dark:text-zinc-600 uppercase tracking-widest">معدل النجاح التاريخي</span>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-emerald-500 relative shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000" 
                                                style={{ width: `${ticket.successRatio || 0}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-black text-emerald-500 tabular-nums">{Math.round(ticket.successRatio || 0)}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Action Panel (The Invoice "Send" Zone) - Moved to Top */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2 pr-1">
                            <span className="text-sm font-black text-slate-500 dark:text-zinc-500 pl-2">إجمالي المبلغ المستحق</span>
                            <div className="flex items-baseline gap-3 bg-slate-100 dark:bg-zinc-950 p-6 rounded-3xl border-2 border-slate-300 dark:border-zinc-700 shadow-2xl relative overflow-hidden group">
                                <div className="absolute inset-0 bg-black/5 dark:bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="text-5xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter relative z-10">
                                    {(Number(ticket.repairPrice) - Number(ticket.amountPaid)).toLocaleString()}
                                </span>
                                <span className="text-sm font-black text-slate-900 dark:text-cyan-400 uppercase tracking-widest relative z-10">EGP</span>
                            </div>

                            {/* Profit Distribution Snapshot (New: CP-02) */}
                            {ticket.status === 'PAID_DELIVERED' && ticket.finalCustomerPrice > 0 && (
                                <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-gradient-to-br dark:from-zinc-800 dark:to-zinc-900 border-2 border-slate-300 dark:border-zinc-700 space-y-3 animate-fly-in shadow-lg">
                                    <h4 className="text-[10px] font-black text-slate-900 dark:text-cyan-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                                        <Database className="w-3 h-3" />
                                        توزيع الأرباح النهائي
                                    </h4>
                                    
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] text-slate-600 dark:text-zinc-500 font-bold">وعاء المصنعية</span>
                                            <span className="text-xs font-black text-slate-900 dark:text-white">{ticket.laborPoolAmount.toLocaleString()} <span className="text-[9px] text-slate-500 dark:text-zinc-600">EGP</span></span>
                                        </div>
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] text-emerald-600 dark:text-emerald-500/70 font-bold">عمولة المهندس</span>
                                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">-{ticket.techCommissionAmount.toLocaleString()} <span className="text-[9px] text-slate-500 dark:text-zinc-600">EGP</span></span>
                                        </div>
                                        <Separator className="bg-slate-200 dark:bg-white/5" />
                                        <div className="flex justify-between items-center px-1 pt-1">
                                            <span className="text-[10px] text-slate-800 dark:text-cyan-500 font-bold">صافي ربح المركز</span>
                                            <span className="text-sm font-black text-slate-900 dark:text-white">{(ticket.centerLaborProfit + ticket.centerPartProfit).toLocaleString()} <span className="text-[9px] text-slate-500 dark:text-zinc-600 uppercase">EGP</span></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Paid Amount Summary Row */}
                            {Number(ticket.amountPaid) > 0 && (
                                <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 mt-1 shadow-sm backdrop-blur-md">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-xs font-black text-zinc-500">المبلغ المدفوع</span>
                                    </div>
                                    <span className="text-sm font-black text-emerald-400 tabular-nums">
                                        {Number(ticket.amountPaid).toLocaleString()}
                                        <span className="text-[9px] mr-1 text-zinc-600 uppercase">EGP</span>
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2.5">
                            {(Number(ticket.repairPrice) - Number(ticket.amountPaid)) > 0 && (
                                <Button
                                    onClick={() => setShowPaymentModal(true)}
                                    className="w-full h-14 bg-white text-black hover:bg-zinc-200 font-black rounded-xl text-base shadow-[0_15px_30px_rgba(255,255,255,0.05)] active:scale-[0.98] transition-all group overflow-hidden relative"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                    <DollarSign className="w-5 h-5 ml-2" />
                                    تسجيل دفعة جديدة
                                </Button>
                            )}
                            <div className="w-full">
                                <WorkflowActions 
                                    ticket={ticket} 
                                    user={user} 
                                    onUpdate={loadData}
                                    onReject={['ADMIN', 'مدير النظام', 'المالك'].includes(user?.role) ? () => setShowRejectModal(true) : undefined}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Basic Info Section (Dates & Risks) - Moved to Bottom (Sticky footer-like position) */}
                    <section className="mt-auto pt-6 border-t-2 border-slate-300 dark:border-zinc-700">
                        <SectionHeader icon={ShieldCheck}>Basic Info</SectionHeader>
                        <div className="bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 rounded-[24px] p-6 space-y-4 shadow-2xl">
                            <WarrantyCard ticket={ticket} onUpdate={loadData} />
                            <div className="pt-4 border-t-2 border-slate-300 dark:border-zinc-700 mt-2">
                                <DataRow label="منذ متى هي في المركز">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-500" />
                                        <span className="font-mono text-slate-800 dark:text-zinc-300">{ticket.gap || '--:--'}</span>
                                    </div>
                                </DataRow>
                                <DataRow label="تقدير المخاطرة الحالي">
                                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase ${ticket.riskLevel === 'high' ? 'text-red-500' : (ticket.riskLevel === 'medium' ? 'text-orange-400' : 'text-emerald-400')}`}>
                                        <div className={`w-2 h-2 rounded-full ${ticket.riskLevel === 'high' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : (ticket.riskLevel === 'medium' ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]')}`} />
                                        {ticket.riskLevel === 'high' ? 'High Risk' : (ticket.riskLevel === 'medium' ? 'Medium' : 'Safe')}
                                    </div>
                                </DataRow>
                                <div className="pt-4 border-t-2 border-slate-300 dark:border-zinc-700 mt-4 space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <label className="text-[9px] font-black uppercase text-slate-500 dark:text-zinc-600 tracking-widest">الفني المسؤول</label>
                                        {ticket.isWarrantyReturn && ['ADMIN', 'مدير النظام', 'المالك', '*'].includes(user?.role) && (
                                            <button
                                                onClick={() => setShowTechModal(true)}
                                                className="text-[9px] font-black uppercase text-orange-400 hover:text-orange-300 transition-colors"
                                            >
                                                إعادة تعيين استثنائية
                                            </button>
                                        )}
                                    </div>
                                    <Select
                                        defaultValue={ticket.technicianId || ''}
                                        onValueChange={handleAssign}
                                        disabled={
                                            ['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'CANCELLED', 'REJECTED', 'VOIDED', 'RETURNED_FOR_REFIX'].includes(ticket.status) ||
                                            (ticket.isWarrantyReturn && !['ADMIN', 'مدير النظام', 'المالك', '*'].includes(user?.role))
                                        }
                                    >
                                        <SelectTrigger className="bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-white/5 h-12 rounded-xl focus:ring-1 focus:ring-black dark:focus:ring-white/20 text-[11px] font-bold text-slate-900 dark:text-white transition-all hover:bg-slate-100 dark:hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed">
                                            <SelectValue placeholder="غير مسند" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white rounded-xl">
                                            {technicians.map(tech => (
                                                <SelectItem key={tech.id} value={tech.id} className="text-xs focus:bg-slate-100 dark:focus:bg-white/5 focus:text-black dark:focus:text-cyan-400">{tech.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </section>
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
                    deviceBrand: ticket.deviceBrand,
                    deviceModel: ticket.deviceModel,
                    status: ticket.status
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

