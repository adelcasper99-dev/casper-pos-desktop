"use client";

import { Store, Phone, MapPin, Receipt, Save, History, Shield, Image as ImageIcon, Upload, X, CheckCircle2 } from "lucide-react";
import { useState, useRef } from "react";
import { updateStoreSettings } from "@/actions/settings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTranslations } from "@/lib/i18n-mock";

export default function StoreConfig({ settings, hideModules = false }: { settings: any, hideModules?: boolean }) {
    const [form, setForm] = useState(settings || {});
    const [saving, setSaving] = useState(false);
    const t = useTranslations('StoreConfig');
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        setSaving(true);
        try {
            const payload = {
                ...form,
                taxRate: parseFloat(form.taxRate) || 0,
                locationLat: parseFloat(form.locationLat) || 24.7136,
                locationLng: parseFloat(form.locationLng) || 46.6753,
                locationRadius: parseInt(form.locationRadius) || 500
            };
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
                    <div className="space-y-12">
                        {/* Store Identity */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                                    <Store className="w-5 h-5 text-cyan-400" />
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{t('title')}</h3>
                            </div>

                            <div className="flex flex-col md:flex-row gap-10 items-start">
                                {/* Logo Dropzone */}
                                <div className="space-y-3 shrink-0">
                                    <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('storeLogo')}</Label>
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="relative w-40 h-40 group/logo cursor-pointer"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent blur-2xl opacity-0 group-hover/logo:opacity-100 transition-opacity" />
                                        <div className={cn(
                                            "w-full h-full rounded-[2.5rem] border-2 border-dashed flex flex-col items-center justify-center p-2 transition-all relative z-10 overflow-hidden bg-background/60 dark:bg-background/40 backdrop-blur-xl",
                                            form.logoUrl ? "border-primary/40 bg-primary/5" : "border-border/60 hover:border-primary/60"
                                        )}>
                                            {form.logoUrl ? (
                                                <div className="relative w-full h-full p-2">
                                                    <img src={form.logoUrl} alt="Store Logo" className="w-full h-full object-contain" />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-all flex items-center justify-center backdrop-blur-sm rounded-3xl">
                                                        <X 
                                                            className="w-8 h-8 text-white hover:text-rose-400 transition-colors" 
                                                            onClick={(e) => { e.stopPropagation(); handleChange('logoUrl', null); }} 
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 group/upload cursor-pointer hover:bg-primary/10 transition-all flex items-center justify-center">
                                                        <p className="text-xs font-black text-primary uppercase tracking-widest">{t('changeLogo')}</p>
                                                    </div>
                                                </>
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
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
                                    <div className="space-y-2 group">
                                        <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1 group-focus-within:text-primary transition-colors">{t('storeName')}</Label>
                                        <div className="relative">
                                           <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                              <Store size={14} className="text-muted-foreground/40" />
                                           </div>
                                            <input
                                                className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-3 pl-10 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all"
                                                value={form.name || ""}
                                                onChange={e => handleChange('name', e.target.value)}
                                                placeholder="My Awesome Store"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2 group">
                                        <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('currency')}</Label>
                                        <input
                                            className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all"
                                            value={form.currency || "EGP"}
                                            onChange={e => handleChange('currency', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2 group">
                                        <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('phone')}</Label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                               <Phone size={14} className="text-muted-foreground/40" />
                                            </div>
                                            <input
                                                className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-3 pl-10 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all"
                                                value={form.phone || ""}
                                                onChange={e => handleChange('phone', e.target.value)}
                                                placeholder="01xxxxxxxxx"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2 group">
                                        <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('address')}</Label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                               <MapPin size={14} className="text-muted-foreground/40" />
                                            </div>
                                            <input
                                                className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-3 pl-10 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all"
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
                        <div className="space-y-8 pt-6 border-t border-border/20">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/20">
                                    <Receipt className="w-5 h-5 text-purple-400" />
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{t('taxTitle')}</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    { id: 'enableTax', label: t('enableTax'), desc: t('enableTaxDesc'), val: Number(form.taxRate) > 0, fn: (c: boolean) => handleChange('taxRate', c ? 14.0 : 0) },
                                    { id: 'autoPrint', label: t('autoPrint'), desc: t('autoPrintDesc'), val: form.autoPrint || false, fn: (c: boolean) => handleChange('autoPrint', c) },
                                    { id: 'autoPrintTicket', label: t('autoPrintTicket'), desc: t('autoPrintTicketDesc'), val: form.autoPrintTicket || false, fn: (c: boolean) => handleChange('autoPrintTicket', c) },
                                    { id: 'autoPrintEngineerCopy', label: t('autoPrintEngineerCopy'), desc: t('autoPrintEngineerCopyDesc'), val: form.autoPrintEngineerCopy || false, fn: (c: boolean) => handleChange('autoPrintEngineerCopy', c) },
                                ].map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-5 border border-border/40 rounded-2xl bg-card/60 dark:bg-card/40 transition-all hover:bg-card/80">
                                        <div className="space-y-0.5 max-w-[70%]">
                                            <Label className="text-xs font-black uppercase tracking-widest text-foreground">{item.label}</Label>
                                            <p className="text-[10px] text-muted-foreground font-medium leading-tight opacity-70">{item.desc}</p>
                                        </div>
                                        <Switch
                                            checked={item.val}
                                            onCheckedChange={item.fn}
                                        />
                                    </div>
                                ))}
                            </div>

                            {Number(form.taxRate) > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 animate-in fade-in slide-in-from-top-4">
                                    <div className="space-y-2 group">
                                        <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('vatNumber')}</Label>
                                        <input
                                            className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl p-3 text-sm font-black focus:outline-none focus:border-indigo-500/50 shadow-sm"
                                            value={form.vatNumber || ""}
                                            onChange={e => handleChange('vatNumber', e.target.value)}
                                            placeholder="310000000000003"
                                        />
                                    </div>
                                    <div className="space-y-2 group">
                                        <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('taxRate')}</Label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl p-3 text-sm font-black focus:outline-none focus:border-indigo-500/50 shadow-sm pr-10"
                                                value={form.taxRate || 0}
                                                onChange={e => handleChange('taxRate', e.target.value)}
                                            />
                                            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                               <span className="font-black text-indigo-400 opacity-60 text-xs">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Inventory & Operational Policy */}
                        <div className="space-y-8 pt-6 border-t border-border/20 group/policy">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-orange-500/10 rounded-xl border border-orange-500/20">
                                    <History className="w-5 h-5 text-orange-400" />
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{t('inventoryPolicy')}</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    { id: 'allowNegativeStock', label: t('allowNegativeStock'), desc: t('allowNegativeStockDesc'), val: form.allowNegativeStock || false, fn: (c: boolean) => handleChange('allowNegativeStock', c) },
                                    { id: 'hideLocationsTab', label: t('hideLocationsTab'), desc: t('hideLocationsTabDesc'), val: getFeatureValue('hideLocationsTab') === true, fn: (c: boolean) => handleFeatureToggle('hideLocationsTab', c) },
                                    { id: 'unitVisibility', label: "إظهار الوحدات", desc: "إظهار أو إخفاء وحدات القياس في النظام (الافتراضي مفعل)", val: getFeatureValue('unitVisibility') !== false, fn: (c: boolean) => handleFeatureToggle('unitVisibility', c) },
                                    { id: 'blindCloseEnabled', label: "Blind Close Shift", desc: "Hide expected cash totals during shift close.", val: form.blindCloseEnabled !== false, fn: (c: boolean) => handleChange('blindCloseEnabled', c) },
                                ].map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-5 border border-border/40 rounded-2xl bg-card/60 dark:bg-card/40 transition-all hover:bg-card/80">
                                        <div className="space-y-0.5 max-w-[70%]">
                                            <Label className="text-xs font-black uppercase tracking-widest text-foreground">{item.label}</Label>
                                            <p className="text-[10px] text-muted-foreground font-medium leading-tight opacity-70">{item.desc}</p>
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
                        <div className="space-y-8 pt-6 border-t border-border/20">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                    <MapPin className="w-5 h-5 text-emerald-400" />
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{t('locationTitle')}</h3>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="space-y-2 lg:col-span-1">
                                    <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('latitude')}</Label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all"
                                        value={form.locationLat ?? 24.7136}
                                        onChange={e => handleChange('locationLat', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2 lg:col-span-1">
                                    <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('longitude')}</Label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all"
                                        value={form.locationLng ?? 46.6753}
                                        onChange={e => handleChange('locationLng', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2 lg:col-span-1">
                                    <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('radius')}</Label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all pe-12"
                                            value={form.locationRadius ?? 500}
                                            onChange={e => handleChange('locationRadius', e.target.value)}
                                        />
                                        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                            <span className="font-black text-primary/40 text-[10px] uppercase">Meters</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2 lg:col-span-1">
                                    <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">Sync Policy</Label>
                                    <div className="flex items-center gap-3 p-4 bg-background/40 rounded-2xl border border-border/40 h-[54px]">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] uppercase font-black tracking-widest text-foreground">Geo-fencing Active</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('invoiceHeader')}</Label>
                                    <textarea
                                        rows={3}
                                        className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-4 px-6 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-inner resize-none"
                                        placeholder="Text appears at top of receipts..."
                                        value={form.invoiceHeader || ""}
                                        onChange={e => handleChange('invoiceHeader', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ps-1">{t('invoiceFooter')}</Label>
                                    <textarea
                                        rows={3}
                                        className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-4 px-6 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-inner resize-none"
                                        placeholder="Text appears at bottom of receipts..."
                                        value={form.invoiceFooter || ""}
                                        onChange={e => handleChange('invoiceFooter', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Premium Save Button */}
                <div className="pt-10 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="group relative inline-flex items-center justify-center gap-3 bg-primary px-10 py-4 rounded-2xl text-white font-black uppercase tracking-widest overflow-hidden transition-all hover:scale-[1.05] active:scale-[0.98] disabled:opacity-50"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                        {saving ? (
                            <span className="flex items-center gap-2 animate-pulse">
                               <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                               {t('saving')}
                            </span>
                        ) : (
                            <>
                                <Save className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                <span>{t('save')}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
