"use client";

import { Store, Phone, MapPin, Receipt, Save, History, Shield, Image as ImageIcon, Upload, X, CheckCircle2, Globe } from "lucide-react";
import { useState, useRef } from "react";
import { updateStoreSettings } from "@/actions/settings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTranslations } from "@/lib/i18n-mock";
import { printService } from "@/lib/print-service";

export default function StoreConfig({ settings, hideModules = false }: { settings: any, hideModules?: boolean }) {
    const [form, setForm] = useState(settings || {});
    const [saving, setSaving] = useState(false);
    const [ipError, setIpError] = useState<string | null>(null);
    const t = useTranslations('StoreConfig');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getFeatures = () => {
        try {
            return typeof form.features === 'string' 
                ? JSON.parse(form.features || "{}") 
                : (form.features || {});
        } catch (e) {
            return {};
        }
    };

    const updateFeature = (key: string, value: any) => {
        const features = getFeatures();
        features[key] = value;
        handleChange('features', JSON.stringify(features));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 200 * 1024) {
            toast.error(t('logoTooLarge'));
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            handleChange('logoUrl', reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleChange = (key: string, val: any) => {
        setForm((prev: any) => ({ ...prev, [key]: val }));
    };

    const handleFeatureToggle = (featureId: string, enabled: boolean) => {
        try {
            const features = typeof form.features === 'string' 
                ? JSON.parse(form.features || "{}") 
                : (form.features || {});
            features[featureId] = enabled;
            handleChange('features', JSON.stringify(features));
        } catch (e) {
            handleChange('features', JSON.stringify({ [featureId]: enabled }));
        }
    };

    const getFeatureValue = (featureId: string) => {
        try {
            const features = typeof form.features === 'string' 
                ? JSON.parse(form.features || "{}") 
                : (form.features || {});
            return features[featureId] !== false;
        } catch (e) {
            return true;
        }
    };

    const handleSave = async () => {
        // Validate Static IP if manual IP configuration is enabled
        const features = getFeatures();
        if (features.manualIpEnabled) {
            const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
            if (!features.staticIp || !ipPattern.test(features.staticIp.trim())) {
                const errMsg = t('staticIpInvalid') || "عنوان IP غير صالح";
                setIpError(errMsg);
                toast.error(errMsg);
                return;
            }
        }
        setIpError(null);
        setSaving(true);
        try {
            const payload = {
                ...form,
                taxRate: parseFloat(form.taxRate) || 0,
                locationLat: parseFloat(form.locationLat) || 24.7136,
                locationLng: parseFloat(form.locationLng) || 46.6753,
                locationRadius: parseInt(form.locationRadius) || 500
            };
            
            // 🛡️ [SYNC FIX] Keep local speed print toggle in sync with global setting
            if (form.autoPrintTicket !== undefined) {
                const currentRegistry = printService.getRegistry() || {};
                printService.updateRegistry({ ...currentRegistry, enableSpeedPrint: form.autoPrintTicket === true });
            }

            const result = await updateStoreSettings(payload);
            if (result?.success) {
                toast.success(t('success'));
            } else {
                toast.error(result?.error || t('error'));
            }
        } catch (error) {
            toast.error(t('error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-4xl space-y-10 animate-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-[2.5rem] p-4 sm:p-10 shadow-xl relative overflow-hidden group/container">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/container:bg-primary/10 transition-colors" />

                {!hideModules ? (
                    <div className="space-y-8">
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black flex items-center gap-3 text-foreground uppercase tracking-tight">
                                <Shield className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" /> 
                                {t('modulesManagement')}
                            </h3>
                            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-9 opacity-60">{t('modulesManagementDesc')}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                                { id: 'dashboard', color: 'bg-blue-400', glow: 'shadow-blue-500/20' },
                                { id: 'pos', color: 'bg-rose-500', glow: 'shadow-rose-500/20' },
                                { id: 'maintenance', color: 'bg-violet-500', glow: 'shadow-violet-500/20' },
                                { id: 'maintenance_dashboard', color: 'bg-fuchsia-500', glow: 'shadow-fuchsia-500/20' },
                                { id: 'hr', color: 'bg-cyan-500', glow: 'shadow-cyan-500/20' },
                                { id: 'inventory', color: 'bg-blue-500', glow: 'shadow-blue-500/20' },
                                { id: 'purchasing', color: 'bg-orange-500', glow: 'shadow-orange-500/20' },
                                { id: 'treasury', color: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
                                { id: 'customers', color: 'bg-pink-500', glow: 'shadow-pink-500/20' },
                                { id: 'reports', color: 'bg-indigo-500', glow: 'shadow-indigo-500/20' },
                                { id: 'returns', color: 'bg-amber-500', glow: 'shadow-amber-500/20' },
                                { id: 'logs', color: 'bg-slate-500', glow: 'shadow-slate-500/20' },
                                { id: 'pos_price_tiers', color: 'bg-cyan-600', glow: 'shadow-cyan-600/20' },
                            ].map((module) => {
                                const isActive = getFeatureValue(module.id);
                                return (
                                    <div 
                                        key={module.id} 
                                        className={cn(
                                            "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 group",
                                            isActive 
                                                ? `bg-card/60 dark:bg-card/40 border-border/60 ${module.glow} shadow-xl scale-[1.02]` 
                                                : "bg-background/40 border-border/20 text-muted-foreground opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                                        )}
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-black text-foreground uppercase tracking-widest">{t(`modules.${module.id}.name`)}</span>
                                            <span className="text-[9px] font-medium text-muted-foreground/60 leading-tight">SYSTEM COMPONENT</span>
                                        </div>
                                        <Switch
                                            className={cn("data-[state=checked]:"+module.color)}
                                            checked={isActive}
                                            onCheckedChange={(checked) => handleFeatureToggle(module.id, checked)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[calc(100vh-145px)] overflow-y-auto pr-1 pb-16">
                        {/* Store Identity */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                    <Store className="w-4 h-4 text-cyan-400" />
                                </div>
                                <h3 className="text-xs font-bold uppercase tracking-tight text-foreground">{t('title')}</h3>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 items-start">
                                {/* Logo Dropzone */}
                                <div className="space-y-1 shrink-0">
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('storeLogo')}</Label>
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="relative w-24 h-24 group/logo cursor-pointer"
                                    >
                                        <div className={cn(
                                            "w-full h-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-1 transition-all relative z-10 overflow-hidden bg-card/40 backdrop-blur-md",
                                            form.logoUrl ? "border-primary/40 bg-primary/5" : "border-border/60 hover:border-primary/60"
                                        )}>
                                            {form.logoUrl ? (
                                                <div className="relative w-full h-full p-1">
                                                    <img src={form.logoUrl} alt="Store Logo" className="w-full h-full object-contain" />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-all flex items-center justify-center backdrop-blur-xs rounded-xl">
                                                        <X 
                                                            className="w-5 h-5 text-white hover:text-rose-400 transition-colors" 
                                                            onClick={(e) => { e.stopPropagation(); handleChange('logoUrl', null); }} 
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 group/upload cursor-pointer hover:bg-primary/10 transition-all flex items-center justify-center text-center">
                                                    <p className="text-[10px] font-bold text-primary">{t('changeLogo')}</p>
                                                </div>
                                            )}
                                        </div>
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            className="hidden" 
                                            accept="image/*" 
                                            onChange={handleFileChange}
                                        />
                                    </div>
                                </div>

                                {/* Form Fields Matrix */}
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                                    <div className="space-y-1 group">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('storeName')}</Label>
                                        <div className="relative">
                                           <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                              <Store size={13} className="text-muted-foreground/40" />
                                           </div>
                                            <input
                                                className="w-full bg-card/40 border border-border/50 rounded-xl py-1 pl-8 pr-3 text-xs font-bold focus:outline-none focus:border-primary h-8 transition-all"
                                                value={form.name || ""}
                                                onChange={e => handleChange('name', e.target.value)}
                                                placeholder="My Awesome Store"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1 group">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('currency')}</Label>
                                        <input
                                            className="w-full bg-card/40 border border-border/50 rounded-xl px-3 py-1 text-xs font-bold focus:outline-none focus:border-primary h-8 transition-all"
                                            value={form.currency || "EGP"}
                                            onChange={e => handleChange('currency', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1 group">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('phone')}</Label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                               <Phone size={13} className="text-muted-foreground/40" />
                                            </div>
                                            <input
                                                className="w-full bg-card/40 border border-border/50 rounded-xl py-1 pl-8 pr-3 text-xs font-bold focus:outline-none focus:border-primary h-8 transition-all"
                                                value={form.phone || ""}
                                                onChange={e => handleChange('phone', e.target.value)}
                                                placeholder="01xxxxxxxxx"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1 group">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('address')}</Label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                               <MapPin size={13} className="text-muted-foreground/40" />
                                            </div>
                                            <input
                                                className="w-full bg-card/40 border border-border/50 rounded-xl py-1 pl-8 pr-3 text-xs font-bold focus:outline-none focus:border-primary h-8 transition-all"
                                                value={form.address || ""}
                                                onChange={e => handleChange('address', e.target.value)}
                                                placeholder="City, Street..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Financial & Tax Policies */}
                        <div className="space-y-3 pt-3 border-t border-border/20">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
                                    <Receipt className="w-4 h-4 text-purple-400" />
                                </div>
                                <h3 className="text-xs font-bold uppercase tracking-tight text-foreground">{t('taxTitle')}</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {[
                                    { id: 'enableTax', label: t('enableTax'), desc: t('enableTaxDesc'), val: Number(form.taxRate) > 0, fn: (c: boolean) => handleChange('taxRate', c ? 14.0 : 0) },
                                    { id: 'autoPrint', label: t('autoPrint'), desc: t('autoPrintDesc'), val: form.autoPrint || false, fn: (c: boolean) => handleChange('autoPrint', c) },
                                    { id: 'autoPrintTicket', label: t('autoPrintTicket'), desc: t('autoPrintTicketDesc'), val: form.autoPrintTicket || false, fn: (c: boolean) => handleChange('autoPrintTicket', c) },
                                    { id: 'autoPrintEngineerCopy', label: t('autoPrintEngineerCopy'), desc: t('autoPrintEngineerCopyDesc'), val: form.autoPrintEngineerCopy || false, fn: (c: boolean) => handleChange('autoPrintEngineerCopy', c) },
                                ].map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-2.5 border border-border/40 rounded-xl bg-card/40 transition-all hover:bg-card/60">
                                        <div className="space-y-0.5 max-w-[75%]">
                                            <Label className="text-xs font-bold text-foreground">{item.label}</Label>
                                            <p className="text-[10px] text-muted-foreground leading-tight opacity-70">{item.desc}</p>
                                        </div>
                                        <Switch
                                            checked={item.val}
                                            onCheckedChange={item.fn}
                                        />
                                    </div>
                                ))}
                            </div>

                            {Number(form.taxRate) > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-1 group">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('vatNumber')}</Label>
                                        <input
                                            className="w-full bg-card/60 border border-border/40 rounded-xl p-2 text-xs font-black focus:outline-none focus:border-indigo-500/50 shadow-xs h-8"
                                            value={form.vatNumber || ""}
                                            onChange={e => handleChange('vatNumber', e.target.value)}
                                            placeholder="310000000000003"
                                        />
                                    </div>
                                    <div className="space-y-1 group">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('taxRate')}</Label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="w-full bg-card/60 border border-border/40 rounded-xl p-2 text-xs font-black focus:outline-none focus:border-indigo-500/50 shadow-xs pr-8 h-8"
                                                value={form.taxRate || 0}
                                                onChange={e => handleChange('taxRate', e.target.value)}
                                            />
                                            <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
                                               <span className="font-bold text-indigo-400 opacity-60 text-xs">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Inventory & Operational Policy */}
                        <div className="space-y-3 pt-3 border-t border-border/20 group/policy">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-orange-500/10 rounded-lg border border-orange-500/20">
                                    <History className="w-4 h-4 text-orange-400" />
                                </div>
                                <h3 className="text-xs font-bold uppercase tracking-tight text-foreground">{t('inventoryPolicy')}</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {[
                                    { id: 'allowNegativeStock', label: t('allowNegativeStock'), desc: t('allowNegativeStockDesc'), val: form.allowNegativeStock || false, fn: (c: boolean) => handleChange('allowNegativeStock', c) },
                                    { id: 'hideLocationsTab', label: t('hideLocationsTab'), desc: t('hideLocationsTabDesc'), val: getFeatureValue('hideLocationsTab') === true, fn: (c: boolean) => handleFeatureToggle('hideLocationsTab', c) },
                                    { id: 'blindCloseEnabled', label: "Blind Close Shift", desc: "Hide expected cash totals during shift close.", val: form.blindCloseEnabled !== false, fn: (c: boolean) => handleChange('blindCloseEnabled', c) },
                                ].map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-2.5 border border-border/40 rounded-xl bg-card/40 transition-all hover:bg-card/60">
                                        <div className="space-y-0.5 max-w-[75%]">
                                            <Label className="text-xs font-bold text-foreground">{item.label}</Label>
                                            <p className="text-[10px] text-muted-foreground leading-tight opacity-70">{item.desc}</p>
                                        </div>
                                        <Switch
                                            checked={item.val}
                                            onCheckedChange={item.fn}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Location Services */}
                        <div className="space-y-3 pt-3 border-t border-border/20">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                    <MapPin className="w-4 h-4 text-emerald-400" />
                                </div>
                                <h3 className="text-xs font-bold uppercase tracking-tight text-foreground">{t('locationTitle')}</h3>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                <div className="space-y-1 lg:col-span-1">
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('latitude')}</Label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-card/40 border border-border/50 rounded-xl px-3 py-1 text-xs font-bold focus:outline-none focus:border-primary h-8 transition-all"
                                        value={form.locationLat ?? 24.7136}
                                        onChange={e => handleChange('locationLat', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1 lg:col-span-1">
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('longitude')}</Label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-card/40 border border-border/50 rounded-xl px-3 py-1 text-xs font-bold focus:outline-none focus:border-primary h-8 transition-all"
                                        value={form.locationLng ?? 46.6753}
                                        onChange={e => handleChange('locationLng', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1 lg:col-span-1">
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('radius')}</Label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className="w-full bg-card/40 border border-border/50 rounded-xl px-3 py-1 text-xs font-bold focus:outline-none focus:border-primary pe-12 h-8 transition-all"
                                            value={form.locationRadius ?? 500}
                                            onChange={e => handleChange('locationRadius', e.target.value)}
                                        />
                                        <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
                                            <span className="font-bold text-muted-foreground text-[10px] uppercase">Meters</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Local Node & Printing Configuration */}
                        <div className="space-y-3 pt-3 border-t border-border/20">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                    <Globe className="w-4 h-4 text-cyan-400" />
                                </div>
                                <h3 className="text-xs font-bold uppercase tracking-tight text-foreground">{t('hardwareIntegration')}</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex items-center justify-between p-2.5 border border-border/40 rounded-xl bg-card/40 transition-all hover:bg-card/60">
                                    <div className="space-y-0.5 max-w-[75%]">
                                        <Label className="text-xs font-bold text-foreground">{t('speedPrintToggle') || "الطباعة السريعة (Speed Print)"}</Label>
                                        <p className="text-[10px] text-muted-foreground leading-tight opacity-70">
                                            {t('speedPrintDesc') || "الطباعة الصامتة عبر خادم أجهزة كاسبر أو سطح المكتب دون حوار المتصفح"}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={getFeatures().speedPrintEnabled === true}
                                        onCheckedChange={(checked) => updateFeature('speedPrintEnabled', checked)}
                                    />
                                </div>

                                <div className="flex items-center justify-between p-2.5 border border-border/40 rounded-xl bg-card/40 transition-all hover:bg-card/60">
                                    <div className="space-y-0.5 max-w-[75%]">
                                        <Label className="text-xs font-bold text-foreground">{t('manualIpToggle') || "تثبيت عنوان IP للجهاز"}</Label>
                                        <p className="text-[10px] text-muted-foreground leading-tight opacity-70">
                                            {t('manualIpDesc') || "تحديد عنوان IP مخصص لتعريف طرفية الكاشير محلياً"}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={getFeatures().manualIpEnabled === true}
                                        onCheckedChange={(checked) => updateFeature('manualIpEnabled', checked)}
                                    />
                                </div>

                                {getFeatures().manualIpEnabled === true && (
                                    <div className="sm:col-span-2 p-2.5 border border-cyan-500/30 rounded-xl bg-cyan-500/5 space-y-1 animate-in fade-in duration-200">
                                        <Label className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">{t('staticIpAddress') || "عنوان IP الثابت للجهاز"}</Label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                className={cn(
                                                    "w-full bg-card/60 border rounded-xl px-3 py-1 text-xs font-bold focus:outline-none h-8 transition-all",
                                                    ipError ? "border-rose-500 focus:border-rose-500" : "border-border/40 focus:border-primary"
                                                )}
                                                value={getFeatures().staticIp || ""}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    updateFeature('staticIp', val);
                                                    const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
                                                    if (val && !ipPattern.test(val.trim())) {
                                                        setIpError(t('staticIpInvalid') || "عنوان IP غير صالح");
                                                    } else {
                                                        setIpError(null);
                                                    }
                                                }}
                                                placeholder={t('staticIpPlaceholder') || "192.168.1.6"}
                                            />
                                            {ipError && (
                                                <span className="text-[10px] text-rose-500 font-bold block mt-0.5 ps-1">{ipError}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sticky Save Button Bar */}
                        <div className="sticky bottom-0 bg-card/90 backdrop-blur-md p-2 rounded-xl border border-border/50 flex justify-end shadow-lg z-20">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="inline-flex items-center justify-center gap-2 bg-primary px-6 h-8 rounded-xl text-white font-bold text-xs transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 shadow-xs"
                            >
                                {saving ? (
                                    <span className="flex items-center gap-1.5 animate-pulse">
                                       <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                                       {t('saving')}
                                    </span>
                                ) : (
                                    <>
                                        <Save className="w-3.5 h-3.5" />
                                        <span>{t('save')}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
