import { Suspense } from "react";
import { getTranslations } from "@/lib/i18n-mock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, Printer, Database, Users, Shield, Globe, Calculator } from "lucide-react";
import StoreConfig from "@/components/settings/StoreConfig";
import PrinterSettings from "@/components/settings/PrinterSettings";
import BackupManager from "@/components/settings/BackupManager";
import UserManagement from "@/components/settings/UserManagement";
import RoleManagement from "@/components/settings/RoleManagement";
import TablesManagement from "@/components/settings/TablesManagement";
import OpeningBalanceWizard from "@/components/setup/OpeningBalanceWizard";
import WarehouseSettings from "@/components/settings/WarehouseSettings";
import { getStoreSettings } from "@/actions/settings";
import { getUsersForPage } from "@/actions/users";
import { getRoles } from "@/actions/roles";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";

export default async function SettingsPage() {
    const t = await getTranslations('Settings');
    const session = await getSession();

    if (!session) {
        redirect("/login");
    }

    // Allow access if user has either full settings access OR just user management
    const canAccessSettings = session.user.role === 'ADMIN' || 
                             session.user.role === 'مدير النظام' || 
                             session.user.role === 'المالك' || 
                             hasPermission(session.user.permissions, '*') || 
                             hasPermission(session.user.permissions, PERMISSIONS.MANAGE_SETTINGS) || 
                             hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);
                             
    if (!canAccessSettings) {
        redirect('/unauthorized');
    }

    // Parallel data fetching
    const [settingsRes, users, rolesRes, branches, warehouses] = await Promise.all([
        getStoreSettings(),
        getUsersForPage().catch(() => []), // Fail gracefully if permission denied
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

    // Define default tab based on priority of permissions
    let defaultTab = "users";
    if (canManageGeneral) defaultTab = "general";
    else if (canManagePrinters) defaultTab = "printers";
    else if (canManageBackups) defaultTab = "backups";
    else if (canManageWarehouses) defaultTab = "warehouses";

    return (
        <div className="p-8 max-w-[1600px] mx-auto w-full">
            <div className="space-y-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-white">System Settings</h1>
                    <p className="text-zinc-400">Manage your store configuration, devices, and team.</p>
                </div>

                <Tabs defaultValue={defaultTab} className="space-y-6">
                    <TabsList className="bg-black/40 border border-white/10 p-1 h-auto flex-wrap justify-start gap-1">
                        {canManageGeneral && (
                            <TabsTrigger value="general" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Store className="w-4 h-4" /> {t('tabs.general', 'General')}
                            </TabsTrigger>
                        )}
                        {canSeePrinters && (
                            <TabsTrigger value="printers" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Printer className="w-4 h-4" /> {t('tabs.print', 'Printers')}
                            </TabsTrigger>
                        )}
                        {canManageBackups && (
                            <TabsTrigger value="backups" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Database className="w-4 h-4" /> {t('tabs.backup', 'Backups')}
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="users" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                            <Users className="w-4 h-4" /> Users & Roles
                        </TabsTrigger>

                        {canManageWarehouses && (
                            <TabsTrigger value="warehouses" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Database className="w-4 h-4" /> المستودعات
                            </TabsTrigger>
                        )}

                        {canManageTables && (
                            <TabsTrigger value="tables" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Store className="w-4 h-4" /> {t('tabs.tables_and_floors', 'Tables')}
                            </TabsTrigger>
                        )}

                        {canManageModules && (
                            <TabsTrigger value="modules" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Shield className="w-4 h-4" /> {t('tabs.modules', 'Modules')}
                            </TabsTrigger>
                        )}

                        {canManageAccounting && (
                            <TabsTrigger value="accounting" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Calculator className="w-4 h-4" /> {t('tabs.accounting', 'Accounting Setup')}
                            </TabsTrigger>
                        )}
                    </TabsList>

                    {canManageGeneral && (
                        <TabsContent value="general" className="outline-none">
                            <StoreConfig settings={settings} hideModules={true} />
                        </TabsContent>
                    )}

                    {canSeePrinters && (
                        <TabsContent value="printers" className="outline-none">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-6">
                                    <PrinterSettings />
                                </div>
                                <div className="space-y-6">
                                    <Card className="glass-card bg-transparent border-white/10 text-white">
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <Globe className="w-5 h-5 text-blue-400" /> Regional Settings
                                            </CardTitle>
                                            <CardDescription className="text-zinc-400">
                                                Language and localization preferences.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="p-3 bg-zinc-900/50 rounded-lg border border-white/10 text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span>Current Language</span>
                                                    <span className="font-bold flex items-center gap-2"><span className="text-lg">🇸🇦</span> Arabic (KSA)</span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    {canManageBackups && (
                        <TabsContent value="backups" className="outline-none">
                            <BackupManager />
                        </TabsContent>
                    )}

                    <TabsContent value="users" className="outline-none space-y-6">
                        <Tabs defaultValue="staff" className="w-full">
                            <div className="flex items-center justify-between mb-4">
                                <TabsList className="bg-muted/30 p-1 border border-white/5 rounded-xl">
                                    <TabsTrigger value="staff" className="px-4 py-2 data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-bold transition-all rounded-lg">
                                        Staff Members
                                    </TabsTrigger>
                                    {canManageRoles && (
                                        <TabsTrigger value="roles" className="px-4 py-2 data-[state=active]:bg-purple-500 data-[state=active]:text-white font-bold transition-all rounded-lg">
                                            Roles & Permissions
                                        </TabsTrigger>
                                    )}
                                </TabsList>
                            </div>

                            <TabsContent value="staff" className="mt-0">
                                <UserManagement
                                    users={users}
                                    roles={roles}
                                    branches={branches}
                                    branchId={session.user.branchId || undefined}
                                    currentUser={session.user}
                                />
                            </TabsContent>

                            {canManageRoles && (
                                <TabsContent value="roles" className="mt-0">
                                    <RoleManagement initialRoles={roles} currentUser={session.user} />
                                </TabsContent>
                            )}
                        </Tabs>
                    </TabsContent>

                    {canManageWarehouses && (
                        <TabsContent value="warehouses" className="outline-none">
                            <WarehouseSettings 
                                warehouses={warehouses as any} 
                                currentBranchId={session.user.branchId || undefined}
                            />
                        </TabsContent>
                    )}

                    {canManageTables && (
                        <TabsContent value="tables" className="outline-none">
                            <TablesManagement />
                        </TabsContent>
                    )}

                    {canManageModules && (
                        <TabsContent value="modules" className="outline-none">
                            <StoreConfig settings={settings} hideModules={false} />
                        </TabsContent>
                    )}

                    {canManageAccounting && (
                        <TabsContent value="accounting" className="outline-none">
                            <OpeningBalanceWizard />
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </div>
    );
}
