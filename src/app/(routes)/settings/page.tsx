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
import { getStoreSettings } from "@/actions/settings";
import { getUsersForPage } from "@/actions/users";
import { getRoles } from "@/actions/roles";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";

export default async function SettingsPage() {
    const t = await getTranslations('Settings');
    const session = await getSession();

    if (!session) {
        redirect("/login");
    }

    // Allow access if user has either full settings access OR just user management
    const canAccessSettings = session.user.role === 'ADMIN' || session.user.role === 'مدير النظام' || session.user.role === 'المالك' || session.user.permissions?.includes('*') || session.user.permissions?.includes(PERMISSIONS.MANAGE_SETTINGS) || session.user.permissions?.includes(PERMISSIONS.MANAGE_USERS);
    if (!canAccessSettings) {
        redirect('/unauthorized');
    }

    // Parallel data fetching
    const [settingsRes, users, rolesRes, branches] = await Promise.all([
        getStoreSettings(),
        getUsersForPage().catch(() => []), // Fail gracefully if permission denied
        getRoles(),
        prisma.branch.findMany({
            select: { id: true, name: true },
            where: { deletedAt: null }
        })
    ]);

    const roles = rolesRes.success ? (rolesRes.data ?? []) : [];

    const settings = settingsRes?.data || {};
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'مدير النظام' || session.user.role === 'المالك' || session.user.permissions?.includes('*');
    const canManageSettings = isAdmin || session.user.permissions?.includes(PERMISSIONS.MANAGE_SETTINGS);
    const canManageUsers = isAdmin || session.user.permissions?.includes(PERMISSIONS.MANAGE_USERS);
    const isManager = session.user.role === 'BRANCH_MANAGER' || session.user.role === 'Branch Manager' || canManageUsers;
    const canSeePrinters = canManageSettings || isManager;

    const defaultTab = canManageSettings ? "general" : "users";

    return (
        <div className="p-8 max-w-[1600px] mx-auto w-full">
            <div className="space-y-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-white">System Settings</h1>
                    <p className="text-zinc-400">Manage your store configuration, devices, and team.</p>
                </div>

                <Tabs defaultValue={defaultTab} className="space-y-6">
                    <TabsList className="bg-black/40 border border-white/10 p-1 h-auto flex-wrap justify-start gap-1">
                        {canManageSettings && (
                            <TabsTrigger value="general" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Store className="w-4 h-4" /> General
                            </TabsTrigger>
                        )}
                        {canSeePrinters && (
                            <TabsTrigger value="printers" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Printer className="w-4 h-4" /> Printers
                            </TabsTrigger>
                        )}
                        {canManageSettings && (
                            <TabsTrigger value="backups" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                <Database className="w-4 h-4" /> Backups
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="users" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                            <Users className="w-4 h-4" /> Users & Roles
                        </TabsTrigger>
                        {canManageSettings && (
                            <>
                                <TabsTrigger value="tables" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                    <Store className="w-4 h-4" /> Tables
                                </TabsTrigger>
                                <TabsTrigger value="accounting" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                                    <Calculator className="w-4 h-4" /> Accounting Setup
                                </TabsTrigger>
                            </>
                        )}
                    </TabsList>

                    {canManageSettings && (
                        <TabsContent value="general" className="outline-none">
                            <StoreConfig settings={settings} />
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

                    {canManageSettings && (
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
                                    {canManageSettings && (
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

                            {canManageSettings && (
                                <TabsContent value="roles" className="mt-0">
                                    <RoleManagement initialRoles={roles} currentUser={session.user} />
                                </TabsContent>
                            )}
                        </Tabs>
                    </TabsContent>

                    {canManageSettings && (
                        <>
                            <TabsContent value="tables" className="outline-none">
                                <TablesManagement />
                            </TabsContent>

                            <TabsContent value="accounting" className="outline-none">
                                <OpeningBalanceWizard />
                            </TabsContent>
                        </>
                    )}
                </Tabs>
            </div>
        </div>
    );
}
