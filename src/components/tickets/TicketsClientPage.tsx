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
    const currentTab = searchParams.get('tab') || 'tickets';
    
    const canViewEngineers = hasPermission(user?.permissions, PERMISSIONS.ENGINEER_VIEW);
    const canViewProfitReport = hasPermission(user?.permissions, PERMISSIONS.REPORTS_VIEW) || canViewEngineers;
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', value);
        router.replace(`/${locale}/maintenance/tickets?${params.toString()}`, { scroll: false });
    };

    if (!isMounted) {
        return null;
    }

    return (
        <ErrorBoundary>
            <div className="p-8 w-full space-y-8 animate-in fade-in duration-500 font-cairo" dir="rtl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-200 dark:border-white/5">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-3xl font-black flex items-center gap-3 text-zinc-900 dark:text-white uppercase tracking-tight">
                            <div className="p-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/20">
                                <Wrench className="w-6 h-6" />
                            </div>
                            {t('title')}
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 font-bold text-sm tracking-wide mt-1">{t('subtitle')}</p>
                    </div>


                </div>

                <div className="flex flex-col gap-6">
                    <Tabs 
                        value={currentTab} 
                        onValueChange={handleTabChange}
                        className="w-full flex flex-col items-start"
                    >
                        <div className="relative flex w-full justify-center items-center py-2">
                            <div className="absolute right-0">
                                <Button 
                                    asChild 
                                    size="lg" 
                                    className="h-12 px-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black border-0 rounded-xl shadow-lg shadow-zinc-900/10 transition-all hover:scale-[1.02] hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-95 group uppercase tracking-widest text-xs"
                                >
                                    <Link href={`/${locale}/maintenance/tickets/new`} className="flex items-center gap-2">
                                        <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
                                        {t('newTicket')}
                                    </Link>
                                </Button>
                            </div>

                            <div className="flex gap-2 p-1.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-white/10 w-full sm:w-fit shadow-inner overflow-x-auto custom-scrollbar relative mx-auto">
                                <TabsList className="bg-transparent border-none p-0 h-auto gap-2 flex-nowrap w-max">
                                    <TabsTrigger 
                                        value="tickets" 
                                        className="h-12 px-6 rounded-xl text-sm font-black transition-all tracking-wide uppercase data-[state=active]:bg-zinc-900 dark:data-[state=active]:bg-white data-[state=active]:text-white dark:data-[state=active]:text-zinc-900 data-[state=active]:shadow-xl text-zinc-500 dark:text-zinc-400 data-[state=inactive]:hover:bg-zinc-200 dark:data-[state=inactive]:hover:bg-white/5"
                                    >
                                        {t('tabs.allTickets')}
                                    </TabsTrigger>
                                    {canViewEngineers && (
                                        <TabsTrigger 
                                            value="engineers" 
                                            className="h-12 px-6 rounded-xl text-sm font-black transition-all tracking-wide uppercase data-[state=active]:bg-zinc-900 dark:data-[state=active]:bg-white data-[state=active]:text-white dark:data-[state=active]:text-zinc-900 data-[state=active]:shadow-xl text-zinc-500 dark:text-zinc-400 data-[state=inactive]:hover:bg-zinc-200 dark:data-[state=inactive]:hover:bg-white/5"
                                        >
                                            {t('tabs.engineers')}
                                        </TabsTrigger>
                                    )}
                                    {canViewEngineers && (
                                        <TabsTrigger 
                                            value="custody" 
                                            className="h-12 px-6 rounded-xl text-sm font-black transition-all tracking-wide uppercase data-[state=active]:bg-zinc-900 dark:data-[state=active]:bg-white data-[state=active]:text-white dark:data-[state=active]:text-zinc-900 data-[state=active]:shadow-xl text-zinc-500 dark:text-zinc-400 data-[state=inactive]:hover:bg-zinc-200 dark:data-[state=inactive]:hover:bg-white/5"
                                        >
                                            {t('tabs.custody')}
                                        </TabsTrigger>
                                    )}
                                    {canViewProfitReport && (
                                        <TabsTrigger 
                                            value="profit-report" 
                                            className="h-12 px-6 rounded-xl text-sm font-black transition-all tracking-wide uppercase data-[state=active]:bg-zinc-900 dark:data-[state=active]:bg-white data-[state=active]:text-white dark:data-[state=active]:text-zinc-900 data-[state=active]:shadow-xl text-zinc-500 dark:text-zinc-400 data-[state=inactive]:hover:bg-zinc-200 dark:data-[state=inactive]:hover:bg-white/5"
                                        >
                                            {t('tabs.maintenanceProfit')}
                                        </TabsTrigger>
                                    )}
                                    <TabsTrigger 
                                        value="returns" 
                                        className="h-12 px-6 rounded-xl text-sm font-black transition-all tracking-wide uppercase data-[state=active]:bg-zinc-900 dark:data-[state=active]:bg-white data-[state=active]:text-white dark:data-[state=active]:text-zinc-900 data-[state=active]:shadow-xl text-zinc-500 dark:text-zinc-400 data-[state=inactive]:hover:bg-zinc-200 dark:data-[state=inactive]:hover:bg-white/5"
                                    >
                                        {t('tabs.returns')}
                                    </TabsTrigger>
                                    <TabsTrigger 
                                        value="warranty" 
                                        className="h-12 px-6 rounded-xl text-sm font-black transition-all tracking-wide uppercase data-[state=active]:bg-zinc-900 dark:data-[state=active]:bg-white data-[state=active]:text-white dark:data-[state=active]:text-zinc-900 data-[state=active]:shadow-xl text-zinc-500 dark:text-zinc-400 data-[state=inactive]:hover:bg-zinc-200 dark:data-[state=inactive]:hover:bg-white/5"
                                    >
                                        {t('tabs.warranty')}
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </div>

                        <div className="w-full mt-8">
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
