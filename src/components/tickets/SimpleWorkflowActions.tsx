'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, CheckCircle, Truck, Wrench, Search, Clock, Box, UserCheck } from "lucide-react";
import { updateTicketStatus, updateTicketDetails } from "@/actions/ticket-actions";
import { toast } from "sonner";
import { TicketStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { WorkflowTicket } from '@/types/ticket';
import type { UserSession } from '@/lib/auth';
import { useTranslations } from '@/lib/i18n-mock';

interface SimpleWorkflowActionsProps {
    ticket: any; // Using any for now to avoid complex type mismatches during migration
    user: any;
    onUpdate: () => void;
    csrfToken?: string;
}

export default function SimpleWorkflowActions({ ticket, user, onUpdate, csrfToken }: SimpleWorkflowActionsProps) {
    const t = useTranslations('Ticket.workflow');
    const [loading, setLoading] = useState<string | null>(null);
    const [duration, setDuration] = useState<number>(ticket.expectedDuration || 60);

    // 1. Determine Current simplified Stage
    const getStage = (status: string) => {
        if (['NEW', 'IN_TRANSIT_TO_CENTER'].includes(status)) return 1; // Check In
        if (['AT_CENTER'].includes(status)) return 2; // Diagnose
        if (['DIAGNOSING'].includes(status)) return 3; // Plan & Start
        if (['IN_PROGRESS', 'WAITING_FOR_PARTS'].includes(status)) return 4; // Repairing
        if (['QC_PENDING', 'COMPLETED', 'READY_AT_BRANCH'].includes(status)) return 5; // Finish
        if (['PAID_DELIVERED', 'DELIVERED', 'PICKED_UP'].includes(status)) return 6; // Done
        return 0; // Unknown
    };

    const stage = getStage(ticket.status);

    // 2. Action Handlers
    const handleTransition = async (targetStatus: string, stepName: string) => {
        setLoading(stepName);
        try {
            // Special Case: Saving Duration before starting repair
            if (stage === 3 && targetStatus === 'IN_PROGRESS') {
                await updateTicketDetails(ticket.id, { expectedDuration: duration });
            }

            const res = await updateTicketStatus({ ticketId: ticket.id, status: targetStatus });
            if (res.success) {
                toast.success(`${stepName} Completed`);
                onUpdate();
            } else {
                toast.error(res.error || "Action Failed");
            }
        } catch (error) {
            toast.error("Network Error");
        } finally {
            setLoading(null);
        }
    };

    // 3. Render Logic
    return (
        <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-zinc-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    Workflow Progress
                </h3>
                <div className="text-xs text-zinc-500 font-mono font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">
                    Stage {stage}/5
                </div>
            </div>

            <div className="flex gap-2 relative">
                {/* Stage 1: Check In */}
                {stage <= 1 && (
                    <Button
                        onClick={() => handleTransition(TicketStatus.AT_CENTER, "Check In")}
                        disabled={!!loading}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 h-14 text-lg font-bold shadow-lg shadow-blue-900/20"
                    >
                        {loading === "Check In" ? <Loader2 className="animate-spin mr-2" /> : <Box className="mr-2 w-5 h-5" />}
                        Check In
                    </Button>
                )}

                {/* Stage 2: Diagnose */}
                {stage === 2 && (
                    <Button
                        onClick={() => handleTransition(TicketStatus.DIAGNOSING, "Start Diagnosis")}
                        disabled={!!loading}
                        className="flex-1 bg-purple-600 hover:bg-purple-500 h-14 text-lg font-bold shadow-lg shadow-purple-900/20"
                    >
                        {loading === "Start Diagnosis" ? <Loader2 className="animate-spin mr-2" /> : <Search className="mr-2 w-5 h-5" />}
                        Start Diagnosis
                    </Button>
                )}

                {/* Stage 3: Diagnosing (Input Duration -> Start Repair) */}
                {stage === 3 && (
                    <div className="flex-1 flex flex-col sm:flex-row gap-4 items-stretch sm:items-end bg-purple-500/10 p-4 rounded-xl border border-purple-500/20">
                        <div className="flex-1">
                            <Label className="text-purple-300 text-xs mb-2 block font-bold uppercase tracking-wider">Estimated Repair Time (Minutes)</Label>
                            <div className="relative">
                                <Clock className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <Input
                                    type="number"
                                    value={duration}
                                    onChange={(e) => setDuration(Number(e.target.value))}
                                    className="pl-10 bg-black/40 border-white/10 h-11 w-full text-white font-mono text-lg"
                                />
                            </div>
                        </div>
                        <Button
                            onClick={() => handleTransition(TicketStatus.IN_PROGRESS, "Start Repair")}
                            disabled={!!loading}
                            className="flex-1 bg-purple-600 hover:bg-purple-500 h-11 text-md font-bold"
                        >
                            {loading === "Start Repair" ? <Loader2 className="animate-spin mr-2" /> : <Wrench className="mr-2 w-5 h-5" />}
                            Start Repair
                        </Button>
                    </div>
                )}

                {/* Stage 4: Repairing -> Finish */}
                {stage === 4 && (
                    <Button
                        onClick={() => handleTransition(TicketStatus.COMPLETED, "Finish Job")}
                        disabled={!!loading}
                        className="flex-1 bg-green-600 hover:bg-green-500 h-14 text-lg font-bold shadow-lg shadow-green-900/20"
                    >
                        {loading === "Finish Job" ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 w-5 h-5" />}
                        Finish Repair
                    </Button>
                )}

                {/* Stage 5: Deliver */}
                {stage === 5 && (
                    <Button
                        onClick={() => handleTransition(TicketStatus.PAID_DELIVERED, "Deliver to Customer")}
                        disabled={!!loading}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 h-14 text-lg font-bold shadow-lg shadow-emerald-900/20"
                    >
                        {loading === "Deliver to Customer" ? <Loader2 className="animate-spin mr-2" /> : <UserCheck className="mr-2 w-5 h-5" />}
                        Deliver & Close
                    </Button>
                )}

                {/* Stage 6: Done */}
                {stage === 6 && (
                    <div className="flex-1 bg-white/5 rounded-xl p-4 text-center text-zinc-400 border border-white/10 flex items-center justify-center gap-3 font-bold text-lg">
                        <CheckCircle className="w-6 h-6 text-green-500" />
                        Ticket Closed
                    </div>
                )}
            </div>

            {/* Steps Indicator */}
            <div className="flex justify-between mt-6 px-1">
                {[1, 2, 3, 4, 5].map((s) => (
                    <div key={s} className={cn(
                        "h-2 rounded-full flex-1 mx-1.5 transition-all duration-500",
                        s < stage ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" :
                            s === stage ? "bg-cyan-500 animate-pulse shadow-[0_0_15px_rgba(6,182,212,0.5)]" :
                                "bg-white/5 border border-white/5"
                    )} />
                ))}
            </div>
        </div>
    );
}
