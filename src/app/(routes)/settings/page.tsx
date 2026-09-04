export const dynamic = "force-dynamic";
import { Suspense } from "react";
import { getTranslations } from "@/lib/i18n-mock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, Printer, Database, Users, Shield, Globe, Calculator, Settings2, RefreshCw, MessageCircle, Building2, Cloud, Wifi } from "lucide-react";
import StoreConfig from "@/components/settings/StoreConfig";
import BranchManager from "@/components/settings/BranchManager";
import MessagingSettings from "@/components/settings/MessagingSettings";
import PrinterSettings from "@/components/settings/PrinterSettings";
import BackupManager from "@/components/settings/BackupManager";
import UserManagement from "@/components/settings/UserManagement";
import RoleManagement from "@/components/settings/RoleManagement";
import TablesManagement from "@/components/settings/TablesManagement";
import OpeningBalanceWizard from "@/components/setup/OpeningBalanceWizard";
import WarehouseSettings from "@/components/settings/WarehouseSettings";
import SyncManagement from "@/components/settings/SyncManagement";
import SuperAdminSecurity from "@/components/settings/SuperAdminSecurity";
import CloudSettings from "@/components/settings/CloudSettings";
import NetworkInfoCard from "@/components/settings/NetworkInfoCard";
import LicenseManagement from "@/components/settings/LicenseManagement";
import TrainingGuideTab from "@/components/settings/TrainingGuideTab";
import { ShieldCheck, GraduationCap } from "lucide-react";
import { getStoreSettings } from "@/actions/settings";
import { getUsersForPage } from "@/actions/users";
import { getRoles } from "@/actions/roles";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export default async function SettingsPage() {
    const t = await getTranslations('Settings');
    const session = await getSession();

    if (!session) {
        redirect("/login");
    }

    const canAccessSettings = session.user.role === 'ADMIN' || 
                             session.user.role === 'مدير النظام' || 
                             session.user.role === 'المالك' || 
                             hasPermission(session.user.permissions, '*') || 
                             hasPermission(session.user.permissions, PERMISSIONS.MANAGE_SETTINGS) || 
                             hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);
                             
    if (!canAccessSettings) {
        redirect('/unauthorized');
    }

    const [settingsRes, users, rolesRes, branches, warehouses] = await Promise.all([
        getStoreSettings(),
        getUsersForPage().catch(() => []),
        getRoles(),
        prisma.branch.findMany({
            select: { id: true, name: true },
            where: { deletedAt: null }
        }),
        prisma.warehouse.findMany({
            where: { 
                deletedAt: null,
                branchId: session.user.branchId || undefined
            },
            orderBy: { name: 'asc' }
        })
    ]);

    const roles = rolesRes.success ? (rolesRes.data ?? []) : [];
    const settings = settingsRes?.data || {};
    const settingsRecord = (settingsRes?.data || {}) as Record<string, unknown>;
    let whatsappTemplates = null;
    try {
        whatsappTemplates = typeof settingsRecord.whatsappTemplates === 'string'
            ? JSON.parse(settingsRecord.whatsappTemplates as string)
            : (settingsRecord.whatsappTemplates ?? null);
    } catch {
        whatsappTemplates = null;
    }
    const rawFeatures = typeof settingsRecord.features === 'string' ? settingsRecord.features : JSON.stringify(settingsRecord.features || {});
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'مدير النظام' || session.user.role === 'المالك' || hasPermission(session.user.permissions, '*');
    const isSuperAdmin = session.user.id === 'super-admin';
    
    // Permission Checks
    const canManageGeneral = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_SETTINGS);
    const canManagePrinters = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_PRINTERS);
    const canManageBackups = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_BACKUPS);
    const canManageUsers = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);
    const canManageRoles = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_ROLES);
    const canManageWarehouses = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_WAREHOUSES);
    const canManageBranches = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.BRANCH_MANAGE);
    const canManageModules = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_MODULES);
    const canManageTables = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_TABLES);
    const canManageAccounting = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_ACCOUNTING_SETUP);

    const canSeePrinters = canManagePrinters || isAdmin;

    let defaultTab = "users";
    if (canManageGeneral) defaultTab = "general";
    else if (canManagePrinters) defaultTab = "printers";
    else if (canManageBackups) defaultTab = "backups";
    else if (canManageWarehouses) defaultTab = "warehouses";

    const validSessionBranchId = branches.find(b => b.id === session.user.branchId)?.id;

    return (
        <div className="p-2 sm:p-3 max-w-[2400px] mx-auto w-full h-[calc(100vh-42px)] flex flex-col space-y-2 animate-fade-in-up font-cairo overflow-hidden">
            {/* Top Breadcrumb & Status Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 shrink-0 px-1">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                        <Settings2 className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xs font-black tracking-tight text-foreground">{t('title', 'System Settings')}</h1>
                        <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-md font-mono font-bold">Casper ERP</span>
                        <span className="text-muted-foreground/30 text-xs hidden sm:inline">•</span>
                        <p className="text-[10px] text-muted-foreground hidden sm:inline">{t('description', 'Manage your store configuration, devices, and team.')}</p>
                    </div>
                </div>
            </div>

            <Tabs defaultValue={defaultTab} orientation="vertical" className="flex-1 flex flex-col md:flex-row gap-3 min-h-0 overflow-hidden">
                {/* 🛡️ Master Sidebar Rail (Grouped & Scrollable) */}
                <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col h-full bg-card/60 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl overflow-hidden shadow-xs">
                    <div className="p-2.5 border-b border-border/30 bg-muted/10 shrink-0">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">لوحة التخصيص والأقسام</p>
                    </div>

                    <TabsList className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col items-stretch justify-start gap-1 bg-transparent border-none rounded-none shadow-none h-auto w-full">
                        {/* المجموعة 1: المتجر والتأسيس */}
                        {(canManageGeneral || canManageModules || canManageAccounting) && (
                            <div className="space-y-0.5">
                                <div className="pt-1 pb-1 px-2">
                                    <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
                                        <Store className="w-3 h-3 text-cyan-400" />
                                        المتجر والتأسيس
                                    </span>
                                </div>
                                {canManageGeneral && (
                                    <TabsTrigger 
                                        value="general" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Store className="w-3.5 h-3.5 opacity-70" /> الإعدادات العامة للمتجر
                                    </TabsTrigger>
                                )}
                                {canManageModules && (
                                    <TabsTrigger 
                                        value="modules" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-rose-500/15 data-[state=active]:text-rose-400 data-[state=active]:border-rose-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Shield className="w-3.5 h-3.5 opacity-70" /> الميزات والموديولات
                                    </TabsTrigger>
                                )}
                                {canManageAccounting && (
                                    <TabsTrigger 
                                        value="accounting" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-indigo-500/15 data-[state=active]:text-indigo-400 data-[state=active]:border-indigo-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Calculator className="w-3.5 h-3.5 opacity-70" /> الأرصدة والحسابات
                                    </TabsTrigger>
                                )}
                            </div>
                        )}

                        {/* المجموعة 2: فريق العمل والفروع */}
                        {(canManageUsers || canManageBranches || canManageWarehouses || canManageTables) && (
                            <div className="space-y-0.5 pt-2 border-t border-border/20 mt-1">
                                <div className="pt-1 pb-1 px-2">
                                    <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
                                        <Users className="w-3 h-3 text-violet-400" />
                                        فريق العمل والتنظيم
                                    </span>
                                </div>
                                <TabsTrigger 
                                    value="users" 
                                    className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-400 data-[state=active]:border-violet-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                >
                                    <Users className="w-3.5 h-3.5 opacity-70" /> المستخدمين والأدوار
                                </TabsTrigger>
                                {canManageBranches && (
                                    <TabsTrigger 
                                        value="branches" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-indigo-500/15 data-[state=active]:text-indigo-400 data-[state=active]:border-indigo-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Building2 className="w-3.5 h-3.5 opacity-70" /> إدارة الفروع
                                    </TabsTrigger>
                                )}
                                {canManageWarehouses && (
                                    <TabsTrigger 
                                        value="warehouses" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400 data-[state=active]:border-blue-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Database className="w-3.5 h-3.5 opacity-70" /> المستودعات والمخازن
                                    </TabsTrigger>
                                )}
                                {canManageTables && (
                                    <TabsTrigger 
                                        value="tables" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400 data-[state=active]:border-emerald-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Store className="w-3.5 h-3.5 opacity-70" /> الصالات والطاولات
                                    </TabsTrigger>
                                )}
                            </div>
                        )}

                        {/* المجموعة 3: الأجهزة والشبكة */}
                        {(canSeePrinters || isAdmin) && (
                            <div className="space-y-0.5 pt-2 border-t border-border/20 mt-1">
                                <div className="pt-1 pb-1 px-2">
                                    <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
                                        <Printer className="w-3 h-3 text-sky-400" />
                                        الأجهزة والعتاد
                                    </span>
                                </div>
                                {canSeePrinters && (
                                    <TabsTrigger 
                                        value="printers" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-400 data-[state=active]:border-sky-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Printer className="w-3.5 h-3.5 opacity-70" /> إعدادات الطابعات
                                    </TabsTrigger>
                                )}
                                {isAdmin && (
                                    <TabsTrigger 
                                        value="network" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400 data-[state=active]:border-emerald-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Wifi className="w-3.5 h-3.5 opacity-70" /> شبكة الفرع والربط
                                    </TabsTrigger>
                                )}
                            </div>
                        )}

                        {/* المجموعة 4: السحابة والبيانات */}
                        {(isAdmin || canManageBackups || canManageGeneral) && (
                            <div className="space-y-0.5 pt-2 border-t border-border/20 mt-1">
                                <div className="pt-1 pb-1 px-2">
                                    <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
                                        <Cloud className="w-3 h-3 text-cyan-400" />
                                        السحابة والبيانات
                                    </span>
                                </div>
                                {isAdmin && (
                                    <>
                                        <TabsTrigger 
                                            value="cloud" 
                                            className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                        >
                                            <Cloud className="w-3.5 h-3.5 opacity-70" /> المزامنة السحابية
                                        </TabsTrigger>
                                        <TabsTrigger 
                                            value="sync" 
                                            className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5 opacity-70" /> إدارة طابور المزامنة (DLQ)
                                        </TabsTrigger>
                                    </>
                                )}
                                {canManageBackups && (
                                    <TabsTrigger 
                                        value="backups" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <Database className="w-3.5 h-3.5 opacity-70" /> النسخ الاحتياطي والقاعدة
                                    </TabsTrigger>
                                )}
                                {canManageGeneral && (
                                    <TabsTrigger 
                                        value="messaging" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-green-500/15 data-[state=active]:text-green-400 data-[state=active]:border-green-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <MessageCircle className="w-3.5 h-3.5 opacity-70" /> رسائل وقوالب الواتساب
                                    </TabsTrigger>
                                )}
                                {isAdmin && (
                                    <TabsTrigger 
                                        value="licenses" 
                                        className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                    >
                                        <ShieldCheck className="w-3.5 h-3.5 opacity-70 text-cyan-500" /> تراخيص وتفعيل النظام
                                    </TabsTrigger>
                                )}
                            </div>
                        )}

                        {/* المجموعة 5: المساعدة والحماية */}
                        <div className="space-y-0.5 pt-2 border-t border-border/20 mt-1">
                            <div className="pt-1 pb-1 px-2">
                                <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
                                    <GraduationCap className="w-3 h-3 text-amber-400" />
                                    المساعدة والنظام
                                </span>
                            </div>
                            <TabsTrigger 
                                value="training" 
                                className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                            >
                                <GraduationCap className="w-3.5 h-3.5 opacity-70 text-amber-500" /> دليل التدريب والتشغيل
                            </TabsTrigger>
                            {isSuperAdmin && (
                                <TabsTrigger 
                                    value="security" 
                                    className="w-full justify-start px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 h-8.5 border border-transparent data-[state=active]:bg-rose-500/15 data-[state=active]:text-rose-400 data-[state=active]:border-rose-500/30 data-[state=active]:shadow-xs hover:bg-muted/40 text-muted-foreground text-right"
                                >
                                    <Shield className="w-3.5 h-3.5 opacity-70" /> الحماية الفائقة
                                </TabsTrigger>
                            )}
                        </div>
                    </TabsList>
                </div>

                {/* 🚀 Main Content Area (Scrollable within Viewport) */}
                <div className="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar bg-card/40 dark:bg-card/20 backdrop-blur-xl border border-border/40 rounded-2xl p-3 sm:p-4 shadow-xs">
                    {canManageGeneral && (
                        <TabsContent value="general" className="mt-0 outline-none focus-visible:ring-0">
                            <StoreConfig settings={settings} hideModules={true} />
                        </TabsContent>
                    )}

                    {canManageGeneral && (
                        <TabsContent value="messaging" className="mt-0 outline-none focus-visible:ring-0">
                            <MessagingSettings initialTemplates={whatsappTemplates} currentFeatures={rawFeatures} />
                        </TabsContent>
                    )}

                    {canSeePrinters && (
                        <TabsContent value="printers" className="mt-0 outline-none focus-visible:ring-0">
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                                <div className="xl:col-span-2 space-y-3">
                                    <PrinterSettings />
                                </div>
                                <div className="space-y-3">
                                    <Card className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-xl overflow-hidden shadow-xs relative group p-3">
                                        <CardHeader className="p-2 pb-1">
                                            <CardTitle className="flex items-center gap-2 font-bold text-xs">
                                                <Globe className="w-4 h-4 text-blue-400" /> 
                                                <span className="uppercase tracking-tight">Regional Settings</span>
                                            </CardTitle>
                                            <CardDescription className="text-muted-foreground font-medium text-[10px]">
                                                Language and localization preferences.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="p-2 pt-1">
                                            <div className="p-2 bg-background/40 rounded-lg border border-border/20 text-xs">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Current Language</span>
                                                    <span className="font-bold flex items-center gap-1.5 text-foreground text-xs">
                                                        <span>🇸🇦</span> Arabic (KSA)
                                                    </span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    {canManageBackups && (
                        <TabsContent value="backups" className="mt-0 outline-none focus-visible:ring-0">
                            <BackupManager />
                        </TabsContent>
                    )}

                    <TabsContent value="users" className="mt-0 outline-none focus-visible:ring-0">
                        <Tabs defaultValue="staff" className="w-full space-y-2.5">
                            <div className="flex items-center justify-between">
                                <TabsList className="bg-card/40 backdrop-blur-md p-1 border border-border/40 rounded-xl shadow-xs h-auto gap-1">
                                    <TabsTrigger 
                                        value="staff" 
                                        className="px-3 py-1 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400 data-[state=active]:border-violet-500/50 border border-transparent font-bold text-xs uppercase transition-all rounded-lg h-7"
                                    >
                                        Staff Members
                                    </TabsTrigger>
                                    {canManageRoles && (
                                        <TabsTrigger 
                                            value="roles" 
                                            className="px-3 py-1 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 data-[state=active]:border-purple-500/50 border border-transparent font-bold text-xs uppercase transition-all rounded-lg h-7"
                                        >
                                            Roles & Permissions
                                        </TabsTrigger>
                                    )}
                                </TabsList>
                            </div>

                            <TabsContent value="staff" className="mt-0 outline-none">
                                <UserManagement
                                    users={users}
                                    roles={roles}
                                    branches={branches}
                                    branchId={validSessionBranchId}
                                    currentUser={session.user}
                                />
                            </TabsContent>

                            {canManageRoles && (
                                <TabsContent value="roles" className="mt-0 outline-none">
                                    <RoleManagement initialRoles={roles} currentUser={session.user} />
                                </TabsContent>
                            )}
                        </Tabs>
                    </TabsContent>

                    {canManageWarehouses && (
                        <TabsContent value="warehouses" className="mt-0 outline-none focus-visible:ring-0">
                            <WarehouseSettings 
                                warehouses={warehouses as unknown as Parameters<typeof WarehouseSettings>[0]['warehouses']} 
                                currentBranchId={validSessionBranchId}
                            />
                        </TabsContent>
                    )}

                    {canManageBranches && (
                        <TabsContent value="branches" className="mt-0 outline-none focus-visible:ring-0">
                            <BranchManager branches={branches as unknown as Parameters<typeof BranchManager>[0]['branches']} />
                        </TabsContent>
                    )}

                    {canManageTables && (
                        <TabsContent value="tables" className="mt-0 outline-none focus-visible:ring-0">
                            <TablesManagement />
                        </TabsContent>
                    )}

                    {canManageModules && (
                        <TabsContent value="modules" className="mt-0 outline-none focus-visible:ring-0">
                            <StoreConfig settings={settings} hideModules={false} />
                        </TabsContent>
                    )}

                    {canManageAccounting && (
                        <TabsContent value="accounting" className="mt-0 outline-none focus-visible:ring-0">
                            <OpeningBalanceWizard />
                        </TabsContent>
                    )}

                    {isAdmin && (
                        <>
                            <TabsContent value="cloud" className="mt-0 outline-none focus-visible:ring-0">
                                <CloudSettings />
                            </TabsContent>
                            <TabsContent value="sync" className="mt-0 outline-none focus-visible:ring-0">
                                <SyncManagement />
                            </TabsContent>
                            <TabsContent value="network" className="mt-0 outline-none focus-visible:ring-0">
                                <div className="max-w-2xl">
                                    <NetworkInfoCard />
                                </div>
                            </TabsContent>
                            <TabsContent value="licenses" className="mt-0 outline-none focus-visible:ring-0">
                                <LicenseManagement />
                            </TabsContent>
                        </>
                    )}
                    <TabsContent value="training" className="mt-0 outline-none focus-visible:ring-0">
                        <TrainingGuideTab />
                    </TabsContent>
                    {isSuperAdmin && (
                        <TabsContent value="security" className="mt-0 outline-none focus-visible:ring-0">
                            <SuperAdminSecurity />
                        </TabsContent>
                    )}
                </div>
            </Tabs>
        </div>
    );
}
