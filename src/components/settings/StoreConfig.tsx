"use client";

import { useState } from "react";
import { Store, Phone, MapPin, Receipt, Save } from "lucide-react";
import { updateStoreSettings } from "@/actions/settings";
import { toast } from "sonner"; // Assuming sonner is used for toasts, if not, I'll switch to alert for now. Wait, PrinterSettings used toast from sonner.

export default function StoreConfig({ settings }: { settings: any }) {
    const [form, setForm] = useState(settings || {});
    const [saving, setSaving] = useState(false);
    const { useTranslations } = require('@/lib/i18n-mock');
    const t = useTranslations('StoreConfig');

    const handleChange = (key: string, val: any) => {
        setForm((prev: any) => ({ ...prev, [key]: val }));
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
        <div className="max-w-2xl space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="glass-card p-6 space-y-6 border border-white/10 bg-black/20 backdrop-blur-xl rounded-xl">
                <h3 className="font-bold flex items-center gap-2 text-lg text-white">
                    <Store className="w-5 h-5 text-cyan-400" /> {t('title')}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('storeName')}</label>
                        <input
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            value={form.name || ""}
                            onChange={e => handleChange('name', e.target.value)}
                            placeholder="My Awesome Store"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('currency')}</label>
                        <input
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            value={form.currency || "SAR"}
                            onChange={e => handleChange('currency', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('phone')}</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                            <input
                                className="w-full bg-black/40 border border-white/10 rounded-lg p-2 pl-10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                value={form.phone || ""}
                                onChange={e => handleChange('phone', e.target.value)}
                                placeholder="05xxxxxxxx"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('address')}</label>
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
                            <label className="text-sm font-medium text-white">{t('enableTax')}</label>
                            <p className="text-xs text-zinc-400">{t('enableTaxDesc')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={Number(form.taxRate) > 0}
                                onChange={(e) => {
                                    const enabled = e.target.checked;
                                    handleChange('taxRate', enabled ? 15.0 : 0);
                                }}
                            />
                            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                    </div>

                    {Number(form.taxRate) > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                            <div>
                                <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('vatNumber')}</label>
                                <input
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                    value={form.vatNumber || ""}
                                    onChange={e => handleChange('vatNumber', e.target.value)}
                                    placeholder="310000000000003"
                                />
                                <p className="text-[10px] text-zinc-500 mt-1">{t('vatNote')}</p>
                            </div>
                            <div>
                                <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('taxRate')}</label>
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
                    <MapPin className="w-5 h-5 text-green-400" /> {t('locationTitle')}
                </h3>
                <div className="p-4 bg-zinc-900/50 rounded-lg border border-white/10 text-sm text-zinc-400 mb-4">
                    {t('locationDesc')}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('latitude')}</label>
                        <input
                            type="number"
                            step="any"
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            value={form.locationLat ?? 24.7136}
                            onChange={e => handleChange('locationLat', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('longitude')}</label>
                        <input
                            type="number"
                            step="any"
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            value={form.locationLng ?? 46.6753}
                            onChange={e => handleChange('locationLng', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">{t('radius')}</label>
                        <input
                            type="number"
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            value={form.locationRadius ?? 500}
                            onChange={e => handleChange('locationRadius', e.target.value)}
                        />
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2 mt-6 transition-colors"
                >
                    {saving ? t('saving') : <><Save className="w-4 h-4" /> {t('save')}</>}
                </button>
            </div>
        </div>
    );
}
