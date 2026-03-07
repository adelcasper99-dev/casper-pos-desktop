'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Wrench, Percent, Clock, ArrowRightLeft, Package, List, AlertTriangle, RotateCcw, RefreshCcw, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from 'next/link'
import { useTranslations } from '@/lib/i18n-mock'
import { getEngineerDetails, getEngineerStock } from "@/actions/engineer-actions"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import EngineerHistory from "@/components/tickets/EngineerHistory"
import EngineerConsumption from "@/components/tickets/EngineerConsumption"
import { Loader2 } from "lucide-react"
import TransferConsole from "@/components/tickets/TransferConsole"
import { useCSRF } from "@/contexts/CSRFContext"
import { getTechniciansForCustody } from "@/actions/technician-custody-actions"
import { getWarehousesByBranch } from "@/actions/branch-actions"

interface EngineerDetailsClientProps {
    id: string;
}

export default function EngineerDetailsClient({ id }: EngineerDetailsClientProps) {
    const t = useTranslations('Tickets.engineers');
    const { token: csrfToken } = useCSRF();
    const [engineer, setEngineer] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [viewTab, setViewTab] = useState<'overview' | 'stock' | 'history' | 'consumption'>('overview')
    const [stock, setStock] = useState<any[]>([])

    // Transfer Console State
    const [isTransferConsoleOpen, setIsTransferConsoleOpen] = useState(false);
    const [transferDestinations, setTransferDestinations] = useState<any[]>([]);

    useEffect(() => {
        loadEngineer()
    }, [id])

    async function loadEngineer() {
        try {
            const res = await getEngineerDetails(id)
            if (res.success && res.data) {
                setEngineer(res.data)
                // If they have a warehouse, load stock
                if (res.data.warehouseId) {
                    loadStock(res.data.warehouseId)
                }
            }
        } catch (error) {
            console.error("Failed to load engineer", error)
        } finally {
            setLoading(false)
        }
    }

    async function loadStock(warehouseId: string) {
        const res = await getEngineerStock(warehouseId)
        if (res.success) setStock(res.data || [])
    }

    // Load destinations for transfer console
    useEffect(() => {
        if (isTransferConsoleOpen && engineer) {
            const loadDestinations = async () => {
                const dests: any[] = [];

                // 1. Technicians
                const techsRes = await getTechniciansForCustody();
                if (techsRes.data) {
                    techsRes.data
                        .filter((t: any) => t.id !== engineer.id)
                        .forEach((t: any) => dests.push({ id: t.id, name: t.name, type: 'ENGINEER' }));
                }

                // 2. Warehouses
                if (engineer.user?.branchId) {
                    const whRes = await getWarehousesByBranch(engineer.user.branchId);
                    if (whRes.success && whRes.data) {
                        whRes.data.forEach((w: any) => dests.push({ id: w.id, name: w.name, type: 'WAREHOUSE' }));
                    }
                }

                setTransferDestinations(dests);
            };
            loadDestinations();
        }
    }, [isTransferConsoleOpen, engineer]);

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            </div>
        )
    }

    if (!engineer) {
        return <div className="p-8 text-center text-white">Engineer not found</div>
    }

    return (
        <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild className="text-zinc-400 hover:text-white hover:bg-white/10">
                    <Link href="/maintenance/tickets?tab=engineers">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-white">{engineer.name}</h1>
                    <div className="flex items-center gap-2 text-zinc-400 text-sm">
                        <span>{engineer.phone}</span>
                        {engineer.warehouse && (
                            <Badge variant="outline" className="border-white/10 text-zinc-400">
                                {engineer.warehouse.name}
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b border-white/10 pb-2 overflow-x-auto">
                {(['overview', 'stock', 'history', 'consumption'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setViewTab(tab)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${viewTab === tab
                            ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/50'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {t(`tabs.${tab}`)}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">
                {viewTab === 'overview' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 duration-300">
                        {/* Total Tickets */}
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mb-3">
                                    <List className="w-6 h-6 text-blue-400" />
                                </div>
                                <div className="text-3xl font-bold text-white">{engineer.totalTicketsCount || 0}</div>
                                <div className="text-sm text-zinc-400">{t('stats.totalTickets')}</div>
                            </CardContent>
                        </Card>

                        {/* Active/Pending Tickets */}
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mb-3">
                                    <Activity className="w-6 h-6 text-amber-400" />
                                </div>
                                <div className="text-3xl font-bold text-white">{engineer.activeTicketsCount || 0}</div>
                                <div className="text-sm text-zinc-400">{t('stats.activeTickets')}</div>
                            </CardContent>
                        </Card>

                        {/* Completed Tickets */}
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center mb-3">
                                    <Wrench className="w-6 h-6 text-cyan-400" />
                                </div>
                                <div className="text-3xl font-bold text-white">{engineer.completedTicketsCount || 0}</div>
                                <div className="text-sm text-zinc-400">{t('stats.completed')}</div>
                            </CardContent>
                        </Card>

                        {/* Average Time */}
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                                    <Clock className="w-6 h-6 text-green-400" />
                                </div>
                                <div className="text-3xl font-bold text-white">{engineer.averageRepairTime || "0.0"}h</div>
                                <div className="text-sm text-zinc-400">{t('stats.avgTime')}</div>
                            </CardContent>
                        </Card>

                        {/* Commission */}
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-3">
                                    <Percent className="w-6 h-6 text-purple-400" />
                                </div>
                                <div className="text-3xl font-bold text-white">{engineer.commissionRate}%</div>
                                <div className="text-sm text-zinc-400">{t('form.commission')}</div>
                            </CardContent>
                        </Card>

                        {/* Returned */}
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center mb-3">
                                    <RotateCcw className="w-6 h-6 text-orange-400" />
                                </div>
                                <div className="text-3xl font-bold text-white">{engineer.returnedTicketsCount || 0}</div>
                                <div className="text-sm text-zinc-400">{t('stats.returned')}</div>
                            </CardContent>
                        </Card>

                        {/* Refunded */}
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-pink-500/20 flex items-center justify-center mb-3">
                                    <RefreshCcw className="w-6 h-6 text-pink-400" />
                                </div>
                                <div className="text-3xl font-bold text-white">{engineer.refundedTicketsCount || 0}</div>
                                <div className="text-sm text-zinc-400">{t('stats.refunded')}</div>
                            </CardContent>
                        </Card>

                        {/* Loss */}
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
                                    <AlertTriangle className="w-6 h-6 text-red-400" />
                                </div>
                                <div className="text-3xl font-bold text-white">{engineer.lossCount || 0}</div>
                                <div className="text-sm text-zinc-400">{t('stats.loss')}</div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {viewTab === 'stock' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="flex justify-end gap-2 mb-4">
                            <Button
                                size="sm"
                                variant="secondary"
                                className="h-10 border-white/10 hover:bg-white/10"
                                onClick={() => setIsTransferConsoleOpen(true)}
                                disabled={stock.length === 0}
                            >
                                <ArrowRightLeft className="w-4 h-4 mr-2" /> Handover
                            </Button>
                        </div>

                        {stock.length === 0 ? (
                            <div className="text-center py-12 text-zinc-500 italic border border-dashed border-white/10 rounded-lg">
                                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                {t('details.noStock')}
                            </div>
                        ) : (
                            <div className="border border-white/5 rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left text-zinc-400">
                                    <thead className="bg-white/5 text-xs uppercase">
                                        <tr>
                                            <th className="p-3">{t('details.product')}</th>
                                            <th className="p-3 text-center">{t('details.qty')}</th>
                                            <th className="p-3 text-right">{t('details.value')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {stock.map(s => (
                                            <tr key={s.id} className="hover:bg-white/5 transition-colors">
                                                <td className="p-3 text-white font-medium">{s.product.name}</td>
                                                <td className="p-3 text-center">
                                                    <Badge variant="outline" className="font-mono bg-white/5 border-white/10">
                                                        {s.quantity}
                                                    </Badge>
                                                </td>
                                                <td className="p-3 text-right text-emerald-400 font-mono">
                                                    {formatCurrency(Number(s.product.sellPrice) * s.quantity)}
                                                </td>

                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {viewTab === 'history' && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                        <EngineerHistory engineerId={engineer.id} />
                    </div>
                )}

                {viewTab === 'consumption' && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                        <EngineerConsumption engineerId={engineer.id} />
                    </div>
                )}
            </div>

            {/* Use the shared TransferConsole component - reuse from EngineersManager logic */}
            {
                engineer && (
                    <TransferConsole
                        isOpen={isTransferConsoleOpen}
                        onClose={() => setIsTransferConsoleOpen(false)}
                        availableSources={[{
                            id: engineer.id,
                            name: engineer.name,
                            type: 'ENGINEER',
                            warehouseId: engineer.warehouseId
                        }]}
                        availableDestinations={transferDestinations}
                        initialSourceId={engineer.id}
                        csrfToken={csrfToken || undefined}
                        onTransferComplete={() => {
                            if (engineer.warehouseId) loadStock(engineer.warehouseId)
                        }}
                    />
                )
            }
        </div>
    )
}
