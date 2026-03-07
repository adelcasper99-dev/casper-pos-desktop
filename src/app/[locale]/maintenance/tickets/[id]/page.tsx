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
import {
    ArrowLeft, Printer, Shield, ShieldCheck, Lock, Smartphone, User,
    DollarSign, Send, CheckCircle, Receipt, Eye, EyeOff, Edit2,
    RotateCcw, Save, X, ScanBarcode, Clock
} from "lucide-react";
import { toast } from "sonner";

import {
    getTicketDetails,
    updateTicketStatus,
    assignTechnician,
    addTicketNote,
    updateTicketDetails,
    getAllTechnicians
} from "@/actions/ticket-actions";
import { getCurrentUser } from "@/actions/auth";
import { getEffectiveStoreSettings } from "@/actions/settings";

import TicketPartsManager from "@/components/tickets/TicketPartsManager";
import CollaboratorManager from "@/components/tickets/CollaboratorManager";
import WorkflowActions from "@/components/tickets/WorkflowActions";
import TicketPaymentModal from "@/components/tickets/TicketPaymentModal";
import ReturnForRepairModal from "@/components/tickets/ReturnForRepairModal";
import RefundTicketModal from "@/components/tickets/RefundTicketModal";
import TicketPrintOptionsModal from "@/components/tickets/TicketPrintOptionsModal";
import WarrantyCard from "@/components/tickets/WarrantyCard";
import { generateWhatsAppUrl, getStatusTemplate } from "@/lib/whatsapp-templates";

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
    };
}

