'use client'

import { useState, useEffect } from 'react'
import { Plus } from "lucide-react"
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

export default function TicketsClientPage({ user }: { user?: any }) {
    const t = useTranslations('Tickets');
    const locale = useLocale();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    // Tab state controlled by URL
    const currentTab = searchParams.get('tab') || 'tickets';
    
    const canViewEngineers = hasPermission(user?.permissions, PERMISSIONS.ENGINEER_VIEW);
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
            <div className="p-6 space-y-8 animate-fly-in">
                <div className="flex flex-col gap-6">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-extrabold tracking-tight text-white">{t('title')}</h1>
                        <p className="text-zinc-400 text-lg">{t('subtitle')}</p>
                    </div>

                    <Tabs 
                        value={currentTab} 
                        onValueChange={handleTabChange}
                        className="w-full flex flex-col items-end"
                    >
                        <div className="flex flex-row-reverse w-full items-start mb-6">
                            <div className="flex flex-col gap-6 items-end">
                                <Button asChild size="lg" className="h-12 px-8 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold border-0 rounded-xl shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02] group">
                                    <Link href={`/${locale}/maintenance/tickets/new`} className="flex items-center gap-2">
                                        <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
                                        {t('newTicket')}
                                    </Link>
                                </Button>

                                <TabsList className="bg-zinc-950/80 border border-white/5 p-1 w-full sm:w-auto justify-end backdrop-blur-md">
                                    <TabsTrigger value="tickets" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-bold h-10 px-6 rounded-lg transition-all">{t('tabs.allTickets')}</TabsTrigger>
                                    {canViewEngineers && (
                                        <TabsTrigger value="engineers" className="data-[state=active]:bg-purple-500 data-[state=active]:text-black font-bold h-10 px-6 rounded-lg transition-all">{t('tabs.engineers')}</TabsTrigger>
                                    )}
                                    {canViewEngineers && (
                                        <TabsTrigger value="custody" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-black font-bold h-10 px-6 rounded-lg transition-all">{t('tabs.custody')}</TabsTrigger>
                                    )}
                                    <TabsTrigger value="returns" className="data-[state=active]:bg-orange-500 data-[state=active]:text-black font-bold h-10 px-6 rounded-lg transition-all">{t('tabs.returns')}</TabsTrigger>
                                    <TabsTrigger value="warranty" className="data-[state=active]:bg-teal-500 data-[state=active]:text-black font-bold h-10 px-6 rounded-lg transition-all">{t('tabs.warranty')}</TabsTrigger>
                                </TabsList>
                            </div>
                        </div>

                        <div className="w-full text-right">
                            <TabsContent value="tickets" className="mt-6">
                                <TicketsList />
                            </TabsContent>

                            {canViewEngineers && (
                                <TabsContent value="engineers" className="mt-6">
                                    <EngineersManager />
                                </TabsContent>
                            )}

                            {canViewEngineers && (
                                <TabsContent value="custody" className="mt-6">
                                    <TechnicianCustodyTab />
                                </TabsContent>
                            )}

                            <TabsContent value="returns" className="mt-6">
                                <ReturnedTicketsTab />
                            </TabsContent>

                            <TabsContent value="warranty" className="mt-6">
                                <WarrantyTicketsTab />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </div>
        </ErrorBoundary>
    )
}
