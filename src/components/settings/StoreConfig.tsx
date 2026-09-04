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

interface StoreSettingsData {
    id?: string;
    name?: string;
    currency?: string;
    phone?: string;
    address?: string;
    vatNumber?: string;
    taxNumber?: string;
    taxRate?: string | number;
    receiptHeader?: string;
    receiptFooter?: string;
    logoUrl?: string | null;
    features?: string | Record<string, unknown>;
    locationLat?: string | number;
    locationLng?: string | number;
    locationRadius?: string | number;
    autoPrint?: boolean;
    autoPrintTicket?: boolean;
    autoPrintEngineerCopy?: boolean;
    allowNegativeStock?: boolean;
    blindCloseEnabled?: boolean;
    bridgeIpAddress?: string;
}

export default function StoreConfig({ settings, hideModules = false }: { settings: StoreSettingsData, hideModules?: boolean }) {
    const [form, setForm] = useState<StoreSettingsData>(settings || {});
    const [saving, setSaving] = useState(false);
    const [ipError, setIpError] = useState<string | null>(null);
    const t = useTranslations('StoreConfig');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getFeatures = () => {
        try {
            return typeof form.features === 'string' 
                ? JSON.parse(form.features || "{}") 
                : ((form.features as Record<string, unknown>) || {});
        } catch {
            return {};
        }
    };

    const updateFeature = (key: string, value: unknown) => {
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

    const handleChange = (key: string, val: unknown) => {
        setForm((prev) => ({ ...prev, [key]: val } as StoreSettingsData));
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
                taxRate: parseFloat(String(form.taxRate ?? 0)) || 0,
                locationLat: parseFloat(String(form.locationLat ?? 24.7136)) || 24.7136,
                locationLng: parseFloat(String(form.locationLng ?? 46.6753)) || 46.6753,
                locationRadius: parseInt(String(form.locationRadius ?? 500)) || 500
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
        <div className="max-w-5xl space-y-3 animate-in slide-in-from-bottom-4 duration-500">
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-3 sm:p-4 shadow-xl relative overflow-hidden group/container">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/container:bg-primary/10 transition-colors pointer-events-none" />

                {!hideModules ? (
                    <div className="space-y-3 max-h-[calc(100vh-140px)] overflow-y-auto pr-1 custom-scrollbar">
                        <div className="flex items-center justify-between pb-2 border-b border-border/40">
                            <div>
                                <h3 className="text-sm font-black flex items-center gap-2 text-foreground uppercase tracking-tight">
                                    <Shield className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" /> 
                                    {t('modulesManagement')}
                                </h3>
                                <p className="text-[11px] font-medium text-muted-foreground ml-6 opacity-75">{t('modulesManagementDesc')}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
                                            "flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200 group",
                                            isActive 
                                                ? `bg-card/70 dark:bg-card/50 border-border/70 ${module.glow} shadow-sm` 
                                                : "bg-background/40 border-border/20 text-muted-foreground opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                                        )}
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-bold text-foreground">{t(`modules.${module.id}.name`)}</span>
                                            <span className="text-[8px] font-semibold text-muted-foreground/60 tracking-wider uppercase">COMPONENT</span>
                                        </div>
                                        <Switch
                                            className={cn("scale-90 data-[state=checked]:"+module.color)}
                                            checked={isActive}
                                            onCheckedChange={(checked) => handleFeatureToggle(module.id, checked)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {/* Compact Header with Integrated Save Button */}
                        <div className="flex items-center justify-between pb-2 border-b border-border/30">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                    <Store className="w-4 h-4 text-cyan-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-tight text-foreground">{t('title')}</h3>
                                    <p className="text-[10px] text-muted-foreground leading-none">Casper POS & ERP Configuration</p>
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="inline-flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 px-4 h-7 rounded-lg text-white font-bold text-xs transition-all active:scale-[0.98] disabled:opacity-50 shadow-xs"
                            >
                                {saving ? (
                                    <span className="flex items-center gap-1.5 animate-pulse">
                                        <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white animate-spin" />
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

                        {/* 2-Column Bento Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-xs">
                            {/* Left Column (Identity & Location) */}
                            <div className="space-y-2">
                                {/* Card 1: Store Identity */}
                                <div className="p-2.5 rounded-xl bg-card/40 border border-border/40 space-y-2">
                                    <div className="flex items-center gap-2">
                                        {/* Inline Compact Logo Dropzone */}
                                        <div 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="relative w-12 h-12 rounded-xl border border-dashed border-border/60 hover:border-primary/60 cursor-pointer overflow-hidden bg-card/60 flex items-center justify-center shrink-0 group/logo transition-all"
                                            title={t('changeLogo')}
                                        >
                                            {form.logoUrl ? (
                                                <>
                                                    <img src={form.logoUrl || undefined} alt="Logo" className="w-full h-full object-contain p-0.5" />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-all flex items-center justify-center">
                                                        <X 
                                                            className="w-4 h-4 text-white hover:text-rose-400" 
                                                            onClick={(e) => { e.stopPropagation(); handleChange('logoUrl', null); }} 
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center text-primary/70 group-hover/logo:text-primary">
                                                    <Upload className="w-4 h-4" />
                                                    <span className="text-[8px] font-bold mt-0.5">Logo</span>
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

                                        {/* Store Name & Currency */}
                                        <div className="flex-1 grid grid-cols-3 gap-1.5">
                                            <div className="col-span-2 space-y-0.5">
                                                <Label className="text-[9px] font-bold text-muted-foreground uppercase">{t('storeName')}</Label>
                                                <div className="relative">
                                                    <Store size={11} className="absolute left-2 top-2 text-muted-foreground/50 pointer-events-none" />
                                                    <input
                                                        className="w-full bg-card/60 border border-border/40 rounded-lg pl-6 pr-2 py-0.5 text-xs font-bold focus:outline-none focus:border-primary h-7 transition-all"
                                                        value={form.name || ""}
                                                        onChange={e => handleChange('name', e.target.value)}
                                                        placeholder="Store Name"
                                                    />
                                                </div>
                                            </div>
                                            <div className="col-span-1 space-y-0.5">
                                                <Label className="text-[9px] font-bold text-muted-foreground uppercase">{t('currency')}</Label>
                                                <input
                                                    className="w-full bg-card/60 border border-border/40 rounded-lg px-2 py-0.5 text-xs font-bold focus:outline-none focus:border-primary h-7 text-center transition-all"
                                                    value={form.currency || "EGP"}
                                                    onChange={e => handleChange('currency', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Phone & Address in 1 row */}
                                    <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-border/20">
                                        <div className="space-y-0.5">
                                            <Label className="text-[9px] font-bold text-muted-foreground uppercase">{t('phone')}</Label>
                                            <div className="relative">
                                                <Phone size={11} className="absolute left-2 top-2 text-muted-foreground/50 pointer-events-none" />
                                                <input
                                                    className="w-full bg-card/60 border border-border/40 rounded-lg pl-6 pr-2 py-0.5 text-xs font-bold focus:outline-none focus:border-primary h-7 transition-all"
                                                    value={form.phone || ""}
                                                    onChange={e => handleChange('phone', e.target.value)}
                                                    placeholder="01xxxxxxxxx"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-0.5">
                                            <Label className="text-[9px] font-bold text-muted-foreground uppercase">{t('address')}</Label>
                                            <div className="relative">
                                                <MapPin size={11} className="absolute left-2 top-2 text-muted-foreground/50 pointer-events-none" />
                                                <input
                                                    className="w-full bg-card/60 border border-border/40 rounded-lg pl-6 pr-2 py-0.5 text-xs font-bold focus:outline-none focus:border-primary h-7 transition-all"
                                                    value={form.address || ""}
                                                    onChange={e => handleChange('address', e.target.value)}
                                                    placeholder="City, Street..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card 2: Location Services (Compact 1-row) */}
                                <div className="p-2 rounded-xl bg-card/40 border border-border/40 space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-[10px] font-bold uppercase text-foreground">{t('locationTitle')}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        <div className="space-y-0.5">
                                            <Label className="text-[8px] font-bold text-muted-foreground uppercase">{t('latitude')}</Label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="w-full bg-card/60 border border-border/40 rounded-lg px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-primary h-7"
                                                value={form.locationLat ?? 24.7136}
                                                onChange={e => handleChange('locationLat', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-0.5">
                                            <Label className="text-[8px] font-bold text-muted-foreground uppercase">{t('longitude')}</Label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="w-full bg-card/60 border border-border/40 rounded-lg px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-primary h-7"
                                                value={form.locationLng ?? 46.6753}
                                                onChange={e => handleChange('locationLng', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-0.5">
                                            <Label className="text-[8px] font-bold text-muted-foreground uppercase">{t('radius')} (m)</Label>
                                            <input
                                                type="number"
                                                className="w-full bg-card/60 border border-border/40 rounded-lg px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-primary h-7"
                                                value={form.locationRadius ?? 500}
                                                onChange={e => handleChange('locationRadius', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Card 3: Hardware Integration */}
                                <div className="p-2 rounded-xl bg-card/40 border border-border/40 space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <Globe className="w-3.5 h-3.5 text-cyan-400" />
                                        <span className="text-[10px] font-bold uppercase text-foreground">{t('hardwareIntegration')}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <span className="text-[11px] font-bold text-foreground truncate pr-1">{t('speedPrintToggle') || "الطباعة السريعة"}</span>
                                            <Switch
                                                className="scale-75"
                                                checked={getFeatures().speedPrintEnabled === true}
                                                onCheckedChange={(checked) => updateFeature('speedPrintEnabled', checked)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <span className="text-[11px] font-bold text-foreground truncate pr-1">{t('manualIpToggle') || "تثبيت IP"}</span>
                                            <Switch
                                                className="scale-75"
                                                checked={getFeatures().manualIpEnabled === true}
                                                onCheckedChange={(checked) => updateFeature('manualIpEnabled', checked)}
                                            />
                                        </div>
                                    </div>
                                    {getFeatures().manualIpEnabled === true && (
                                        <div className="pt-1 border-t border-border/20">
                                            <input
                                                type="text"
                                                className={cn(
                                                    "w-full bg-card/60 border rounded-lg px-2.5 py-0.5 text-xs font-mono focus:outline-none h-7",
                                                    ipError ? "border-rose-500" : "border-border/40 focus:border-primary"
                                                )}
                                                value={getFeatures().staticIp || ""}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    updateFeature('staticIp', val);
                                                    const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
                                                    if (val && !ipPattern.test(val.trim())) {
                                                        setIpError(t('staticIpInvalid') || "IP غير صالح");
                                                    } else {
                                                        setIpError(null);
                                                    }
                                                }}
                                                placeholder={t('staticIpPlaceholder') || "192.168.1.6"}
                                            />
                                            {ipError && (
                                                <span className="text-[9px] text-rose-500 font-bold block mt-0.5">{ipError}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column (Policies: Tax & Inventory) */}
                            <div className="space-y-2">
                                {/* Card 4: Tax & Printing Policies */}
                                <div className="p-2 rounded-xl bg-card/40 border border-border/40 space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <Receipt className="w-3.5 h-3.5 text-purple-400" />
                                        <span className="text-[10px] font-bold uppercase text-foreground">{t('taxTitle')}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <span className="text-[11px] font-bold text-foreground truncate pr-1">{t('enableTax')}</span>
                                            <Switch
                                                className="scale-75"
                                                checked={Number(form.taxRate) > 0}
                                                onCheckedChange={(c) => handleChange('taxRate', c ? 14.0 : 0)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <span className="text-[11px] font-bold text-foreground truncate pr-1">{t('autoPrint')}</span>
                                            <Switch
                                                className="scale-75"
                                                checked={form.autoPrint || false}
                                                onCheckedChange={(c) => handleChange('autoPrint', c)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <span className="text-[11px] font-bold text-foreground truncate pr-1">{t('autoPrintTicket')}</span>
                                            <Switch
                                                className="scale-75"
                                                checked={form.autoPrintTicket || false}
                                                onCheckedChange={(c) => handleChange('autoPrintTicket', c)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <span className="text-[11px] font-bold text-foreground truncate pr-1">{t('autoPrintEngineerCopy')}</span>
                                            <Switch
                                                className="scale-75"
                                                checked={form.autoPrintEngineerCopy || false}
                                                onCheckedChange={(c) => handleChange('autoPrintEngineerCopy', c)}
                                            />
                                        </div>
                                    </div>

                                    {/* Inline VAT & Tax Rate when Tax is Enabled */}
                                    {Number(form.taxRate) > 0 && (
                                        <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                            <div className="col-span-2 space-y-0.5">
                                                <Label className="text-[8px] font-bold text-muted-foreground uppercase">{t('vatNumber')}</Label>
                                                <input
                                                    className="w-full bg-card/70 border border-border/40 rounded-md px-2 py-0.5 text-xs font-mono font-bold focus:outline-none focus:border-indigo-500 h-6"
                                                    value={form.vatNumber || ""}
                                                    onChange={e => handleChange('vatNumber', e.target.value)}
                                                    placeholder="310000000000003"
                                                />
                                            </div>
                                            <div className="col-span-1 space-y-0.5">
                                                <Label className="text-[8px] font-bold text-muted-foreground uppercase">{t('taxRate')} %</Label>
                                                <input
                                                    type="number"
                                                    className="w-full bg-card/70 border border-border/40 rounded-md px-2 py-0.5 text-xs font-mono font-bold focus:outline-none focus:border-indigo-500 h-6 text-center"
                                                    value={form.taxRate || 0}
                                                    onChange={e => handleChange('taxRate', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Card 5: Inventory & Operational Policies */}
                                <div className="p-2 rounded-xl bg-card/40 border border-border/40 space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <History className="w-3.5 h-3.5 text-orange-400" />
                                        <span className="text-[10px] font-bold uppercase text-foreground">{t('inventoryPolicy')}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <div className="pr-1">
                                                <span className="text-[11px] font-bold text-foreground block leading-tight">{t('allowNegativeStock')}</span>
                                                <span className="text-[9px] text-muted-foreground">{t('allowNegativeStockDesc')}</span>
                                            </div>
                                            <Switch
                                                className="scale-75"
                                                checked={form.allowNegativeStock || false}
                                                onCheckedChange={(c) => handleChange('allowNegativeStock', c)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <div className="pr-1">
                                                <span className="text-[11px] font-bold text-foreground block leading-tight">{t('hideLocationsTab')}</span>
                                                <span className="text-[9px] text-muted-foreground">{t('hideLocationsTabDesc')}</span>
                                            </div>
                                            <Switch
                                                className="scale-75"
                                                checked={getFeatureValue('hideLocationsTab') === true}
                                                onCheckedChange={(c) => handleFeatureToggle('hideLocationsTab', c)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/30 bg-card/50">
                                            <div className="pr-1">
                                                <span className="text-[11px] font-bold text-foreground block leading-tight">Blind Close Shift</span>
                                                <span className="text-[9px] text-muted-foreground">Hide cash totals during shift close</span>
                                            </div>
                                            <Switch
                                                className="scale-75"
                                                checked={form.blindCloseEnabled !== false}
                                                onCheckedChange={(c) => handleChange('blindCloseEnabled', c)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
