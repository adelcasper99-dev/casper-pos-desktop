"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, Play, CheckCircle2, ShoppingCart, Box, Users, Truck, Landmark, BarChart3, Wrench, Shield, ArrowRight } from "lucide-react";

const MODULES = [
    { title: "لوحة التحكم (Dashboard)", icon: BarChart3, desc: "مؤشرات المبيعات اليومية، الأرباح، وتدفق العمليات لحظياً." },
    { title: "نقطة البيع (POS)", icon: ShoppingCart, desc: "إصدار الفواتير السريعة، الباركود، طرق الدفع المتعددة وطباعة الإيصالات." },
    { title: "إدارة المخزون", icon: Box, desc: "إدارة المنتجات، التنبيهات بالنواقص، الجرد، والتسويات الجردية." },
    { title: "العملاء والحسابات", icon: Users, desc: "إدارة حسابات العملاء، البيع بالآجل، وأرصدة المديونيات." },
    { title: "المشتريات والموردين", icon: Truck, desc: "تسجيل فواتير الشراء، حسابات الموردين، وإدخال بضائع المخازن." },
    { title: "الخزينة والمالية", icon: Landmark, desc: "الإيداعات، السحوبات، اليوميات المالية، وتتبع أرصدة الصناديق." },
    { title: "تذاكر الصيانة", icon: Wrench, desc: "دورة حياة صيانة الأجهزة من الاستلام والتسعير وحتى التسليم." },
    { title: "الأمان والإعدادات", icon: Shield, desc: "صلاحيات الموظفين، إعدادات الطابعات، والنسخ الاحتياطي." },
];

export default function TrainingGuideTab() {
    const launchTour = () => {
        window.dispatchEvent(new CustomEvent("open-training-modal"));
    };

    return (
        <div className="max-w-5xl space-y-3 animate-in fade-in duration-500">
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1 custom-scrollbar space-y-3">
                <Card className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl overflow-hidden shadow-sm relative group">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent blur-3xl pointer-events-none" />
                    <CardHeader className="p-3 pb-2 border-b border-border/20">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] font-bold uppercase">
                                    <GraduationCap className="w-3 h-3" /> مركز التدريب التفاعلي
                                </div>
                                <CardTitle className="text-sm font-bold tracking-tight">
                                    التدريب والدليل التشغيلي للنظام (Training Guide)
                                </CardTitle>
                                <CardDescription className="text-[11px] font-medium text-muted-foreground">
                                    تعلم كيفية استخدام جميع أقسام Casper POS خطوة بخطوة من خلال الجولة التفاعلية المصورة.
                                </CardDescription>
                            </div>
                            <Button
                                onClick={launchTour}
                                size="sm"
                                className="h-8 bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-4 rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer text-xs"
                            >
                                <Play className="w-3 h-3 fill-current" />
                                <span>بدء الجولة التفاعلية</span>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                            {MODULES.map((mod, idx) => (
                                <div
                                    key={idx}
                                    className="p-2.5 rounded-xl bg-slate-50/50 dark:bg-white/[0.02] border border-slate-200/50 dark:border-white/5 hover:border-cyan-500/30 transition-all duration-200 group/card"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center mb-1.5 group-hover/card:scale-105 transition-transform">
                                        <mod.icon className="w-3.5 h-3.5" />
                                    </div>
                                    <h4 className="font-bold text-xs text-foreground mb-0.5">
                                        {mod.title}
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground leading-snug">
                                        {mod.desc}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
