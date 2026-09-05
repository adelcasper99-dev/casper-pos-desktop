'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCSRF } from "@/contexts/CSRFContext";
import { useTranslations, useLocale } from '@/lib/i18n-mock'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CustomerAutocomplete } from "@/components/tickets/CustomerAutocomplete"
import { createTicket } from "@/actions/ticket-actions"
import { ArrowLeft, Loader2, User, Smartphone, Wrench, FileText, Save, Check, X, Search, DollarSign, Clock } from 'lucide-react'
import { toast } from "sonner"
import { modelsByBrand } from "@/lib/mobileModels";
import { SearchableSelect } from "@/components/ui/searchable-select"
import { cn, safeRandomUUID } from "@/lib/utils"
import PatternLockCanvas from "@/components/tickets/PatternLockCanvas"
import { generateIdempotencyKey } from '@/lib/offline-transaction-helper';
import { offlineDB, type OfflineTicket } from "@/lib/offline-db";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useWhatsAppAutoNotify } from "@/hooks/useWhatsAppAutoNotify";
import { getEffectiveStoreSettings } from "@/actions/settings";

import { getPresets, addPreset, deletePreset } from "@/actions/preset-actions";
import { getDevicePresets, upsertDevice } from "@/actions/device-actions";
import { Edit, Trash2, PlusCircle, Sparkles, Zap } from "lucide-react";
import { searchCustomers } from "@/actions/customer-actions";
import GlassModal from "@/components/ui/GlassModal";
import { shouldAutoPrint } from "@/lib/print-guard";

type TicketPageSettings = {
    name?: string | null;
    whatsappEnabled?: boolean;
    whatsappTemplates?: string | null;
    autoPrintTicket?: boolean;
    [key: string]: unknown;
};

const POPULAR_BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Oppo', 'Realme', 'Huawei', 'Infinix', 'Vivo'];
const POPULAR_ISSUES = [
    'تغيير شاشة',
    'تغيير باغة',
    'تغيير بطارية',
    'سوكت شحن',
    'فاصل باور',
    'كاميرا خلفية',
    'كاميرا أمامية',
    'سماعة / صوت',
    'مايك',
    'صيانة ماذربورد',
    'سوفت وير',
    'فحص وصيانة شاملة'
];