// Helper to convert SNAKE_CASE status to camelCase for translation keys
function getStatusTranslationKey(status: string) {
    if (!status) return 'new';
    return status.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

export default function TicketDetailPage() {
    const t = useTranslations('Ticket');
    const tCommon = useTranslations('Common');
    const tPOSIX = useTranslations('POS');
    const tTickets = useTranslations('Tickets');
    const locale = useLocale();
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const id = params.id;
    const router = useRouter();

    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [hasPrinted, setHasPrinted] = useState(false);
    const [settings, setSettings] = useState<any>(null);

    // Form States
    const [noteText, setNoteText] = useState('');
    const [editingPrice, setEditingPrice] = useState(false);
    const [priceInput, setPriceInput] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [editingIssue, setEditingIssue] = useState(false);
    const [issueText, setIssueText] = useState('');
    const [showSecurityCode, setShowSecurityCode] = useState(false);
    const [showPattern, setShowPattern] = useState(false);
    const [editingDuration, setEditingDuration] = useState(false);
    const [durationInput, setDurationInput] = useState('');
    const [showPrintOptions, setShowPrintOptions] = useState(false);
    const [defaultPrintMode, setDefaultPrintMode] = useState<'receipt' | 'label'>('receipt');

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    useEffect(() => {
        const shouldPrint = searchParams.get('print') === 'true';
        if (shouldPrint && ticket && !loading && !hasPrinted) {
            setShowPrintOptions(true);
            setHasPrinted(true);
            // Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete('print');
            window.history.replaceState({}, '', url.toString());
        }
    }, [searchParams, ticket, loading, hasPrinted]);

    async function loadData() {
        if (!ticket) setLoading(true);
        try {
            const [ticketRes, techRes, userRes, settingsRes] = await Promise.all([
                getTicketDetails(id),
                getAllTechnicians(),
                getCurrentUser(),
                getEffectiveStoreSettings()
            ]);

            if (ticketRes.ticket) {
                const serializedTicket = serializeTicket(ticketRes.ticket);
                setTicket(serializedTicket);
                setPriceInput(serializedTicket.repairPrice?.toString() || '0');
                setIssueText(serializedTicket.issueDescription || '');
                setDurationInput(serializedTicket.expectedDuration?.toString() || '');
            } else if (ticketRes.error) {
                toast.error(ticketRes.error);
            }

            if (techRes.technicians) {
                setTechnicians(techRes.technicians);
            }

            setUser(userRes);
            if (settingsRes.success) setSettings(settingsRes);
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
        const res = await updateTicketDetails(ticket.id, { expectedDuration: d });
        if (res.success) {
            setEditingDuration(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Duration updated");
        }
    };

    const handleAssign = async (techId: string) => {
        const res = await assignTechnician({ ticketId: ticket.id, technicianId: techId });
        if (res.success) {
            loadData();
            toast.success("Technician assigned");
        }
    };

    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        const res = await addTicketNote({ ticketId: ticket.id, text: noteText, isInternal: true });
        if (res.success) {
            setNoteText('');
            loadData();
            toast.success("Note added");
        }
    };

    const handleSavePrice = async () => {
        const price = parseFloat(priceInput);
        if (isNaN(price)) return;
        const res = await updateTicketDetails(ticket.id, { repairPrice: price });
        if (res.success) {
            setEditingPrice(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Price updated");
        }
    };

    const handleSaveIssue = async () => {
        if (!issueText.trim()) return;
        const res = await updateTicketDetails(ticket.id, { issueDescription: issueText });
        if (res.success) {
            setEditingIssue(false);
            setTicket(serializeTicket(res.ticket));
            toast.success("Issue updated");
        }
    };

    const openBarcodePrint = () => {
        setDefaultPrintMode('label');
        setShowPrintOptions(true);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-screen bg-[#09090b] text-white">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                <p className="text-zinc-400 animate-pulse">{tCommon('loading')}...</p>
            </div>
        </div>
    );

    if (!ticket) return (
        <div className="flex items-center justify-center h-screen bg-[#09090b]">
            <Card className="bg-zinc-900 border-zinc-800 text-center p-8 max-w-md mx-auto">
                <X className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">{t('ticketNotFound')}</h2>
                <Button onClick={() => router.back()} className="mt-4 bg-zinc-800 hover:bg-zinc-700">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
                </Button>
            </Card>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#09090b] p-6 text-zinc-100" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/50 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            onClick={() => router.back()}
                            className="bg-white/5 hover:bg-white/10 text-zinc-300"
                        >
                            <ArrowLeft className="h-4 w-4 ml-2" /> {tCommon('back')}
                        </Button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-black tracking-tight text-white">
                                    Ticket #{ticket.barcode}
                                </h1>
                                <Badge className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20 text-xs px-3 py-1">
                                    {tTickets(`status.${getStatusTranslationKey(ticket.status)}`).toUpperCase()}
                                </Badge>
                            </div>
                            <p className="text-zinc-500 text-sm mt-1">
                                {new Date(ticket.createdAt).toLocaleString('ar-EG')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={openBarcodePrint}
                            className="bg-purple-500/5 border-purple-500/20 text-purple-400 hover:bg-purple-500/10 h-11"
                        >
                            <ScanBarcode className="h-4 w-4 ml-2" /> {tPOSIX('printBarcode') || 'Barcode'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => { setDefaultPrintMode('receipt'); setShowPrintOptions(true); }}
                            className="bg-cyan-500/5 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 h-11"
                        >
                            <Printer className="h-4 w-4 ml-2" /> {tPOSIX('print') || 'Receipt'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content Area */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Device Info Card */}
                        <Card className="bg-zinc-900 border-white/5 overflow-hidden">
                            <CardHeader className="bg-white/5 border-b border-white/5">
                                <CardTitle className="flex items-center gap-2 text-white">
                                    <Smartphone className="h-5 w-5 text-cyan-400" /> {t('deviceDetails')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">{t('model')}</label>
                                        <div className="text-lg font-bold text-white leading-none">{ticket.deviceBrand} {ticket.deviceModel}</div>
                                    </div>
                                    <div className="space-y-1 text-left sm:text-right">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">{t('imei')}</label>
                                        <div className="text-lg font-mono text-zinc-300 leading-none">{ticket.deviceImei || '-'}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">{t('color')}</label>
                                        <div className="text-lg font-bold text-zinc-300 leading-none">{ticket.deviceColor || '-'}</div>
                                    </div>
                                    <div className="space-y-1 text-left sm:text-right">
                                        <div className="flex items-center justify-end gap-2 mb-1">
                                            <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">{t('expectedDuration')}</label>
                                            <button onClick={() => setEditingDuration(true)} className="text-zinc-500 hover:text-white transition-colors">
                                                <Edit2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                        {editingDuration ? (
                                            <div className="flex items-center gap-2 justify-end">
                                                <Input
                                                    type="number"
                                                    value={durationInput}
                                                    onChange={(e) => setDurationInput(e.target.value)}
                                                    className="w-20 h-8 bg-black/50 border-white/10 text-white font-bold"
                                                />
                                                <Button size="icon" onClick={handleSaveDuration} className="h-8 w-8 bg-cyan-600 hover:bg-cyan-500">
                                                    <Save className="w-4 h-4 text-white" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => setEditingDuration(false)} className="h-8 w-8 text-red-500">
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="text-lg font-bold text-cyan-400 leading-none flex items-center justify-end gap-2">
                                                <Clock className="w-4 h-4" />
                                                {ticket.expectedDuration ? `${ticket.expectedDuration} min` : '-'}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <Separator className="bg-white/5" />

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">{t('issueDescription')}</label>
                                        {!editingIssue && (
                                            <button onClick={() => setEditingIssue(true)} className="text-zinc-500 hover:text-white transition-colors">
                                                <Edit2 className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                    {editingIssue ? (
                                        <div className="space-y-3">
                                            <Textarea
                                                value={issueText}
                                                onChange={(e) => setIssueText(e.target.value)}
                                                className="bg-black/50 border-white/10 text-white min-h-[100px] leading-relaxed resize-none"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" onClick={() => setEditingIssue(false)} className="text-zinc-500">{t('cancel')}</Button>
                                                <Button onClick={handleSaveIssue} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold">{t('save')}</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-black/30 rounded-xl border border-white/5 text-zinc-200 leading-relaxed italic">
                                            {ticket.issueDescription}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">{t('conditionNotes')}</label>
                                    <div className="text-sm text-zinc-400">{ticket.conditionNotes || t('notSet')}</div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Security Access Card */}
                        <Card className="bg-zinc-900 border-white/5 overflow-hidden">
                            <CardHeader className="bg-white/5 border-b border-white/5">
                                <CardTitle className="flex items-center gap-2 text-white">
                                    <ShieldCheck className="h-5 w-5 text-yellow-500" /> {t('securityHeader')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-5 rounded-2xl bg-yellow-500/5 border border-yellow-500/10 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-yellow-500">
                                            <Lock className="w-4 h-4" />
                                            <span className="text-xs font-bold uppercase">{t('pinPassword')}</span>
                                        </div>
                                        <button onClick={() => setShowSecurityCode(!showSecurityCode)} className="text-yellow-500/50 hover:text-yellow-500 transition-colors">
                                            {showSecurityCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <div className="text-2xl font-mono font-black tracking-widest text-white h-8 flex items-center">
                                        {!ticket.securityCode ? (
                                            <span className="text-zinc-600 text-sm font-normal italic">{t('notSet')}</span>
                                        ) : showSecurityCode ? (
                                            ticket.securityCode
                                        ) : (
                                            "••••••"
                                        )}
                                    </div>
                                </div>

                                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-zinc-400">
                                            <Smartphone className="w-4 h-4" />
                                            <span className="text-xs font-bold uppercase">{t('patternLock')}</span>
                                        </div>
                                        <button onClick={() => setShowPattern(!showPattern)} className="text-zinc-500 hover:text-white transition-colors">
                                            {showPattern ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <div className="text-sm font-mono text-zinc-400">
                                        {!ticket.patternData ? (
                                            <span className="italic">{t('noPattern')}</span>
                                        ) : showPattern ? (
                                            <div className="bg-black/50 p-2 rounded-lg text-xs leading-none break-all text-cyan-400">
                                                {ticket.patternData}
                                            </div>
                                        ) : (
                                            "••••••••••••"
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Logs & Parts Tabs */}
                        <Card className="bg-zinc-900 border-white/5">
                            <CardContent className="p-6">
                                <Tabs defaultValue="notes" className="space-y-6">
                                    <TabsList className="bg-black/40 border border-white/10 p-1 rounded-xl h-12 w-full sm:w-auto">
                                        <TabsTrigger value="notes" className="rounded-lg px-8 data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-bold h-full">
                                            {t('notesTab')}
                                        </TabsTrigger>
                                        {(user?.branchType === 'CENTER' || user?.role === 'ADMIN' || user?.role === 'مدير النظام') && (
                                            <TabsTrigger value="parts" className="rounded-lg px-8 data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-bold h-full">
                                                {t('partsTab')}
                                            </TabsTrigger>
                                        )}
                                    </TabsList>

                                    <TabsContent value="notes" className="space-y-6 focus:outline-none">
                                        <div className="flex gap-3">
                                            <Textarea
                                                placeholder={t('addNotePlaceholder')}
                                                value={noteText}
                                                onChange={(e) => setNoteText(e.target.value)}
                                                className="bg-white/5 border-white/10 text-white resize-none min-h-[50px] flex-1 rounded-2xl focus:ring-2 focus:ring-cyan-500/20"
                                            />
                                            <Button
                                                className="h-auto px-6 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl shadow-lg shadow-cyan-600/10"
                                                onClick={handleAddNote}
                                            >
                                                <Send className="h-5 w-5" />
                                            </Button>
                                        </div>

                                        <div className="space-y-4 max-h-[400px] overflow-y-auto px-1 custom-scrollbar">
                                            {ticket.notes?.map((note: any) => (
                                                <div
                                                    key={note.id}
                                                    className={`p-4 rounded-2xl border ${note.isInternal ? 'bg-yellow-500/5 border-yellow-500/10' : 'bg-white/5 border-white/10'}`}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-bold text-white flex items-center gap-2">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${note.isInternal ? 'bg-yellow-500' : 'bg-cyan-500'}`} />
                                                            {note.author}
                                                        </span>
                                                        <span className="text-[10px] text-zinc-500 font-mono">
                                                            {new Date(note.createdAt).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-zinc-300 leading-relaxed">
                                                        {note.text}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="parts" className="focus:outline-none">
                                        <TicketPartsManager
                                            ticketId={ticket.id}
                                            parts={ticket.parts || []}
                                            technicianId={ticket.technicianId}
                                            technicianName={ticket.technician?.name}
                                            technicianWarehouseId={ticket.technician?.warehouseId}
                                            onUpdate={loadData}
                                        />
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar Columns */}
                    <div className="space-y-6">
                        {/* Customer Sidebar Card */}
                        <Card className="bg-zinc-900 border-white/5 overflow-hidden">
                            <CardHeader className="bg-white/5 border-b border-white/5 py-4">
                                <CardTitle className="text-sm uppercase tracking-widest font-bold text-zinc-400 flex items-center gap-2 leading-none">
                                    <User className="h-4 w-4" /> {t('customerLabel')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                <div className="space-y-1">
                                    <div className="text-xl font-black text-white">{ticket.customerName}</div>
                                    <div className="text-sm font-mono text-cyan-500">{ticket.customerPhone}</div>
                                    {ticket.customerEmail && <div className="text-xs text-zinc-500">{ticket.customerEmail}</div>}
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full h-11 bg-green-500/5 border-green-500/20 text-green-500 hover:bg-green-500/10 rounded-xl"
                                    onClick={() => {
                                        const template = getStatusTemplate(ticket.status, 'ar');
                                        const url = generateWhatsAppUrl(ticket.customerPhone, template, {
                                            name: ticket.customerName,
                                            device: `${ticket.deviceBrand} ${ticket.deviceModel}`,
                                            barcode: ticket.barcode,
                                            price: Number(ticket.repairPrice).toFixed(2),
                                            branch: 'الفرع',
                                            issue: ticket.issueDescription || '-',
                                            notes: ticket.conditionNotes || '-'
                                        });
                                        window.open(url, '_blank');
                                        addTicketNote({ ticketId: ticket.id, text: `📱 WhatsApp notification sent (Status: ${ticket.status})`, isInternal: true });
                                    }}
                                >
                                    <Send className="h-4 w-4 ml-2" />
                                    {t('whatsappUpdate')}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Status Sidebar Card */}
                        <Card className="bg-zinc-900 border-white/5 overflow-hidden">
                            <CardHeader className="bg-white/5 border-b border-white/5 py-4">
                                <CardTitle className="text-sm uppercase tracking-widest font-bold text-zinc-400 flex items-center gap-2 leading-none">
                                    <CheckCircle className="h-4 w-4" /> {t('workflowHeader')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <WorkflowActions ticket={ticket} user={user} onUpdate={loadData} />

                                <Separator className="bg-white/5" />

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider flex items-center gap-1.5 leading-none">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                        {t('assignedEngineer')}
                                    </label>
                                    <Select
                                        defaultValue={ticket.technicianId || ''}
                                        onValueChange={handleAssign}
                                    >
                                        <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-11 focus:ring-cyan-500/50">
                                            <SelectValue placeholder={t('unassigned')} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white rounded-xl">
                                            {technicians.map(t => (
                                                <SelectItem key={t.id} value={t.id} className="focus:bg-cyan-500/20 focus:text-white rounded-lg m-1">
                                                    {t.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <CollaboratorManager
                                    ticketId={ticket.id}
                                    collaborators={ticket.collaborators || []}
                                    technicians={technicians}
                                    onUpdate={loadData}
                                />
                            </CardContent>
                        </Card>

                        {/* Financial Sidebar */}
                        <Card className="bg-zinc-900 border-white/5 overflow-hidden border-r-4 border-r-green-500">
                            <CardHeader className="bg-white/5 border-b border-white/5 py-4">
                                <CardTitle className="text-sm uppercase tracking-widest font-bold text-zinc-400 flex items-center gap-2 leading-none">
                                    <DollarSign className="h-4 w-4" /> {t('financialsHeader')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-zinc-500 text-sm font-bold">{t('repairCost')}</span>
                                    {editingPrice ? (
                                        <div className="flex items-center gap-1">
                                            <Input
                                                className="w-24 h-9 bg-black/50 text-white border-white/10 text-center font-bold"
                                                type="number"
                                                value={priceInput}
                                                onChange={(e) => setPriceInput(e.target.value)}
                                            />
                                            <Button size="icon" className="h-9 w-9 bg-green-600 hover:bg-green-500" onClick={handleSavePrice}>
                                                <Save className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 group">
                                            <span className="text-2xl font-black text-white">
                                                {Number(ticket.repairPrice).toLocaleString()}
                                            </span>
                                            <button onClick={() => setEditingPrice(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-white p-1">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-zinc-500">{t('paid')}</span>
                                    <span className="text-green-500 font-bold">{Number(ticket.amountPaid).toLocaleString()}</span>
                                </div>

                                <Separator className="bg-white/5" />

                                <div className="flex justify-between items-center bg-black/30 p-4 rounded-2xl border border-white/5 shadow-inner">
                                    {(Number(ticket.repairPrice) - Number(ticket.amountPaid)) > 0 ? (
                                        <>
                                            <span className="text-zinc-400 font-bold">{t('balanceDue')}</span>
                                            <span className="text-2xl font-black text-red-500">
                                                {(Number(ticket.repairPrice) - Number(ticket.amountPaid)).toLocaleString()}
                                            </span>
                                        </>
                                    ) : (Number(ticket.repairPrice) - Number(ticket.amountPaid)) < 0 ? (
                                        <>
                                            <span className="text-yellow-500 font-bold">{t('refundDue')}</span>
                                            <span className="text-2xl font-black text-yellow-500">
                                                {Math.abs(Number(ticket.repairPrice) - Number(ticket.amountPaid)).toLocaleString()}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-white font-bold">{t('balanceDue')}</span>
                                            <span className="text-2xl font-black text-green-500">0.00</span>
                                        </>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {(Number(ticket.repairPrice) - Number(ticket.amountPaid)) > 0 && (
                                        <Button
                                            onClick={() => setShowPaymentModal(true)}
                                            className="w-full h-11 bg-green-600 hover:bg-green-500 text-white font-black rounded-xl shadow-lg shadow-green-600/10"
                                        >
                                            <Receipt className="w-4 h-4 ml-2" />
                                            {t('payNow')}
                                        </Button>
                                    )}

                                    {Number(ticket.amountPaid) > 0 && (
                                        <Button
                                            onClick={() => setShowRefundModal(true)}
                                            variant="ghost"
                                            className="w-full text-red-500/50 hover:text-red-500 hover:bg-red-500/5 h-11 rounded-xl text-xs font-bold"
                                        >
                                            <RotateCcw className="w-3 h-3 ml-2" />
                                            {t('issueRefund')}
                                        </Button>
                                    )}

                                    {['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'COMPLETED'].includes(ticket.status) && (
                                        <Button
                                            onClick={() => setShowReturnModal(true)}
                                            className="w-full h-11 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl shadow-lg shadow-orange-600/10 mt-2"
                                        >
                                            🔄 {t('returnForRepair')}
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <WarrantyCard ticket={ticket} onUpdate={loadData} />
                    </div>
                </div>

                {/* Modals Section */}
                <TicketPrintOptionsModal
                    isOpen={showPrintOptions}
                    onClose={() => setShowPrintOptions(false)}
                    ticket={ticket}
                    settings={settings}
                    defaultMode={defaultPrintMode}
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
            </div>
        </div>
    );
}

