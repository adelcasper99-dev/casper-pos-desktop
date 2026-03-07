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
import { useTranslations } from '@/lib/i18n-mock'
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default function TicketsClientPage({ user }: { user?: any }) {
    const t = useTranslations('Tickets');
    const canViewEngineers = hasPermission(user?.permissions, PERMISSIONS.ENGINEER_VIEW);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return (
        <ErrorBoundary>
            <div className="p-6 space-y-6 animate-fly-in">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">{t('title')}</h1>
                        <p className="text-zinc-400 mt-1">{t('subtitle')}</p>
                    </div>
                    <Button asChild size="lg" className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold border-0">
                        <Link href="/ar/maintenance/tickets/new">
                            <Plus className="h-4 w-4" />
                            {t('newTicket')}
                        </Link>
                    </Button>
                </div>

                <Tabs defaultValue="tickets" className="w-full">
                    <TabsList className="bg-white/5 border border-white/5 p-1 w-full sm:w-auto">
                        <TabsTrigger value="tickets" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black">{t('tabs.allTickets')}</TabsTrigger>
                        {canViewEngineers && (
                            <TabsTrigger value="engineers" className="data-[state=active]:bg-purple-500 data-[state=active]:text-black">{t('tabs.engineers')}</TabsTrigger>
                        )}
                        {canViewEngineers && (
                            <TabsTrigger value="custody" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-black">{t('tabs.custody')}</TabsTrigger>
                        )}
                        <TabsTrigger value="returns" className="data-[state=active]:bg-orange-500 data-[state=active]:text-black">{t('tabs.returns')}</TabsTrigger>
                        <TabsTrigger value="warranty" className="data-[state=active]:bg-teal-500 data-[state=active]:text-black">{t('tabs.warranty')}</TabsTrigger>
                    </TabsList>

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
                </Tabs>
            </div>
        </ErrorBoundary>
    )
}
