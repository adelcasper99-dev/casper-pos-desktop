'use client'

import { useState, useEffect } from 'react'
import { Plus, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TicketsList from "@/components/tickets/TicketsList"
import EngineersManager from "@/components/tickets/EngineersManager"
import TechnicianCustodyTab from "@/components/maintenance/TechnicianCustodyTab"
import ReturnedTicketsTab from "@/components/tickets/ReturnedTicketsTab"
import WarrantyTicketsTab from "@/components/tickets/WarrantyTicketsTab"
import { useTranslations, useLocale } from '@/lib/i18n-mock'
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { MaintenanceProfitReport } from "@/components/reports/MaintenanceProfitReport"

export default function TicketsClientPage({ user }: { user?: any }) {
    const t = useTranslations('Tickets');
    const locale = useLocale();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    // Tab state controlled by URL
    const currentTab = searchParams?.get('tab') || 'tickets';
    
    const canViewEngineers = hasPermission(user?.permissions, PERMISSIONS.ENGINEER_VIEW);
    const canViewProfitReport = hasPermission(user?.permissions, PERMISSIONS.REPORTS_VIEW) || canViewEngineers;
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('tab', value);
        router.replace(`/${locale}/maintenance/tickets?${params.toString()}`, { scroll: false });
    };

    if (!isMounted) {
        return null;
    }

    return (
        <ErrorBoundary>
            <div className="p-4 md:p-6 w-full max-w-[1600px] mx-auto space-y-4 animate-in fade-in duration-500 font-cairo" dir="rtl">
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm">
                            <Wrench className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                {t('title')}
                            </h1>
                            <p className="text-slate-500 dark:text-zinc-400 font-medium text-xs mt-0.5">{t('subtitle')}</p>
                        </div>
                    </div>
                </div>

                {/* Tabs & Action Bar */}
                <div className="flex flex-col gap-4">
                    <Tabs 
                        value={currentTab} 
                        onValueChange={handleTabChange}
                        className="w-full flex flex-col items-start"
                    >
                        <div className="flex flex-col md:flex-row w-full justify-between items-stretch md:items-center gap-3">
                            {/* Navigation Tabs Pill Bar */}
                            <div className="p-1 bg-slate-100 dark:bg-zinc-900/60 rounded-xl border border-slate-200/80 dark:border-white/10 w-full md:w-auto shadow-inner overflow-x-auto no-scrollbar">
                                <TabsList className="bg-transparent border-none p-0 h-auto gap-1 flex-nowrap w-max">
                                    <TabsTrigger 
                                        value="tickets" 
                                        className="h-8 px-3.5 rounded-lg text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                                    >
                                        {t('tabs.allTickets')}
                                    </TabsTrigger>
                                    {canViewEngineers && (
                                        <TabsTrigger 
                                            value="engineers" 
                                            className="h-8 px-3.5 rounded-lg text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                                        >
                                            {t('tabs.engineers')}
                                        </TabsTrigger>
                                    )}
                                    {canViewEngineers && (
                                        <TabsTrigger 
                                            value="custody" 
                                            className="h-8 px-3.5 rounded-lg text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                                        >
                                            {t('tabs.custody')}
                                        </TabsTrigger>
                                    )}
                                    {canViewProfitReport && (
                                        <TabsTrigger 
                                            value="profit-report" 
                                            className="h-8 px-3.5 rounded-lg text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                                        >
                                            {t('tabs.maintenanceProfit')}
                                        </TabsTrigger>
                                    )}
                                    <TabsTrigger 
                                        value="returns" 
                                        className="h-8 px-3.5 rounded-lg text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                                    >
                                        {t('tabs.returns')}
                                    </TabsTrigger>
                                    <TabsTrigger 
                                        value="warranty" 
                                        className="h-8 px-3.5 rounded-lg text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                                    >
                                        {t('tabs.warranty')}
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            {/* Create Ticket Action Button */}
                            <Button 
                                asChild 
                                size="sm" 
                                className="h-9 px-4 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 font-bold border-0 rounded-xl shadow-sm transition-all hover:bg-slate-800 dark:hover:bg-zinc-100 active:scale-95 group text-xs shrink-0"
                            >
                                <Link href={`/${locale}/maintenance/tickets/new`} className="flex items-center gap-1.5">
                                    <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
                                    <span>{t('newTicket')}</span>
                                </Link>
                            </Button>
                        </div>

                        <div className="w-full mt-4">
                            <TabsContent value="tickets" className="mt-0 outline-none">
                                <TicketsList />
                            </TabsContent>

                            {canViewEngineers && (
                                <TabsContent value="engineers" className="mt-0 outline-none">
                                    <EngineersManager />
                                </TabsContent>
                            )}

                            {canViewEngineers && (
                                <TabsContent value="custody" className="mt-0 outline-none">
                                    <TechnicianCustodyTab />
                                </TabsContent>
                            )}

                            {canViewProfitReport && (
                                <TabsContent value="profit-report" className="mt-0 outline-none">
                                    <MaintenanceProfitReport isTab={true} />
                                </TabsContent>
                            )}

                            <TabsContent value="returns" className="mt-0 outline-none">
                                <ReturnedTicketsTab />
                            </TabsContent>

                            <TabsContent value="warranty" className="mt-0 outline-none">
                                <WarrantyTicketsTab />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </div>
        </ErrorBoundary>
    )
}
