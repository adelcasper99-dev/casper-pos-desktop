'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Users, HardHat } from "lucide-react"
import { addCollaborator, removeCollaborator } from "@/actions/ticket-actions"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useCSRF } from "@/contexts/CSRFContext"
import { useTranslations } from "@/lib/i18n-mock"

interface CollaboratorManagerProps {
    ticketId: string
    collaborators: any[]
    technicians: any[]
    onUpdate: () => void
}

export default function CollaboratorManager({ ticketId, collaborators, technicians, onUpdate }: CollaboratorManagerProps) {
    const t = useTranslations('Tickets.assistants')
    const commonT = useTranslations('Common')
    const { token: csrfToken } = useCSRF()
    const [isAdding, setIsAdding] = useState(false)
    const [selectedTechId, setSelectedTechId] = useState('')
    const [loading, setLoading] = useState(false)

    const handleAdd = async () => {
        if (!selectedTechId) return
        setLoading(true)
        try {
            const res = await addCollaborator({
                ticketId,
                technicianId: selectedTechId,
                commissionRate: 0, // Default commission for assistants
                csrfToken: csrfToken ?? undefined
            })
            if (res.success) {
                setIsAdding(false)
                setSelectedTechId('')
                onUpdate()
                toast.success(t('successAdded'))
            } else {
                toast.error("Failed to add collaborator")
            }
        } catch (error: any) {
            toast.error(error.message || "An error occurred")
        } finally {
            setLoading(false)
        }
    }

    const handleRemove = async (techId: string) => {
        if (!confirm(t('confirmRemove'))) return
        setLoading(true)
        try {
            const res = await removeCollaborator({ ticketId, technicianId: techId, csrfToken: csrfToken ?? undefined })
            if (res.success) {
                onUpdate()
                toast.success(t('successRemoved'))
            } else {
                toast.error("Failed to remove collaborator")
            }
        } catch (error: any) {
            toast.error(error.message || "An error occurred")
        } finally {
            setLoading(false)
        }
    }

    // Filter out already added technicians and lead technician if applicable
    const availableTechs = technicians.filter(t => !collaborators.some(c => c.technicianId === t.id))
    const techOptions = availableTechs.map(t => ({ value: t.id, label: t.name }))

    return (
        <div className="space-y-4 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" /> {t('title')}
                </h3>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAdding(!isAdding)}
                    className="h-7 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 font-black text-[10px] uppercase tracking-wider"
                >
                    <Plus className="w-3.5 h-3.5 ml-1" /> {t('add')}
                </Button>
            </div>

            {isAdding && (
                <div className="p-4 rounded-2xl border border-white/10 bg-zinc-950/50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xl">
                    <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{t('selectAssistant')}</Label>
                        <SearchableSelect
                            options={techOptions}
                            value={selectedTechId}
                            onChange={setSelectedTechId}
                            placeholder={t('searchEngineer')}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            className="flex-1 bg-white text-black hover:bg-zinc-200 font-black rounded-xl"
                            onClick={handleAdd}
                            disabled={loading || !selectedTechId}
                        >
                            {t('add')}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsAdding(false)}
                            className="text-zinc-500 hover:text-white font-bold"
                        >
                            {commonT('cancel')}
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {collaborators.length === 0 ? (
                    <div className="text-[10px] text-zinc-600 font-bold italic p-4 text-center border border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                        {t('noAssistants')}
                    </div>
                ) : (
                    collaborators.map((collab) => (
                        <div key={collab.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 group hover:border-white/20 transition-all shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-white/5 flex items-center justify-center">
                                    <HardHat className="w-4 h-4 text-orange-400" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[sm] font-black text-white leading-none mb-1">{collab.technician?.name || 'Unknown'}</span>
                                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black opacity-60">{t('roleAssistant')}</span>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                onClick={() => handleRemove(collab.technicianId)}
                                disabled={loading}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
