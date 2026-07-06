import { Suspense } from "react";
import { getTranslations } from "@/lib/i18n-mock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, Printer, Database, Users, Shield, Globe, Calculator, Settings2, RefreshCw, MessageCircle, Cloud } from "lucide-react";
import StoreConfig from "@/components/settings/StoreConfig";
import MessagingSettings from "@/components/settings/MessagingSettings";
import PrinterSettings from "@/components/settings/PrinterSettings";
import BackupManager from "@/components/settings/BackupManager";
import UserManagement from "@/components/settings/UserManagement";
import RoleManagement from "@/components/settings/RoleManagement";
import TablesManagement from "@/components/settings/TablesManagement";
import OpeningBalanceWizard from "@/components/setup/OpeningBalanceWizard";
import WarehouseSettings from "@/components/settings/WarehouseSettings";
import SyncManagement from "@/components/settings/SyncManagement";
import CloudSettings from "@/components/settings/CloudSettings";
import LicenseManagement from "@/components/settings/LicenseManagement";
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
    
    // Permission Checks
    const canManageGeneral = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_SETTINGS);
    const canManagePrinters = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_PRINTERS);
    const canManageBackups = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_BACKUPS);
    const canManageUsers = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);
    const canManageRoles = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_ROLES);
    const canManageWarehouses = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_WAREHOUSES);
    const canManageTables = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_TABLES);
    const canManageModules = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_MODULES);
    const canManageAccounting = isAdmin || hasPermission(session.user.permissions, PERMISSIONS.MANAGE_ACCOUNTING_SETUP);

    const canSeePrinters = canManagePrinters || isAdmin;

    let defaultTab = "users";
    if (canManageGeneral) defaultTab = "general";
    else if (canManagePrinters) defaultTab = "printers";
    else if (canManageBackups) defaultTab = "backups";
    else if (canManageWarehouses) defaultTab = "warehouses";

    const validSessionBranchId = branches.find(b => b.id === session.user.branchId)?.id;

    return (
        <div className="p-6 max-w-[2400px] mx-auto w-full min-h-screen space-y-10 animate-in fade-in duration-700">
            {/* Premium Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-4">
                        <div className="w-2 h-10 bg-primary rounded-full shadow-[0_0_20px_rgba(var(--primary),0.5)]" />
                        {t('title', 'System Settings')}
                    </h1>
                    <p className="text-muted-foreground font-medium text-sm ms-6">{t('description', 'Manage your store configuration, devices, and team.')}</p>
                </div>
                <div className="flex items-center gap-3 bg-card/40 backdrop-blur-xl p-2 rounded-2xl border border-border/40 shadow-xl">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Settings2 className="w-5 h-5 text-primary" />
                    </div>
                </div>
            </div>

            <Tabs defaultValue={defaultTab} className="space-y-8">
                {/* Modern Glass Tabs List */}
                <TabsList className="bg-card/80 dark:bg-card/30 backdrop-blur-xl border border-border/40 p-1.5 h-auto flex-wrap justify-start gap-2 rounded-2xl shadow-xl overflow-hidden">
                    {canManageGeneral && (
                        <TabsTrigger 
                            value="general" 
                            className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-600 dark:data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                        >
                            <Store className="w-4 h-4 opacity-70" /> {t('tabs.general', 'General')}
                        </TabsTrigger>
                    )}
                    {canManageGeneral && (
                        <TabsTrigger 
                            value="messaging" 
                            className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-600 dark:data-[state=active]:text-green-400 data-[state=active]:border-green-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                        >
                            <MessageCircle className="w-4 h-4 opacity-70" /> {t('tabs.messaging', 'Messaging')}
                        </TabsTrigger>
                    )}
                    {canSeePrinters && (
                        <TabsTrigger 
                            value="printers" 
                            className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-600 dark:data-[state=active]:text-sky-400 data-[state=active]:border-sky-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                        >
                            <Printer className="w-4 h-4 opacity-70" /> {t('tabs.print', 'Printers')}
                        </TabsTrigger>
                    )}
                    <TabsTrigger 
                        value="users" 
                        className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-600 dark:data-[state=active]:text-violet-400 data-[state=active]:border-violet-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                    >
                        <Users className="w-4 h-4 opacity-70" /> Users & Roles
                    </TabsTrigger>

                    {canManageWarehouses && (
                        <TabsTrigger 
                            value="warehouses" 
                            className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:border-blue-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                        >
                            <Database className="w-4 h-4 opacity-70" /> المستودعات
                        </TabsTrigger>
                    )}

                    {canManageBackups && (
                        <TabsTrigger 
                            value="backups" 
                            className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                        >
                            <Database className="w-4 h-4 opacity-70" /> {t('tabs.backup', 'Backups')}
                        </TabsTrigger>
                    )}

                    {canManageTables && (
                        <TabsTrigger 
                            value="tables" 
                            className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 data-[state=active]:border-emerald-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                        >
                            <Store className="w-4 h-4 opacity-70" /> {t('tabs.tables_and_floors', 'Tables')}
                        </TabsTrigger>
                    )}

                    {canManageModules && (
                        <TabsTrigger 
                            value="modules" 
                            className="data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-600 dark:data-[state=active]:text-rose-400 data-[state=active]:border-rose-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                        >
                            <Shield className="w-4 h-4 opacity-70" /> {t('tabs.modules', 'Modules')}
                        </TabsTrigger>
                    )}

                    {canManageAccounting && (
                        <TabsTrigger 
                            value="accounting" 
                            className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:border-indigo-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                        >
                            <Calculator className="w-4 h-4 opacity-70" /> {t('tabs.accounting', 'Accounting')}
                        </TabsTrigger>
                    )}

                    {isAdmin && (
                        <>
                            <TabsTrigger 
                                value="cloud" 
                                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-600 dark:data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                            >
                                <Cloud className="w-4 h-4 opacity-70" /> Cloud Sync Config
                            </TabsTrigger>
                            <TabsTrigger 
                                value="licenses" 
                                className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-600 dark:data-[state=active]:text-violet-400 data-[state=active]:border-violet-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                            >
                                <Shield className="w-4 h-4 opacity-70" /> Client Licenses
                            </TabsTrigger>
                            <TabsTrigger 
                                value="sync" 
                                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-600 dark:data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50 border border-transparent px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5 flex gap-2.5 items-center"
                            >
                                <RefreshCw className="w-4 h-4 opacity-70" /> Sync Logs
                            </TabsTrigger>
                        </>
                    )}
                </TabsList>

                {/* Main Content Area */}
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
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
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
                                <div className="xl:col-span-2 space-y-6">
                                    <PrinterSettings />
                                </div>
                                <div className="space-y-6">
                                    <Card className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-3xl overflow-hidden shadow-xl relative group">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-3 font-black text-lg">
                                                <Globe className="w-5 h-5 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" /> 
                                                <span className="uppercase tracking-tight">Regional Settings</span>
                                            </CardTitle>
                                            <CardDescription className="text-muted-foreground font-bold text-xs">
                                                Language and localization preferences.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="p-5 bg-background/40 rounded-2xl border border-border/20 text-sm shadow-inner group-hover:border-blue-500/40 transition-colors">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs uppercase font-black tracking-widest text-muted-foreground">Current Language</span>
                                                    <span className="font-black flex items-center gap-2 text-foreground">
                                                        <span className="text-xl">🇸🇦</span> Arabic (KSA)
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
                        <Tabs defaultValue="staff" className="w-full space-y-6">
                            <div className="flex items-center justify-between">
                                <TabsList className="bg-card/80 dark:bg-card/30 backdrop-blur-xl p-1.5 border border-border/40 rounded-2xl shadow-lg h-auto">
                                    <TabsTrigger 
                                        value="staff" 
                                        className="px-6 py-2.5 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-600 dark:data-[state=active]:text-violet-400 data-[state=active]:border-violet-500/50 border border-transparent font-black text-xs uppercase tracking-widest transition-all rounded-xl"
                                    >
                                        Staff Members
                                    </TabsTrigger>
                                    {canManageRoles && (
                                        <TabsTrigger 
                                            value="roles" 
                                            className="px-6 py-2.5 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 data-[state=active]:border-purple-500/50 border border-transparent font-black text-xs uppercase tracking-widest transition-all rounded-xl"
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
                            <TabsContent value="licenses" className="outline-none focus-visible:ring-0">
                                <LicenseManagement />
                            </TabsContent>
                            <TabsContent value="sync" className="outline-none focus-visible:ring-0">
                                <SyncManagement />
                            </TabsContent>
                        </>
                    )}
                </div>
            </Tabs>
        </div>
    );
}
