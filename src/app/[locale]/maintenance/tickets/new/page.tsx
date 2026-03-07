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
import { offlineDB } from "@/lib/offline-db";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

import { getPresets, addPreset, deletePreset } from "@/actions/preset-actions";
import { getDevicePresets, upsertDevice } from "@/actions/device-actions";
import { Edit, Trash2, PlusCircle } from "lucide-react";
import GlassModal from "@/components/ui/GlassModal";

export default function NewTicketPage() {
    const t = useTranslations('Tickets');
    const tCommon = useTranslations('Common');
    const tVal = useTranslations('Validation');
    const locale = useLocale();
    const router = useRouter()
    const { isOnline } = useNetworkStatus();
    const { token: csrfToken } = useCSRF();
    const [submitting, setSubmitting] = useState(false)
    const [isEditingPresets, setIsEditingPresets] = useState<"ISSUE" | "CONDITION" | null>(null)

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
                        barcode: tempBarcode,
                        customerName: formData.customerName,
                        customerPhone: formData.customerPhone,
                        deviceBrand: formData.deviceBrand,
                        deviceModel: formData.deviceModel,
                        issue: formData.issueDescription,
                        estimatedCost: Number(formData.repairPrice),
                        expectedDuration: formData.expectedDuration ? Number(formData.expectedDuration) : null,
                        parts: [],
                        createdAt: Date.now(),
                        synced: 0 as const,
                        syncRetries: 0,
                        status: 'NEW',
                        totalAmount: Number(formData.repairPrice)
                    };

                    await offlineDB.tickets.add(offlineTicket);

                    toast.success(
                        <div>
                            <p className="font-bold">Ticket Saved Offline</p>
                            <p className="text-sm font-mono">#{tempBarcode}</p>
                            <p className="text-xs text-yellow-300">Will sync when online</p>
                        </div>
                    );

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
                csrfToken: csrfToken ?? undefined
            });

            if (!res.success) {
                const errorMsg = "Failed to create ticket: " + (res.error || "Unknown error");
                console.error("❌ Ticket Creation Error:", errorMsg);
                toast.error(errorMsg);
                setSubmitting(false);
            } else {
                toast.success("Ticket created! Opening details...");
                const ticketId = (res as any).id || (res as any).data?.id;

                if (ticketId) {
                    router.push(`/${locale}/maintenance/tickets/${ticketId}?print=true`);
                } else {
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
        <div className="h-[calc(100vh-100px)] overflow-hidden animate-fly-in">
            <form id="ticket-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">

                {/* LEFT COLUMN: SCROLLABLE INPUTS */}
                <div className="lg:col-span-2 overflow-y-auto pr-2 space-y-6 pb-32 scrollbar-hide">

                    {/* Header */}
                    <div className="flex items-center gap-4 mb-2">
                        <Button variant="ghost" type="button" onClick={() => router.back()} className="text-zinc-400 hover:text-white hover:bg-white/5">
                            <ArrowLeft className="h-4 w-4 mr-2" /> {tCommon('back')}
                        </Button>
                        <h1 className="text-2xl font-bold text-white">{t('newTicket')}</h1>
                    </div>

                    {/* Customer Info */}
                    <Card className="glass-card shadow-none bg-transparent overflow-hidden">
                        <CardHeader className="pb-3 bg-white/5 border-b border-white/10">
                            <CardTitle className="flex items-center justify-between text-white">
                                <div className="flex items-center gap-2">
                                    <User className="h-5 w-5 text-cyan-400" />
                                    {t('customerInfo')}
                                </div>
                                {isExistingCustomer && (
                                    <div className="flex items-center gap-1 text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded-full border border-cyan-500/30 animate-pulse">
                                        <Check className="h-3 w-3" /> Loaded Record
                                    </div>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="p-4 bg-cyan-500/5 border border-cyan-500/10 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-cyan-500 uppercase tracking-widest">{t('quickLookup')}</label>
                                    <Search className="h-3 w-3 text-cyan-500/50" />
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
                                        toast.success(`Customer details loaded: ${customer.name}`);
                                    }}
                                    placeholder={t('searchCustomerPlaceholder')}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-400">{t('name')} <span className="text-red-500">*</span></label>
                                    <Input
                                        className="glass-input bg-transparent border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500 h-12"
                                        name="customerName"
                                        required
                                        value={formData.customerName}
                                        onChange={handleChange}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-400">{t('phone')} <span className="text-red-500">*</span></label>
                                    <Input
                                        className="glass-input bg-transparent border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500 h-12 font-mono tracking-wider"
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
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-sm font-medium text-zinc-400">{t('email')}</label>
                                    <Input
                                        className="glass-input bg-transparent border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500 h-12"
                                        name="customerEmail"
                                        type="email"
                                        value={formData.customerEmail}
                                        onChange={handleChange}
                                        placeholder="john@example.com"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Device Info */}
                    <Card className="glass-card shadow-none bg-transparent">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-white">
                                <Smartphone className="h-5 w-5 text-cyan-400" />
                                {t('deviceDetails')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-300">{t('brand')} <span className="text-red-500">*</span></label>
                                    <SearchableSelect
                                        options={uniqueBrands}
                                        value={formData.deviceBrand}
                                        onChange={(val) => {
                                            if (val !== formData.deviceBrand) {
                                                setFormData(prev => ({ ...prev, deviceBrand: val, deviceModel: '' }));
                                            }
                                        }}
                                        onAdd={(newBrand) => {
                                            setFormData(prev => ({ ...prev, deviceBrand: newBrand }))
                                        }}
                                        placeholder="Select or Type Brand..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-300">{t('model')} <span className="text-red-500">*</span></label>
                                    <SearchableSelect
                                        options={modelsForSelectedBrand}
                                        value={formData.deviceModel}
                                        onChange={(val) => setFormData(prev => ({ ...prev, deviceModel: val }))}
                                        onAdd={(newModel) => setFormData(prev => ({ ...prev, deviceModel: newModel }))}
                                        placeholder={formData.deviceBrand ? `Select ${formData.deviceBrand} Model...` : "Select Brand First..."}
                                        disabled={!formData.deviceBrand}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-300">{t('imei')}</label>
                                    <Input className="glass-input bg-transparent border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500" name="deviceImei" value={formData.deviceImei} onChange={handleChange} placeholder="352..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-300">{t('color')}</label>
                                    <Input className="glass-input bg-transparent border-white/10 text-white placeholder:text-zinc-600" name="deviceColor" value={formData.deviceColor} onChange={handleChange} placeholder="Space Gray" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-yellow-500">{t('pin')}</label>
                                    <Input
                                        className="glass-input bg-transparent border-yellow-500/50 text-yellow-100 placeholder:text-yellow-500/30 focus:border-yellow-500 text-lg tracking-widest font-mono"
                                        name="securityCode"
                                        value={formData.securityCode}
                                        onChange={handleChange}
                                        placeholder="1234"
                                        maxLength={20}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-yellow-500">{t('pattern')}</label>
                                    <PatternLockCanvas
                                        value={formData.patternData}
                                        onChange={(pattern) => setFormData(prev => ({ ...prev, patternData: pattern }))}
                                        size={150}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Issue & Condition */}
                    <Card className="glass-card shadow-none bg-transparent">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-white">
                                <Wrench className="h-5 w-5 text-cyan-400" />
                                {t('issuesCondition')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-300">{t('issueDescription')}</label>
                                    <button type="button" onClick={() => setIsEditingPresets("ISSUE")} className="text-xs flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
                                        <Edit className="w-3 h-3" /> {t('editPresets')}
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-2 min-h-[30px]">
                                    {formData.selectedIssues.map((issue, idx) => (
                                        <div key={idx} className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-3 py-1 rounded-full text-sm">
                                            <span>{issue}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newIssues = formData.selectedIssues.filter((_, i) => i !== idx);
                                                    setFormData(prev => ({ ...prev, selectedIssues: newIssues, issueDescription: newIssues.join(", ") }));
                                                }}
                                                className="hover:text-white"
                                            >
                                                <X className="h-3 w-3" />
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
                                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                                formData.selectedIssues.includes(issue.name)
                                                    ? "bg-cyan-500 text-black border-cyan-400"
                                                    : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10 hover:text-white"
                                            )}
                                        >
                                            {formData.selectedIssues.includes(issue.name) ? "✓ " : "+ "}{issue.name}
                                        </button>
                                    ))}
                                </div>

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
                                    placeholder={t('searchIssuePlaceholder')}
                                />

                                <Textarea
                                    name="issueDescription"
                                    value={formData.issueDescription}
                                    onChange={(e) => setFormData(prev => ({ ...prev, issueDescription: e.target.value }))}
                                    placeholder={t('additionalNotesPlaceholder')}
                                    rows={2}
                                    className="resize-none glass-input bg-transparent border-white/10 text-white mt-2"
                                />
                            </div>

                            <div className="space-y-3 pt-4 border-t border-white/10">
                                <div className="flex items-center justify-between">
                                    <label className="text-base font-semibold text-white">{t('conditionNotes')}</label>
                                    <button type="button" onClick={() => setIsEditingPresets("CONDITION")} className="text-xs flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
                                        <Edit className="w-3 h-3" /> {t('editPresets')}
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-2 min-h-[30px]">
                                    {formData.selectedConditions.map((cond, idx) => (
                                        <div key={idx} className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 px-3 py-1 rounded-full text-sm">
                                            <span>{cond}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newConds = formData.selectedConditions.filter((_, i) => i !== idx);
                                                    setFormData(prev => ({ ...prev, selectedConditions: newConds }));
                                                }}
                                                className="hover:text-white"
                                            >
                                                <X className="h-3 w-3" />
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
                                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                                formData.selectedConditions.includes(cond.name)
                                                    ? "bg-yellow-500 text-black border-yellow-400"
                                                    : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10 hover:text-white"
                                            )}
                                        >
                                            {formData.selectedConditions.includes(cond.name) ? "✓ " : "+ "}{cond.name}
                                        </button>
                                    ))}
                                </div>

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
                                    placeholder={t('searchConditionPlaceholder')}
                                />

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                    {[
                                        { key: 'cameraWorking', label: 'الكاميرا' },
                                        { key: 'speakerWorking', label: 'السماعة' },
                                        { key: 'microphoneWorking', label: 'الميكروفون' },
                                        { key: 'chargingPortWorking', label: 'الشحن' },
                                    ].map((item) => (
                                        <div
                                            key={item.key}
                                            className={cn(
                                                "flex items-center justify-between border p-2 rounded cursor-pointer transition-colors",
                                                formData[item.key as keyof typeof formData]
                                                    ? "bg-green-500/10 border-green-500/30"
                                                    : "bg-red-500/10 border-red-500/30"
                                            )}
                                            onClick={() => toggleCheck(item.key)}
                                        >
                                            <span className="text-sm text-zinc-300">{item.label}</span>
                                            {formData[item.key as keyof typeof formData]
                                                ? <Check className="h-4 w-4 text-green-500" />
                                                : <X className="h-4 w-4 text-red-500" />
                                            }
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                </div>

                {/* RIGHT COLUMN: STICKY SUMMARY */}
                <div className="lg:col-span-1 h-full flex flex-col pb-32">
                    <Card className="flex-1 flex flex-col glass-card border-cyan-500/20 shadow-lg bg-black/40">
                        <CardHeader className="bg-white/5 border-b border-white/10">
                            <CardTitle className="flex items-center gap-2 text-white">
                                <FileText className="h-5 w-5 text-cyan-400" />
                                {t('ticketSummary')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-6 space-y-6 overflow-y-auto">

                            {/* Customer Summary */}
                            <div className="space-y-1">
                                <div className="text-sm text-zinc-500">{t('customer')}</div>
                                <div className="font-semibold text-lg text-white">{formData.customerName || '-'}</div>
                                <div className="text-sm text-cyan-400">{formData.customerPhone || '-'}</div>
                            </div>

                            <div className="border-t border-white/10" />

                            {/* Device Summary */}
                            <div className="space-y-1">
                                <div className="text-sm text-zinc-500">{t('device')}</div>
                                <div className="font-semibold text-white">{formData.deviceBrand} {formData.deviceModel}</div>
                                <div className="text-xs text-zinc-500 font-mono">{formData.deviceImei}</div>
                            </div>

                            <div className="border-t border-white/10" />

                            {/* Issue Summary */}
                            <div className="space-y-1">
                                <div className="text-sm text-zinc-500">{t('issue')}</div>
                                <div className="text-sm text-white whitespace-pre-wrap">{formData.issueDescription || '-'}</div>
                            </div>

                            <div className="border-t border-white/10" />

                            <div className="space-y-2 bg-white/5 p-4 rounded-lg border border-white/10">
                                <label className="text-sm text-zinc-400">{t('estimatedCost')}</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                    <Input
                                        type="number"
                                        name="repairPrice"
                                        className="pl-12 text-lg font-bold bg-black/50 border-white/10 text-white focus:border-cyan-500"
                                        value={formData.repairPrice}
                                        onChange={handleChange}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 bg-white/5 p-4 rounded-lg border border-white/10">
                                <label className="text-sm text-zinc-400">{t('expectedDuration')}</label>
                                <div className="relative">
                                    <Clock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                    <Input
                                        type="number"
                                        name="expectedDuration"
                                        className="pl-12 text-lg font-bold bg-black/50 border-white/10 text-white focus:border-cyan-500"
                                        value={formData.expectedDuration}
                                        onChange={handleChange}
                                        placeholder="60"
                                    />
                                </div>
                            </div>

                        </CardContent>

                        <div className="p-4 bg-white/5 border-t border-white/10">
                            <Button
                                className="w-full h-12 text-lg gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/20"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? <Loader2 className="animate-spin" /> : <Save className="h-5 w-5" />}
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
                        <Button onClick={handleAddPreset} className="bg-cyan-600 hover:bg-cyan-500">
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
