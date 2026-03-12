'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
    Loader2, ArrowRight, XCircle, CheckCircle, Truck, Wrench, Search,
    ChevronDown, Settings2, MoreHorizontal, RotateCcw, ShieldCheck
} from "lucide-react";
import { isBefore, startOfDay } from "date-fns";
import { canTransition } from "@/lib/workflow";
import { TicketStatus } from "@/lib/constants";
import { updateTicketStatus, undoTicketStatus, initiateWarrantyReturn } from "@/actions/ticket-actions";
import { useRouter } from "next/navigation";
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
import RefundTicketModal from "./RefundTicketModal";

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
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [warrantyReturnLoading, setWarrantyReturnLoading] = useState(false);
    const router = useRouter();

    if (!ticket || !user) return null;

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
                setOptimisticStatus(null);
                onUpdate();
            } else {
                toast.error(res.error || t('updateFailed'));
                setOptimisticStatus(null);
            }
        } catch (error) {
            toast.error(t('updateFailed'));
            setOptimisticStatus(null);
        }
    };

    const handleUndo = async () => {
        setLoading('undo');
        try {
            const res = await undoTicketStatus({ ticketId: ticket.id, csrfToken: csrfToken ?? undefined });
            if (res.success) {
                toast.success(t('statusUpdated'));
                setOptimisticStatus(null);
                onUpdate();
            } else {
                toast.error(res.error || t('updateFailed'));
            }
        } catch (error) {
            toast.error(t('updateFailed'));
        }
        setLoading(null);
    };

    const handleTransition = async (targetStatus: string) => {
        if (targetStatus === TicketStatus.DIAGNOSING) {
            setShowEstimationModal(true);
            return;
        }

        if (targetStatus === TicketStatus.AT_CENTER || (targetStatus === TicketStatus.IN_PROGRESS && !ticket.technicianId)) {
            setShowTechModal(true);
            return;
        }

        if (targetStatus === TicketStatus.PICKED_UP) {
            const balanceDue = Math.max(0, (Number(ticket.repairPrice || 0) - Number(ticket.amountPaid || 0)));
            if (balanceDue <= 0) {
                setOptimisticStatus(targetStatus);
                setLoading(targetStatus);
                await performStatusUpdate(targetStatus);
                setLoading(null);
                return;
            }
            setShowPaymentModal(true);
            return;
        }

        setOptimisticStatus(targetStatus);
        setLoading(targetStatus);
        await performStatusUpdate(targetStatus);
        setLoading(null);
    };

    const allowedActions = transitions.filter(tr => tr.allowed);
    const blockedActions = transitions.filter(tr => !tr.allowed);

    let primaryAction = allowedActions[0];
    if (ticket.status === TicketStatus.NEW) {
        primaryAction = allowedActions.find(a => a.actionLabel === "Start Repair") ||
            allowedActions.find(a => a.actionLabel === "Send to Center") ||
            allowedActions[0];
    }

    const secondaryActions = transitions.filter(tr => tr !== primaryAction);

    return (
        <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-2 w-full justify-end">
                {(ticket.status === TicketStatus.PAID_DELIVERED || ticket.status === TicketStatus.DELIVERED) && (
                    <div className="flex flex-col gap-2 items-end">
                        {ticket.status === TicketStatus.PAID_DELIVERED && (
                            <div className="flex items-center gap-2 relative z-50 pointer-events-auto">
                                <div className="text-blue-400 font-bold flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5" /> 
                                    {t('paidDelivered')}
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowRefundModal(true);
                                    }}
                                    className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 h-8 rounded-lg px-2 flex gap-2 font-bold text-[10px] uppercase tracking-wider relative z-[100] cursor-pointer pointer-events-auto"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    {t('fullReturn')}
                                </Button>
                            </div>
                        )}

                        {/* WARRANTY RETURN BUTTON */}
                        {(() => {
                            const hasWarranty = !!ticket.warrantyExpiryDate;
                            const isValidWarranty = hasWarranty && !isBefore(new Date(ticket.warrantyExpiryDate as Date), startOfDay(new Date()));

                            const handleWarrantyReturn = async () => {
                                setWarrantyReturnLoading(true);
                                try {
                                    const res = await initiateWarrantyReturn(ticket.id);
                                    if (res.success && res.newTicketId) {
                                        toast.success(`تم إنشاء تذكرة المرتجع: #${res.newBarcode}`);
                                        router.push(`/ar/maintenance/tickets/${res.newTicketId}`);
                                    } else {
                                        toast.error(res.error || 'فشل إنشاء تذكرة المرتجع');
                                    }
                                } catch (err: any) {
                                    toast.error(err.message || 'فشل إنشاء تذكرة المرتجع');
                                } finally {
                                    setWarrantyReturnLoading(false);
                                }
                            };

                            return isValidWarranty ? (
                                <Button
                                    onClick={handleWarrantyReturn}
                                    disabled={warrantyReturnLoading}
                                    className="h-9 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500 border border-orange-500/30 text-orange-400 hover:text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all"
                                >
                                    {warrantyReturnLoading
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <ShieldCheck className="w-3.5 h-3.5" />
                                    }
                                    {t('createWarrantyReturn')}
                                </Button>
                            ) : (
                                <Button
                                    disabled
                                    title={t('warrantyExpiredTooltip')}
                                    className="h-9 px-3 rounded-xl bg-zinc-800/50 border border-zinc-700/30 text-zinc-600 font-black text-[10px] uppercase tracking-wider flex items-center gap-2 cursor-not-allowed opacity-50"
                                >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    {t('createWarrantyReturn')}
                                </Button>
                            );
                        })()}
                    </div>
                )}

                {ticket.status === TicketStatus.VOIDED && (
                    <div className="flex items-center gap-2">
                        <div className="text-red-400 font-bold flex items-center gap-1.5 italic">
                            <RotateCcw className="w-4 h-4" /> 
                            {t('fullReturn')}
                        </div>
                    </div>
                )}

                {transitions.length > 0 ? (
                    <>
                        {ticket.previousStatus && 
                         (user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'مدير النظام' || user.role === 'المالك') && 
                         !['PAID_DELIVERED', 'VOIDED'].includes(ticket.status) && (
                            <Button
                                variant="outline"
                                onClick={handleUndo}
                                disabled={loading === 'undo'}
                                className="border-white/10 text-zinc-400 h-12 rounded-xl px-4 flex gap-2 font-bold hover:bg-white/5 active:scale-95 transition-all text-xs"
                            >
                                {loading === 'undo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
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
                                                variant="ghost" 
                                                className="bg-cyan-500 hover:bg-cyan-400 text-black border-none h-12 w-10 p-0 flex items-center justify-center rounded-none"
                                            >
                                                <ChevronDown className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 rounded-xl w-48 p-1 shadow-2xl">
                                            {secondaryActions.map((action, i) => (
                                                <DropdownMenuItem
                                                    key={i}
                                                    onClick={() => handleTransition(action.target)}
                                                    className="flex items-center gap-3 px-3 py-3 text-zinc-300 hover:text-white cursor-pointer rounded-lg hover:bg-white/5 transition-colors"
                                                >
                                                    {getIcon(action.actionLabel || '')}
                                                    <span className="font-bold text-xs">{getActionLabel(action.actionLabel || '')}</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        ) : (
                            !['PAID_DELIVERED', 'VOIDED'].includes(ticket.status) && (
                                <span className="text-zinc-500 text-xs italic">{t('noActions')}</span>
                            )
                        )}
                    </>
                ) : (
                    !['PAID_DELIVERED', 'VOIDED'].includes(ticket.status) && (
                        <span className="text-zinc-500 text-sm">{t('noActions')}</span>
                    )
                )}
            </div>

            <TicketPaymentModal 
                isOpen={showPaymentModal} 
                onClose={() => setShowPaymentModal(false)} 
                ticket={ticket} 
                onSuccess={() => {
                    setShowPaymentModal(false);
                    onUpdate();
                }}
            />
            {ticket.status === TicketStatus.NEW && (
                <EstimationModal 
                    isOpen={showEstimationModal} 
                    onClose={() => setShowEstimationModal(false)} 
                    ticket={{ ...ticket, expectedDuration: ticket.expectedDuration || undefined }}
                    onSuccess={() => {
                        setShowEstimationModal(false);
                        onUpdate();
                    }}
                />
            )}
            <TechnicianAssignmentModal 
                isOpen={showTechModal} 
                onClose={() => setShowTechModal(false)} 
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    status: ticket.status,
                    technicianId: ticket.technicianId,
                    deviceBrand: ticket.deviceBrand,
                    deviceModel: ticket.deviceModel,
                }} 
                onSuccess={() => {
                    setShowTechModal(false);
                    onUpdate();
                }}
            />
            <RefundTicketModal 
                isOpen={showRefundModal} 
                onClose={() => setShowRefundModal(false)} 
                ticket={{
                    id: ticket.id,
                    barcode: ticket.barcode,
                    amountPaid: Number(ticket.amountPaid),
                    repairPrice: Number(ticket.repairPrice)
                }} 
                onSuccess={() => {
                    setShowRefundModal(false);
                    onUpdate();
                }}
            />
        </div>
    );
}
