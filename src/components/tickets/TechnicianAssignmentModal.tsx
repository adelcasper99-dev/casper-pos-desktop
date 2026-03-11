"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GlassModal from "@/components/ui/GlassModal";
import { Loader2, UserCheck, CheckCircle, Wrench, AlertCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getAllTechnicians, assignTechnician, updateTicketStatus } from "@/actions/ticket-actions";
import { useCSRF } from "@/contexts/CSRFContext";

interface Technician {
    id: string;
    name: string;
    phone?: string;
    skills?: string;
    activeTickets?: number; // injected from parallel fetch
}

interface TechnicianAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: {
        id: string;
        barcode: string;
        technicianId?: string | null;
        deviceBrand?: string;
        deviceModel?: string;
    };
    onSuccess: () => void;
}

// Workload colour thresholds
function workloadBadge(count: number) {
    if (count === 0) return { label: "متاح", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
    if (count <= 2) return { label: `${count} جهاز`, cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" };
    return { label: `${count} جهاز`, cls: "bg-red-500/10 text-red-400 border-red-500/20" };
}

export default function TechnicianAssignmentModal({
    isOpen,
    onClose,
    ticket,
    onSuccess,
}: TechnicianAssignmentModalProps) {
    const { token: csrfToken } = useCSRF();
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);

    // Load technicians with active ticket count
    useEffect(() => {
        if (!isOpen) return;
        setSelected(ticket.technicianId ?? null);

        const load = async () => {
            setIsFetching(true);
            try {
                const res = await getAllTechnicians();
                if (res.technicians) {
                    setTechnicians(res.technicians as Technician[]);
                }
            } finally {
                setIsFetching(false);
            }
        };
        load();
    }, [isOpen, ticket.technicianId]);

    const handleConfirm = async () => {
        if (!selected) { toast.error("يرجى اختيار فني"); return; }

        setIsLoading(true);
        try {
            // Use assignTechnician which also sets status to IN_PROGRESS internally;
            // We override with explicit DIAGNOSING→AT_CENTER status after.
            const res = await assignTechnician({
                ticketId: ticket.id,
                technicianId: selected,
                csrfToken: csrfToken ?? undefined,
            });

            if (res.success) {
                // Ensure FSM status is AT_CENTER (assign sets IN_PROGRESS by default, we correct it)
                await updateTicketStatus({
                    ticketId: ticket.id,
                    status: "AT_CENTER",
                    csrfToken: csrfToken ?? undefined,
                });

                const techName = technicians.find(t => t.id === selected)?.name ?? "الفني";
                toast.success(`✅ تم تعيين ${techName} — التذكرة جاهزة للإصلاح`);
                onSuccess();
                onClose();
            } else {
                toast.error((res as any).error || "فشل تعيين الفني");
            }
        } catch (e) {
            toast.error("حدث خطأ أثناء التعيين");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black uppercase text-cyan-500 tracking-[0.2em]">
                        #{ticket.barcode} — {ticket.deviceBrand} {ticket.deviceModel}
                    </span>
                    <span className="text-lg font-black text-white">تعيين الفني المسؤول</span>
                </div>
            }
            className="max-w-lg"
        >
            <div className="space-y-4 pt-2" dir="rtl">

                {/* Search Bar */}
                <div className="relative group">
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-cyan-500 transition-colors" />
                    <Input
                        placeholder="بحث عن فني (الاسم أو المهارات)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-12 pr-11 bg-white/[0.03] border-white/10 rounded-xl focus:border-cyan-500/50 focus:ring-cyan-500/20 transition-all text-sm font-bold"
                    />
                </div>

                {/* Technician List */}
                <div className="space-y-2 max-h-[42vh] overflow-y-auto custom-scrollbar pr-1">
                    {isFetching ? (
                        <div className="flex items-center justify-center py-16 text-zinc-600">
                            <Loader2 className="w-6 h-6 animate-spin mr-3" />
                            <span className="text-sm font-bold">جاري تحميل الفنيين...</span>
                        </div>
                    ) : technicians.filter(t => 
                        t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        t.skills?.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-600">
                            <AlertCircle className="w-8 h-8" />
                            <span className="text-sm font-bold">
                                {searchQuery ? "لم يتم العثور على نتائج" : "لا يوجد فنيين مسجلين"}
                            </span>
                        </div>
                    ) : (
                        technicians
                            .filter(t => 
                                t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                t.skills?.toLowerCase().includes(searchQuery.toLowerCase())
                            )
                            .map((tech) => {
                            const isSelected = selected === tech.id;
                            const isCurrent = ticket.technicianId === tech.id;
                            const count = tech.activeTickets ?? 0;
                            const badge = workloadBadge(count);

                            return (
                                <button
                                    key={tech.id}
                                    onClick={() => setSelected(tech.id)}
                                    className={cn(
                                        "w-full h-16 flex items-center gap-4 px-4 rounded-2xl border transition-all duration-200 text-right",
                                        isSelected
                                            ? "bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                                            : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.07] hover:border-white/20"
                                    )}
                                >
                                    {/* Avatar */}
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black transition-all",
                                        isSelected
                                            ? "bg-cyan-500 text-black"
                                            : "bg-zinc-800 text-zinc-400"
                                    )}>
                                        {isSelected ? (
                                            <CheckCircle className="w-5 h-5" />
                                        ) : (
                                            tech.name.charAt(0)
                                        )}
                                    </div>

                                    {/* Name + current badge */}
                                    <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-sm font-black truncate",
                                                isSelected ? "text-cyan-400" : "text-white"
                                            )}>
                                                {tech.name}
                                            </span>
                                            {isCurrent && (
                                                <span className="text-[9px] font-black uppercase tracking-widest text-cyan-500 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full shrink-0">
                                                    الحالي
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Wrench className="w-3 h-3 text-zinc-600" />
                                            <span className="text-[10px] font-bold text-zinc-600">
                                                {tech.skills || "فني صيانة"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Workload badge */}
                                    <span className={cn(
                                        "shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full border",
                                        badge.cls
                                    )}>
                                        {badge.label}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* CTA */}
                <div className="flex gap-3 pt-2 border-t border-white/10">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 h-14 text-zinc-500 hover:text-white rounded-2xl font-bold"
                    >
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selected || isLoading}
                        className={cn(
                            "flex-[2] h-14 font-black text-base rounded-2xl transition-all flex items-center justify-center gap-3",
                            selected
                                ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_30px_rgba(34,211,238,0.2)] active:scale-[0.98]"
                                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <UserCheck className="w-5 h-5" />
                                {selected
                                    ? `تأكيد تعيين ${technicians.find(t => t.id === selected)?.name ?? "الفني"}`
                                    : "اختر فنياً أولاً"}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </GlassModal>
    );
}