export default function NewTicketPage() {
    const t = useTranslations('Tickets.details');
    const tCommon = useTranslations('Common');
    const tVal = useTranslations('Validation');
    const locale = useLocale();
    const router = useRouter()
    const { isOnline } = useNetworkStatus();
    const { token: csrfToken } = useCSRF();
    const autoNotify = useWhatsAppAutoNotify();
    const [submitting, setSubmitting] = useState(false)
    const [isEditingPresets, setIsEditingPresets] = useState<"ISSUE" | "CONDITION" | null>(null)
    const [settings, setSettings] = useState<TicketPageSettings | null>(null);

    // Reset Modal State
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetOptions, setResetOptions] = useState({
        customer: true,
        device: true,
        issues: true
    });

    // Dynamic Presets
    const [issuesList, setIssuesList] = useState<{ id: string, name: string }[]>([]);
    const [conditionsList, setConditionsList] = useState<{ id: string, name: string }[]>([]);
    const [devicePresets, setDevicePresets] = useState<{ brand: string, model: string }[]>([]);
    const [newPresetName, setNewPresetName] = useState("");

    const [formData, setFormData] = useState({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        deviceBrand: '',
        deviceModel: '',
        deviceImei: '',
        deviceColor: '',
        securityCode: '',
        patternData: '',
        issueDescription: '',
        conditionNotes: '',
        repairPrice: '',
        expectedDuration: '',
        screenScratches: false,
        bodyCracks: false,
        cameraWorking: true,
        speakerWorking: true,
        microphoneWorking: true,
        chargingPortWorking: true,
        buttonsWorking: true,
        selectedIssues: [] as string[],
        selectedConditions: [] as string[]
    })

    const STORAGE_KEY = 'ticket_form_draft';
    const [isLoaded, setIsLoaded] = useState(false);

    // Load draft on mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                setFormData(prev => ({ ...prev, ...data }));
                if (data.customerName || data.customerPhone) {
                    setIsExistingCustomer(false); // Re-validate or just keep it false
                }
            } catch (e) {
                console.error("Failed to load ticket draft", e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Save draft on change
    useEffect(() => {
        if (!isLoaded) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    }, [formData, isLoaded]);

    // Helper to toggle functional checks
    const toggleCheck = (key: string) => {
        setFormData(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))
    }

    // Fetch Presets and Devices
    useEffect(() => {
        const loadPresets = async () => {
            const issues = await getPresets("ISSUE");
            const conditions = await getPresets("CONDITION");
            const devices = await getDevicePresets();

            setIssuesList(issues);
            setConditionsList(conditions);

            if (devices && devices.length > 0) {
                setDevicePresets(devices);
            } else {
                console.warn("Device presets empty, using static fallback.");
                const staticFallback: { brand: string, model: string }[] = [];
                Object.entries(modelsByBrand).forEach(([brand, models]) => {
                    models.forEach(model => staticFallback.push({ brand, model }));
                });
                setDevicePresets(staticFallback);
            }
        };
        loadPresets();

        // Load settings for WhatsApp
        getEffectiveStoreSettings().then(res => {
            if (res.success) setSettings(res.data);
        });
    }, []);

    // Derived Device Data
    const uniqueBrands = Array.from(new Set(devicePresets.map(d => d.brand)));
    const modelsForSelectedBrand = devicePresets
        .filter(d => d.brand === formData.deviceBrand)
        .map(d => d.model);

    const handleAddPreset = async () => {
        if (!newPresetName.trim() || !isEditingPresets) return;
        await addPreset(isEditingPresets, newPresetName);
        const updated = await getPresets(isEditingPresets);
        if (isEditingPresets === "ISSUE") setIssuesList(updated);
        else setConditionsList(updated);
        setNewPresetName("");
    }

    const handleDeletePreset = async (id: string, type: "ISSUE" | "CONDITION") => {
        await deletePreset(id);
        const updated = await getPresets(type);
        if (type === "ISSUE") setIssuesList(updated);
        else setConditionsList(updated);
    }

    const [isExistingCustomer, setIsExistingCustomer] = useState(false);
    const [showPattern, setShowPattern] = useState(false);
    const [phoneSearching, setPhoneSearching] = useState(false);
    const [phoneDetectedCustomer, setPhoneDetectedCustomer] = useState<{ id: string; name: string; phone: string; email?: string } | null>(null);

    const handlePhoneChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 11);
        setFormData(prev => ({ ...prev, customerPhone: val }));
        setIsExistingCustomer(false);
        setPhoneDetectedCustomer(null);

        if (val.length === 11) {
            setPhoneSearching(true);
            try {
                const res = await searchCustomers(val);
                if (res.success && res.customers && res.customers.length > 0) {
                    const exact = res.customers.find(c => c.phone === val) || res.customers[0];
                    if (exact && exact.name) {
                        setPhoneDetectedCustomer({
                            id: exact.id as string,
                            name: exact.name,
                            phone: exact.phone,
                            email: exact.email || undefined
                        });
                    }
                }
            } catch (err) {
                console.error("Phone auto-detect error", err);
            } finally {
                setPhoneSearching(false);
            }
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
        if (['customerName', 'customerPhone'].includes(name)) {
            setIsExistingCustomer(false);
        }
    }

    const handleReset = () => {
        setFormData(prev => ({
            ...prev,
            customerName: resetOptions.customer ? '' : prev.customerName,
            customerPhone: resetOptions.customer ? '' : prev.customerPhone,
            customerEmail: resetOptions.customer ? '' : prev.customerEmail,
            deviceBrand: resetOptions.device ? '' : prev.deviceBrand,
            deviceModel: resetOptions.device ? '' : prev.deviceModel,
            deviceImei: resetOptions.device ? '' : prev.deviceImei,
            deviceColor: resetOptions.device ? '' : prev.deviceColor,
            securityCode: resetOptions.device ? '' : prev.securityCode,
            patternData: resetOptions.device ? '' : prev.patternData,
            issueDescription: resetOptions.issues ? '' : prev.issueDescription,
            conditionNotes: resetOptions.issues ? '' : prev.conditionNotes,
            repairPrice: resetOptions.issues ? '' : prev.repairPrice,
            expectedDuration: resetOptions.issues ? '' : prev.expectedDuration,
            selectedIssues: resetOptions.issues ? [] : prev.selectedIssues,
            selectedConditions: resetOptions.issues ? [] : prev.selectedConditions,
        }));
        if (resetOptions.customer) setIsExistingCustomer(false);
        if (resetOptions.device) setShowPattern(false);
        setShowResetModal(false);
        toast.success("تم تفريغ النموذج بناءً على اختيارك");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.customerName || !formData.customerPhone || !formData.issueDescription) {
            toast.error("Please fill required fields");
            return;
        }

        setSubmitting(true)
        const idempotencyKey = generateIdempotencyKey('TICKET');

        try {
            const tempBarcode = 'T-' + Math.floor(100000 + Math.random() * 900000);

            if (formData.deviceBrand && formData.deviceModel) {
                try {
                    await upsertDevice(formData.deviceBrand, formData.deviceModel);
                } catch (err) {
                    console.error("Failed to auto-save device:", err);
                }
            }

            const functionalNotes = [
                !formData.cameraWorking ? 'عطل الكاميرا' : null,
                !formData.speakerWorking ? 'عطل السماعة' : null,
                !formData.microphoneWorking ? 'عطل الميكروفون' : null,
                !formData.chargingPortWorking ? 'عطل سوكيت الشحن' : null,
                !formData.buttonsWorking ? 'عطل في الأزرار' : null,
            ].filter(Boolean).join(', ');

            const finalConditionNotes = [
                functionalNotes,
                ...formData.selectedConditions,
                formData.conditionNotes
            ].filter(Boolean).join(' | ');

            toast.success(
                <div>
                    <p className="font-bold">Creating Ticket...</p>
                    <p className="text-sm font-mono">#{tempBarcode}</p>
                </div>,
                { duration: 2000 }
            );

            if (!isOnline) {
                try {
                    const offlineTicket: OfflineTicket = {
                        id: safeRandomUUID(),
                        idempotencyKey,
                        customerName: formData.customerName,
                        customerPhone: formData.customerPhone,
                        deviceBrand: formData.deviceBrand,
                        deviceModel: formData.deviceModel,
                        issueDescription: formData.issueDescription,
                        initialQuote: Number(formData.repairPrice),
                        repairPrice: Number(formData.repairPrice),
                        expectedDuration: formData.expectedDuration ? Number(formData.expectedDuration) : null,
                        items: [],
                        createdAt: Date.now(),
                        synced: 0,
                        syncRetries: 0,
                        status: 'NEW',
                        totalAmount: Number(formData.repairPrice),
                        syncStatus: 'PENDING'
                    };

                    await offlineDB.tickets.add(offlineTicket);

                    toast.success(
                        <div>
                            <p className="font-bold">تم حفظ التذكرة محلياً</p>
                            <p className="text-sm font-mono">#{tempBarcode}</p>
                            <p className="text-xs text-yellow-300">ستُزامَن عند استعادة الاتصال</p>
                        </div>
                    );

                    localStorage.removeItem(STORAGE_KEY);
                    router.push(`/${locale}/maintenance/tickets`);
                    return;
                } catch (err) {
                    console.error("Offline Ticket Save Error:", err);
                    toast.error("Failed to save offline ticket");
                    setSubmitting(false);
                    return;
                }
            }

            const res = await createTicket({
                ...formData,
                repairPrice: formData.repairPrice ? Number(formData.repairPrice) : 0,
                expectedDuration: formData.expectedDuration ? Number(formData.expectedDuration) : undefined,
                conditionNotes: finalConditionNotes,
                csrfToken: csrfToken ?? undefined,
                idempotencyKey
            });

            if (!res.success) {
                const errorMsg = "Failed to create ticket: " + (res.error || "Unknown error");
                console.error("❌ Ticket Creation Error:", errorMsg);
                toast.error(errorMsg);
                setSubmitting(false);
            } else {
                // 🛡️ FIX: Don't show success toast when auto-print is enabled - it causes confusion
                // The print modal will show automatically
                const resData = res as {
                    success: boolean;
                    data?: { id?: string; ticketId?: string; barcode?: string };
                    id?: string;
                    ticketId?: string;
                    barcode?: string;
                };
                const ticketData = resData.data || resData;
                const ticketId = ticketData.id || ticketData.ticketId;
                const barcode = ticketData.barcode;

                // 🚀 WhatsApp Auto-Notify (Non-blocking)
                autoNotify('NEW', {
                    customerPhone: formData.customerPhone,
                    customerName: formData.customerName,
                    barcode: barcode || tempBarcode,
                    deviceBrand: formData.deviceBrand,
                    deviceModel: formData.deviceModel,
                    repairPrice: Number(formData.repairPrice),
                    branchName: settings?.name ?? undefined,
                    issueDescription: formData.issueDescription
                }, {
                    whatsappEnabled: settings?.whatsappEnabled,
                    whatsappTemplates: settings?.whatsappTemplates
                });

                console.log('[AutoPrint] Ticket created, redirecting with print=true, ticketId:', ticketId);

                if (ticketId) {
                    localStorage.removeItem(STORAGE_KEY); // Clear draft on success
                    // Use replace to avoid history stack issues
                    if (shouldAutoPrint(settings, 'ticket')) {
                        router.replace(`/${locale}/maintenance/tickets/${ticketId}?print=true`);
                    } else {
                        router.replace(`/${locale}/maintenance/tickets/${ticketId}`);
                    }
                } else {
                    localStorage.removeItem(STORAGE_KEY); // Clear draft on success
                    router.push(`/${locale}/maintenance/tickets`);
                }
            }
        } catch (error) {
            const errorMsg = "Ticket creation failed: " + (error instanceof Error ? error.message : "Unknown error");
            console.error("❌ Ticket Creation Error:", errorMsg);
            toast.error(errorMsg);
            setSubmitting(false);
        }
    };

    return (
        <div className="h-[calc(100vh-70px)] bg-slate-50/60 dark:bg-black p-2 md:p-3 rounded-2xl border border-slate-200/80 dark:border-white/5 flex flex-col overflow-hidden">
            <form id="ticket-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 flex-1 min-h-0">

                {/* LEFT COLUMN: 2 COLS */}
                <div className="lg:col-span-2 flex flex-col justify-between gap-2 h-full min-h-0 overflow-hidden">

                    {/* Header Bar */}
                    <div className="flex items-center justify-between shrink-0 h-8 pb-1 border-b border-slate-200/60 dark:border-white/5">
                        <div className="flex items-center gap-2.5">
                            <Button 
                                variant="ghost" 
                                type="button" 
                                onClick={() => router.back()} 
                                className="h-7 px-2.5 text-slate-600 dark:text-zinc-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 flex items-center gap-1.5 rounded-lg transition-all border border-slate-200 dark:border-white/10 text-xs font-bold"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" /> 
                                <span>عودة</span>
                            </Button>
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                                    <Wrench className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                                </div>
                                <h1 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                                    تسجيل جهاز جديد
                                </h1>
                            </div>
                        </div>

                        <Button 
                            variant="ghost" 
                            type="button" 
                            className="h-7 px-2.5 rounded-lg text-xs font-bold gap-1 bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white border border-red-200 dark:border-red-900/40 transition-colors"
                            onClick={() => {
                                if (window.confirm("هل أنت متأكد من مسح جميع بيانات التذكرة؟")) {
                                    localStorage.removeItem(STORAGE_KEY);
                                    window.location.reload();
                                }
                            }}
                        >
                            <Trash2 className="w-3 h-3" /> مسح النموذج
                        </Button>
                    </div>

                    {/* Step 1: Customer Card */}
                    <div className="rounded-2xl p-0.5 bg-slate-200/50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 shrink-0 relative z-30">
                        <div className="rounded-[0.9rem] bg-white/95 dark:bg-zinc-900/90 p-2.5 space-y-2 backdrop-blur-md">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 text-[11px] font-black flex items-center justify-center font-mono">
                                        01
                                    </span>
                                    <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <User className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                                        بيانات العميل
                                    </span>
                                </div>

                                {isExistingCustomer ? (
                                    <div className="flex items-center gap-1.5 text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold">
                                        <Check className="h-3 w-3" />
                                        <span>مسجل: {formData.customerName}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setFormData(prev => ({ ...prev, customerName: '', customerPhone: '', customerEmail: '' }));
                                                setIsExistingCustomer(false);
                                                setPhoneDetectedCustomer(null);
                                            }}
                                            className="hover:text-red-500 font-mono ml-0.5"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                                        تسجيل فوري أو بحث
                                    </span>
                                )}
                            </div>

                            {/* Autocomplete Search */}
                            <CustomerAutocomplete
                                onSelect={(customer) => {
                                    setFormData(prev => ({
                                        ...prev,
                                        customerName: customer.name,
                                        customerPhone: customer.phone,
                                        customerEmail: customer.email || ''
                                    }));
                                    setIsExistingCustomer(true);
                                    setPhoneDetectedCustomer(null);
                                    toast.success(`تم تحميل بيانات: ${customer.name}`);
                                }}
                                onNewCustomer={(val) => {
                                    const isPhone = /^\d+$/.test(val);
                                    if (isPhone) {
                                        setFormData(prev => ({ ...prev, customerPhone: val.slice(0, 11) }));
                                    } else {
                                        setFormData(prev => ({ ...prev, customerName: val }));
                                    }
                                    setIsExistingCustomer(false);
                                    toast.info(`تم تعبئة: ${val}`);
                                }}
                                placeholder="بحث برقم الهاتف أو الاسم... أو اضغط Enter للتسجيل الفوري"
                                className="h-8.5 text-xs rounded-xl"
                            />

                            {phoneDetectedCustomer && !isExistingCustomer && (
                                <div className="flex items-center justify-between p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs">
                                    <div className="flex items-center gap-1.5">
                                        <Zap className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                                        <span>عميل معروف بالرقم: <strong>{phoneDetectedCustomer.name}</strong></span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData(prev => ({
                                                ...prev,
                                                customerName: phoneDetectedCustomer.name,
                                                customerEmail: phoneDetectedCustomer.email || ''
                                            }));
                                            setIsExistingCustomer(true);
                                            setPhoneDetectedCustomer(null);
                                            toast.success(`تم تحميل بيانات: ${phoneDetectedCustomer.name}`);
                                        }}
                                        className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700 text-[11px]"
                                    >
                                        تحميل ↵
                                    </button>
                                </div>
                            )}

                            {/* 3 Inputs */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                                        الاسم <span className="text-red-500">*</span>
                                    </label>
                                    <Input
                                        className="h-8.5 bg-slate-50/70 dark:bg-black/40 border-slate-200 dark:border-white/10 text-xs font-bold rounded-lg"
                                        name="customerName"
                                        required
                                        value={formData.customerName}
                                        onChange={handleChange}
                                        placeholder="اسم العميل"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between mb-0.5">
                                        <span>الهاتف <span className="text-red-500">*</span></span>
                                        {phoneSearching && <span className="text-[9px] text-cyan-500">فحص...</span>}
                                    </label>
                                    <Input
                                        className="h-8.5 bg-slate-50/70 dark:bg-black/40 border-slate-200 dark:border-white/10 text-xs font-bold font-mono tracking-wider rounded-lg"
                                        name="customerPhone"
                                        required
                                        value={formData.customerPhone}
                                        onChange={handlePhoneChange}
                                        placeholder="01xxxxxxxxx"
                                        maxLength={11}
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-0.5">
                                        <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">الباسورد / PIN</label>
                                        <button
                                            type="button"
                                            onClick={() => setShowPattern(!showPattern)}
                                            className="text-[9px] text-cyan-600 dark:text-cyan-400 font-bold"
                                        >
                                            {showPattern ? "إخفاء النمط" : "نمط"}
                                        </button>
                                    </div>
                                    <Input
                                        className="h-8.5 bg-slate-50/70 dark:bg-black/40 border-slate-200 dark:border-white/10 text-xs font-mono rounded-lg"
                                        name="securityCode"
                                        value={formData.securityCode}
                                        onChange={handleChange}
                                        placeholder="PIN / باسورد"
                                    />
                                </div>
                            </div>

                            {showPattern && (
                                <div className="p-2 bg-slate-100/70 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/10 rounded-xl flex items-center justify-center">
                                    <PatternLockCanvas
                                        value={formData.patternData}
                                        onChange={(pattern) => setFormData(prev => ({ ...prev, patternData: pattern }))}
                                        size={100}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Step 2: Device Details Card */}
                    <div className="rounded-2xl p-0.5 bg-slate-200/50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 shrink-0 relative z-20">
                        <div className="rounded-[0.9rem] bg-white/95 dark:bg-zinc-900/90 p-2.5 space-y-2 backdrop-blur-md">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-md bg-teal-500/15 text-teal-600 dark:text-teal-400 text-[11px] font-black flex items-center justify-center font-mono">
                                        02
                                    </span>
                                    <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <Smartphone className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                                        تفاصيل الجهاز
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 overflow-x-auto max-w-[65%] pb-0.5 scrollbar-none">
                                    {POPULAR_BRANDS.map(brand => (
                                        <button
                                            key={brand}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, deviceBrand: brand, deviceModel: '' }))}
                                            className={cn(
                                                "h-6 px-2 rounded-md text-[10px] font-bold transition-all shrink-0 border",
                                                formData.deviceBrand === brand
                                                    ? "bg-slate-900 text-white dark:bg-white dark:text-black border-slate-900 dark:border-white"
                                                    : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 border-slate-200/60 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                                            )}
                                        >
                                            {brand}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <div className="relative z-30">
                                    <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                                        البراند <span className="text-red-500">*</span>
                                    </label>
                                    <SearchableSelect
                                        options={uniqueBrands}
                                        value={formData.deviceBrand}
                                        onChange={(val) => {
                                            if (val !== formData.deviceBrand) {
                                                setFormData(prev => ({ ...prev, deviceBrand: val, deviceModel: '' }));
                                            }
                                        }}
                                        onAdd={(val) => setFormData(prev => ({ ...prev, deviceBrand: val }))}
                                        placeholder="الماركة"
                                        inputClassName="h-8.5 text-xs rounded-lg border"
                                    />
                                </div>
                                <div className="relative z-20">
                                    <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                                        الموديل <span className="text-red-500">*</span>
                                    </label>
                                    <SearchableSelect
                                        options={modelsForSelectedBrand}
                                        value={formData.deviceModel}
                                        onChange={(val) => setFormData(prev => ({ ...prev, deviceModel: val }))}
                                        onAdd={(val) => setFormData(prev => ({ ...prev, deviceModel: val }))}
                                        placeholder={formData.deviceBrand ? `موديل ${formData.deviceBrand}` : "الموديل"}
                                        disabled={!formData.deviceBrand}
                                        inputClassName="h-8.5 text-xs rounded-lg border"
                                    />
                                </div>
                                <div className="relative z-10">
                                    <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                                        IMEI / السيريال
                                    </label>
                                    <Input 
                                        className="h-8.5 bg-slate-50/70 dark:bg-black/40 border-slate-200 dark:border-white/10 text-xs font-mono rounded-lg" 
                                        name="deviceImei" 
                                        value={formData.deviceImei} 
                                        onChange={handleChange} 
                                        placeholder="السيريال..." 
                                    />
                                </div>
                                <div className="relative z-10">
                                    <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                                        اللون
                                    </label>
                                    <Input 
                                        className="h-8.5 bg-slate-50/70 dark:bg-black/40 border-slate-200 dark:border-white/10 text-xs rounded-lg" 
                                        name="deviceColor" 
                                        value={formData.deviceColor} 
                                        onChange={handleChange} 
                                        placeholder="اللون..." 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Issues & Diagnosis Card */}
                    <div className="rounded-2xl p-0.5 bg-slate-200/50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 flex-1 min-h-0 flex flex-col relative z-10">
                        <div className="rounded-[0.9rem] bg-white/95 dark:bg-zinc-900/90 p-2.5 space-y-1.5 backdrop-blur-md flex-1 min-h-0 flex flex-col justify-between">
                            <div className="flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-black flex items-center justify-center font-mono">
                                        03
                                    </span>
                                    <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <Wrench className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                        المشاكل والوصف
                                    </span>
                                </div>

                                <button 
                                    type="button" 
                                    onClick={() => setIsEditingPresets("ISSUE")} 
                                    className="h-6 px-2 flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground bg-slate-100 dark:bg-white/5 rounded-md border border-slate-200/60 dark:border-white/5"
                                >
                                    <Edit className="w-2.5 h-2.5" /> تعديل الاختصارات
                                </button>
                            </div>

                            {/* Direct Search / Write Issue Input */}
                            <div className="shrink-0 relative z-30">
                                <SearchableSelect
                                    options={Array.from(new Set([...issuesList.map(i => i.name), ...POPULAR_ISSUES])).filter(name => !formData.selectedIssues.includes(name))}
                                    value=""
                                    onChange={(val) => {
                                        if (val && !formData.selectedIssues.includes(val)) {
                                            const newIssues = [...formData.selectedIssues, val];
                                            setFormData(prev => ({ ...prev, selectedIssues: newIssues, issueDescription: newIssues.join(", ") }));
                                        }
                                    }}
                                    onAdd={(newIssue) => {
                                        const newIssues = [...formData.selectedIssues, newIssue];
                                        setFormData(prev => ({ ...prev, selectedIssues: newIssues, issueDescription: newIssues.join(", ") }));
                                    }}
                                    placeholder="اكتب العطل أو ابحث مباشرة واضغط Enter للإضافة..."
                                    inputClassName="h-8 text-xs rounded-lg border bg-white dark:bg-zinc-900 shadow-none"
                                />
                            </div>

                            {/* Quick Popular Issue Pills */}
                            <div className="flex flex-wrap gap-1 shrink-0">
                                {Array.from(new Set([...issuesList.map(i => i.name), ...POPULAR_ISSUES])).slice(0, 10).map(issue => {
                                    const isSelected = formData.selectedIssues.includes(issue);
                                    return (
                                        <button
                                            key={issue}
                                            type="button"
                                            onClick={() => {
                                                let nextIssues: string[];
                                                if (isSelected) {
                                                    nextIssues = formData.selectedIssues.filter(i => i !== issue);
                                                } else {
                                                    nextIssues = [...formData.selectedIssues, issue];
                                                }
                                                setFormData(prev => ({ 
                                                    ...prev, 
                                                    selectedIssues: nextIssues, 
                                                    issueDescription: nextIssues.join(", ") 
                                                }));
                                            }}
                                            className={cn(
                                                "h-5.5 px-2 rounded-md text-[10px] font-bold transition-all border",
                                                isSelected
                                                    ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                                                    : "bg-slate-100/80 dark:bg-white/5 text-slate-700 dark:text-zinc-300 border-slate-200/60 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                                            )}
                                        >
                                            {issue} {isSelected ? "✓" : "+"}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Selected Active Badges */}
                            {formData.selectedIssues.length > 0 && (
                                <div className="flex flex-wrap gap-1 shrink-0">
                                    {formData.selectedIssues.map((issue, idx) => (
                                        <span 
                                            key={idx} 
                                            className="inline-flex items-center gap-1 bg-slate-900 dark:bg-white text-white dark:text-black px-2 py-0.5 rounded-md text-[10px] font-bold animate-in zoom-in-95"
                                        >
                                            {issue}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextIssues = formData.selectedIssues.filter((_, i) => i !== idx);
                                                    setFormData(prev => ({ 
                                                        ...prev, 
                                                        selectedIssues: nextIssues, 
                                                        issueDescription: nextIssues.join(", ") 
                                                    }));
                                                }}
                                                className="hover:opacity-70 ml-0.5"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Compact Notes Textarea */}
                            <div className="shrink-0">
                                <Textarea
                                    name="issueDescription"
                                    value={formData.issueDescription}
                                    onChange={(e) => setFormData(prev => ({ ...prev, issueDescription: e.target.value }))}
                                    placeholder="ملاحظات إضافية وفحص العطل..."
                                    rows={2}
                                    className="resize-none h-11 bg-slate-50/70 dark:bg-black/40 border-slate-200 dark:border-white/10 text-xs rounded-lg p-1.5 leading-tight"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: 1 COL */}
                <div className="lg:col-span-1 h-full min-h-0 flex flex-col">
                    <div className="rounded-2xl p-0.5 bg-slate-200/50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 h-full flex flex-col shadow-sm">
                        <div className="rounded-[0.9rem] bg-white dark:bg-zinc-950 p-3 flex flex-col justify-between h-full overflow-hidden space-y-2">
                            
                            {/* Card Header */}
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-white/5 shrink-0">
                                <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                                    <FileText className="h-3.5 w-3.5 text-cyan-500" />
                                    <span>ملخص التذكرة</span>
                                </div>
                                <span className="text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 px-1.5 py-0.5 rounded">
                                    Live
                                </span>
                            </div>

                            {/* Mini Previews */}
                            <div className="space-y-1.5 shrink-0">
                                <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                                    <div className="text-[9px] text-muted-foreground uppercase font-black">العميل</div>
                                    <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                        {formData.customerName || <span className="text-slate-400 font-normal">لم يحدد بعد</span>}
                                    </div>
                                    <div className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                                        {formData.customerPhone || '01xxxxxxxxx'}
                                    </div>
                                </div>

                                <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                                    <div className="text-[9px] text-muted-foreground uppercase font-black">الجهاز</div>
                                    <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                        {formData.deviceBrand || formData.deviceModel 
                                            ? `${formData.deviceBrand} ${formData.deviceModel}` 
                                            : <span className="text-slate-400 font-normal">الماركة والموديل</span>}
                                    </div>
                                    {formData.deviceImei && (
                                        <div className="text-[10px] font-mono text-muted-foreground truncate">
                                            IMEI: {formData.deviceImei}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Price & Duration */}
                            <div className="space-y-2 shrink-0">
                                <div className="p-2 bg-slate-100/70 dark:bg-white/[0.03] rounded-xl border border-slate-200/80 dark:border-white/5">
                                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">
                                        التكلفة المتوقعة
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black font-mono text-muted-foreground">
                                            EGP
                                        </span>
                                        <Input
                                            type="number"
                                            name="repairPrice"
                                            className="h-9 pl-10 text-base font-black bg-white dark:bg-zinc-900 border-slate-200 dark:border-white/10 rounded-lg shadow-inner"
                                            value={formData.repairPrice}
                                            onChange={handleChange}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div className="p-2 bg-slate-100/70 dark:bg-white/[0.03] rounded-xl border border-slate-200/80 dark:border-white/5 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-muted-foreground">الوقت المتوقع (دقيقة)</label>
                                        <Clock className="w-3 h-3 text-muted-foreground" />
                                    </div>
                                    <Input
                                        type="number"
                                        name="expectedDuration"
                                        className="h-7 text-xs font-bold bg-white dark:bg-zinc-900 border-slate-200 dark:border-white/10 rounded-lg"
                                        value={formData.expectedDuration}
                                        onChange={handleChange}
                                        placeholder="60"
                                    />
                                    <div className="grid grid-cols-5 gap-1 pt-0.5">
                                        {[
                                            { label: '30د', val: '30' },
                                            { label: '1س', val: '60' },
                                            { label: '2س', val: '120' },
                                            { label: '24س', val: '1440' },
                                            { label: '3أيام', val: '4320' },
                                        ].map(d => (
                                            <Button
                                                key={d.val}
                                                type="button"
                                                variant="outline"
                                                className={cn(
                                                    "h-6 text-[10px] font-bold border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 rounded p-0",
                                                    formData.expectedDuration === d.val && "bg-slate-900 text-white dark:bg-white dark:text-black"
                                                )}
                                                onClick={() => setFormData(prev => ({ ...prev, expectedDuration: d.val }))}
                                            >
                                                {d.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <div className="pt-1 shrink-0">
                                <Button
                                    className="w-full h-11 bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    <span>حفظ وطباعة الإيصال</span>
                                </Button>
                            </div>

                        </div>
                    </div>
                </div>
            </form>

            <GlassModal
                isOpen={!!isEditingPresets}
                onClose={() => setIsEditingPresets(null)}
                title={t('managePresets')}
            >
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder={t('addNewPreset')}
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddPreset()}
                            className="bg-white/5 border-white/10 text-white"
                        />
                        <Button onClick={handleAddPreset} className="bg-black dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-zinc-200 shadow-lg">
                            <PlusCircle className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                        {(isEditingPresets === "ISSUE" ? issuesList : conditionsList).map(item => (
                            <div key={item.id} className="flex items-center justify-between p-2 bg-white/5 rounded border border-white/10">
                                <span className="text-zinc-300">{item.name}</span>
                                <button
                                    onClick={() => handleDeletePreset(item.id, isEditingPresets!)}
                                    className="text-red-400 hover:text-red-300 transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                isOpen={showResetModal}
                onClose={() => setShowResetModal(false)}
                title="تفريغ النموذج"
            >
                <div className="space-y-4 p-2">
                    <p className="text-sm font-bold text-slate-600 dark:text-zinc-400 mb-4">اختر البيانات التي تريد تفريغها:</p>
                    
                    <label className="flex items-center gap-3 p-3 bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                        <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded border-slate-300 dark:border-white/20 text-black dark:text-white focus:ring-black dark:focus:ring-white"
                            checked={resetOptions.customer} 
                            onChange={e => setResetOptions(prev => ({...prev, customer: e.target.checked}))} 
                        />
                        <span className="font-black text-slate-900 dark:text-white">تفريغ بيانات العميل</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                        <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded border-slate-300 dark:border-white/20 text-black dark:text-white focus:ring-black dark:focus:ring-white"
                            checked={resetOptions.device} 
                            onChange={e => setResetOptions(prev => ({...prev, device: e.target.checked}))} 
                        />
                        <span className="font-black text-slate-900 dark:text-white">تفريغ بيانات الجهاز</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                        <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded border-slate-300 dark:border-white/20 text-black dark:text-white focus:ring-black dark:focus:ring-white"
                            checked={resetOptions.issues} 
                            onChange={e => setResetOptions(prev => ({...prev, issues: e.target.checked}))} 
                        />
                        <span className="font-black text-slate-900 dark:text-white">تفريغ المشاكل والوصف والسعر</span>
                    </label>

                    <Button 
                        onClick={handleReset} 
                        className="w-full mt-6 h-12 bg-red-600 hover:bg-red-700 text-white font-black text-lg rounded-xl"
                    >
                        تأكيد التفريغ
                    </Button>
                </div>
            </GlassModal>
        </div>
    )
}
