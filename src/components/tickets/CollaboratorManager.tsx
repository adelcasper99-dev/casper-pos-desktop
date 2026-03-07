'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Users, HardHat } from "lucide-react"
import { addCollaborator, removeCollaborator } from "@/actions/ticket-actions"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useCSRF } from "@/contexts/CSRFContext"

interface CollaboratorManagerProps {
    ticketId: string
    collaborators: any[]
    technicians: any[]
    onUpdate: () => void
}

export default function CollaboratorManager({ ticketId, collaborators, technicians, onUpdate }: CollaboratorManagerProps) {
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
                toast.success("Collaborator added successfully")
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
        if (!confirm('Are you sure you want to remove this collaborator?')) return
        setLoading(true)
        try {
            const res = await removeCollaborator({ ticketId, technicianId: techId, csrfToken: csrfToken ?? undefined })
            if (res.success) {
                onUpdate()
                toast.success("Collaborator removed")
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
                <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" /> Assistants
                </h3>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAdding(!isAdding)}
                    className="h-7 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                >
                    <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
            </div>

            {isAdding && (
                <div className="p-3 rounded-lg border border-white/10 bg-black/20 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-2">
                        <Label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Select Assistant Engineer</Label>
                        <SearchableSelect
                            options={techOptions}
                            value={selectedTechId}
                            onChange={setSelectedTechId}
                            placeholder="Search engineer..."
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                            onClick={handleAdd}
                            disabled={loading || !selectedTechId}
                        >
                            Add
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsAdding(false)}
                            className="text-zinc-500 hover:text-white"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {collaborators.length === 0 ? (
                    <div className="text-xs text-zinc-500 italic p-3 text-center border border-dashed border-white/5 rounded-lg">
                        No assistants assigned
                    </div>
                ) : (
                    collaborators.map((collab) => (
                        <div key={collab.id} className="flex items-center justify-between p-2 pl-3 rounded-lg bg-white/5 border border-white/10 group hover:border-white/20 transition-all">
                            <div className="flex items-center gap-2">
                                <HardHat className="w-4 h-4 text-orange-400" />
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-white">{collab.technician?.name || 'Unknown'}</span>
                                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">{collab.role}</span>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
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
