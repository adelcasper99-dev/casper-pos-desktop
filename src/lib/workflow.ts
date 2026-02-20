import { TicketStatus } from "./constants";
import { PERMISSIONS } from "./permissions";

type TransitionRule = {
    from: string[];
    to: string;
    requiredRole?: string; // Legacy simple role
    requiredPermission?: string; // Granular permission (preferred)
    description: string;
    actionLabel: string;
};

// Define the strict flow
// This is the "Truth" of the business process.
// Define the strict flow
// This is the "Truth" of the business process.
export const TICKET_TRANSITIONS: TransitionRule[] = [
    // 1. Branch/Store Flow
    {
        from: [TicketStatus.NEW],
        to: TicketStatus.IN_TRANSIT_TO_CENTER, // Simplified: Direct to Transit
        requiredPermission: PERMISSIONS.LOGISTICS_CREATE,
        description: "Send device to Center",
        actionLabel: "Send to Center"
    },
    {
        from: [TicketStatus.NEW, TicketStatus.READY_AT_BRANCH, TicketStatus.IN_PROGRESS],
        to: TicketStatus.COMPLETED,
        requiredPermission: PERMISSIONS.TICKET_COMPLETE, // Quick fix scenario or direct finish
        description: "Quick Fix / Direct Finish",
        actionLabel: "Mark Completed"
    },

    // 2. Logistics Flow
    {
        from: [TicketStatus.IN_TRANSIT_TO_CENTER, TicketStatus.NEW],
        to: TicketStatus.AT_CENTER,
        requiredPermission: PERMISSIONS.LOGISTICS_RECEIVE,
        description: "Device Arrived at Center",
        actionLabel: "Receive at Center"
    },

    // 3. Center/Technician Flow
    {
        from: [TicketStatus.AT_CENTER],
        to: TicketStatus.DIAGNOSING,
        requiredPermission: PERMISSIONS.TICKET_ASSIGN,
        description: "Technician starts inspection",
        actionLabel: "Start Diagnosis"
    },
    {
        from: [TicketStatus.DIAGNOSING],
        to: TicketStatus.PENDING_APPROVAL,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Quote needs approval",
        actionLabel: "Submit Quote"
    },
    {
        from: [TicketStatus.DIAGNOSING, TicketStatus.PENDING_APPROVAL, TicketStatus.WAITING_FOR_PARTS],
        to: TicketStatus.IN_PROGRESS,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Repair work started",
        actionLabel: "Start Repair"
    },
    {
        from: [TicketStatus.IN_PROGRESS],
        to: TicketStatus.WAITING_FOR_PARTS,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Pause for parts",
        actionLabel: "Wait for Parts"
    },
    // Technician finishes -> QC PENDING
    {
        from: [TicketStatus.IN_PROGRESS],
        to: TicketStatus.QC_PENDING,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Repair done, needs check",
        actionLabel: "Finish & Send to QC"
    },

    // 4. QC Flow
    {
        from: [TicketStatus.QC_PENDING],
        to: TicketStatus.COMPLETED,
        requiredPermission: PERMISSIONS.TICKET_COMPLETE, // QC Role needs this
        description: "Quality Check Passed",
        actionLabel: "Log Parts & Pass QC"
    },

    // 5. Return Flow
    {
        from: [TicketStatus.COMPLETED, TicketStatus.CANCELLED],
        to: TicketStatus.IN_TRANSIT_TO_BRANCH, // Simplified: Direct to Transit
        requiredPermission: PERMISSIONS.LOGISTICS_CREATE,
        description: "Shipped back to store",
        actionLabel: "Ship to Store"
    },
    {
        from: [TicketStatus.IN_TRANSIT_TO_BRANCH],
        to: TicketStatus.READY_AT_BRANCH,
        requiredPermission: PERMISSIONS.LOGISTICS_RECEIVE,
        description: "Arrived at Store",
        actionLabel: "Receive at Store"
    },

    // 6. Customer Handover
    {
        from: [TicketStatus.READY_AT_BRANCH, TicketStatus.COMPLETED], // If completed in store directly
        to: TicketStatus.PICKED_UP, // DELIVERED
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Customer collected device",
        actionLabel: "Mark Delivered"
    },

    // 🔧 FIX BUG-03: 6b. Final State — Paid & Delivered (close the ticket)
    {
        from: [TicketStatus.PICKED_UP, TicketStatus.DELIVERED, TicketStatus.COMPLETED, TicketStatus.READY_AT_BRANCH],
        to: TicketStatus.PAID_DELIVERED,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Ticket fully paid and delivered — close ticket",
        actionLabel: "Close Ticket"
    },

    // 7. Warranty Return Flow (Re-Repair)
    {
        from: [TicketStatus.DELIVERED, TicketStatus.PICKED_UP, TicketStatus.PAID_DELIVERED],
        to: TicketStatus.RETURNED_FOR_REFIX,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Customer returned device with issue",
        actionLabel: "Return for Re-Repair"
    },
    {
        from: [TicketStatus.RETURNED_FOR_REFIX],
        to: TicketStatus.IN_TRANSIT_TO_CENTER,
        requiredPermission: PERMISSIONS.LOGISTICS_CREATE,
        description: "Send for re-repair at center",
        actionLabel: "Send to Center"
    },
    {
        from: [TicketStatus.RETURNED_FOR_REFIX],
        to: TicketStatus.IN_PROGRESS,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Quick fix at branch",
        actionLabel: "Start Quick Fix"
    },

    // 8. Rejection Flow (Unrepairable)
    {
        from: [TicketStatus.DIAGNOSING, TicketStatus.IN_PROGRESS, TicketStatus.PENDING_APPROVAL],
        to: TicketStatus.REJECTED,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Cannot repair / Rejected",
        actionLabel: "Reject / Unrepairable"
    },
    {
        from: [TicketStatus.REJECTED],
        to: TicketStatus.READY_AT_BRANCH,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Return rejected device to front desk",
        actionLabel: "Ready for Pickup"
    }
];

