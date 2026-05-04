"use client";

import { MessageCircle, Save, RotateCcw, Info } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { updateStoreSettings } from "@/actions/settings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { DEFAULT_WHATSAPP_TEMPLATES } from "@/lib/whatsapp-templates";

const DEFAULT_READY_TEMPLATE = "عميلنا العزيز، جهازك رقم {barcode} جاهز للاستلام. التكلفة الإجمالية: {price} ج.م. شكراً لتعاملك مع Casper POS.";
const DEFAULT_HAPPY_TEMPLATE = "شكراً لزيارتك! 🙏 تم تسليم جهازك رقم {barcode} وإغلاق الطلب بنجاح. ننتظر تقييمك لخدمتنا. يومك سعيد!";

interface MessagingSettingsProps {
    initialTemplates: { 
        NEW?: string; 
        READY?: string; 
        PAID_DELIVERED?: string;
        enabled?: {
            NEW?: boolean;
            READY?: boolean;
            PAID_DELIVERED?: boolean;
        }
    } | null;
    currentFeatures: string;
}

import WhatsAppConnection from "./WhatsAppConnection";

export default function MessagingSettings({ initialTemplates, currentFeatures }: MessagingSettingsProps) {
    const [templates, setTemplates] = useState({
        NEW: initialTemplates?.NEW || DEFAULT_WHATSAPP_TEMPLATES.NEW.ar,
        READY: initialTemplates?.READY || DEFAULT_READY_TEMPLATE,
        PAID_DELIVERED: initialTemplates?.PAID_DELIVERED || DEFAULT_HAPPY_TEMPLATE
    });
    const [enabled, setEnabled] = useState({
        NEW: initialTemplates?.enabled?.NEW ?? true,
        READY: initialTemplates?.enabled?.READY ?? true,
        PAID_DELIVERED: initialTemplates?.enabled?.PAID_DELIVERED ?? true
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (templates.NEW.length < 10 || templates.READY.length < 10 || templates.PAID_DELIVERED.length < 10) {
            toast.error("الرسالة قصيرة جداً، يرجى كتابة 10 أحرف على الأقل");
            return;
        }

        setSaving(true);
        try {
            const result = await updateStoreSettings({
                whatsappTemplates: {
                    ...templates,
                    enabled
                }
            });

            if (result?.success) {
                toast.success("تم حفظ إعدادات المراسلة بنجاح");
            } else {
                toast.error(result?.error || "حدث خطأ أثناء الحفظ");
            }
        } catch (error) {
            toast.error("حدث خطأ غير متوقع");
        } finally {
            setSaving(false);
        }
    };

    const handleReset = (key: 'NEW' | 'READY' | 'PAID_DELIVERED') => {
        let defaultValue = '';
        if (key === 'NEW') defaultValue = DEFAULT_WHATSAPP_TEMPLATES.NEW.ar;
        else if (key === 'READY') defaultValue = DEFAULT_READY_TEMPLATE;
        else defaultValue = DEFAULT_HAPPY_TEMPLATE;

        setTemplates(prev => ({ ...prev, [key]: defaultValue }));
        toast.info("تمت استعادة النص الافتراضي - لا تنسى الحفظ");
    };

    return (
        <div className="max-w-4xl space-y-10 animate-in slide-in-from-bottom-4 duration-700 pb-20">
            <WhatsAppConnection />
            
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-[2.5rem] p-4 sm:p-10 shadow-xl relative overflow-hidden group/container">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/container:bg-primary/10 transition-colors" />

                <div className="space-y-12">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2.5 bg-green-500/10 rounded-xl border border-green-500/20">
                            <MessageCircle className="w-5 h-5 text-green-400" />
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">إعدادات المراسلة (WhatsApp)</h3>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">تخصيص قوالب الرسائل التلقائية</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-10">
                        {/* Welcome Message */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Switch 
                                        checked={enabled.NEW}
                                        onCheckedChange={(checked) => setEnabled(prev => ({ ...prev, NEW: checked }))}
                                        className="data-[state=checked]:bg-primary"
                                    />
                                    <Label className="text-sm font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                                        رسالة الترحيب عند فتح التذكرة
                                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase">Welcome (NEW)</span>
                                    </Label>
                                </div>
                                <button 
                                    onClick={() => handleReset('NEW')}
                                    className="text-[10px] font-black text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors uppercase tracking-widest"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    استعادة الافتراضي
                                </button>
                            </div>
                            <textarea
                                dir="rtl"
                                rows={5}
                                className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-3xl py-4 px-6 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-inner resize-none text-right"
                                value={templates.NEW}
                                onChange={e => setTemplates(prev => ({ ...prev, NEW: e.target.value }))}
                                placeholder="اكتب رسالة الترحيب هنا..."
                            />
                            <div className="flex justify-end">
                                <span className={cn(
                                    "text-[10px] font-bold px-2 py-1 rounded-md",
                                    templates.NEW.length > 500 ? "bg-rose-500/10 text-rose-500" : "bg-muted text-muted-foreground"
                                )}>
                                    {templates.NEW.length} / 500 حرف
                                </span>
                            </div>
                        </div>

                        {/* Ready Message */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Switch 
                                        checked={enabled.READY}
                                        onCheckedChange={(checked) => setEnabled(prev => ({ ...prev, READY: checked }))}
                                        className="data-[state=checked]:bg-green-500"
                                    />
                                    <Label className="text-sm font-black text-foreground uppercase tracking-tight flex items-center gap-2 text-green-500">
                                        رسالة الجاهزية للاستلام
                                        <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full font-bold uppercase">Ready message</span>
                                    </Label>
                                </div>
                                <button 
                                    onClick={() => handleReset('READY')}
                                    className="text-[10px] font-black text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors uppercase tracking-widest"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    استعادة الافتراضي
                                </button>
                            </div>
                            <textarea
                                dir="rtl"
                                rows={4}
                                className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-3xl py-4 px-6 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-inner resize-none text-right"
                                value={templates.READY}
                                onChange={e => setTemplates(prev => ({ ...prev, READY: e.target.value }))}
                                placeholder="اكتب رسالة الجاهزية هنا..."
                            />
                            <div className="flex justify-end">
                                <span className={cn(
                                    "text-[10px] font-bold px-2 py-1 rounded-md",
                                    templates.READY.length > 500 ? "bg-rose-500/10 text-rose-500" : "bg-muted text-muted-foreground"
                                )}>
                                    {templates.READY.length} / 500 حرف
                                </span>
                            </div>
                        </div>

                        {/* Happy Message */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Switch 
                                        checked={enabled.PAID_DELIVERED}
                                        onCheckedChange={(checked) => setEnabled(prev => ({ ...prev, PAID_DELIVERED: checked }))}
                                        className="data-[state=checked]:bg-cyan-500"
                                    />
                                    <Label className="text-sm font-black text-foreground uppercase tracking-tight flex items-center gap-2 text-cyan-500">
                                        رسالة "شكراً" بعد تسليم الجهاز
                                        <span className="text-[10px] bg-cyan-500/10 text-cyan-500 px-2 py-0.5 rounded-full font-bold uppercase">Happy message</span>
                                    </Label>
                                </div>
                                <button 
                                    onClick={() => handleReset('PAID_DELIVERED')}
                                    className="text-[10px] font-black text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors uppercase tracking-widest"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    استعادة الافتراضي
                                </button>
                            </div>
                            <textarea
                                dir="rtl"
                                rows={4}
                                className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-3xl py-4 px-6 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-inner resize-none text-right"
                                value={templates.PAID_DELIVERED}
                                onChange={e => setTemplates(prev => ({ ...prev, PAID_DELIVERED: e.target.value }))}
                                placeholder="اكتب رسالة الشكر هنا..."
                            />
                            <div className="flex justify-end">
                                <span className={cn(
                                    "text-[10px] font-bold px-2 py-1 rounded-md",
                                    templates.PAID_DELIVERED.length > 500 ? "bg-rose-500/10 text-rose-500" : "bg-muted text-muted-foreground"
                                )}>
                                    {templates.PAID_DELIVERED.length} / 500 حرف
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Placeholder Reference Panel */}
                    <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                            <Info className="w-4 h-4" />
                            <h4 className="text-xs font-black uppercase tracking-widest">الأكواد المختصرة المتاحة</h4>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                            {[
                                { code: "{name}", label: "اسم العميل" },
                                { code: "{device}", label: "الجهاز" },
                                { code: "{barcode}", label: "رقم التذكرة" },
                                { code: "{price}", label: "التكلفة" },
                                { code: "{issue}", label: "وصف العطل" },
                            ].map((item) => (
                                <div key={item.code} className="space-y-1">
                                    <code className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">{item.code}</code>
                                    <p className="text-[10px] font-bold text-muted-foreground">{item.label}</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-[9px] text-muted-foreground font-medium italic">* سيتم استبدال هذه الأكواد بالبيانات الفعلية عند إرسال الرسالة.</p>
                    </div>
                </div>

                {/* Save Button */}
                <div className="pt-10 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="group relative inline-flex items-center justify-center gap-3 bg-primary px-10 py-4 rounded-2xl text-white font-black uppercase tracking-widest overflow-hidden transition-all hover:scale-[1.05] active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-primary/25"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                        {saving ? (
                            <span className="flex items-center gap-2 animate-pulse">
                                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                                جارِ الحفظ...
                            </span>
                        ) : (
                            <>
                                <Save className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                <span>حفظ التغييرات</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
