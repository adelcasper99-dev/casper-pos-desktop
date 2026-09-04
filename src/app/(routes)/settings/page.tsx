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
    const whatsappTemplates = (settings as any).whatsappTemplates ?? null;
    const rawFeatures = (settings as any).features ?? '{}';
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
        <div className="p-2.5 sm:p-3.5 max-w-[2400px] mx-auto w-full min-h-screen space-y-2.5 animate-fade-in-up font-cairo">
            {/* Compact Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                        <Settings2 className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-black tracking-tight text-foreground">{t('title', 'System Settings')}</h1>
                            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-md font-mono">Casper ERP</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{t('description', 'Manage your store configuration, devices, and team.')}</p>
                    </div>
                </div>
            </div>

            <Tabs defaultValue={defaultTab} className="space-y-2.5">
                {/* Modern Compact Tabs List */}
                <TabsList className="bg-card/40 backdrop-blur-md border border-border/50 p-1 h-auto flex-wrap justify-start gap-1 rounded-xl shadow-xs w-full">
                    {canManageGeneral && (
                        <TabsTrigger 
                            value="general" 
                            className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Store className="w-3.5 h-3.5 opacity-70" /> {t('tabs.general', 'General')}
                        </TabsTrigger>
                    )}
                    {canManageGeneral && (
                        <TabsTrigger 
                            value="messaging" 
                            className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 data-[state=active]:border-green-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <MessageCircle className="w-3.5 h-3.5 opacity-70" /> {t('tabs.messaging', 'Messaging')}
                        </TabsTrigger>
                    )}
                    {canSeePrinters && (
                        <TabsTrigger 
                            value="printers" 
                            className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-400 data-[state=active]:border-sky-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Printer className="w-3.5 h-3.5 opacity-70" /> {t('tabs.print', 'Printers')}
                        </TabsTrigger>
                    )}
                    <TabsTrigger 
                        value="users" 
                        className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400 data-[state=active]:border-violet-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                    >
                        <Users className="w-3.5 h-3.5 opacity-70" /> Users & Roles
                    </TabsTrigger>

                    {canManageWarehouses && (
                        <TabsTrigger 
                            value="warehouses" 
                            className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 data-[state=active]:border-blue-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Database className="w-3.5 h-3.5 opacity-70" /> المستودعات
                        </TabsTrigger>
                    )}

                    {canManageBranches && (
                        <TabsTrigger 
                            value="branches" 
                            className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-400 data-[state=active]:border-indigo-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Building2 className="w-3.5 h-3.5 opacity-70" /> الفروع
                        </TabsTrigger>
                    )}

                    {canManageBackups && (
                        <TabsTrigger 
                            value="backups" 
                            className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Database className="w-3.5 h-3.5 opacity-70" /> {t('tabs.backup', 'Backups')}
                        </TabsTrigger>
                    )}

                    {canManageTables && (
                        <TabsTrigger 
                            value="tables" 
                            className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 data-[state=active]:border-emerald-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Store className="w-3.5 h-3.5 opacity-70" /> {t('tabs.tables_and_floors', 'Tables')}
                        </TabsTrigger>
                    )}

                    {canManageModules && (
                        <TabsTrigger 
                            value="modules" 
                            className="data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-400 data-[state=active]:border-rose-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Shield className="w-3.5 h-3.5 opacity-70" /> {t('tabs.modules', 'الميزات / Features')}
                        </TabsTrigger>
                    )}

                    {canManageAccounting && (
                        <TabsTrigger 
                            value="accounting" 
                            className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-400 data-[state=active]:border-indigo-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Calculator className="w-3.5 h-3.5 opacity-70" /> {t('tabs.accounting', 'Accounting')}
                        </TabsTrigger>
                    )}

                    {isAdmin && (
                        <>
                            <TabsTrigger 
                                value="cloud" 
                                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                            >
                                <Cloud className="w-3.5 h-3.5 opacity-70" /> Cloud Sync Config
                            </TabsTrigger>
                            <TabsTrigger 
                                value="sync" 
                                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                            >
                                <RefreshCw className="w-3.5 h-3.5 opacity-70" /> Sync Management
                            </TabsTrigger>
                            <TabsTrigger 
                                value="network" 
                                className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 data-[state=active]:border-emerald-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                            >
                                <Wifi className="w-3.5 h-3.5 opacity-70" /> شبكة الفرع
                            </TabsTrigger>
                            <TabsTrigger 
                                value="licenses" 
                                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                            >
                                <ShieldCheck className="w-3.5 h-3.5 opacity-70 text-cyan-500" /> التراخيص
                            </TabsTrigger>
                        </>
                    )}
                    <TabsTrigger 
                        value="training" 
                        className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                    >
                        <GraduationCap className="w-3.5 h-3.5 opacity-70 text-amber-500" /> دليل التدريب
                    </TabsTrigger>
                    {isSuperAdmin && (
                        <TabsTrigger 
                            value="security" 
                            className="data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-400 data-[state=active]:border-rose-500/50 border border-transparent px-2.5 py-1 rounded-lg font-bold text-xs transition-all hover:bg-white/5 flex gap-1.5 items-center h-8"
                        >
                            <Shield className="w-3.5 h-3.5 opacity-70" /> الحماية
                        </TabsTrigger>
                    )}
                </TabsList>

                {/* Main Content Area */}
                <div className="animate-in fade-in duration-300 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
                    {canManageGeneral && (
                        <TabsContent value="general" className="outline-none focus-visible:ring-0">
                            <StoreConfig settings={settings} hideModules={true} />
                        </TabsContent>
                    )}

                    {canManageGeneral && (
                        <TabsContent value="messaging" className="outline-none focus-visible:ring-0">
                            <MessagingSettings initialTemplates={whatsappTemplates} currentFeatures={rawFeatures} />
                        </TabsContent>
                    )}

                    {canSeePrinters && (
                        <TabsContent value="printers" className="outline-none focus-visible:ring-0">
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
                        <TabsContent value="backups" className="outline-none focus-visible:ring-0">
                            <BackupManager />
                        </TabsContent>
                    )}

                    <TabsContent value="users" className="outline-none focus-visible:ring-0">
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
                        <TabsContent value="warehouses" className="outline-none focus-visible:ring-0">
                            <WarehouseSettings 
                                warehouses={warehouses as any} 
                                currentBranchId={validSessionBranchId}
                            />
                        </TabsContent>
                    )}

                    {canManageBranches && (
                        <TabsContent value="branches" className="outline-none focus-visible:ring-0">
                            <BranchManager branches={branches as any} />
                        </TabsContent>
                    )}


                    {canManageTables && (
                        <TabsContent value="tables" className="outline-none focus-visible:ring-0">
                            <TablesManagement />
                        </TabsContent>
                    )}

                    {canManageModules && (
                        <TabsContent value="modules" className="outline-none focus-visible:ring-0">
                            <StoreConfig settings={settings} hideModules={false} />
                        </TabsContent>
                    )}

                    {canManageAccounting && (
                        <TabsContent value="accounting" className="outline-none focus-visible:ring-0">
                            <OpeningBalanceWizard />
                        </TabsContent>
                    )}

                    {isAdmin && (
                        <>
                            <TabsContent value="cloud" className="outline-none focus-visible:ring-0">
                                <CloudSettings />
                            </TabsContent>
                            <TabsContent value="sync" className="outline-none focus-visible:ring-0">
                                <SyncManagement />
                            </TabsContent>
                            <TabsContent value="network" className="outline-none focus-visible:ring-0">
                                <div className="max-w-2xl">
                                    <NetworkInfoCard />
                                </div>
                            </TabsContent>
                            <TabsContent value="licenses" className="outline-none focus-visible:ring-0">
                                <LicenseManagement />
                            </TabsContent>
                        </>
                    )}
                    <TabsContent value="training" className="outline-none focus-visible:ring-0">
                        <TrainingGuideTab />
                    </TabsContent>
                    {isSuperAdmin && (
                        <TabsContent value="security" className="outline-none focus-visible:ring-0">
                            <SuperAdminSecurity />
                        </TabsContent>
                    )}
                </div>
            </Tabs>
        </div>
    );
}
