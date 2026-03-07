import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, XCircle, CheckCircle, Truck, Wrench, Search } from "lucide-react";
import { canTransition } from "@/lib/workflow";
import { TicketStatus } from "@/lib/constants";
import { updateTicketStatus } from "@/actions/ticket-actions";
import { toast } from "sonner";
import type { WorkflowTicket } from '@/types/ticket';
import type { UserSession } from '@/lib/auth';
import { useTranslations } from '@/lib/i18n-mock';

interface WorkflowActionsProps {
    ticket: WorkflowTicket;
    user: UserSession;
    onUpdate: () => void;
    csrfToken?: string;
}

export default function WorkflowActions({ ticket, user, onUpdate, csrfToken }: WorkflowActionsProps) {
    const t = useTranslations('Tickets.workflow');
    const [loading, setLoading] = useState<string | null>(null);
    const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);

    if (!ticket || !user) return null;

    // Get Allowed Transitions (use optimistic status if set)
    const currentStatus = optimisticStatus || ticket.status;
    const branchType = user.branchType || "STORE"; // Default to STORE for safety in UI

    const transitions = canTransition(currentStatus, user.permissions || [], ticket, branchType, user.role);

    const getActionLabel = (label: string) => {
        // Map English labels to translation keys
        switch (label) {
            case "Send to Center": return t('actions.sendToCenter');
            case "Mark Completed": return t('actions.markCompleted');
            case "Receive at Center": return t('actions.receiveAtCenter');
            case "Start Diagnosis": return t('actions.startDiagnosis');
            case "Submit Quote": return t('actions.submitQuote');
            case "Start Repair": return t('actions.startRepair');
            case "Wait for Parts": return t('actions.waitForParts');
            case "Finish & Send to QC": return t('actions.finishSendToQC');
            case "Log Parts & Pass QC": return t('actions.logPartsPassQC');
            case "Ship to Store": return t('actions.shipToStore');
            case "Receive at Store": return t('actions.receiveAtStore');
            case "Mark Delivered": return t('actions.markDelivered');
            case "Return for Re-Repair": return t('actions.returnForReRepair');
            case "Start Quick Fix": return t('actions.startQuickFix');
            case "Reject / Unrepairable": return t('actions.reject');
            case "Ready for Pickup": return t('actions.returnRejected');
            default: return label;
        }
    };

    const getReasonLabel = (reason: string) => {
        if (reason === "Insufficient Permissions") return t('errors.insufficientPermissions');
        if (reason === "Action only available at Main Center") return t('errors.centerOnly');
        return reason;
    }

    const handleTransition = async (targetStatus: string) => {
        // Optimistic update - instant UI feedback
        setOptimisticStatus(targetStatus);
        setLoading(targetStatus);

        try {
            const res = await updateTicketStatus({ ticketId: ticket.id, status: targetStatus, csrfToken });

            if (res.success) {
                toast.success(t('statusUpdated'));
                onUpdate();
            } else {
                // Rollback on error
                setOptimisticStatus(null);
                toast.error(res.error || t('updateFailed'));
            }
        } catch (error) {
            // Rollback on exception
            setOptimisticStatus(null);
            toast.error(t('networkError'));
        } finally {
            setLoading(null);
        }
    };

    if (transitions.length === 0) {
        // If completed or no actions allowed
        if (ticket.status === TicketStatus.COMPLETED) {
            return <div className="text-green-400 font-bold flex items-center gap-2"><CheckCircle className="w-6 h-6" /> {t('completed')}</div>;
        }
        if (ticket.status === TicketStatus.PAID_DELIVERED) {
            return <div className="text-blue-400 font-bold flex items-center gap-2"><CheckCircle className="w-6 h-6" /> {t('paidDelivered')}</div>;
        }
        return <span className="text-zinc-500 text-sm">{t('noActions')}</span>;
    }

    // Helper to get Icon (touch-safe sizing)
    const getIcon = (label: string) => {
        if (label.includes("Ship")) return <Truck className="w-6 h-6 mr-2" />;
        if (label.includes("Repair")) return <Wrench className="w-6 h-6 mr-2" />;
        if (label.includes("Diagnosis")) return <Search className="w-6 h-6 mr-2" />;
        if (label.includes("Complete")) return <CheckCircle className="w-6 h-6 mr-2" />;
        return <ArrowRight className="w-6 h-6 mr-2" />;
    };

    return (
        <div className="flex gap-3 flex-wrap justify-end items-center">
            {/* Optimistic syncing indicator */}
            {optimisticStatus && loading && (
                <div className="text-xs text-cyan-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('syncing')}
                </div>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {transitions.map((tAction: any) => (
                <div key={tAction.target} className="relative group">
                    <Button
                        onClick={() => handleTransition(tAction.target)}
                        disabled={!tAction.allowed || !!loading}
                        variant={tAction.allowed ? "default" : "outline"}
                        size="lg"
                        className={`min-h-[48px] px-6 ${!tAction.allowed
                            ? "opacity-50 cursor-not-allowed border-red-500/20 text-red-400 hover:text-red-400 hover:bg-transparent"
                            : "bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-500/20"
                            }`}
                    >
                        {loading === tAction.target ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : getIcon(tAction.actionLabel || '')}
                        {getActionLabel(tAction.actionLabel || '')}
                    </Button>

                    {/* Tooltip for Reason */}
                    {!tAction.allowed && tAction.reason && (
                        <div className="absolute bottom-full mb-2 right-0 w-48 bg-black/90 text-white text-xs p-2 rounded border border-white/10 shadow-xl z-50 pointer-events-none">
                            <div className="flex items-center gap-1 text-red-400 mb-1 font-bold">
                                <XCircle className="w-3 h-3" /> {t('blocked')}
                            </div>
                            {getReasonLabel(tAction.reason)}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
