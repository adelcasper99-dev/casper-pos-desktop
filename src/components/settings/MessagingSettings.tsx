"use client";

import { MessageCircle, Save, RotateCcw, Info, Check, Plus, User, Hash, Smartphone, DollarSign, Wrench, Eye } from "lucide-react";
import { useState, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { updateStoreSettings } from "@/actions/settings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { DEFAULT_WHATSAPP_TEMPLATES } from "@/lib/whatsapp-templates";
import WhatsAppConnection from "./WhatsAppConnection";

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

type TemplateKey = 'NEW' | 'READY' | 'PAID_DELIVERED';

interface BoxConfig {
    key: TemplateKey;
    title: string;
    subtitle: string;
    badge: string;
    badgeColor: string;
    borderColor: string;
    defaultText: string;
    sampleData: {
        name: string;
        device: string;
        barcode: string;
        price: string;
        issue: string;
    };
}

const TEMPLATE_BOXES: BoxConfig[] = [
    {
        key: 'NEW',
        title: 'رسالة الترحيب عند فتح التذكرة',
        subtitle: 'تُرسل تلقائياً للعميل فور تسجيل جهاز جديد بمركز الصيانة',
        badge: 'تذكرة جديدة',
        badgeColor: 'bg-primary/10 text-primary border-primary/20',
        borderColor: 'border-primary/30',
        defaultText: DEFAULT_WHATSAPP_TEMPLATES.NEW.ar,
        sampleData: {
            name: "أحمد محمود",
            device: "iPhone 13 Pro",
            barcode: "TK-1082",
            price: "450",
            issue: "تغيير شاشة + فحص بطارية"
        }
    },
    {
        key: 'READY',
        title: 'رسالة الجاهزية للاستلام',
        subtitle: 'تُرسل للعميل فور انتهاء الفني من تصليح الجهاز بنجاح',
        badge: 'جاهز للاستلام',
        badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        borderColor: 'border-emerald-500/30',
        defaultText: DEFAULT_READY_TEMPLATE,
        sampleData: {
            name: "محمد إبراهيم",
            device: "Samsung S23 Ultra",
            barcode: "TK-2041",
            price: "600",
            issue: "إصلاح منفذ الشحن"
        }
    },
    {
        key: 'PAID_DELIVERED',
        title: 'رسالة الشكر والتقييم بعد التسليم',
        subtitle: 'تُرسل للعميل فور تحصيل المبلغ وتسليم الجهاز وإغلاق التذكرة',
        badge: 'تم التسليم والتحصيل',
        badgeColor: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
        borderColor: 'border-cyan-500/30',
        defaultText: DEFAULT_HAPPY_TEMPLATE,
        sampleData: {
            name: "سارة علي",
            device: "Xiaomi 12T",
            barcode: "TK-3095",
            price: "320",
            issue: "تغيير سماعة مكالمات"
        }
    }
];

export default function MessagingSettings({ initialTemplates }: MessagingSettingsProps) {
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
    const textareaRefs = {
        NEW: useRef<HTMLTextAreaElement>(null),
        READY: useRef<HTMLTextAreaElement>(null),
        PAID_DELIVERED: useRef<HTMLTextAreaElement>(null)
    };

    const handleSave = async () => {
        if (templates.NEW.length < 5 || templates.READY.length < 5 || templates.PAID_DELIVERED.length < 5) {
            toast.error("يرجى كتابة نص مناسب لكل رسالة (5 أحرف على الأقل)");
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
                toast.success("تم حفظ قوالب رسائل واتساب بنجاح");
            } else {
                toast.error(result?.error || "حدث خطأ أثناء الحفظ");
            }
        } catch {
            toast.error("حدث خطأ غير متوقع أثناء الحفظ");
        } finally {
            setSaving(false);
        }
    };

    const handleReset = (key: TemplateKey) => {
        let defaultValue = '';
        if (key === 'NEW') defaultValue = DEFAULT_WHATSAPP_TEMPLATES.NEW.ar;
        else if (key === 'READY') defaultValue = DEFAULT_READY_TEMPLATE;
        else defaultValue = DEFAULT_HAPPY_TEMPLATE;

        setTemplates(prev => ({ ...prev, [key]: defaultValue }));
        toast.info("تمت استعادة النص الافتراضي - لا تنسى الضغط على حفظ القوالب");
    };

    const insertPlaceholder = (key: TemplateKey, tag: string) => {
        const textarea = textareaRefs[key].current;
        const currentText = templates[key];

        if (textarea) {
            const start = textarea.selectionStart ?? currentText.length;
            const end = textarea.selectionEnd ?? currentText.length;
            const updated = currentText.slice(0, start) + tag + currentText.slice(end);
            setTemplates(prev => ({ ...prev, [key]: updated }));

            // Return focus and adjust cursor
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + tag.length, start + tag.length);
            }, 50);
        } else {
            setTemplates(prev => ({ ...prev, [key]: currentText + " " + tag }));
        }
    };

    const renderPreview = (text: string, sample: BoxConfig['sampleData']) => {
        return text
            .replace(/\{name\}/g, sample.name)
            .replace(/\{device\}/g, sample.device)
            .replace(/\{barcode\}/g, sample.barcode)
            .replace(/\{price\}/g, sample.price)
            .replace(/\{issue\}/g, sample.issue)
            .replace(/\{branch\}/g, "الفرع الرئيسي");
    };

    return (
        <div className="max-w-5xl space-y-3 animate-in slide-in-from-bottom-4 duration-500 pb-8">
            <WhatsAppConnection />
            
            {/* Main Header with Sticky Save */}
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-3 sm:p-4 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-500">
                            <MessageCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                                قوالب رسائل واتساب التلقائية
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">
                                    3 خانات منفصلة
                                </span>
                            </h3>
                            <p className="text-[11px] font-medium text-muted-foreground">
                                اسم العميل ورقم التذكرة يتم تضمينهما تلقائياً. خصص نص الرسالة لكل مرحلة بكل سهولة.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="h-8.5 px-5 bg-primary rounded-xl text-white font-bold text-xs hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                        {saving ? (
                            <span className="flex items-center gap-1.5 animate-pulse">
                                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                                جارِ الحفظ...
                            </span>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>حفظ القوالب</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Structured Boxes for Each Message */}
            <div className="space-y-3">
                {TEMPLATE_BOXES.map((box) => {
                    const isEnabled = enabled[box.key];
                    const currentText = templates[box.key];
                    const previewText = renderPreview(currentText, box.sampleData);

                    return (
                        <div 
                            key={box.key}
                            className={cn(
                                "glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border rounded-2xl p-3.5 sm:p-4 shadow-md transition-all duration-300 relative overflow-hidden",
                                isEnabled ? box.borderColor : "border-border/40 opacity-70"
                            )}
                        >
                            {/* Box Header */}
                            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/30 flex-wrap">
                                <div className="flex items-center gap-2.5">
                                    <Switch 
                                        checked={isEnabled}
                                        onCheckedChange={(checked) => setEnabled(prev => ({ ...prev, [box.key]: checked }))}
                                        className="scale-90 data-[state=checked]:bg-primary cursor-pointer"
                                    />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs font-black text-foreground">
                                                {box.title}
                                            </Label>
                                            <span className={cn("text-[9px] px-2 py-0.5 rounded-md font-bold uppercase border", box.badgeColor)}>
                                                {box.badge}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground font-medium">
                                            {box.subtitle}
                                        </p>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => handleReset(box.key)}
                                    className="text-[10px] font-semibold text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-muted/40"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    استعادة الافتراضي
                                </button>
                            </div>

                            {/* Automatic System Tags Notice (البيانات التي توضع برة عنهم) */}
                            <div className="my-2.5 p-2 rounded-xl bg-muted/30 border border-border/40 flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
                                    <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                                    <span>بيانات العميل والتذكرة المتاحة للتضمين التلقائي:</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-background border border-border/60 text-foreground flex items-center gap-1">
                                        <User className="w-2.5 h-2.5 text-primary" /> اسم العميل
                                    </span>
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-background border border-border/60 text-foreground flex items-center gap-1">
                                        <Hash className="w-2.5 h-2.5 text-primary" /> رقم التذكرة
                                    </span>
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-background border border-border/60 text-foreground flex items-center gap-1">
                                        <Smartphone className="w-2.5 h-2.5 text-primary" /> نوع الجهاز
                                    </span>
                                    {box.key === 'READY' && (
                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                            <DollarSign className="w-2.5 h-2.5" /> التكلفة الإجمالية
                                        </span>
                                    )}
                                    {box.key === 'NEW' && (
                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                            <Wrench className="w-2.5 h-2.5" /> وصف العطل
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 2-Column Split: Custom Text Box vs Live WhatsApp Preview */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
                                
                                {/* Right Side: Custom Message Box (خانة الكتابة) */}
                                <div className="lg:col-span-7 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-bold text-foreground">
                                            خانة نص الرسالة والملاحظات:
                                        </label>
                                        <span className={cn(
                                            "text-[9px] font-semibold px-1.5 py-0.5 rounded",
                                            currentText.length > 500 ? "bg-rose-500/10 text-rose-500" : "bg-muted text-muted-foreground"
                                        )}>
                                            {currentText.length} / 500 حرف
                                        </span>
                                    </div>

                                    <textarea
                                        ref={textareaRefs[box.key]}
                                        dir="rtl"
                                        rows={4}
                                        disabled={!isEnabled}
                                        className={cn(
                                            "w-full bg-background/80 dark:bg-background/40 border border-border/60 rounded-xl py-2 px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-inner resize-none text-right leading-relaxed",
                                            !isEnabled && "opacity-50 cursor-not-allowed bg-muted/20"
                                        )}
                                        value={currentText}
                                        onChange={e => setTemplates(prev => ({ ...prev, [box.key]: e.target.value }))}
                                        placeholder={`اكتب نص ${box.title} هنا...`}
                                    />

                                    {/* Quick Variable Insertion Chips */}
                                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                        <span className="text-[9px] font-semibold text-muted-foreground ml-1">إضافة متغير:</span>
                                        <button
                                            type="button"
                                            onClick={() => insertPlaceholder(box.key, "{name}")}
                                            className="text-[9px] font-bold px-1.5 py-0.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded border border-primary/20 transition-all cursor-pointer flex items-center gap-0.5"
                                        >
                                            <Plus className="w-2.5 h-2.5" /> اسم العميل
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => insertPlaceholder(box.key, "{barcode}")}
                                            className="text-[9px] font-bold px-1.5 py-0.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded border border-primary/20 transition-all cursor-pointer flex items-center gap-0.5"
                                        >
                                            <Plus className="w-2.5 h-2.5" /> رقم التذكرة
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => insertPlaceholder(box.key, "{device}")}
                                            className="text-[9px] font-bold px-1.5 py-0.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded border border-primary/20 transition-all cursor-pointer flex items-center gap-0.5"
                                        >
                                            <Plus className="w-2.5 h-2.5" /> الجهاز
                                        </button>
                                        {box.key === 'READY' && (
                                            <button
                                                type="button"
                                                onClick={() => insertPlaceholder(box.key, "{price}")}
                                                className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded border border-emerald-500/20 transition-all cursor-pointer flex items-center gap-0.5"
                                            >
                                                <Plus className="w-2.5 h-2.5" /> التكلفة
                                            </button>
                                        )}
                                        {box.key === 'NEW' && (
                                            <button
                                                type="button"
                                                onClick={() => insertPlaceholder(box.key, "{issue}")}
                                                className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500/10 hover:bg-amber-500 text-amber-600 hover:text-white rounded border border-amber-500/20 transition-all cursor-pointer flex items-center gap-0.5"
                                            >
                                                <Plus className="w-2.5 h-2.5" /> وصف العطل
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Left Side: Live WhatsApp Message Bubble Preview */}
                                <div className="lg:col-span-5 flex flex-col justify-between">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                                            <Eye className="w-3 h-3 text-emerald-500" />
                                            معاينة شكل الرسالة لدى العميل (WhatsApp):
                                        </div>
                                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">مباشر</span>
                                    </div>

                                    {/* WhatsApp Chat Simulated Bubble */}
                                    <div className="p-3 rounded-xl bg-[#0b141a]/90 dark:bg-[#0b141a] text-white border border-[#1f2c34] shadow-inner font-sans min-h-[110px] flex flex-col justify-between relative overflow-hidden" dir="rtl">
                                        {/* Background subtle doodle effect */}
                                        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#25d366_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none" />
                                        
                                        {/* Green Message Bubble */}
                                        <div className="bg-[#005c4b] text-white rounded-xl rounded-tr-xs p-2.5 text-[11px] leading-relaxed relative z-10 shadow-sm whitespace-pre-wrap select-none border border-[#02735e]/30">
                                            {previewText || "اكتب نص الرسالة لتظهر المعاينة هنا..."}
                                            
                                            <div className="flex items-center justify-end gap-1 mt-1.5 text-[9px] text-white/70 font-mono" dir="ltr">
                                                <span>10:42 AM</span>
                                                <span className="text-[#53bdeb] font-bold">✓✓</span>
                                            </div>
                                        </div>

                                        <div className="text-[9px] text-white/40 pt-1.5 flex items-center justify-between">
                                            <span>Casper POS WhatsApp Gateway</span>
                                            <span>عميل تجريبي: {box.sampleData.name}</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
