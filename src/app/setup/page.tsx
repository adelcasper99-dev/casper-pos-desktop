"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Server, MonitorSmartphone, CheckCircle2, AlertCircle, Database } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CasperLogo } from "@/components/ui/CasperLogo";

export default function SetupWizard() {
    const [step, setStep] = useState(1);
    const [role, setRole] = useState<"MASTER" | "SUB_NODE" | null>(null);
    const [masterIp, setMasterIp] = useState("");
    const [hasLegacyDb, setHasLegacyDb] = useState(false);
    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationProgress, setMigrationProgress] = useState(0);
    const [migrationMessage, setMigrationMessage] = useState("");

    useEffect(() => {
        const checkDb = async () => {
            const api = (window as any).electronAPI;
            if (api?.config?.checkLegacyDb) {
                const res = await api.config.checkLegacyDb();
                if (res?.exists) {
                    setHasLegacyDb(true);
                }
            }
        };
        checkDb();

        const api = (window as any).electronAPI;
        if (api?.config?.onMigrationProgress) {
            api.config.onMigrationProgress((data: any) => {
                setMigrationProgress(data.percent);
                setMigrationMessage(data.message);
            });
        }
    }, []);

    const handleSaveRole = async () => {
        if (role === "SUB_NODE" && !masterIp) {
            toast.error("يرجى إدخال عنوان IP الخاص بالجهاز الرئيسي");
            return;
        }

        try {
            const api = (window as any).electronAPI;
            await api.config.saveNodeConfig({
                nodeRole: role,
                masterIp: role === "SUB_NODE" ? masterIp : "127.0.0.1",
            });
        } catch (error: any) {
            toast.error(`حدث خطأ أثناء الحفظ: ${error.message}`);
        }
    };

    const handleMigrate = async () => {
        setIsMigrating(true);
        setMigrationProgress(0);
        setMigrationMessage("جاري تحضير البيانات...");
        
        try {
            const api = (window as any).electronAPI;
            const res = await api.config.migrateToPostgres();
            if (res.success) {
                toast.success("تم نقل البيانات بنجاح!");
                handleSaveRole();
            } else {
                toast.error(`فشل النقل: ${res.error}`);
                setIsMigrating(false);
            }
        } catch (error: any) {
            toast.error(`خطأ: ${error.message}`);
            setIsMigrating(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden" dir="rtl">
            {/* Background Effects */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px]" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px]" />

            <div className="z-10 mb-8 flex flex-col items-center">
                <CasperLogo className="mb-4" />
                <h1 className="text-3xl font-bold text-white tracking-tight">إعداد شبكة Casper POS</h1>
                <p className="text-slate-400 mt-2">خطوات بسيطة لربط الفروع والأجهزة الخاصة بك</p>
            </div>

            <Card className="w-full max-w-2xl border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl text-white">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">
                        {step === 1 && "تحديد دور الجهاز"}
                        {step === 2 && role === "MASTER" && "إعداد قاعدة البيانات"}
                        {step === 2 && role === "SUB_NODE" && "الاتصال بالجهاز الرئيسي"}
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                    {step === 1 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => setRole("MASTER")}
                                className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 transition-all duration-300 ${
                                    role === "MASTER"
                                        ? "border-blue-500 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.2)]"
                                        : "border-slate-800 hover:border-slate-700 bg-slate-900"
                                }`}
                            >
                                <Server className={`w-16 h-16 mb-4 ${role === "MASTER" ? "text-blue-500" : "text-slate-400"}`} />
                                <h3 className="text-xl font-bold mb-2">جهاز رئيسي (Master)</h3>
                                <p className="text-sm text-slate-400 text-center">
                                    هذا هو الجهاز الأساسي الذي يستضيف قاعدة البيانات ويدير الأجهزة الأخرى في الفرع.
                                </p>
                            </button>

                            <button
                                onClick={() => setRole("SUB_NODE")}
                                className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 transition-all duration-300 ${
                                    role === "SUB_NODE"
                                        ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.2)]"
                                        : "border-slate-800 hover:border-slate-700 bg-slate-900"
                                }`}
                            >
                                <MonitorSmartphone className={`w-16 h-16 mb-4 ${role === "SUB_NODE" ? "text-indigo-500" : "text-slate-400"}`} />
                                <h3 className="text-xl font-bold mb-2">جهاز فرعي (Sub-Node)</h3>
                                <p className="text-sm text-slate-400 text-center">
                                    جهاز كاشير إضافي يتصل بالجهاز الرئيسي عبر الشبكة الداخلية.
                                </p>
                            </button>
                        </div>
                    )}

                    {step === 2 && role === "SUB_NODE" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-lg flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                                <div className="text-sm text-indigo-200">
                                    يرجى التأكد من تشغيل الجهاز الرئيسي أولاً، ومعرفة عنوان الـ IP الخاص به (مثال: 192.168.1.100).
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">عنوان الجهاز الرئيسي (Master IP)</label>
                                <Input
                                    value={masterIp}
                                    onChange={(e) => setMasterIp(e.target.value)}
                                    placeholder="192.168.x.x"
                                    className="bg-slate-950 border-slate-800 text-lg py-6 text-center tracking-widest text-white placeholder:text-slate-600"
                                    dir="ltr"
                                />
                            </div>
                        </div>
                    )}

                    {step === 2 && role === "MASTER" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                            {hasLegacyDb ? (
                                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center space-y-4 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                                    <Database className="w-12 h-12 text-blue-400 mx-auto" />
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1">تم العثور على بيانات قديمة</h3>
                                        <p className="text-sm text-slate-400">
                                            النظام اكتشف وجود قاعدة بيانات (SQLite) سابقة. هل ترغب في ترحيل هذه البيانات محلياً إلى النظام الجديد؟
                                        </p>
                                    </div>
                                    
                                    {isMigrating ? (
                                        <div className="space-y-3 pt-4">
                                            <Progress value={migrationProgress} className="h-3 bg-slate-800" />
                                            <div className="flex justify-between text-xs text-slate-400">
                                                <span>{migrationMessage}</span>
                                                <span>{migrationProgress}%</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex gap-3 justify-center pt-2">
                                            <Button variant="outline" onClick={handleSaveRole} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                                                تخطي والبدء من جديد
                                            </Button>
                                            <Button onClick={handleMigrate} className="bg-blue-600 hover:bg-blue-700 text-white border-0">
                                                استيراد البيانات القديمة
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-8 space-y-4">
                                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                                    <div>
                                        <h3 className="text-xl font-bold text-white">جاهز للإقلاع</h3>
                                        <p className="text-slate-400 mt-2">
                                            لم يتم العثور على بيانات قديمة. سيتم إنشاء قاعدة بيانات جديدة بالكامل.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex justify-between border-t border-slate-800/50 p-6">
                    {step === 2 ? (
                        <Button
                            variant="ghost"
                            onClick={() => setStep(1)}
                            disabled={isMigrating}
                            className="text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                            رجوع
                        </Button>
                    ) : (
                        <div />
                    )}
                    
                    {step === 1 && (
                        <Button
                            onClick={() => setStep(2)}
                            disabled={!role}
                            className="bg-white text-black hover:bg-slate-200 px-8"
                        >
                            التالي
                        </Button>
                    )}

                    {step === 2 && (!hasLegacyDb || role === "SUB_NODE") && (
                        <Button
                            onClick={handleSaveRole}
                            disabled={role === "SUB_NODE" && !masterIp}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 border-0"
                        >
                            حفظ وإنهاء الإعداد
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