export function canTransition(
    currentStatus: string,
    userPermissions: string[],
    ticketDetails?: any, // For logic guards (parts count etc)
    currentBranchType: string = "STORE", // Default to weakest role for security
    userRole?: string
): { allowed: boolean; reason?: string; actionLabel?: string; target: string }[] {

    console.log("🛡️ [canTransition] Check:", { currentBranchType, userRole });

    // Find all possible next steps from current status
    const possibleMoves = TICKET_TRANSITIONS.filter(t => t.from.includes(currentStatus));

    return possibleMoves.map(move => {
        // 1. Check Permissions
        if (move.requiredPermission && !userPermissions.includes(move.requiredPermission)) {
            return {
                allowed: false,
                reason: "Insufficient Permissions",
                target: move.to,
                actionLabel: move.actionLabel
            };
        }

        // 2. Branch Type Security Guard
        // Stores can ONLY do:
        // - Send to Center (Transit)
        // - Receive at Store (Transit -> Ready)
        // - Complete (Quick Fix) - Maybe? Let's check move target.
        // - Deliver (Complete -> Picked Up)

        // They CANNOT do:
        // - Diagnose
        // - Start Repair
        // - QC

        if (currentBranchType !== 'CENTER' && userRole !== 'ADMIN') {
            const centerOnlyTargets: string[] = [
                TicketStatus.DIAGNOSING,
                TicketStatus.IN_PROGRESS,
                TicketStatus.WAITING_FOR_PARTS,
                TicketStatus.QC_PENDING
            ];

            if (centerOnlyTargets.includes(move.to)) {
                return {
                    allowed: false,
                    reason: "Action only available at Main Center",
                    target: move.to,
                    actionLabel: move.actionLabel
                };
            }
        }

        // 3. Logic Guards (Existing)
        // REMOVED: We now allow completing tickets without parts/labor (e.g. Warranty or No Issue Found)
        /*
        if (move.to === TicketStatus.COMPLETED) {
            if (ticketDetails) {
                const hasParts = ticketDetails.parts && ticketDetails.parts.length > 0;
                const hasCharge = ticketDetails.repairPrice && Number(ticketDetails.repairPrice) > 0;

                if (!hasParts && !hasCharge) {
                    return {
                        allowed: false,
                        reason: "Cannot complete: Please log Parts or Labor first.",
                        target: move.to,
                        actionLabel: move.actionLabel
                    };
                }
            }
        }
        */

        return {
            allowed: true,
            target: move.to,
            actionLabel: move.actionLabel
        };
    });
}
