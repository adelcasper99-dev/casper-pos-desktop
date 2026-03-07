'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, User as UserIcon, CheckCircle2, Clock, Search, ExternalLink, Trash2, Loader2, Save, Wrench, Percent } from "lucide-react"
import { getEngineersStats, upsertEngineer, getBranches, deleteEngineer } from "@/actions/engineer-actions"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import GlassModal from "@/components/ui/GlassModal"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCSRF } from "@/contexts/CSRFContext"
import { useTranslations, useLocale } from '@/lib/i18n-mock';
import Link from 'next/link'

export default function EngineersManager() {
    const { token: csrfToken } = useCSRF()
    const t = useTranslations('Tickets.engineers');
    const tCommon = useTranslations('Common');
    const locale = useLocale();

    const [engineers, setEngineers] = useState<any[]>([])
    const [branches, setBranches] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        skills: '',
        commissionRate: 0,
        lossRate: 70,
        username: '',
        password: '',
        createWarehouse: false,
        branchId: ''
    })

    useEffect(() => {
        Promise.all([
            getEngineersStats().then((res: any) => setEngineers(res.data?.data || res.data || [])),
            getBranches().then((res: any) => {
                if (!res.success) {
                    toast.error(res.error || "Failed to fetch branches");
                    setBranches([]);
                } else {
                    setBranches(res.data || []);
                }
            }).catch(() => {
                toast.error("Network error fetching branches");
            })
        ]).finally(() => setLoading(false))
    }, [])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!csrfToken) {
            toast.error("Security token missing");
            return;
        }

        try {
            const res = await upsertEngineer({
                id: editingId || undefined,
                ...formData,
                csrfToken
            })
            if (res.success) {
                toast.success(editingId ? "Engineer updated" : "Engineer added")
                setIsDialogOpen(false)
                const statsRes = await getEngineersStats()
                setEngineers((statsRes as any).data?.data || (statsRes as any).data || [])
            } else {
                toast.error(res.error || "Failed to save");
            }
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}?`)) return
        if (!csrfToken) {
            toast.error("Security token missing");
            return;
        }

        try {
            const res = await deleteEngineer({ id, csrfToken })
            if (res.success) {
                toast.success("Engineer deleted")
                const statsRes = await getEngineersStats()
                setEngineers((statsRes as any).data?.data || (statsRes as any).data || [])
            } else {
                toast.error(res.error || "Failed to delete");
            }
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const totalEngineers = engineers.length
    const activeTicketsCount = engineers.reduce((sum, e) => sum + (e.activeTicketsCount || 0), 0)
    const avgCommission = totalEngineers > 0
        ? (engineers.reduce((sum, e) => sum + Number(e.commissionRate || 0), 0) / totalEngineers).toFixed(1)
        : 0

    const filteredEngineers = engineers.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.phone?.includes(search)
    )

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center text-cyan-500">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fly-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-white/5 border-white/5">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-zinc-500">{t('stats.totalEngineers')}</p>
                            <h3 className="text-2xl font-bold text-white mt-1">{totalEngineers}</h3>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                            <UserIcon className="h-5 w-5 text-cyan-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/5">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-zinc-500">{t('stats.activeTickets')}</p>
                            <h3 className="text-2xl font-bold text-white mt-1">{activeTicketsCount}</h3>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                            <Wrench className="h-5 w-5 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/5">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-zinc-500">{t('stats.avgCommission')}</p>
                            <h3 className="text-2xl font-bold text-white mt-1">{avgCommission}%</h3>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                            <Percent className="h-5 w-5 text-green-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5 shadow-xl bg-black/20">
                <div className="relative w-full sm:w-96 group/search">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within/search:text-cyan-500 transition-all" />
                    <Input
                        placeholder={t('searchPlaceholder')}
                        className="pl-9 bg-black/40 border-white/10 focus:border-cyan-500/50 transition-all rounded-xl"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Button onClick={() => {
                    setEditingId(null)
                    setFormData({
                        name: '', phone: '', skills: '', commissionRate: 0, lossRate: 70,
                        username: '', password: '', createWarehouse: true, branchId: branches[0]?.id || ''
                    })
                    setIsDialogOpen(true)
                }} className="w-full sm:w-auto bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border-0 text-white font-bold h-11 px-6">
                    <Plus className="w-4 h-4 mr-2" />
                    {t('addEngineer')}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredEngineers.map((eng) => (
                    <Card key={eng.id} className="group bg-white/5 border-white/10 hover:border-cyan-500/30 transition-all duration-300 shadow-xl overflow-hidden glass-card">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-lg font-bold text-white truncate pr-4">
                                {eng.name}
                            </CardTitle>
                            {eng.warehouse && (
                                <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-[10px] uppercase tracking-wider">
                                    {eng.warehouse.name}
                                </Badge>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between text-sm text-zinc-500 mb-4">
                                <span className="flex items-center">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {eng.averageRepairTime}h avg
                                </span>
                                <span className="flex items-center text-cyan-500 font-medium">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    {eng.completedTicketsCount} {tCommon('done') || 'done'}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/5">
                                <Button
                                    variant="ghost"
                                    className="w-full justify-start text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
                                    onClick={() => {
                                        setEditingId(eng.id)
                                        setFormData({
                                            name: eng.name,
                                            phone: eng.phone || '',
                                            skills: eng.skills || '',
                                            commissionRate: Number(eng.commissionRate),
                                            lossRate: Number(eng.lossRate || 70),
                                            username: eng.user?.username || '',
                                            password: '',
                                            createWarehouse: false,
                                            branchId: eng.user?.branchId || ''
                                        })
                                        setIsDialogOpen(true)
                                    }}
                                >
                                    {tCommon('edit')}
                                </Button>
                                <Button
                                    asChild
                                    variant="ghost"
                                    className="w-full justify-end text-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/5 transition-all"
                                >
                                    <Link href={`/${locale}/maintenance/tickets/engineers/${eng.id}`}>
                                        {tCommon('view')}
                                        <ExternalLink className="w-4 h-4 ml-2" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <GlassModal
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                title={editingId ? t('editEngineer') : t('addEngineer')}
            >
                <form onSubmit={handleSave} className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-400">{t('form.name')}</Label>
                            <Input
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="bg-black/40 border-white/10 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-400">{t('form.phone')}</Label>
                            <Input
                                required
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                className="bg-black/40 border-white/10 text-white"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-zinc-400">{t('form.branch')}</Label>
                        <Select
                            value={formData.branchId}
                            onValueChange={(val) => setFormData({ ...formData, branchId: val })}
                        >
                            <SelectTrigger className="bg-black/40 border-white/10 text-white">
                                <SelectValue placeholder="Select Branch" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                {branches.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-400">{t('form.skills')}</Label>
                            <Input
                                value={formData.skills}
                                onChange={e => setFormData({ ...formData, skills: e.target.value })}
                                className="bg-black/40 border-white/10 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-400">{t('form.commission')}</Label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={formData.commissionRate}
                                    onChange={e => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) })}
                                    className="bg-black/40 border-white/10 text-white pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600">%</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-400">Loss Rate</Label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={formData.lossRate}
                                    onChange={e => setFormData({ ...formData, lossRate: parseFloat(e.target.value) })}
                                    className="bg-black/40 border-white/10 text-white pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600">%</span>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-white/5 pt-4 mt-4">
                        <h4 className="text-sm font-medium text-zinc-500 mb-4">{t('form.loginSettings')}</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-400">{t('form.username')}</Label>
                                <Input
                                    value={formData.username}
                                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                                    className="bg-black/40 border-white/10 text-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-400">{t('form.password')}</Label>
                                <Input
                                    type="password"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    className="bg-black/40 border-white/10 text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {!editingId && (
                        <div className="flex items-center gap-2 pt-2">
                            <input
                                type="checkbox"
                                id="createWarehouse"
                                checked={formData.createWarehouse}
                                onChange={e => setFormData({ ...formData, createWarehouse: e.target.checked })}
                                className="rounded border-white/10 bg-black/50 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-black"
                            />
                            <Label htmlFor="createWarehouse" className="cursor-pointer text-zinc-400 text-sm">{t('form.createWarehouse')}</Label>
                        </div>
                    )}

                    <div className="flex justify-between pt-6 border-t border-white/5 mt-6">
                        {editingId && (
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => handleDelete(editingId, formData.name)}
                                className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border-0"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {tCommon('delete')}
                            </Button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <Button type="button" variant="ghost" className="text-zinc-500 hover:text-white" onClick={() => setIsDialogOpen(false)}>
                                {tCommon('cancel')}
                            </Button>
                            <Button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white px-8">
                                <Save className="w-4 h-4 mr-2" />
                                {editingId ? tCommon('save') : tCommon('create')}
                            </Button>
                        </div>
                    </div>
                </form>
            </GlassModal>
        </div>
    )
}
