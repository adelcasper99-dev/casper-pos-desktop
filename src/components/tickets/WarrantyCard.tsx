'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from '@/lib/i18n-mock'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { ShieldCheck, Calendar as CalendarIcon, Edit2, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { format, addDays, isAfter, isBefore, startOfDay } from "date-fns"
import { cn } from "@/lib/utils"
import { updateTicketDetails } from "@/actions/ticket-actions"
import { toast } from "sonner"

interface WarrantyCardProps {
    ticket: any
    onUpdate: () => void
}

export default function WarrantyCard({ ticket, onUpdate }: WarrantyCardProps) {
    // Note: useTranslations('Tickets') might need valid JSON in messages
    // Falling back to manual labels if translations fail
    const [date, setDate] = useState<Date | undefined>(
        ticket.warrantyExpiryDate ? new Date(ticket.warrantyExpiryDate) : undefined
    )
    const [loading, setLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)

    // Sync state with props
    useEffect(() => {
        setDate(ticket.warrantyExpiryDate ? new Date(ticket.warrantyExpiryDate) : undefined)
    }, [ticket.warrantyExpiryDate])


    // Calculate Status
    const hasWarranty = !!ticket.warrantyExpiryDate
    const isExpired = hasWarranty && isBefore(new Date(ticket.warrantyExpiryDate), startOfDay(new Date()))
    const isActive = hasWarranty && !isExpired

    const handleSave = async (newDate: Date | undefined) => {
        setLoading(true)
        try {
            // Pass null if undefined to clear it
            await updateTicketDetails(ticket.id, {
                // @ts-ignore - Action expects null|Date|undefined, here we use null to clear
                warrantyExpiryDate: newDate === undefined ? null : newDate
            })
            // Optimistic update
            setDate(newDate)
            onUpdate()
            setIsOpen(false)
            toast.success(newDate ? "Warranty updated" : "Warranty cleared")
        } catch (error) {
            toast.error("Failed to update warranty")
            // Revert on error
            setDate(ticket.warrantyExpiryDate ? new Date(ticket.warrantyExpiryDate) : undefined)
        } finally {
            setLoading(false)
        }
    }

    const setWarrantyDays = (days: number) => {
        const newDate = addDays(new Date(), days)
        // updateTicketDetails expects Date object
        handleSave(newDate)
    }

    const clearWarranty = () => {
        handleSave(undefined)
    }

    return (
        <Card className={cn(
            "glass-card shadow-none bg-transparent border-t-4",
            isActive ? "border-t-green-500" : isExpired ? "border-t-red-500" : "border-t-zinc-600"
        )}>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className={cn("h-5 w-5",
                            isActive ? "text-green-400" : isExpired ? "text-red-400" : "text-zinc-500"
                        )} />
                        <span>Warranty Status</span>
                    </div>
                    {isActive && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                            Active
                        </Badge>
                    )}
                    {isExpired && (
                        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">
                            Expired
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between mb-4">
                    <div className="text-sm">
                        <div className="text-zinc-400 mb-1">Expiry Date</div>
                        <div className="font-mono text-lg text-white font-medium flex items-center gap-2">
                            {hasWarranty ? (
                                <>
                                    <CalendarIcon className="w-4 h-4 text-zinc-500" />
                                    {format(new Date(ticket.warrantyExpiryDate), 'dd/MM/yyyy')}
                                </>
                            ) : (
                                <span className="text-zinc-500 italic">No warranty set</span>
                            )}
                        </div>
                    </div>

                    <Popover open={isOpen} onOpenChange={setIsOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5">
                                <Edit2 className="w-4 h-4 mr-2" />
                                Edit
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800" align="end">
                            <div className="p-4 border-b border-white/10 space-y-2">
                                <h4 className="font-medium text-white mb-2">Quick Presets</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setWarrantyDays(30)} className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700">30 Days</Button>
                                    <Button size="sm" variant="outline" onClick={() => setWarrantyDays(60)} className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700">60 Days</Button>
                                    <Button size="sm" variant="outline" onClick={() => setWarrantyDays(90)} className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700">90 Days</Button>
                                    <Button size="sm" variant="destructive" onClick={clearWarranty} className="col-span-3 mt-1 h-7 text-xs">Clear Warranty</Button>
                                </div>
                            </div>
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(d) => {
                                    setDate(d)
                                    if (d) handleSave(d)
                                }}
                                initialFocus
                                className="p-3 pointer-events-auto"
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Contextual Status Message */}
                <div className="text-xs">
                    {isActive ? (
                        <div className="flex items-center gap-2 text-green-400/80 bg-green-900/10 p-2 rounded">
                            <CheckCircle className="w-3 h-3" />
                            Ticket is covered under warranty
                        </div>
                    ) : isExpired ? (
                        <div className="flex items-center gap-2 text-red-400/80 bg-red-900/10 p-2 rounded">
                            <AlertCircle className="w-3 h-3" />
                            Warranty period has ended
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-zinc-500 bg-zinc-800/30 p-2 rounded">
                            <AlertCircle className="w-3 h-3" />
                            Standard repair warranty applies after delivery
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
