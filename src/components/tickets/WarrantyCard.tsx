'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { ShieldCheck, Calendar as CalendarIcon, Edit2 } from "lucide-react"
import { addDays, isBefore, startOfDay } from "date-fns"
import { updateTicketDetails } from "@/actions/ticket-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface WarrantyCardProps {
    ticket: any
    onUpdate: () => void
}

export default function WarrantyCard({ ticket, onUpdate }: WarrantyCardProps) {
    const [date, setDate] = useState<Date | undefined>(
        ticket.warrantyExpiryDate ? new Date(ticket.warrantyExpiryDate) : undefined
    )
    const [loading, setLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        setDate(ticket.warrantyExpiryDate ? new Date(ticket.warrantyExpiryDate) : undefined)
    }, [ticket.warrantyExpiryDate])

    const hasWarranty = !!ticket.warrantyExpiryDate
    const isExpired = hasWarranty && isBefore(new Date(ticket.warrantyExpiryDate), startOfDay(new Date()))
    const isActive = hasWarranty && !isExpired

    const handleSave = async (newDate: Date | undefined) => {
        setLoading(true)
        try {
            await updateTicketDetails(ticket.id, {
                // @ts-ignore
                warrantyExpiryDate: newDate === undefined ? null : newDate
            })
            setDate(newDate)
            onUpdate()
            setIsOpen(false)
            toast.success(newDate ? "تم تحديث الضمان" : "تم إلغاء الضمان")
        } catch (error) {
            toast.error("فشل تحديث الضمان")
        } finally {
            setLoading(false)
        }
    }

    const setWarrantyDays = (days: number) => {
        handleSave(addDays(new Date(), days))
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">تاريخ انتهاء الضمان</span>
                    <div className="flex items-center gap-2 mt-1">
                        <ShieldCheck className={cn("w-3.5 h-3.5", isExpired ? "text-red-500" : "text-emerald-500")} />
                        <span className={cn("text-[11px] font-bold", isExpired ? "text-red-400" : "text-emerald-400")}>
                            {ticket.warrantyExpiryDate ? new Date(ticket.warrantyExpiryDate).toLocaleDateString('ar-EG') : 'بدون ضمان'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge className={cn(
                        "px-2 py-0.5 h-5 text-[8px] font-black uppercase tracking-wider rounded-md border",
                        isExpired ? "bg-red-500/20 text-red-500 border-red-500/30" : "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
                    )}>
                        {isExpired ? 'منتهي' : isActive ? 'ساري' : 'غير محدد'}
                    </Badge>
                    <Popover open={isOpen} onOpenChange={setIsOpen}>
                        <PopoverTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                disabled={['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'CANCELLED', 'REJECTED'].includes(ticket.status)}
                                className="h-8 w-8 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg border border-white/5 hover:border-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Edit2 className="w-3 h-3" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-zinc-900 border-white/10 rounded-2xl shadow-2xl overflow-hidden" align="center">
                            <div className="p-4 border-b border-white/5 space-y-4 text-right" dir="rtl">
                                <h4 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">اختصارات زمنية</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    {[30, 60, 90].map(d => (
                                        <Button key={d} size="sm" variant="outline" onClick={() => setWarrantyDays(d)} className="bg-white/5 border-white/5 hover:bg-emerald-500/20 h-10 rounded-xl text-xs font-bold">{d} يوم</Button>
                                    ))}
                                    <Button size="sm" variant="destructive" onClick={() => handleSave(undefined)} className="col-span-3 mt-1 h-10 rounded-xl text-[10px] font-black uppercase bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border-red-500/20">إلغاء الضمان</Button>
                                </div>
                            </div>
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(d) => { setDate(d); if (d) handleSave(d); }}
                                className="p-4 bg-transparent text-white"
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </div>
    );
}
