'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
    Loader2, ArrowRight, XCircle, CheckCircle, Truck, Wrench, Search,
    ChevronDown, Settings2, MoreHorizontal, RotateCcw
} from "lucide-react";
import { canTransition } from "@/lib/workflow";
import { TicketStatus } from "@/lib/constants";
import { updateTicketStatus, undoTicketStatus } from "@/actions/ticket-actions";
import { toast } from "sonner";
import type { WorkflowTicket } from '@/types/ticket';
import type { UserSession } from '@/lib/auth';
import { useTranslations } from '@/lib/i18n-mock';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCSRF } from "@/contexts/CSRFContext";
import TicketPaymentModal from "./TicketPaymentModal";
import EstimationModal from "./EstimationModal";
import TechnicianAssignmentModal from "./TechnicianAssignmentModal";


interface WorkflowActionsProps {
    ticket: WorkflowTicket;
    user: UserSession;
    onUpdate: () => void;
    csrfToken?: string;
}

export default function WorkflowActions({ ticket, user, onUpdate }: Omit<WorkflowActionsProps, 'csrfToken'>) {
    const t = useTranslations('Tickets.workflow');
    const { token: csrfToken } = useCSRF();
    const [loading, setLoading] = useState<string | null>(null);
    const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showEstimationModal, setShowEstimationModal] = useState(false);
    const [showTechModal, setShowTechModal] = useState(false);


    if (!ticket || !user) return null;

    // Get Allowed Transitions
    const currentStatus = optimisticStatus || ticket.status;
    const branchType = user.branchType || "STORE";
    const transitions = canTransition(currentStatus, user.permissions || [], ticket, branchType, user.role);

    const getActionLabel = (label: string) => {
        switch (label) {
            case "Send to Center": return t('actions.sendToCenter');
            case "Mark Completed": return t('actions.markCompleted');
            case "Receive at Center": return t('actions.receiveAtCenter');
            case "Start Diagnosis": return t('actions.startDiagnosis');
            case "Submit Quote": return t('actions.submitQuote');
            case "Pending Approval": return t('actions.pendingApproval');
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
            case "Close Ticket": return t('actions.closeTicket');
            default: return label;
        }
    };

    const getIcon = (label: string, className?: string) => {
        const baseClass = cn("w-5 h-5", className);
        if (label.includes("Ship") || label.includes("Send")) return <Truck className={baseClass} />;
        if (label.includes("Repair") || label.includes("Fix")) return <Wrench className={baseClass} />;
        if (label.includes("Diagnosis") || label.includes("Search")) return <Search className={baseClass} />;
        if (label.includes("Complete") || label.includes("Close") || label.includes("Pass QC")) return <CheckCircle className={baseClass} />;
        if (label.includes("Receive")) return <ArrowRight className={baseClass} />;
        return <ArrowRight className={baseClass} />;
    };

    const performStatusUpdate = async (targetStatus: string) => {
        try {
            const res = await updateTicketStatus({ ticketId: ticket.id, status: targetStatus, csrfToken: csrfToken ?? undefined });
            if (res.success) {
                toast.success(t('statusUpdated'));
                setOptimisticStatus(null); // Clear optimistic state to sync visually
                onUpdate();
            } else {
                toast.error(res.error || t('updateFailed'));
                setOptimisticStatus(null);
            }
        } catch (error) {
            toast.error(t('networkError'));
            setOptimisticStatus(null);
        }
    };

    const handleUndo = async () => {
        setLoading('undo');
        try {
            const res = await undoTicketStatus({ ticketId: ticket.id, csrfToken: csrfToken ?? undefined });
            if (res.success) {
                toast.success(t('statusUpdated'));
                setOptimisticStatus(null); // Clear optimistic state to sync visually
                onUpdate();
            } else {
                toast.error(res.error || t('updateFailed'));
            }
        } catch (error) {
            toast.error(t('networkError'));
        }
        setLoading(null);
    };

    const handleTransition = async (targetStatus: string) => {
        // Intercept: NEW → DIAGNOSING — capture cost & duration first
        if (targetStatus === TicketStatus.DIAGNOSING) {
            setShowEstimationModal(true);
            return;
        }

        // Intercept: DIAGNOSING → AT_CENTER — assign a technician first
        // Also: Starting Repair without a technician
        if (targetStatus === TicketStatus.AT_CENTER || (targetStatus === TicketStatus.IN_PROGRESS && !ticket.technicianId)) {
            setShowTechModal(true);
            return;
        }

        // Intercept Payment status
        if (targetStatus === TicketStatus.PICKED_UP) {
            setShowPaymentModal(true);
            return;
        }

        setOptimisticStatus(targetStatus);
        setLoading(targetStatus);
        await performStatusUpdate(targetStatus);
        setLoading(null);
    };

    if (transitions.length === 0) {
        if (ticket.status === TicketStatus.COMPLETED) {
            return <div className="text-green-400 font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {t('completed')}</div>;
        }
        if (ticket.status === TicketStatus.PAID_DELIVERED) {
            return <div className="text-blue-400 font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {t('paidDelivered')}</div>;
        }
        return <span className="text-zinc-500 text-sm">{t('noActions')}</span>;
    }

    // Logic to select the "Primary" action
    // Usually the first allowed transition, but we can prioritize based on common flows
    const allowedActions = transitions.filter(tr => tr.allowed);
    const blockedActions = transitions.filter(tr => !tr.allowed);

    // In NEW state, prioritize "Start Repair" as primary if available
    let primaryAction = allowedActions[0];
    if (ticket.status === TicketStatus.NEW) {
        primaryAction = allowedActions.find(a => a.actionLabel === "Start Repair") ||
            allowedActions.find(a => a.actionLabel === "Send to Center") ||
            allowedActions[0];
    }

    const secondaryActions = transitions.filter(tr => tr !== primaryAction);

    return (
        <div className="flex items-center gap-2 w-full justify-end">
            {ticket.previousStatus && 
             (user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'مدير النظام' || user.role === 'المالك') && 
             !['COMPLETED', 'DELIVERED', 'PAID_DELIVERED'].includes(ticket.status) && (
                <Button
                    variant="outline"
                    onClick={handleUndo}
                    disabled={!!loading}
                    className="border-orange-500/20 text-orange-500 hover:bg-orange-500/10 h-12 rounded-xl px-4 flex gap-2 font-black text-[11px] uppercase tracking-wider"
                >
                    <RotateCcw className="w-4 h-4" />
                    تراجع
                </Button>
            )}
            {primaryAction ? (
                <div className="flex items-stretch shadow-lg shadow-cyan-500/10 rounded-xl overflow-hidden border border-cyan-500/20">
                    <Button
                        onClick={() => handleTransition(primaryAction.target)}
                        disabled={!!loading}
                        className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-6 h-12 rounded-none border-r border-black/10 flex items-center gap-2"
                    >
                        {loading === primaryAction.target ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            getIcon(primaryAction.actionLabel || '')
                        )}
                        <span className="whitespace-nowrap">{getActionLabel(primaryAction.actionLabel || '')}</span>
                    </Button>

                    {secondaryActions.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    disabled={!!loading}
                                    className="bg-cyan-500 hover:bg-cyan-400 text-black px-3 h-12 rounded-none focus-visible:ring-0"
                                >
                                    <ChevronDown className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white min-w-[200px] p-2 rounded-xl">
                                {secondaryActions.map((action) => (
                                    <DropdownMenuItem
                                        key={action.target}
                                        disabled={!action.allowed || !!loading}
                                        onClick={() => handleTransition(action.target)}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors focus:bg-white/10",
                                            !action.allowed && "opacity-50 grayscale cursor-not-allowed"
                                        )}
                                    >
                                        {getIcon(action.actionLabel || '', action.allowed ? "text-cyan-400" : "text-zinc-500")}
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm">{getActionLabel(action.actionLabel || '')}</span>
                                            {!action.allowed && action.reason && (
                                                <span className="text-[10px] text-red-400 font-medium">
                                                    {action.reason === "Insufficient Permissions" ? t('errors.insufficientPermissions') :
                                                        action.reason === "Action only available at Main Center" ? t('errors.centerOnly') :
                                                            action.reason}
                                                </span>
                                            )}
                                        </div>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            ) : (
                // If NO actions are allowed (all blocked)
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="border-red-500/20 text-red-400 h-12 rounded-xl px-4 flex gap-2 font-bold">
                            <Settings2 className="w-5 h-5" />
                            {t('blocked')}
                            <ChevronDown className="w-4 h-4 ml-1" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white min-w-[220px] p-2 rounded-xl">
                        {blockedActions.map((action) => (
                            <DropdownMenuItem key={action.target} disabled className="flex items-center gap-3 p-3 opacity-50">
                                <XCircle className="w-5 h-5 text-red-500" />
                                <div className="flex flex-col">
                                    <span className="font-bold text-sm text-zinc-400">{getActionLabel(action.actionLabel || '')}</span>
                                    <span className="text-[10px] text-red-400">
                                        {action.reason === "Insufficient Permissions" ? t('errors.insufficientPermissions') :
                                            action.reason === "Action only available at Main Center" ? t('errors.centerOnly') :
                                                action.reason}
                                    </span>
                                </div>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            <TicketPaymentModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                ticket={ticket}
                onSuccess={() => {
                    setShowPaymentModal(false);
                    performStatusUpdate(TicketStatus.PICKED_UP);
                }}
            />

            <EstimationModal
                isOpen={showEstimationModal}
                onClose={() => setShowEstimationModal(false)}
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    repairPrice: ticket.repairPrice as number | undefined,
                    expectedDuration: ticket.expectedDuration as number | undefined,
                }}
                onSuccess={onUpdate}
            />

            <TechnicianAssignmentModal
                isOpen={showTechModal}
                onClose={() => setShowTechModal(false)}
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    technicianId: ticket.technicianId as string | null | undefined,
                    deviceBrand: ticket.deviceBrand as string | undefined,
                    deviceModel: ticket.deviceModel as string | undefined,
                }}
                onSuccess={onUpdate}
            />
        </div>
    );
}
