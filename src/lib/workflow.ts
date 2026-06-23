import { TicketStatus } from "./constants";
import { PERMISSIONS, hasPermission } from "./permissions";

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
    // 1. استلام (Reception) -> تحديد التكلفة والوقت (Estimation)
    {
        from: [TicketStatus.NEW, TicketStatus.RETURNED_FOR_REFIX],
        to: TicketStatus.DIAGNOSING,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Start Diagnosis / Estimate Cost & Time",
        actionLabel: "تحديد التكلفة والوقت"
    },
    // 2. تحديد التكلفة والوقت -> تعيين مهندس (Assign Engineer)
    {
        from: [TicketStatus.DIAGNOSING],
        to: TicketStatus.AT_CENTER, // Using AT_CENTER as "Assigned/Ready for Technician"
        requiredPermission: PERMISSIONS.TICKET_ASSIGN,
        description: "Assign Technician",
        actionLabel: "تعيين مهندس"
    },
    // 3. تعيين مهندس -> فى انتظار (Pending) OR بدء الإصلاح (In Progress)
    {
        from: [TicketStatus.AT_CENTER, TicketStatus.DIAGNOSING, TicketStatus.RETURNED_FOR_REFIX],
        to: TicketStatus.IN_PROGRESS,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Start Repairing Device",
        actionLabel: "بدء الإصلاح"
    },
    {
        from: [TicketStatus.AT_CENTER, TicketStatus.DIAGNOSING, TicketStatus.IN_PROGRESS],
        to: TicketStatus.PENDING_APPROVAL,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Waiting for approval or parts",
        actionLabel: "فى انتظار"
    },
    // 4. فى انتظار / تعيين مهندس -> تم الاصلاح (Fixed)
    {
        from: [TicketStatus.PENDING_APPROVAL, TicketStatus.AT_CENTER, TicketStatus.DIAGNOSING, TicketStatus.IN_PROGRESS],
        to: TicketStatus.COMPLETED,
        requiredPermission: PERMISSIONS.TICKET_COMPLETE,
        description: "Repair finished",
        actionLabel: "تم الاصلاح"
    },
    // 5. تم الاصلاح -> الدفع (Payment)
    {
        from: [TicketStatus.COMPLETED, TicketStatus.READY_AT_BRANCH],
        to: TicketStatus.PICKED_UP,
        requiredPermission: PERMISSIONS.TICKET_PAY,
        description: "Process payment",
        actionLabel: "الدفع"
    },
    // 6. الدفع -> قفل التذكرة (Closure)
    {
        from: [TicketStatus.PICKED_UP, TicketStatus.DELIVERED],
        to: TicketStatus.PAID_DELIVERED,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Close ticket",
        actionLabel: "قفل التذكرة"
    },

    // Rejection Flow
    {
        from: [TicketStatus.DIAGNOSING, TicketStatus.AT_CENTER, TicketStatus.PENDING_APPROVAL, TicketStatus.RETURNED_FOR_REFIX],
        to: TicketStatus.REJECTED,
        requiredPermission: PERMISSIONS.TICKET_EDIT,
        description: "Reject / Unrepairable",
        actionLabel: "رفض / غير قابل للإصلاح"
    }
];

export function canTransition(
    currentStatus: string,
    userPermissions: string[],
    ticketDetails?: any, // For logic guards (parts count etc)
    currentBranchType: string = "CENTER", // Single-branch mode: always CENTER
    userRole?: string
): { allowed: boolean; reason?: string; actionLabel?: string; target: string }[] {

    // Find all possible next steps from current status
    const possibleMoves = TICKET_TRANSITIONS.filter(t => t.from.includes(currentStatus));

    return possibleMoves.map(move => {
        // 1. Check Permissions
        // Using hasPermission handles '*' wildcard for admins safely
        // Admins also bypass via role string check for extra robustness
        const isAdmin = userRole === 'ADMIN' || userRole === 'Admin' || userRole === 'مدير النظام' || userRole === 'المالك';
        if (move.requiredPermission && !isAdmin && !hasPermission(userPermissions, move.requiredPermission)) {
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
        if (move.to === TicketStatus.IN_PROGRESS) {
            if (ticketDetails && !ticketDetails.technicianId) {
                return {
                    allowed: false,
                    reason: "يجب تعيين مهندس أولاً",
                    target: move.to,
                    actionLabel: move.actionLabel
                };
            }
        }

        return {
            allowed: true,
            target: move.to,
            actionLabel: move.actionLabel
        };
    });
}
