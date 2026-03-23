"use client";

import { Store, Phone, MapPin, Receipt, Save, History, Shield, Image as ImageIcon, Upload, X } from "lucide-react";
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
            return features[featureId] !== false; // Default to true
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
                console.error('[StoreConfig] Save failed:', result?.error);
                toast.error(result?.error || t('error'));
            }
        } catch (error) {
            console.error('[StoreConfig] Save exception:', error);
            toast.error(t('error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-2xl space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-10">
            <div className="glass-card p-6 space-y-6 border border-white/10 bg-black/20 backdrop-blur-xl rounded-xl">
                {!hideModules ? (
                   <>
                    <h3 className="font-bold flex items-center gap-2 text-lg text-white">
                        <Shield className="w-5 h-5 text-emerald-400" /> {t('modulesManagement')}
                    </h3>
                    <p className="text-xs text-zinc-400 px-1">{t('modulesManagementDesc')}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                            { id: 'dashboard', color: 'data-[state=checked]:bg-blue-400' },
                            { id: 'pos', color: 'data-[state=checked]:bg-rose-500' },
                            { id: 'maintenance', color: 'data-[state=checked]:bg-violet-500' },
                            { id: 'maintenance_dashboard', color: 'data-[state=checked]:bg-fuchsia-500' },
                            { id: 'hr', color: 'data-[state=checked]:bg-cyan-500' },
                            { id: 'inventory', color: 'data-[state=checked]:bg-blue-500' },
                            { id: 'purchasing', color: 'data-[state=checked]:bg-orange-500' },
                            { id: 'treasury', color: 'data-[state=checked]:bg-emerald-500' },
                            { id: 'customers', color: 'data-[state=checked]:bg-pink-500' },
                            { id: 'reports', color: 'data-[state=checked]:bg-indigo-500' },
                            { id: 'returns', color: 'data-[state=checked]:bg-amber-500' },
                            { id: 'logs', color: 'data-[state=checked]:bg-slate-500' },
                            { id: 'pos_price_tiers', color: 'data-[state=checked]:bg-cyan-600' },
                        ].map((module) => (
                            <div key={module.id} className="flex items-center justify-between p-3 border border-white/5 rounded-xl bg-zinc-900/30 group hover:bg-zinc-900/50 transition-colors">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white uppercase">{t(`modules.${module.id}.name`)}</span>
                                    <span className="text-[10px] text-zinc-500">{t(`modules.${module.id}.desc`)}</span>
                                </div>
                                <Switch
                                    className={module.color}
                                    checked={getFeatureValue(module.id)}
                                    onCheckedChange={(checked) => handleFeatureToggle(module.id, checked)}
                                />
                            </div>
                        ))}
                    </div>
                   </>
                ) : (
                    <>
                        <h3 className="font-bold flex items-center gap-2 text-lg text-white">
                            <Store className="w-5 h-5 text-cyan-400" /> {t('title')}
                        </h3>

                        {/* Logo Upload Section */}
                        <div className="space-y-2 mb-6 p-4 border border-white/10 rounded-xl bg-white/5 relative overflow-hidden group">
                            <Label className="text-xs text-zinc-400 uppercase font-bold flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-cyan-400" /> {t('storeLogo')}
                            </Label>
                            <div className="flex items-center gap-6">
                                <div className="relative w-24 h-24 bg-black/40 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center overflow-hidden transition-all group-hover:border-cyan-500/50">
                                    {form.logoUrl ? (
                                        <>
                                            <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                                            <button 
                                                type="button"
                                                onClick={() => handleChange('logoUrl', null)}
                                                className="absolute top-1 right-1 p-1 bg-red-500 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 text-zinc-600">
                                            <ImageIcon className="w-8 h-8 opacity-20" />
                                            <span className="text-[10px] font-bold">No Logo</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 space-y-3">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                                        >
                                            <Upload className="w-4 h-4 text-cyan-400" /> {t('browseLogo')}
                                        </button>
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            className="hidden" 
                                            accept="image/*" 
                                            onChange={handleFileChange}
                                        />
                                    </div>
                                    <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                                        {t('logoNote')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-400 uppercase font-bold">{t('storeName')}</Label>
                                <input
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                    value={form.name || ""}
                                    onChange={e => handleChange('name', e.target.value)}
                                    placeholder="My Awesome Store"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-400 uppercase font-bold">{t('currency')}</Label>
                                <input
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                    value={form.currency || "EGP"}
                                    onChange={e => handleChange('currency', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-400 uppercase font-bold">{t('phone')}</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                                    <input
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 pl-10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                        value={form.phone || ""}
                                        onChange={e => handleChange('phone', e.target.value)}
                                        placeholder="01xxxxxxxxx"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-400 uppercase font-bold">{t('address')}</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                                    <input
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 pl-10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                        value={form.address || ""}
                                        onChange={e => handleChange('address', e.target.value)}
                                        placeholder="City, Street..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-white/10 pt-4" />

                        <h3 className="font-bold flex items-center gap-2 text-lg text-white">
                            <Receipt className="w-5 h-5 text-purple-400" /> {t('taxTitle')}
                        </h3>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 border border-white/10 rounded-xl bg-white/5">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium text-white">{t('enableTax')}</Label>
                                    <p className="text-xs text-zinc-400">{t('enableTaxDesc')}</p>
                                </div>
                                <Switch
                                    checked={Number(form.taxRate) > 0}
                                    onCheckedChange={(checked) => handleChange('taxRate', checked ? 14.0 : 0)}
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 border border-white/10 rounded-xl bg-white/5">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium text-white">{t('autoPrint')}</Label>
                                    <p className="text-xs text-zinc-400">{t('autoPrintDesc')}</p>
                                </div>
                                <Switch
                                    checked={form.autoPrint || false}
                                    onCheckedChange={(checked) => handleChange('autoPrint', checked)}
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 border border-white/10 rounded-xl bg-white/5">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium text-white">{t('autoPrintTicket')}</Label>
                                    <p className="text-xs text-zinc-400">{t('autoPrintTicketDesc')}</p>
                                </div>
                                <Switch
                                    checked={form.autoPrintTicket || false}
                                    onCheckedChange={(checked) => handleChange('autoPrintTicket', checked)}
                                />
                            </div>

                            {Number(form.taxRate) > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-zinc-400 uppercase font-bold">{t('vatNumber')}</Label>
                                        <input
                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                            value={form.vatNumber || ""}
                                            onChange={e => handleChange('vatNumber', e.target.value)}
                                            placeholder="310000000000003"
                                        />
                                        <p className="text-[10px] text-zinc-500">{t('vatNote')}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-zinc-400 uppercase font-bold">{t('taxRate')}</Label>
                                        <input
                                            type="number"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                            value={form.taxRate || 0}
                                            onChange={e => handleChange('taxRate', e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-white/10 pt-4" />

                        <h3 className="font-bold flex items-center gap-2 text-lg text-white">
                            <History className="w-5 h-5 text-orange-400" /> {t('inventoryPolicy')}
                        </h3>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 border border-white/10 rounded-xl bg-white/5">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium text-white">{t('allowNegativeStock')}</Label>
                                    <p className="text-xs text-zinc-400">{t('allowNegativeStockDesc')}</p>
                                </div>
                                <Switch
                                    checked={form.allowNegativeStock || false}
                                    onCheckedChange={(checked) => handleChange('allowNegativeStock', checked)}
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 border border-white/10 rounded-xl bg-white/5">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium text-white">{t('hideLocationsTab')}</Label>
                                    <p className="text-xs text-zinc-400">{t('hideLocationsTabDesc')}</p>
                                </div>
                                <Switch
                                    checked={getFeatureValue('hideLocationsTab') === true}
                                    onCheckedChange={(checked) => handleFeatureToggle('hideLocationsTab', checked)}
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 border border-white/10 rounded-xl bg-white/5">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium text-white">Blind Close Shift (الإغلاق الأعمى)</Label>
                                    <p className="text-xs text-zinc-400">Hide expected cash totals from cashiers during shift close for better auditing.</p>
                                </div>
                                <Switch
                                    checked={form.blindCloseEnabled !== false}
                                    onCheckedChange={(checked) => handleChange('blindCloseEnabled', checked)}
                                />
                            </div>
                        </div>

                        <div className="border-t border-white/10 pt-4" />

                        <h3 className="font-bold flex items-center gap-2 text-lg text-white">
                            <MapPin className="w-5 h-5 text-green-400" /> {t('locationTitle')}
                        </h3>
                        <div className="p-4 bg-zinc-900/50 rounded-lg border border-white/10 text-sm text-zinc-400 mb-4">
                            {t('locationDesc')}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-400 uppercase font-bold">{t('latitude')}</Label>
                                <input
                                    type="number"
                                    step="any"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                    value={form.locationLat ?? 24.7136}
                                    onChange={e => handleChange('locationLat', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-400 uppercase font-bold">{t('longitude')}</Label>
                                <input
                                    type="number"
                                    step="any"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                    value={form.locationLng ?? 46.6753}
                                    onChange={e => handleChange('locationLng', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-400 uppercase font-bold">{t('radius')}</Label>
                                <input
                                    type="number"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                    value={form.locationRadius ?? 500}
                                    onChange={e => handleChange('locationRadius', e.target.value)}
                                />
                            </div>
                        </div>
                    </>
                )}

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2 mt-6 transition-colors shadow-lg shadow-cyan-900/20"
                >
                    {saving ? t('saving') : <><Save className="w-4 h-4" /> {t('save')}</>}
                </button>
            </div>
        </div>
    );
}
