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
        <div className="space-y-6">
            <Card className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-3xl overflow-hidden shadow-xl relative group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent blur-3xl pointer-events-none" />
                <CardHeader className="p-8 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-black tracking-widest uppercase mb-2">
                                <GraduationCap className="w-3.5 h-3.5" /> مركز التدريب التفاعلي
                            </div>
                            <CardTitle className="text-2xl font-black tracking-tight">
                                التدريب والدليل التشغيلي للنظام
                            </CardTitle>
                            <CardDescription className="text-sm font-medium">
                                تعلم كيفية استخدام جميع أقسام Casper POS خطوة بخطوة من خلال الجولة التفاعلية المصورة.
                            </CardDescription>
                        </div>
                        <Button
                            onClick={launchTour}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-6 py-5 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all hover:scale-[1.02] flex items-center gap-2.5 shrink-0"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            <span>بدء الجولة التفاعلية</span>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-8 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                        {MODULES.map((mod, idx) => (
                            <div
                                key={idx}
                                className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 hover:border-cyan-500/30 transition-all duration-200 group/card"
                            >
                                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mb-3 group-hover/card:scale-110 transition-transform">
                                    <mod.icon className="w-4 h-4" />
                                </div>
                                <h4 className="font-bold text-sm text-foreground mb-1">
                                    {mod.title}
                                </h4>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {mod.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
