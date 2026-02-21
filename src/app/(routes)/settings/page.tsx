import { Suspense } from "react";
import { getTranslations } from "@/lib/i18n-mock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, Printer, Database, Users, Shield, Globe } from "lucide-react";
import StoreConfig from "@/components/settings/StoreConfig";
import PrinterSettings from "@/components/settings/PrinterSettings";
import BackupManager from "@/components/settings/BackupManager";
import UserManagement from "@/components/settings/UserManagement";
import RoleManagement from "@/components/settings/RoleManagement";
import TablesManagement from "@/components/settings/TablesManagement";
import { getStoreSettings } from "@/actions/settings";
import { getUsersForPage } from "@/actions/users";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
    const t = await getTranslations('Settings');
    const session = await getSession();

    if (!session) {
        redirect("/login");
    }

    // Parallel data fetching
    const [settingsRes, users, roles, branches] = await Promise.all([
        getStoreSettings(),
        getUsersForPage().catch(() => []), // Fail gracefully if permission denied
        prisma.role.findMany(),
        prisma.branch.findMany({
            select: { id: true, name: true },
            where: { deletedAt: null }
        })
    ]);

    const settings = settingsRes?.data || {};

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-white">System Settings</h1>
                <p className="text-zinc-400">Manage your store configuration, devices, and team.</p>
            </div>

            <Tabs defaultValue="general" className="space-y-6">
                <TabsList className="bg-black/40 border border-white/10 p-1 h-auto flex-wrap justify-start gap-1">
                    <TabsTrigger value="general" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                        <Store className="w-4 h-4" /> General
                    </TabsTrigger>
                    <TabsTrigger value="printers" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                        <Printer className="w-4 h-4" /> Printers
                    </TabsTrigger>
                    <TabsTrigger value="backups" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                        <Database className="w-4 h-4" /> Backups
                    </TabsTrigger>
                    <TabsTrigger value="users" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                        <Users className="w-4 h-4" /> Users & Roles
                    </TabsTrigger>
                    <TabsTrigger value="tables" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex gap-2 items-center">
                        <Store className="w-4 h-4" /> Tables
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="outline-none">
                    <StoreConfig settings={settings} />
                </TabsContent>

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

                <TabsContent value="backups" className="outline-none">
                    <BackupManager />
                </TabsContent>

                <TabsContent value="users" className="outline-none space-y-6">
                    <Tabs defaultValue="staff" className="w-full">
                        <div className="flex items-center justify-between mb-4">
                            <TabsList className="bg-muted/30 p-1 border border-white/5 rounded-xl">
                                <TabsTrigger value="staff" className="px-4 py-2 data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-bold transition-all rounded-lg">
                                    Staff Members
                                </TabsTrigger>
                                <TabsTrigger value="roles" className="px-4 py-2 data-[state=active]:bg-purple-500 data-[state=active]:text-white font-bold transition-all rounded-lg">
                                    Roles & Permissions
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="staff" className="mt-0">
                            <UserManagement
                                users={users}
                                roles={roles}
                                branches={branches}
                                branchId={session.user.branchId || undefined}
                            />
                        </TabsContent>

                        <TabsContent value="roles" className="mt-0">
                            <RoleManagement initialRoles={roles} />
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                <TabsContent value="tables" className="outline-none">
                    <TablesManagement />
                </TabsContent>
            </Tabs>
        </div>
    );
}
