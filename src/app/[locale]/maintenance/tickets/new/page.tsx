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
import { offlineDB } from "@/lib/offline-db";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useWhatsAppAutoNotify } from "@/hooks/useWhatsAppAutoNotify";
import { getEffectiveStoreSettings } from "@/actions/settings";

import { getPresets, addPreset, deletePreset } from "@/actions/preset-actions";
import { getDevicePresets, upsertDevice } from "@/actions/device-actions";
import { Edit, Trash2, PlusCircle } from "lucide-react";
import GlassModal from "@/components/ui/GlassModal";
import { shouldAutoPrint } from "@/lib/print-guard";

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
    const [settings, setSettings] = useState<any>(null);

    // Dynamic Presets
    const [issuesList, setIssuesList] = useState<{ id: string, name: string }[]>([]);
    const [conditionsList, setConditionsList] = useState<{ id: string, name: string }[]>([]);
    const [devicePresets, setDevicePresets] = useState<{ brand: string, model: string }[]>([]);
    const [newPresetName, setNewPresetName] = useState("");

    // Main Form State
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
        if (['customerName', 'customerPhone'].includes(name)) {
            setIsExistingCustomer(false);
        }
    }

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
                    const offlineTicket = {
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
                        synced: 0 as const,
                        syncRetries: 0,
                        status: 'NEW',
                        totalAmount: Number(formData.repairPrice),
                        syncStatus: 'PENDING'
                    };

                    await offlineDB.tickets.add(offlineTicket as any);

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
                const ticketData = (res as any).data || res;
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
        <div className="h-[calc(100vh-100px)] overflow-hidden animate-fly-in bg-slate-50 dark:bg-black p-4 md:p-6 rounded-2xl border border-slate-300 dark:border-white/5">
            <form id="ticket-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">

                {/* LEFT COLUMN: SCROLLABLE INPUTS */}
                <div className="lg:col-span-2 overflow-y-auto pr-1 space-y-3 pb-10 scrollbar-hide">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" type="button" onClick={() => router.back()} className="h-11 px-5 text-slate-600 dark:text-zinc-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 flex items-center gap-2 rounded-xl transition-all border border-slate-300 dark:border-white/10">
                                <ArrowLeft className="h-5 w-5" /> <span className="text-sm font-black">عودة</span>
                            </Button>
                            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-black dark:bg-white flex items-center justify-center shadow-xl shadow-black/20">
                                <Wrench className="w-6 h-6 text-white dark:text-black" />
                            </div>
                                تسجيل جهاز جديد
                            </h1>
                        </div>
                        <Button 
                            variant="destructive" 
                            type="button" 
                            className="h-11 rounded-xl font-black gap-2 shadow-xl bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white border border-red-200 dark:border-red-900/50"
                            onClick={() => {
                                if (window.confirm("هل أنت متأكد من مسح جميع بيانات التذكرة؟")) {
                                    localStorage.removeItem(STORAGE_KEY);
                                    window.location.reload();
                                }
                            }}
                        >
                            <Trash2 className="w-4 h-4" /> مسح البيانات
                        </Button>
                    </div>

                    {/* Customer Info */}
                    <Card className="shadow-xl bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 mb-4 rounded-2xl">
                        <CardHeader className="py-3 px-5 bg-slate-50 dark:bg-zinc-800 border-b-2 border-slate-200 dark:border-zinc-700">
                            <CardTitle className="flex items-center justify-between text-slate-900 dark:text-white text-base font-black uppercase tracking-tighter">
                                <div className="flex items-center gap-3">
                                    <User className="h-5 w-5 text-black dark:text-white" />
                                    بيانات العميل
                                </div>
                                {isExistingCustomer && (
                                    <div className="flex items-center gap-1 text-[11px] bg-black dark:bg-white text-white dark:text-black px-3 py-1 rounded-full border border-black dark:border-white font-black shadow-lg shadow-black/20">
                                        <Check className="h-3 w-3" /> سجل موجود
                                    </div>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-5">
                            <div className="p-4 bg-slate-100 dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-700 rounded-2xl space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <label className="text-[11px] font-black text-slate-700 dark:text-zinc-400 uppercase tracking-widest leading-none">بحث سريع برقم الهاتف أو الاسم</label>
                                    <Search className="h-4 w-4 text-black dark:text-white" />
                                </div>
                                <CustomerAutocomplete
                                    onSelect={(customer) => {
                                        setFormData(prev => ({
                                            ...prev,
                                            customerName: customer.name,
                                            customerPhone: customer.phone,
                                            customerEmail: customer.email || ''
                                        }));
                                        setIsExistingCustomer(true);
                                        toast.success(`تم تحميل بيانات العميل: ${customer.name}`);
                                    }}
                                    placeholder="ابحث عن العميل..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-800 dark:text-zinc-100 ml-1">اسم العميل <span className="text-red-500">*</span></label>
                                    <Input
                                        className="h-12 bg-slate-50 dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-black dark:focus:border-white shadow-inner text-base font-black rounded-xl"
                                        name="customerName"
                                        required
                                        value={formData.customerName}
                                        onChange={handleChange}
                                        placeholder="الاسم"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-800 dark:text-zinc-100 ml-1">رقم الهاتف <span className="text-red-500">*</span></label>
                                    <Input
                                        className="h-12 bg-slate-50 dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-black dark:focus:border-white shadow-inner text-base font-black rounded-xl tracking-widest"
                                        name="customerPhone"
                                        required
                                        value={formData.customerPhone}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                                            setFormData(prev => ({ ...prev, customerPhone: val }));
                                            setIsExistingCustomer(false);
                                        }}
                                        placeholder="01xxxxxxxxx"
                                        maxLength={11}
                                        minLength={11}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between ml-1">
                                        <label className="text-xs font-black text-slate-800 dark:text-zinc-100">كود الأمان / الباسورد</label>
                                        <button
                                            type="button"
                                            onClick={() => setShowPattern(!showPattern)}
                                            className={cn(
                                                "text-[10px] uppercase font-black tracking-widest transition-colors",
                                                showPattern ? "text-black dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                            )}
                                        >
                                            {showPattern ? "إخفاء النمط" : "استخدام نمط"}
                                        </button>
                                    </div>
                                    <Input
                                        className="h-12 bg-slate-50 dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-black dark:focus:border-white shadow-inner text-base font-black rounded-xl tracking-widest"
                                        name="securityCode"
                                        value={formData.securityCode}
                                        onChange={handleChange}
                                        placeholder="PIN / باسوورد"
                                        maxLength={20}
                                    />
                                </div>
                            </div>

                            {showPattern && (
                                <div className="mt-3 p-3 bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-xl flex items-center justify-center animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex flex-col items-center gap-2">
                                        <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">{t('pattern')}</label>
                                        <div className="bg-black/40 p-2 rounded-lg border border-slate-900/10 dark:border-white/10">
                                            <PatternLockCanvas
                                                value={formData.patternData}
                                                onChange={(pattern) => setFormData(prev => ({ ...prev, patternData: pattern }))}
                                                size={140}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Device Info */}
                    <Card className="shadow-xl bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 mb-4 rounded-2xl">
                        <CardHeader className="py-3 px-5 bg-slate-50 dark:bg-zinc-800 border-b-2 border-slate-200 dark:border-zinc-700">
                            <CardTitle className="flex items-center gap-3 text-slate-900 dark:text-white text-base font-black uppercase tracking-tighter">
                                <Smartphone className="h-5 w-5 text-black dark:text-white" />
                                تفاصيل الجهاز
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-800 dark:text-zinc-100 ml-1">البراند <span className="text-red-500">*</span></label>
                                    <SearchableSelect
                                        options={uniqueBrands}
                                        value={formData.deviceBrand}
                                        onChange={(val) => {
                                            if (val !== formData.deviceBrand) {
                                                setFormData(prev => ({ ...prev, deviceBrand: val, deviceModel: '' }));
                                            }
                                        }}
                                        onAdd={(val) => setFormData(prev => ({ ...prev, deviceBrand: val }))}
                                        placeholder="اختر أو اكتب الماركة"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest ml-1">الموديل <span className="text-red-500">*</span></label>
                                    <SearchableSelect
                                        options={modelsForSelectedBrand}
                                        value={formData.deviceModel}
                                        onChange={(val) => setFormData(prev => ({ ...prev, deviceModel: val }))}
                                        onAdd={(val) => setFormData(prev => ({ ...prev, deviceModel: val }))}
                                        placeholder={formData.deviceBrand ? `اختر أو اكتب موديل ${formData.deviceBrand}` : "اختر الموديل"}
                                        disabled={!formData.deviceBrand}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-800 dark:text-zinc-100 ml-1">IMEI / السيريال</label>
                                    <Input className="h-12 bg-slate-50 dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-black dark:focus:border-white shadow-inner text-base font-black rounded-xl transition-all" name="deviceImei" value={formData.deviceImei} onChange={handleChange} placeholder="352..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-800 dark:text-zinc-100 ml-1">اللون</label>
                                    <Input className="h-12 bg-slate-50 dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-black dark:focus:border-white shadow-inner text-base font-black rounded-xl transition-all" name="deviceColor" value={formData.deviceColor} onChange={handleChange} placeholder="اللون" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Issue & Condition */}
                    <Card className="shadow-xl bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 mb-4 rounded-2xl">
                        <CardHeader className="py-3 px-5 bg-slate-50 dark:bg-zinc-800 border-b-2 border-slate-200 dark:border-zinc-700">
                            <CardTitle className="flex items-center gap-3 text-slate-900 dark:text-white text-base font-black uppercase tracking-tighter">
                                <Wrench className="h-5 w-5 text-black dark:text-white" />
                                المشاكل والوصف
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => setIsEditingPresets("ISSUE")} className="h-11 px-4 flex items-center gap-2 text-[11px] text-black dark:text-white hover:text-slate-600 dark:hover:text-zinc-300 uppercase font-black tracking-widest bg-slate-100 dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-700 rounded-xl shrink-0 transition-all hover:scale-105 active:scale-95">
                                        <Edit className="w-3 h-3" /> تعديل الاختصارات
                                    </button>
                                    <div className="flex-1">
                                        <SearchableSelect
                                            options={issuesList.map(i => i.name).filter(name => !formData.selectedIssues.includes(name))}
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
                                            placeholder="ابحث عن مشكلة.."
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-2 min-h-0">
                                    {formData.selectedIssues.map((issue, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black border-2 border-black dark:border-white px-3 py-2 rounded-xl text-xs font-black shadow-lg animate-in zoom-in-95 duration-200">
                                            <span>{issue}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newIssues = formData.selectedIssues.filter((_, i) => i !== idx);
                                                    setFormData(prev => ({ ...prev, selectedIssues: newIssues, issueDescription: newIssues.join(", ") }));
                                                }}
                                                className="hover:text-slate-300 transition-colors"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {issuesList.map(issue => (
                                        <button
                                            key={issue.id}
                                            type="button"
                                            onClick={() => {
                                                if (!formData.selectedIssues.includes(issue.name)) {
                                                    const newIssues = [...formData.selectedIssues, issue.name];
                                                    setFormData(prev => ({ ...prev, selectedIssues: newIssues, issueDescription: newIssues.join(", ") }));
                                                }
                                            }}
                                            className={cn(
                                                "px-4 py-2 rounded-xl text-xs font-black transition-all border-2",
                                                formData.selectedIssues.includes(issue.name)
                                                    ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg"
                                                    : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-700"
                                            )}
                                        >
                                            {issue.name}
                                        </button>
                                    ))}
                                </div>

                                <Textarea
                                    name="issueDescription"
                                    value={formData.issueDescription}
                                    onChange={(e) => setFormData(prev => ({ ...prev, issueDescription: e.target.value }))}
                                    placeholder="أى ملاحظات إضافية على الجهاز..."
                                    rows={3}
                                    className="resize-none h-24 bg-slate-50 dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white mt-4 font-black text-base shadow-inner rounded-2xl"
                                />
                            </div>

                            <div className="space-y-4 pt-4 border-t-2 border-slate-200 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => setIsEditingPresets("CONDITION")} className="h-11 px-4 flex items-center gap-2 text-[11px] text-black dark:text-white hover:text-slate-600 dark:hover:text-zinc-300 uppercase font-black tracking-widest bg-slate-100 dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-700 rounded-xl shrink-0 transition-all hover:scale-105 active:scale-95">
                                        <Edit className="w-3 h-3" /> تعديل الاختصارات
                                    </button>
                                    <div className="flex-1">
                                        <SearchableSelect
                                            options={conditionsList.map(c => c.name).filter(name => !formData.selectedConditions.includes(name))}
                                            value=""
                                            onChange={(val) => {
                                                if (val && !formData.selectedConditions.includes(val)) {
                                                    setFormData(prev => ({ ...prev, selectedConditions: [...prev.selectedConditions, val] }));
                                                }
                                            }}
                                            onAdd={(newCond) => {
                                                setFormData(prev => ({ ...prev, selectedConditions: [...prev.selectedConditions, newCond] }));
                                            }}
                                            placeholder="ابحث عن ملاحظة.."
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-2 min-h-0">
                                    {formData.selectedConditions.map((cond, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black border-2 border-black dark:border-white px-3 py-2 rounded-xl text-xs font-black shadow-lg animate-in zoom-in-95 duration-200">
                                            <span>{cond}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newConds = formData.selectedConditions.filter((_, i) => i !== idx);
                                                    setFormData(prev => ({ ...prev, selectedConditions: newConds }));
                                                }}
                                                className="hover:text-slate-300 transition-colors"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-wrap gap-2 mb-2">
                                    {conditionsList.map(cond => (
                                        <button
                                            key={cond.id}
                                            type="button"
                                            onClick={() => {
                                                if (!formData.selectedConditions.includes(cond.name)) {
                                                    setFormData(prev => ({ ...prev, selectedConditions: [...prev.selectedConditions, cond.name] }));
                                                }
                                            }}
                                            className={cn(
                                                "px-4 py-2 rounded-xl text-xs font-black transition-all border-2",
                                                formData.selectedConditions.includes(cond.name)
                                                    ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg"
                                                    : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-700"
                                            )}
                                        >
                                            {cond.name}
                                        </button>
                                    ))}
                                </div>

                            </div>
                        </CardContent>
                    </Card>

                </div>

                {/* RIGHT COLUMN: STICKY SUMMARY */}
                <div className="lg:col-span-1 h-full flex flex-col">
                    <Card className="flex-1 flex flex-col bg-white dark:bg-zinc-950 border-2 border-slate-300 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                        <CardHeader className="py-3 px-4 bg-white/5 border-b border-white/10">
                            <CardTitle className="flex items-center gap-2 text-black dark:text-white text-base font-black uppercase tracking-tighter">
                                <FileText className="h-4 w-4" />
                                {t('ticketSummary')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-3 space-y-3 overflow-y-auto">

                            {/* Customer Summary */}
                            <div className="space-y-0.5">
                                <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{t('customerLabel')}</div>
                                <div className="font-bold text-black dark:text-white leading-tight">{formData.customerName || '-'}</div>
                                <div className="text-xs text-zinc-500 font-mono">{formData.customerPhone || '-'}</div>
                            </div>

                            <div className="border-t border-slate-200 dark:border-white/5" />

                            {/* Device Summary */}
                            <div className="space-y-0.5">
                                <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{t('deviceLabel')}</div>
                                <div className="font-bold text-black dark:text-white leading-tight">{formData.deviceBrand} {formData.deviceModel}</div>
                                <div className="text-[10px] text-zinc-500 font-mono opacity-60">{formData.deviceImei}</div>
                            </div>

                            <div className="border-t border-slate-200 dark:border-white/5" />

                            {/* Issue Summary */}
                            <div className="space-y-0.5">
                                <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{t('issueLabel')}</div>
                                <div className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{formData.issueDescription || '-'}</div>
                            </div>

                            <div className="border-t border-slate-200 dark:border-white/5" />

                            <div className="space-y-2 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border-2 border-slate-200 dark:border-white/5">
                                <label className="text-xs font-black text-slate-500 dark:text-zinc-500 uppercase tracking-widest leading-none block px-1">إجمالى التكلفة</label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
                                        <ArrowLeft className="w-5 h-5 text-slate-400" />
                                    </div>
                                    <Input
                                        type="number"
                                        name="repairPrice"
                                        className="h-14 pl-12 text-2xl font-black bg-white dark:bg-black border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:border-black dark:focus:border-white shadow-inner rounded-xl"
                                        value={formData.repairPrice}
                                        onChange={handleChange}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border-2 border-slate-200 dark:border-white/5">
                                <label className="text-xs font-black text-slate-500 dark:text-zinc-500 uppercase tracking-widest leading-none block px-1">الوقت المتوقع (بالدقيقة)</label>
                                <div className="relative">
                                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                    <Input
                                        type="number"
                                        name="expectedDuration"
                                        className="h-14 pl-12 text-2xl font-black bg-white dark:bg-black border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:border-black dark:focus:border-white shadow-inner rounded-xl"
                                        value={formData.expectedDuration}
                                        onChange={handleChange}
                                        placeholder="60"
                                    />
                                </div>
                                <div className="grid grid-cols-5 gap-2 pt-2">
                                    {[
                                        { label: '30M', val: '30' },
                                        { label: '1H', val: '60' },
                                        { label: '2H', val: '120' },
                                        { label: '1D', val: '1440' },
                                        { label: '3D', val: '4320' },
                                    ].map(d => (
                                        <Button
                                            key={d.val}
                                            type="button"
                                            variant="outline"
                                            className={cn(
                                                "flex-1 h-14 text-sm font-black border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-all rounded-xl",
                                                formData.expectedDuration === d.val && "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white scale-[1.05]"
                                            )}
                                            onClick={() => setFormData(prev => ({ ...prev, expectedDuration: d.val }))}
                                        >
                                            {d.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                        </CardContent>

                        <div className="p-4 bg-white/5 border-t border-white/10">
                            <Button
                                className="w-full h-20 bg-gradient-to-r from-slate-800 via-black to-slate-800 text-white text-2xl font-black rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.4)] flex items-center justify-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98] border-t border-white/20"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? <Loader2 className="h-8 w-8 animate-spin" /> : <Save className="h-8 w-8" />}
                                {t('saveTicket')}
                            </Button>
                        </div>
                    </Card>
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
        </div>
    )
}
